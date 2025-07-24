// Background service worker for ChatGPT Prompt Queuer
class MultiTabManager {
  constructor() {
    this.tabs = new Map(); // tabId -> tabInfo
    this.queue = [];
    this.isProcessing = false;
    this.currentIndex = 0;
    this.completedPrompts = new Set();
    
    this.init();
  }

  init() {
    chrome.runtime.onInstalled.addListener(() => {
      console.log('ChatGPT Prompt Queuer extension installed');
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'REGISTER_TAB':
        this.registerTab(message.tabId, message.url);
        sendResponse({ success: true });
        break;

      case 'TAB_VISIBILITY_CHANGE':
        this.updateTabVisibility(message.tabId, message.isVisible);
        break;

      case 'REQUEST_NEXT_PROMPT':
        this.handlePromptRequest(message.tabId, sendResponse);
        break;

      case 'PROMPT_COMPLETED':
        this.handlePromptCompleted(message.tabId, message.prompt, message.response);
        sendResponse({ success: true });
        break;

      case 'TAB_FINISHED':
        this.handleTabFinished(message.tabId);
        sendResponse({ success: true });
        break;

      case 'TAB_ERROR':
        this.handleTabError(message.tabId, message.error);
        sendResponse({ success: true });
        break;

      case 'START_MULTI_TAB_QUEUE':
        this.startMultiTabQueue(message.messages, sendResponse);
        break;

      case 'STOP_MULTI_TAB_QUEUE':
        this.stopMultiTabQueue(sendResponse);
        break;

      case 'GET_QUEUE_STATUS':
        sendResponse({
          isProcessing: this.isProcessing,
          queueLength: this.queue.length,
          currentIndex: this.currentIndex,
          completedCount: this.completedPrompts.size,
          activeTabs: Array.from(this.tabs.values()).filter(tab => tab.isActive).length
        });
        break;

      case 'GET_ACTIVE_TABS':
        sendResponse({
          tabs: Array.from(this.tabs.values()).filter(tab => tab.isActive)
        });
        break;

      // Forward progress updates to popup
      case 'PROGRESS_UPDATE':
        chrome.runtime.sendMessage(message);
        break;
    }
  }

  registerTab(tabId, url) {
    const isChatGPT = url.includes('chat.openai.com') || 
                     url.includes('chatgpt.com') ||
                     url.includes('chat.openai.com/c/') ||
                     url.includes('chatgpt.com/c/');
    
    if (isChatGPT) {
      this.tabs.set(tabId, {
        tabId: tabId,
        url: url,
        isActive: false,
        isVisible: true,
        currentPrompt: null,
        registeredAt: Date.now()
      });
      console.log(`📝 Registered ChatGPT tab: ${tabId} (${url})`);
    }
  }

  updateTabVisibility(tabId, isVisible) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isVisible = isVisible;
    }
  }

  async handlePromptRequest(tabId, sendResponse) {
    if (!this.isProcessing || this.currentIndex >= this.queue.length) {
      sendResponse({ prompt: null });
      return;
    }

    const prompt = this.queue[this.currentIndex];
    const promptIndex = this.currentIndex;
    this.currentIndex++;

    // Update tab info
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isActive = true;
      tab.currentPrompt = prompt;
      tab.currentPromptIndex = promptIndex;
    }

    console.log(`📤 [Tab ${tabId}] Assigned prompt ${promptIndex + 1}/${this.queue.length}: "${prompt}"`);
    sendResponse({ prompt: prompt, index: promptIndex });
  }

  handlePromptCompleted(tabId, prompt, response) {
    this.completedPrompts.add(prompt);
    
    // Store the prompt-response pair
    if (response) {
      this.storePromptResponse(prompt, response);
    }
    
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.currentPrompt = null;
      tab.currentPromptIndex = null;
    }

    console.log(`✅ [Tab ${tabId}] Completed prompt: "${prompt}"`);
    
    // Check if all prompts are completed
    if (this.completedPrompts.size >= this.queue.length) {
      this.onQueueComplete();
    }
  }

  storePromptResponse(prompt, response) {
    const conversation = {
      prompt: prompt,
      response: response,
      timestamp: Date.now(),
      tabId: Array.from(this.tabs.keys())[0] || 'unknown'
    };
    
    console.log(`💾 Storing conversation: "${prompt.substring(0, 50)}..." with response length: ${response ? response.length : 0}`);
    
    // Get existing conversations
    chrome.storage.local.get(['conversations'], (result) => {
      const conversations = result.conversations || [];
      conversations.push(conversation);
      
      // Keep only last 100 conversations to prevent storage bloat
      if (conversations.length > 100) {
        conversations.splice(0, conversations.length - 100);
      }
      
      // Save back to storage
      chrome.storage.local.set({ conversations: conversations }, () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Error storing conversation:', chrome.runtime.lastError);
        } else {
          console.log(`✅ Conversation stored successfully. Total conversations: ${conversations.length}`);
        }
      });
    });
  }

  handleTabFinished(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isActive = false;
      tab.currentPrompt = null;
    }
    console.log(`🏁 [Tab ${tabId}] Finished processing`);
  }

  handleTabError(tabId, error) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isActive = false;
      tab.currentPrompt = null;
    }
    console.error(`❌ [Tab ${tabId}] Error: ${error}`);
  }

  async startMultiTabQueue(messages, sendResponse) {
    // Get all active ChatGPT tabs
    const activeTabs = Array.from(this.tabs.values()).filter(tab => {
      const isChatGPT = tab.url.includes('chat.openai.com') || 
                       tab.url.includes('chatgpt.com') ||
                       tab.url.includes('chat.openai.com/c/') ||
                       tab.url.includes('chatgpt.com/c/');
      return isChatGPT && tab.isVisible;
    });

    if (activeTabs.length === 0) {
      sendResponse({ success: false, error: 'No active ChatGPT tabs found' });
      return;
    }

    if (messages.length === 0) {
      sendResponse({ success: false, error: 'No prompts in queue' });
      return;
    }

    // Initialize queue
    this.queue = [...messages];
    this.currentIndex = 0;
    this.completedPrompts.clear();
    this.isProcessing = true;

    console.log(`🚀 Starting multi-tab queue with ${messages.length} prompts across ${activeTabs.length} tabs`);

    // Start processing on all active tabs
    const startPromises = activeTabs.map(async (tab) => {
      try {
        const response = await chrome.tabs.sendMessage(tab.tabId, {
          type: 'START_QUEUE'
        });
        return { tabId: tab.tabId, success: true };
      } catch (error) {
        console.error(`Failed to start queue on tab ${tab.tabId}:`, error);
        return { tabId: tab.tabId, success: false, error: error.message };
      }
    });

    const results = await Promise.all(startPromises);
    const successfulTabs = results.filter(r => r.success);

    if (successfulTabs.length === 0) {
      this.isProcessing = false;
      sendResponse({ success: false, error: 'Failed to start queue on any tabs' });
      return;
    }

    console.log(`✅ Started queue on ${successfulTabs.length} tabs`);
    sendResponse({ 
      success: true, 
      activeTabs: successfulTabs.length,
      totalPrompts: messages.length
    });
  }

  stopMultiTabQueue(sendResponse) {
    this.isProcessing = false;
    this.currentIndex = 0;
    this.completedPrompts.clear();
    this.queue = []; // Clear the queue

    // Stop all active tabs
    this.tabs.forEach((tab, tabId) => {
      if (tab.isActive) {
        chrome.tabs.sendMessage(tabId, { type: 'STOP_QUEUE' }).catch(() => {
          // Tab might be closed, ignore errors
        });
        tab.isActive = false;
        tab.currentPrompt = null;
      }
    });

    console.log('🛑 Stopped multi-tab queue and cleared queue');
    sendResponse({ success: true });
  }

  onQueueComplete() {
    this.isProcessing = false;
    console.log('🎉 Multi-tab queue completed!');
    
    // Notify popup
    chrome.runtime.sendMessage({
      type: 'QUEUE_COMPLETE',
      totalPrompts: this.queue.length,
      activeTabs: Array.from(this.tabs.values()).filter(tab => tab.isActive).length
    });
  }

  // Clean up tabs that are no longer active
  cleanupInactiveTabs() {
    const now = Date.now();
    for (const [tabId, tab] of this.tabs.entries()) {
      if (now - tab.registeredAt > 300000) { // 5 minutes
        this.tabs.delete(tabId);
      }
    }
  }
}

// Initialize the multi-tab manager
const multiTabManager = new MultiTabManager();

// Clean up inactive tabs every minute
setInterval(() => {
  multiTabManager.cleanupInactiveTabs();
}, 60000); 