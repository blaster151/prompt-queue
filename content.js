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
    // Helper to check if button might be a navigation/back button
    const isLikelyNavigationButton = (btn) => {
      const text = btn.textContent?.toLowerCase() || '';
      const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
      const className = btn.className?.toLowerCase() || '';
      
      // Reject buttons with navigation-related text
      const navKeywords = ['back', 'close', 'cancel', 'exit', 'return', 'navigate', 'leave'];
      return navKeywords.some(keyword => 
        text.includes(keyword) || ariaLabel.includes(keyword) || className.includes(keyword)
      );
    };
    
    // Try multiple strategies to find the send button
    const strategies = [
      // Strategy 1: Look for data-testid (most reliable)
      () => document.querySelector('button[data-testid="send-button"]'),
      
      // Strategy 2: Look for specific SVG path (current ChatGPT)
      () => Array.from(document.querySelectorAll('button'))
        .find(btn => {
          if (isLikelyNavigationButton(btn)) return false;
          return btn.querySelector('svg path[d*="M10.5 4.5l7 7-7 7"]');
        }),
      
      // Strategy 3: Look for common send button patterns
      () => Array.from(document.querySelectorAll('button'))
        .find(btn => {
          if (isLikelyNavigationButton(btn)) return false;
          const text = btn.textContent?.toLowerCase() || '';
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          return text.includes('send') || ariaLabel.includes('send') || 
                 text.includes('submit') || ariaLabel.includes('submit');
        }),
      
      // Strategy 4: Look for buttons with send-like icons (arrow pointing right/up)
      () => Array.from(document.querySelectorAll('button'))
        .find(btn => {
          if (isLikelyNavigationButton(btn)) return false;
          const svg = btn.querySelector('svg');
          if (!svg) return false;
          const paths = svg.querySelectorAll('path');
          return Array.from(paths).some(path => {
            const d = path.getAttribute('d') || '';
            // More specific: must be a reasonably long path (icon) and not too complex
            return d.includes('M') && d.includes('L') && d.length > 20 && d.length < 200;
          });
        }),
      
      // Strategy 5: Look for button near input (LAST RESORT - most dangerous)
      () => {
        const input = getInput();
        if (!input) return null;
        const container = input.closest('form') || input.parentElement;
        if (!container) return null;
        
        // Get all buttons in container
        const buttons = Array.from(container.querySelectorAll('button:not([disabled])'));
        
        // Filter out navigation buttons and prefer the last button (usually send)
        const safeButtons = buttons.filter(btn => !isLikelyNavigationButton(btn));
        return safeButtons[safeButtons.length - 1]; // Return last button in DOM order
      }
    ];
    
    for (const strategy of strategies) {
      try {
        const button = strategy();
        if (button && !button.disabled && button.offsetParent !== null) {
          console.log(`🎯 Found send button via strategy: ${button.getAttribute('aria-label') || button.textContent || 'unnamed button'}`);
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
    // CRITICAL: If stop button is visible, response is definitely in progress
    // This is a hard requirement that overrides all other checks
    const stopButtonVisible = isVisible('[data-testid="stop-button"]');
    
    if (stopButtonVisible) {
      if (window.debugPromptQueuer) {
        console.log('🛑 Stop button visible - response still in progress');
      }
      return false;
    }
    
    // Try multiple strategies to detect if response is complete
    const strategies = [
      { 
        name: 'Send button visible',
        check: () => isVisible('[data-testid="send-button"]') || getSendButton() !== null
      },
      { 
        name: 'Mic button visible',
        check: () => isVisible('[data-testid="composer-speech-button"]')
      },
      { 
        name: 'No loading indicators',
        check: () => !document.querySelector('.loading, .spinner, [data-loading="true"]')
      },
      { 
        name: 'Input enabled',
        check: () => {
          const input = getInput();
          return input && !input.disabled && !input.readOnly;
        }
      }
    ];
    
    // Count how many strategies indicate completion
    let completionIndicators = 0;
    const results = ['No stop button: ✓']; // Already verified above
    
    for (const strategy of strategies) {
      try {
        const result = strategy.check();
        results.push(`${strategy.name}: ${result ? '✓' : '✗'}`);
        if (result) completionIndicators++;
      } catch (e) {
        console.warn(`Response completion strategy '${strategy.name}' failed:`, e);
        results.push(`${strategy.name}: ERROR`);
      }
    }
    
    // Require at least 3 out of 4 secondary strategies to agree
    // (Stop button already verified, so we check the remaining 4)
    const isComplete = completionIndicators >= 3;
    
    // Log detailed strategy results for debugging
    if (window.debugPromptQueuer) {
      console.log(`🔍 Completion check: ${completionIndicators}/4 secondary strategies agree | ${results.join(', ')}`);
    }
    
    if (isComplete) {
      // Additional check: ensure the last response has actual content
      const lastResponse = getLastResponse();
      if (lastResponse) {
        const content = lastResponse.textContent?.trim() || '';
        // If there's a response but it's empty or very short, it might not be done yet
        if (content.length < 5) {
          console.log(`⚠️ Response element exists but content too short (${content.length} chars), waiting...`);
          return false;
        }
      }
      
      console.log(`✅ Response completion confirmed: ${completionIndicators}/4 secondary strategies agree | ${results.join(', ')}`);
    }
    
    return isComplete;
  };

  const waitForResponseToFinish = async () => {
    console.log("⏳ Waiting for assistant to finish…");

    return new Promise((resolve) => {
      let checkCount = 0;
      const startTime = Date.now();
      
      const checkCompletion = () => {
        checkCount++;
        const elapsedMs = Date.now() - startTime;
        
        // Don't check completion for at least 500ms to ensure response has started
        if (elapsedMs < 500) {
          console.log(`⏳ Waiting for response to start... (${elapsedMs}ms elapsed)`);
          return false;
        }
        
        if (isResponseComplete()) {
          console.log(`✅ Assistant response is complete. (${checkCount} checks, ${elapsedMs}ms elapsed)`);
          resolve();
          return true;
        }
        
        // Log progress every 5 seconds
        if (checkCount % 50 === 0) {
          console.log(`⏳ Still waiting for response... (${elapsedMs}ms elapsed, ${checkCount} checks)`);
        }
        
        return false;
      };

      // Don't check immediately - wait a bit for response to start
      // Then check every 100ms
      const interval = setInterval(() => {
        if (checkCompletion()) {
          clearInterval(interval);
        }
      }, 100);

      // Timeout after 5 minutes - but ONLY if stop button is not visible
      // NEVER assume response is done if stop button is still visible
      setTimeout(() => {
        const elapsedMs = Date.now() - startTime;
        const stopButtonStillVisible = isVisible('[data-testid="stop-button"]');
        
        if (stopButtonStillVisible) {
          console.warn(`⏰ Timeout reached after ${elapsedMs}ms, but stop button still visible - continuing to wait...`);
          // Keep checking - don't clear the interval
        } else {
          clearInterval(interval);
          console.warn(`⏰ Timeout after ${elapsedMs}ms and stop button not visible - assuming response is done.`);
          resolve();
        }
      }, 300000); // 5 minutes timeout
    });
  };

  const uploadAttachments = async (attachments) => {
    if (!attachments || attachments.length === 0) return;
    
    console.log(`📎 Uploading ${attachments.length} attachment(s)...`);
    
    for (const attachment of attachments) {
      try {
        // Convert base64 data URL to File object
        const response = await fetch(attachment.data);
        const blob = await response.blob();
        const file = new File([blob], attachment.name, { type: attachment.mimeType });
        
        // Find the file input or drop zone
        const fileInput = document.querySelector('input[type="file"]');
        
        if (fileInput) {
          // Create a DataTransfer to simulate file selection
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
          
          // Trigger change event
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log(`✅ Uploaded attachment: ${attachment.name}`);
        } else {
          // Try drag-drop simulation
          const dropZone = document.querySelector('[data-testid="composer-dropzone"]') || 
                          document.querySelector('[role="textbox"]')?.closest('form');
          
          if (dropZone) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            // Simulate drag events
            const dragEvent = new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dataTransfer
            });
            
            dropZone.dispatchEvent(dragEvent);
            console.log(`✅ Dropped attachment: ${attachment.name}`);
          } else {
            console.warn(`⚠️ Could not find file upload mechanism for ${attachment.name}`);
          }
        }
        
        // Wait for upload to process
        await delay(500);
      } catch (error) {
        console.error(`❌ Error uploading attachment ${attachment.name}:`, error);
      }
    }
    
    // Wait a bit more for all uploads to complete
    await delay(1000);
  };

  const sendMessage = async (messageOrText, attachments = []) => {
    // Handle both string and object formats
    const text = typeof messageOrText === 'string' ? messageOrText : messageOrText.text;
    const atts = typeof messageOrText === 'string' ? attachments : (messageOrText.attachments || []);
    
    console.log(`📝 Attempting to send message: "${text.substring(0, 50)}..." with ${atts.length} attachment(s)`);
    
    // SAFETY CHECK: Don't send if a response is currently in progress
    const stopButtonVisible = isVisible('[data-testid="stop-button"]');
    if (stopButtonVisible) {
      console.error("❌ SAFETY: Cannot send message - stop button is visible (response in progress)");
      throw new Error("Cannot send message while response is in progress");
    }
    
    // Upload attachments first if any
    if (atts.length > 0) {
      await uploadAttachments(atts);
    }
    
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
        
        // Continue with next prompt with error boundary
        // Add extra safety delay to ensure UI is truly ready
        setTimeout(() => {
          try {
            // EXTRA SAFETY: Double-check stop button isn't visible before proceeding
            const stopButtonStillVisible = isVisible('[data-testid="stop-button"]');
            if (stopButtonStillVisible) {
              console.warn(`⚠️ [Tab ${tabId}] Stop button still visible after completion, waiting additional 1s...`);
              // Wait additional time and try again
              setTimeout(() => {
                try {
                  processNextPromptSingleTab();
                } catch (error) {
                  console.error(`❌ [Tab ${tabId}] Error after delayed retry:`, error);
                  isActive = false;
                }
              }, 1000);
              return;
            }
            
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
        }, 500); // Increased from 100ms to 500ms for better safety in Codex mode
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
        
        // Continue with next prompt with error boundary
        // Add extra safety delay to ensure UI is truly ready
        setTimeout(() => {
          try {
            // EXTRA SAFETY: Double-check stop button isn't visible before proceeding
            const stopButtonStillVisible = isVisible('[data-testid="stop-button"]');
            if (stopButtonStillVisible) {
              console.warn(`⚠️ [Tab ${tabId}] Stop button still visible after completion, waiting additional 1s...`);
              // Wait additional time and try again
              setTimeout(() => {
                try {
                  processNextPrompt();
                } catch (error) {
                  console.error(`❌ [Tab ${tabId}] Error after delayed retry:`, error);
                  isActive = false;
                }
              }, 1000);
              return;
            }
            
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
        }, 500); // Increased from 100ms to 500ms for better safety in Codex mode
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

  // Enable debug mode for detailed completion logging
  window.enableDebugMode = () => {
    window.debugPromptQueuer = true;
    console.log('🐛 Debug mode ENABLED - detailed completion checks will be logged');
  };

  window.disableDebugMode = () => {
    window.debugPromptQueuer = false;
    console.log('🐛 Debug mode DISABLED');
  };

  console.log(`✅ ChatGPT Prompt Queuer content script loaded (Tab ID: ${tabId})`);
  console.log('🧪 Test prompt insertion with: window.testPromptInsertion()');
  console.log('🐛 Enable debug mode with: window.enableDebugMode()');
})(); 