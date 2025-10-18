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
      // Only return true for message types that need async responses
      const needsAsyncResponse = [
        'REQUEST_NEXT_PROMPT',
        'START_MULTI_TAB_QUEUE',
        'STOP_MULTI_TAB_QUEUE',
        'START_SINGLE_TAB_QUEUE'
      ].includes(message.type);
      
      this.handleMessage(message, sender, sendResponse);
      return needsAsyncResponse; // Only keep channel open if async response needed
    });

    // Listen for tab removal events
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      this.handleTabRemoved(tabId);
    });

    // Listen for tab updates to detect navigation away from ChatGPT
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        this.handleTabUrlChange(tabId, changeInfo.url);
      }
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'REGISTER_TAB':
        this.registerTab(message.tabId, message.url, sender.tab?.id);
        sendResponse({ success: true });
        break;

      case 'TAB_VISIBILITY_CHANGE':
        this.updateTabVisibility(message.tabId, message.isVisible);
        sendResponse({ success: true });
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
        // Return ALL registered ChatGPT tabs, not just ones actively processing
        const allTabs = Array.from(this.tabs.values()).map(tab => ({
          ...tab,
          status: tab.isActive ? 'processing' : 'ready'
        }));
        console.log(`📋 GET_ACTIVE_TABS: Returning ${allTabs.length} registered tab(s)`);
        sendResponse({ tabs: allTabs });
        break;

      // Forward progress updates to popup
      case 'PROGRESS_UPDATE':
        chrome.runtime.sendMessage(message);
        sendResponse({ success: true });
        break;

      case 'START_SINGLE_TAB_QUEUE':
        this.handleStartSingleTabQueue(message.messages, sendResponse);
        break;
    }
  }

  registerTab(tabId, url, chromeTabId = null) {
    const isChatGPT = url.includes('chat.openai.com') || 
                     url.includes('chatgpt.com') ||
                     url.includes('chat.openai.com/c/') ||
                     url.includes('chatgpt.com/c/');
    
    if (isChatGPT) {
      // Check for tab ID collision
      if (this.tabs.has(tabId)) {
        console.warn(`⚠️ Tab ID collision detected: ${tabId}. Existing tab will be replaced.`);
        // Clean up the existing tab's state
        const existingTab = this.tabs.get(tabId);
        if (existingTab && existingTab.isActive) {
          console.log(`🔄 Deactivating existing tab with same ID: ${tabId}`);
          existingTab.isActive = false;
          existingTab.currentPrompt = null;
        }
      }
      
      this.tabs.set(tabId, {
        tabId: tabId,
        chromeTabId: chromeTabId,
        url: url,
        isActive: false,
        isVisible: true,
        currentPrompt: null,
        registeredAt: Date.now(),
        lastActivity: Date.now()
      });
      console.log(`📝 Registered ChatGPT tab: ${tabId} (${url})`);
    }
  }

  updateTabVisibility(tabId, isVisible) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isVisible = isVisible;
      tab.lastActivity = Date.now();
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
      tab.lastActivity = Date.now();
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
    // Validate and truncate content if necessary
    const maxPromptLength = 10000; // 10KB
    const maxResponseLength = 50000; // 50KB
    
    const truncatedPrompt = prompt && prompt.length > maxPromptLength 
      ? prompt.substring(0, maxPromptLength) + '... [truncated]'
      : prompt;
      
    const truncatedResponse = response && response.length > maxResponseLength
      ? response.substring(0, maxResponseLength) + '... [truncated]'
      : response;
    
    const conversation = {
      prompt: truncatedPrompt,
      response: truncatedResponse,
      timestamp: Date.now(),
      tabId: Array.from(this.tabs.keys())[0] || 'unknown'
    };
    
    // Estimate size in bytes (rough approximation)
    const conversationSize = JSON.stringify(conversation).length * 2; // UTF-16 approximation
    
    console.log(`💾 Storing conversation: "${truncatedPrompt?.substring(0, 50)}..." (${conversationSize} bytes)`);
    
    // Get existing conversations
    chrome.storage.local.get(['conversations'], (result) => {
      const conversations = result.conversations || [];
      
      // Calculate total size
      const totalSize = conversations.reduce((size, conv) => 
        size + JSON.stringify(conv).length * 2, 0
      ) + conversationSize;
      
      // Chrome storage quota is ~5MB per extension
      const maxStorageSize = 4 * 1024 * 1024; // 4MB to be safe
      
      // Remove old conversations if we're approaching the limit
      let currentSize = totalSize;
      while (currentSize > maxStorageSize && conversations.length > 0) {
        const removedConv = conversations.shift();
        console.log(`🗑️ Removed old conversation to free space: "${removedConv.prompt?.substring(0, 30)}..."`);
        
        // Recalculate size after removal
        currentSize = conversations.reduce((size, conv) => 
          size + JSON.stringify(conv).length * 2, 0
        ) + conversationSize;
      }
      
      // Also enforce maximum count limit
      if (conversations.length >= 100) {
        conversations.splice(0, conversations.length - 99);
      }
      
      conversations.push(conversation);
      
      // Final size check
      const finalSize = conversations.reduce((size, conv) => 
        size + JSON.stringify(conv).length * 2, 0
      );
      
      if (finalSize > maxStorageSize) {
        console.warn(`⚠️ Storage size still too large (${finalSize} bytes), storing anyway but may fail`);
      }
      
      // Save back to storage
      chrome.storage.local.set({ conversations: conversations }, () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Error storing conversation:', chrome.runtime.lastError);
          
          // If storage failed due to quota, try removing more conversations
          if (chrome.runtime.lastError.message?.includes('quota')) {
            console.log('🧹 Storage quota exceeded, attempting emergency cleanup...');
            const reducedConversations = conversations.slice(-20); // Keep only last 20
            chrome.storage.local.set({ conversations: reducedConversations }, () => {
              if (chrome.runtime.lastError) {
                console.error('❌ Emergency cleanup also failed:', chrome.runtime.lastError);
              } else {
                console.log(`✅ Emergency cleanup successful. Reduced to ${reducedConversations.length} conversations`);
              }
            });
          }
        } else {
          console.log(`✅ Conversation stored successfully. Total: ${conversations.length} conversations (${finalSize} bytes)`);
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

  async handleStartSingleTabQueue(messages, sendResponse) {
    // Find the first available ChatGPT tab
    const availableTabs = Array.from(this.tabs.values()).filter(tab => {
      const isChatGPT = tab.url.includes('chat.openai.com') || 
                       tab.url.includes('chatgpt.com') ||
                       tab.url.includes('chat.openai.com/c/') ||
                       tab.url.includes('chatgpt.com/c/');
      return isChatGPT && tab.isVisible && tab.chromeTabId;
    });

    if (availableTabs.length === 0) {
      sendResponse({ success: false, error: 'No available ChatGPT tabs found' });
      return;
    }

    const targetTab = availableTabs[0];
    
    try {
      const response = await chrome.tabs.sendMessage(targetTab.chromeTabId, {
        type: 'START_SINGLE_TAB_QUEUE',
        messages: messages
      });
      sendResponse(response);
    } catch (error) {
      console.error('Failed to start single tab queue:', error);
      sendResponse({ success: false, error: error.message });
    }
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

  // Handle tab removal
  handleTabRemoved(chromeTabId) {
    // Find and remove any tabs with this Chrome tab ID
    const toRemove = [];
    for (const [tabId, tab] of this.tabs.entries()) {
      // Try to match by Chrome tab ID if available, or by other criteria
      if (tab.chromeTabId === chromeTabId) {
        toRemove.push(tabId);
      }
    }
    
    for (const tabId of toRemove) {
      console.log(`🗑️ Cleaning up removed tab: ${tabId}`);
      this.tabs.delete(tabId);
    }
  }

  // Handle tab URL changes
  handleTabUrlChange(chromeTabId, newUrl) {
    const isChatGPT = newUrl.includes('chat.openai.com') || 
                     newUrl.includes('chatgpt.com') ||
                     newUrl.includes('chat.openai.com/c/') ||
                     newUrl.includes('chatgpt.com/c/');
    
    // If navigated away from ChatGPT, clean up the tab
    if (!isChatGPT) {
      const toRemove = [];
      for (const [tabId, tab] of this.tabs.entries()) {
        if (tab.chromeTabId === chromeTabId) {
          toRemove.push(tabId);
        }
      }
      
      for (const tabId of toRemove) {
        console.log(`🚫 Cleaning up tab that navigated away from ChatGPT: ${tabId}`);
        this.tabs.delete(tabId);
      }
    }
  }

  // Clean up tabs that are no longer active
  cleanupInactiveTabs() {
    const now = Date.now();
    const toRemove = [];
    
    for (const [tabId, tab] of this.tabs.entries()) {
      // More aggressive cleanup: remove tabs older than 5 minutes OR inactive for 2 minutes
      const isOld = now - tab.registeredAt > 300000; // 5 minutes
      const isInactive = !tab.isActive && now - (tab.lastActivity || tab.registeredAt) > 120000; // 2 minutes
      
      if (isOld || isInactive) {
        toRemove.push(tabId);
      }
    }
    
    for (const tabId of toRemove) {
      console.log(`🧹 Cleaning up inactive tab: ${tabId}`);
      this.tabs.delete(tabId);
    }
    
    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} inactive tabs. ${this.tabs.size} tabs remaining.`);
    }
  }
}

// Initialize the multi-tab manager
const multiTabManager = new MultiTabManager();

// Clean up inactive tabs every minute
setInterval(() => {
  multiTabManager.cleanupInactiveTabs();
}, 60000); 