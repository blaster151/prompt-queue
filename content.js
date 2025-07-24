// ChatGPT Prompt Queuer Content Script
(() => {
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  // Tab identification - use timestamp + random for uniqueness
  const tabId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  let isActive = false;
  let currentPrompt = null;

  const getInput = () =>
    document.querySelector('div[contenteditable="true"][data-testid="conversation-compose-textarea"]') ||
    document.querySelector('div[contenteditable="true"]');

  const getSendButton = () =>
    Array.from(document.querySelectorAll('button'))
      .find(btn => btn.querySelector('svg path[d*="M10.5 4.5l7 7-7 7"]'));

  const getLastResponse = () =>
    [...document.querySelectorAll('[data-message-author-role="assistant"]')].pop();

  const getLastResponseId = () =>
    getLastResponse()?.getAttribute("data-message-id") || null;

  const getLastResponseContent = () => {
    const response = getLastResponse();
    if (!response) return null;
    
    // Get the markdown content from the response
    const markdownElement = response.querySelector('.markdown');
    if (markdownElement) {
      return markdownElement.innerHTML;
    }
    
    // Fallback to text content
    return response.textContent || null;
  };

  const isVisible = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const waitForResponseToFinish = async () => {
    console.log("⏳ Waiting for assistant to finish…");

    return new Promise((resolve) => {
      // Check immediately first
      const checkCompletion = () => {
        const stopVisible = isVisible('[data-testid="stop-button"]');
        const micVisible = isVisible('[data-testid="composer-speech-button"]');
        const sendVisible = isVisible('[data-testid="send-button"]');

        if (!stopVisible && (micVisible || sendVisible)) {
          console.log("✅ Assistant response is complete.");
          resolve();
          return true;
        }
        return false;
      };

      // Check immediately
      if (checkCompletion()) return;

      // Then check every 100ms
      const interval = setInterval(() => {
        if (checkCompletion()) {
          clearInterval(interval);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        console.warn("⏰ Timeout: assuming response is done.");
        resolve();
      }, 30000);
    });
  };

  const sendMessage = async (text) => {
    console.log(`📝 Attempting to send message: "${text.substring(0, 50)}..."`);
    
    const input = getInput();
    if (!input) {
      console.error("❌ Input box not found");
      throw new Error("Input box not found");
    }

    console.log("✅ Input box found, inserting text...");
    
    input.focus();
    input.innerText = "";
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(100);

    const button = getSendButton();
    if (button && !button.disabled) {
      console.log("✅ Send button found and enabled, clicking...");
      button.click();
    } else {
      console.log("⚠️ Send button not found or disabled, using Enter key...");
      input.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        code: "Enter"
      }));
    }
    
    console.log("✅ Message sent successfully");
  };

  const parsePastedMatrix = (input) => {
    const lines = input.trim().split(/\r?\n/);
    if (lines.length === 0) return [];

    // Detect column count from first data row (skip header)
    const firstDataRow = lines[1];
    if (!firstDataRow) return [];

    const columnCount = firstDataRow.split("\t").length;
    console.log(`📊 Detected ${columnCount} columns in matrix`);

    // Validate column count (2-4 columns supported)
    if (columnCount < 2 || columnCount > 4) {
      console.warn(`⚠️ Unsupported column count: ${columnCount}. Expected 2-4 columns.`);
      return [];
    }

    const rows = [];
    let buffer = "";

    const flushIfComplete = () => {
      const tabCount = buffer.split("\t").length;
      if (tabCount === columnCount) {
        rows.push(buffer);
        buffer = "";
      }
    };

    for (const line of lines.slice(1)) { // skip header
      if (!buffer) {
        buffer = line;
      } else {
        buffer += "\n" + line;
      }
      flushIfComplete();
    }

    if (buffer.trim()) {
      const tabCount = buffer.split("\t").length;
      if (tabCount === columnCount) {
        rows.push(buffer);
      } else {
        console.warn("⚠️ Incomplete row discarded:", buffer);
      }
    }

    return rows.map(row =>
      row
        .split("\t")
        .map(cell => cell.replace(/\r?\n/g, " ").trim())
        .join("  ")
    );
  };

  const processNextPromptSingleTab = async () => {
    console.log(`🔄 [Tab ${tabId}] processNextPromptSingleTab called - isActive: ${isActive}, localQueue: ${window.localQueue ? 'exists' : 'null'}`);
    
    if (!isActive || !window.localQueue) {
      console.log(`⚠️ [Tab ${tabId}] Skipping - not active or no local queue`);
      return;
    }

    try {
      if (window.localQueueIndex < window.localQueue.length) {
        currentPrompt = window.localQueue[window.localQueueIndex];
        console.log(`📨 [Tab ${tabId}] Sending prompt ${window.localQueueIndex + 1}/${window.localQueue.length}: "${currentPrompt}"`);
        
        // Update progress in in-page UI
        if (window.updateQueueProgress) {
          window.updateQueueProgress(window.localQueueIndex, 'processing');
        }
        
        // Send progress update to popup
        chrome.runtime.sendMessage({
          type: 'PROGRESS_UPDATE',
          tabId: tabId,
          prompt: currentPrompt,
          status: 'sending'
        });
        
        await sendMessage(currentPrompt);

        const newIdAppeared = async () => {
          return new Promise(resolve => {
            const observer = new MutationObserver(() => {
              const current = getLastResponse();
              const currentId = current?.getAttribute("data-message-id");
              if (currentId && currentId !== getLastResponseId()) {
                observer.disconnect();
                resolve();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
              observer.disconnect();
              resolve(); // fail-safe
            }, 30000);
          });
        };

        await newIdAppeared();
        await waitForResponseToFinish();
        // No delay needed - response is already complete

        // Get the response content
        const responseContent = getLastResponseContent();
        
        // Update progress in in-page UI
        if (window.updateQueueProgress) {
          window.updateQueueProgress(window.localQueueIndex, 'completed');
        }
        
        // Send completion update with response for popup
        chrome.runtime.sendMessage({
          type: 'PROGRESS_UPDATE',
          tabId: tabId,
          prompt: currentPrompt,
          response: responseContent,
          status: 'completed'
        });
        
        // Also send to background script for conversation history
        chrome.runtime.sendMessage({
          type: 'PROMPT_COMPLETED',
          tabId: tabId,
          prompt: currentPrompt,
          promptIndex: window.localQueueIndex,
          response: responseContent
        });

        window.localQueueIndex++;
        currentPrompt = null;
        
        // Continue with next prompt immediately
        processNextPromptSingleTab();
      } else {
        // No more prompts available
        console.log(`🏁 [Tab ${tabId}] Single tab queue completed`);
        isActive = false;
        chrome.runtime.sendMessage({
          type: 'QUEUE_COMPLETE',
          totalPrompts: window.localQueue.length,
          activeTabs: 1
        });
      }
    } catch (error) {
      console.error(`❌ [Tab ${tabId}] Error processing prompt:`, error);
      isActive = false;
      chrome.runtime.sendMessage({
        type: 'TAB_ERROR',
        tabId: tabId,
        error: error.message
      });
    }
  };

  const processNextPrompt = async () => {
    if (!isActive) return;

    try {
      // Request next prompt from background script
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_NEXT_PROMPT',
        tabId: tabId
      });

      if (response && response.prompt) {
        currentPrompt = response.prompt;
        const promptIndex = response.index;
        console.log(`📨 [Tab ${tabId}] Sending prompt ${promptIndex + 1}: "${currentPrompt}"`);
        
        // Send progress update to popup
        chrome.runtime.sendMessage({
          type: 'PROGRESS_UPDATE',
          tabId: tabId,
          prompt: currentPrompt,
          promptIndex: promptIndex,
          status: 'sending'
        });
        
        await sendMessage(currentPrompt);

        const newIdAppeared = async () => {
          return new Promise(resolve => {
            const observer = new MutationObserver(() => {
              const current = getLastResponse();
              const currentId = current?.getAttribute("data-message-id");
              if (currentId && currentId !== getLastResponseId()) {
                observer.disconnect();
                resolve();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
              observer.disconnect();
              resolve(); // fail-safe
            }, 30000);
          });
        };

        await newIdAppeared();
        await waitForResponseToFinish();
        // No delay needed - response is already complete

        // Get the response content
        const responseContent = getLastResponseContent();
        
        // Mark prompt as completed with response
        chrome.runtime.sendMessage({
          type: 'PROMPT_COMPLETED',
          tabId: tabId,
          prompt: currentPrompt,
          promptIndex: promptIndex,
          response: responseContent
        });

        currentPrompt = null;
        
        // Continue with next prompt immediately
        processNextPrompt();
      } else {
        // No more prompts available
        console.log(`🏁 [Tab ${tabId}] No more prompts available`);
        isActive = false;
        chrome.runtime.sendMessage({
          type: 'TAB_FINISHED',
          tabId: tabId
        });
      }
    } catch (error) {
      console.error(`❌ [Tab ${tabId}] Error processing prompt:`, error);
      isActive = false;
      chrome.runtime.sendMessage({
        type: 'TAB_ERROR',
        tabId: tabId,
        error: error.message
      });
    }
  };

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`📨 [Tab ${tabId}] Received message:`, request.type);
    
    if (request.type === 'START_QUEUE') {
      console.log(`🚀 [Tab ${tabId}] Starting queue processing...`);
      isActive = true;
      
      // Check if messages were passed directly (single tab mode)
      if (request.messages && request.messages.length > 0) {
        console.log(`📨 [Tab ${tabId}] Starting single tab mode with ${request.messages.length} messages`);
        // Store messages locally for single tab mode
        window.localQueue = request.messages;
        window.localQueueIndex = 0;
        processNextPromptSingleTab();
      } else {
        console.log(`📨 [Tab ${tabId}] Starting multi tab mode`);
        processNextPrompt();
      }
      
      sendResponse({ success: true, tabId: tabId });
    } else if (request.type === 'STOP_QUEUE') {
      console.log(`🛑 [Tab ${tabId}] Stopping queue processing...`);
      isActive = false;
      currentPrompt = null;
      window.localQueue = null;
      window.localQueueIndex = 0;
      sendResponse({ success: true });
    } else if (request.type === 'PARSE_MATRIX') {
      console.log(`📊 [Tab ${tabId}] Parsing matrix data...`);
      const parsed = parsePastedMatrix(request.input);
      sendResponse({ messages: parsed });
    } else if (request.type === 'GET_TAB_STATUS') {
      console.log(`📊 [Tab ${tabId}] Getting tab status...`);
      sendResponse({ 
        tabId: tabId, 
        isActive: isActive, 
        currentPrompt: currentPrompt 
      });
    }
  });

  // Register this tab with the background script
  chrome.runtime.sendMessage({
    type: 'REGISTER_TAB',
    tabId: tabId,
    url: window.location.href
  });

  // Notify when tab becomes active/inactive
  document.addEventListener('visibilitychange', () => {
    chrome.runtime.sendMessage({
      type: 'TAB_VISIBILITY_CHANGE',
      tabId: tabId,
      isVisible: !document.hidden
    });
  });

  // Global entry points for debugging
  window.runPromptQueuer = processNextPrompt;
  window.runPromptQueuerSingleTab = processNextPromptSingleTab;
  window.parsePastedMatrix = parsePastedMatrix;
  window.getTabStatus = () => ({ tabId, isActive, currentPrompt });
  window.setActive = (active) => { isActive = active; };

  // Test function for debugging
  window.testPromptInsertion = async () => {
    console.log('🧪 Testing prompt insertion...');
    try {
      await sendMessage('Test message from console');
      console.log('✅ Test message sent successfully');
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  };

  console.log(`✅ ChatGPT Prompt Queuer content script loaded (Tab ID: ${tabId})`);
  console.log('🧪 Test prompt insertion with: window.testPromptInsertion()');
})(); 