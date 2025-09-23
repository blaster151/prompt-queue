// ChatGPT Prompt Queuer Content Script
(() => {
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  // Tab identification - use timestamp + random + URL hash for uniqueness
  const generateUniqueTabId = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 11);
    const urlHash = window.location.href.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0).toString(36);
    return `${timestamp}-${random}-${urlHash}`;
  };
  
  const tabId = generateUniqueTabId();
  let isActive = false;
  let currentPrompt = null;

  const getInput = () => {
    // Try multiple selectors in order of preference
    const selectors = [
      'div[contenteditable="true"][data-testid="conversation-compose-textarea"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      '[role="textbox"]',
      'div[contenteditable="true"][placeholder]',
      '#prompt-textarea',
      '.composer textarea'
    ];
    
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) { // Check if visible
          return element;
        }
      } catch (e) {
        console.warn(`Selector failed: ${selector}`, e);
      }
    }
    
    // Last resort: find any contenteditable div that looks like an input
    const editableDivs = document.querySelectorAll('div[contenteditable="true"]');
    for (const div of editableDivs) {
      if (div.offsetParent !== null && div.getBoundingClientRect().height > 20) {
        return div;
      }
    }
    
    return null;
  };

  const getSendButton = () => {
    // Try multiple strategies to find the send button
    const strategies = [
      // Strategy 1: Look for specific SVG path (current ChatGPT)
      () => Array.from(document.querySelectorAll('button'))
        .find(btn => btn.querySelector('svg path[d*="M10.5 4.5l7 7-7 7"]')),
      
      // Strategy 2: Look for data-testid
      () => document.querySelector('button[data-testid="send-button"]'),
      
      // Strategy 3: Look for common send button patterns
      () => Array.from(document.querySelectorAll('button'))
        .find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          return text.includes('send') || ariaLabel.includes('send') || 
                 text.includes('submit') || ariaLabel.includes('submit');
        }),
      
      // Strategy 4: Look for buttons with send-like icons
      () => Array.from(document.querySelectorAll('button'))
        .find(btn => {
          const svg = btn.querySelector('svg');
          if (!svg) return false;
          const paths = svg.querySelectorAll('path');
          return Array.from(paths).some(path => {
            const d = path.getAttribute('d') || '';
            return d.includes('M') && d.includes('L') && d.length > 20; // Likely an arrow/send icon
          });
        }),
      
      // Strategy 5: Look for button near input that's not disabled
      () => {
        const input = getInput();
        if (!input) return null;
        const container = input.closest('form') || input.parentElement;
        if (!container) return null;
        return container.querySelector('button:not([disabled])');
      }
    ];
    
    for (const strategy of strategies) {
      try {
        const button = strategy();
        if (button && !button.disabled && button.offsetParent !== null) {
          return button;
        }
      } catch (e) {
        console.warn('Send button strategy failed:', e);
      }
    }
    
    return null;
  };

  const getLastResponse = () => {
    // Try multiple strategies to find the last response
    const strategies = [
      // Strategy 1: Current ChatGPT format
      () => [...document.querySelectorAll('[data-message-author-role="assistant"]')].pop(),
      
      // Strategy 2: Alternative data attributes
      () => [...document.querySelectorAll('[data-author="assistant"]')].pop(),
      
      // Strategy 3: Look for response containers with specific classes
      () => [...document.querySelectorAll('.response-container, .assistant-message, .bot-message')].pop(),
      
      // Strategy 4: Find messages that are not from user
      () => {
        const allMessages = document.querySelectorAll('[data-message-author-role]');
        const assistantMessages = Array.from(allMessages).filter(msg => 
          !msg.getAttribute('data-message-author-role').includes('user')
        );
        return assistantMessages[assistantMessages.length - 1];
      }
    ];
    
    for (const strategy of strategies) {
      try {
        const response = strategy();
        if (response) return response;
      } catch (e) {
        console.warn('Response detection strategy failed:', e);
      }
    }
    
    return null;
  };

  const getLastResponseId = () => {
    const response = getLastResponse();
    if (!response) return null;
    
    // Try multiple attributes for message ID
    return response.getAttribute("data-message-id") || 
           response.getAttribute("data-id") || 
           response.getAttribute("id") || 
           response.dataset?.messageId ||
           null;
  };

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
    try {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
    } catch (e) {
      return false;
    }
  };

  const isResponseComplete = () => {
    // Try multiple strategies to detect if response is complete
    const strategies = [
      // Strategy 1: Look for stop button (response in progress)
      () => !isVisible('[data-testid="stop-button"]'),
      
      // Strategy 2: Look for send button (response complete)
      () => isVisible('[data-testid="send-button"]') || getSendButton() !== null,
      
      // Strategy 3: Look for mic button (response complete)
      () => isVisible('[data-testid="composer-speech-button"]'),
      
      // Strategy 4: Check if any loading indicators are gone
      () => !document.querySelector('.loading, .spinner, [data-loading="true"]'),
      
      // Strategy 5: Check if input is enabled
      () => {
        const input = getInput();
        return input && !input.disabled && !input.readOnly;
      }
    ];
    
    // Response is complete if any strategy indicates completion
    for (const strategy of strategies) {
      try {
        if (strategy()) return true;
      } catch (e) {
        console.warn('Response completion strategy failed:', e);
      }
    }
    
    return false;
  };

  const waitForResponseToFinish = async () => {
    console.log("⏳ Waiting for assistant to finish…");

    return new Promise((resolve) => {
      // Check immediately first
      const checkCompletion = () => {
        if (isResponseComplete()) {
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

      // Timeout after 30 seconds
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
    const cleanInput = input.trim();
    if (!cleanInput) return [];
    
    const lines = cleanInput.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    // Check if first line looks like headers (contains common header words)
    const headerWords = ['name', 'title', 'prompt', 'question', 'task', 'column', 'field', 'header'];
    const firstLine = lines[0].toLowerCase();
    const looksLikeHeader = headerWords.some(word => firstLine.includes(word)) && lines.length > 1;
    
    // Start from first data row (skip header if detected)
    const startIndex = looksLikeHeader ? 1 : 0;
    const dataLines = lines.slice(startIndex);
    
    console.log(`📊 Processing ${dataLines.length} data rows (header ${looksLikeHeader ? 'detected and ' : ''}skipped)`);

    const prompts = [];
    
    for (const line of dataLines) {
      if (!line.trim()) continue;
      
      // Check if line contains tabs (multi-column)
      if (line.includes('\t')) {
        // Multi-column: concatenate all columns with spaces
        const columns = line.split('\t')
          .map(cell => cell.trim())
          .filter(cell => cell); // Remove empty columns
        
        if (columns.length > 0) {
          prompts.push(columns.join(' '));
        }
      } else {
        // Single column: use the line as-is
        prompts.push(line.trim());
      }
    }

    console.log(`✅ Parsed ${prompts.length} prompts from list data`);
    return prompts;
  };

  const processNextPromptSingleTab = async () => {
    console.log(`🔄 [Tab ${tabId}] processNextPromptSingleTab called - isActive: ${isActive}, localQueue: ${window.localQueue ? 'exists' : 'null'}`);
    
    if (!isActive || !window.localQueue) {
      console.log(`⚠️ [Tab ${tabId}] Skipping - not active or no local queue`);
      return;
    }

    try {
      // Check for infinite recursion protection
      if (window.processingSingleTab) {
        console.warn(`⚠️ [Tab ${tabId}] Already processing single tab queue, skipping duplicate call`);
        return;
      }
      window.processingSingleTab = true;
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
        
        // Continue with next prompt immediately with error boundary
        setTimeout(() => {
          try {
            processNextPromptSingleTab();
          } catch (error) {
            console.error(`❌ [Tab ${tabId}] Error in recursive call to processNextPromptSingleTab:`, error);
            isActive = false;
            chrome.runtime.sendMessage({
              type: 'TAB_ERROR',
              tabId: tabId,
              error: `Recursive processing error: ${error.message}`
            });
          }
        }, 100); // Small delay to prevent stack overflow
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
    } finally {
      // Always clear the processing flag
      window.processingSingleTab = false;
    }
  };

  const processNextPrompt = async () => {
    if (!isActive) return;

    try {
      // Check for infinite recursion protection
      if (window.processingMultiTab) {
        console.warn(`⚠️ [Tab ${tabId}] Already processing multi-tab queue, skipping duplicate call`);
        return;
      }
      window.processingMultiTab = true;
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
        
        // Continue with next prompt immediately with error boundary
        setTimeout(() => {
          try {
            processNextPrompt();
          } catch (error) {
            console.error(`❌ [Tab ${tabId}] Error in recursive call to processNextPrompt:`, error);
            isActive = false;
            chrome.runtime.sendMessage({
              type: 'TAB_ERROR',
              tabId: tabId,
              error: `Recursive processing error: ${error.message}`
            });
          }
        }, 100); // Small delay to prevent stack overflow
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
    } finally {
      // Always clear the processing flag
      window.processingMultiTab = false;
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
    } else if (request.type === 'START_SINGLE_TAB_QUEUE') {
      console.log(`🚀 [Tab ${tabId}] Starting single tab queue via message...`);
      if (request.messages && request.messages.length > 0) {
        isActive = true;
        window.localQueue = request.messages;
        window.localQueueIndex = 0;
        
        try {
          processNextPromptSingleTab();
          sendResponse({ success: true, tabId: tabId });
        } catch (error) {
          console.error(`❌ Error starting single tab queue:`, error);
          sendResponse({ success: false, error: error.message });
        }
      } else {
        sendResponse({ success: false, error: 'No messages provided' });
      }
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