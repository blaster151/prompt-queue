// In-page UI for ChatGPT Prompt Queuer
(() => {
  let isUIVisible = false;
  let queue = [];
  let isProcessing = false;
  let currentProcessingIndex = -1;
  let completedPrompts = new Set();
  let multiTabMode = false;
  let activeTabs = [];
  let queueStatus = {};

  // Create the UI container
  function createUIContainer() {
    const container = document.createElement('div');
    container.id = 'prompt-queuer-ui';
    container.innerHTML = `
      <div class="pq-header">
        <div class="pq-title">🤖 Prompt Queuer</div>
        <div class="pq-controls">
          <button class="pq-toggle" id="pq-toggle">⚡</button>
          <button class="pq-close" id="pq-close">×</button>
        </div>
      </div>
      <div class="pq-content" id="pq-content" style="display: none;">
        <div class="pq-tabs">
          <button class="pq-tab active" data-tab="manual">Manual</button>
          <button class="pq-tab" data-tab="matrix">List</button>
          <button class="pq-tab" data-tab="queue">Queue</button>
          <button class="pq-tab" data-tab="multi">Multi-Tab</button>
          <button class="pq-tab" data-tab="history">History</button>
        </div>
        
        <!-- Manual Tab -->
        <div class="pq-tab-content active" id="manual">
          <div class="pq-input-group">
            <label>Single Prompt:</label>
            <textarea id="pq-single-prompt" placeholder="Enter your prompt here..."></textarea>
            <button class="pq-button primary" id="pq-add-single">Add to Queue</button>
          </div>
        </div>

        <!-- List Tab -->
        <div class="pq-tab-content" id="matrix">
          <div class="pq-input-group">
            <label>List Data:</label>
            <textarea id="pq-matrix-input" placeholder="Paste your data here...&#10;&#10;• One prompt per line&#10;• Multi-column data will be concatenated"></textarea>
            <button class="pq-button primary" id="pq-parse-matrix">Parse & Add</button>
          </div>
        </div>

        <!-- Queue Tab -->
        <div class="pq-tab-content" id="queue">
          <div class="pq-mode-selector">
            <button class="pq-mode-btn active" data-mode="single">Single Tab</button>
            <button class="pq-mode-btn" data-mode="multi">Multi Tab</button>
          </div>
          
          <div class="pq-progress" id="pq-progress" style="display: none;">
            <div class="pq-status" id="pq-status">Processing...</div>
            <div class="pq-progress-bar">
              <div class="pq-progress-fill" id="pq-progress-fill"></div>
            </div>
            <div class="pq-status" id="pq-progress-text">0 / 0</div>
          </div>

          <div class="pq-queue-list" id="pq-queue-list">
            <div class="pq-empty-state">
              <p>No prompts in queue</p>
              <p>Add prompts from Manual or List tabs</p>
            </div>
          </div>

          <button class="pq-button primary" id="pq-start-queue" disabled>Start Queue</button>
          <button class="pq-button warning" id="pq-stop-queue" disabled>Stop Queue</button>
          <button class="pq-button danger" id="pq-clear-queue">Clear Queue</button>
        </div>

        <!-- Multi-Tab Tab -->
        <div class="pq-tab-content" id="multi">
          <div class="pq-stats" id="pq-multi-stats">
            <div class="pq-stat-item">
              <span class="pq-stat-value" id="pq-active-tabs-count">0</span>
              <span>Active Tabs</span>
            </div>
            <div class="pq-stat-item">
              <span class="pq-stat-value" id="pq-queue-length">0</span>
              <span>Queue Length</span>
            </div>
            <div class="pq-stat-item">
              <span class="pq-stat-value" id="pq-completed-count">0</span>
              <span>Completed</span>
            </div>
          </div>

          <div class="pq-tabs-info" id="pq-tabs-info">
            <div class="pq-empty-state">
              <p>No ChatGPT tabs detected</p>
              <p>Open multiple ChatGPT tabs to use multi-tab mode</p>
            </div>
          </div>

          <button class="pq-button primary" id="pq-start-multi-queue" disabled>Start Multi-Tab Queue</button>
          <button class="pq-button warning" id="pq-stop-multi-queue" disabled>Stop Queue</button>
          <button class="pq-button" id="pq-refresh-tabs">Refresh Tab List</button>
        </div>

        <!-- History Tab -->
        <div class="pq-tab-content" id="history">
          <div class="pq-history-controls">
            <button class="pq-button" id="pq-load-history">Load History</button>
            <button class="pq-button danger" id="pq-clear-history">Clear History</button>
            <button class="pq-button" id="pq-export-history">Export History</button>
          </div>

          <div class="pq-history-list" id="pq-history-list">
            <div class="pq-empty-state">
              <p>No conversation history</p>
              <p>Complete some prompts to see them here</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add styles
    const styles = document.createElement('style');
    styles.textContent = `
      #prompt-queuer-ui {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: white;
        font-size: 12px;
        max-height: 80vh;
        overflow: hidden;
      }

      .pq-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        background: #2a2a2a;
        border-bottom: 1px solid #333;
        border-radius: 8px 8px 0 0;
      }

      .pq-title {
        font-weight: 600;
        font-size: 14px;
      }

      .pq-controls {
        display: flex;
        gap: 5px;
      }

      .pq-toggle, .pq-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 14px;
      }

      .pq-toggle:hover, .pq-close:hover {
        background: rgba(255,255,255,0.1);
      }

      .pq-content {
        max-height: calc(80vh - 50px);
        overflow-y: auto;
      }

      .pq-tabs {
        display: flex;
        background: #2a2a2a;
        border-bottom: 1px solid #333;
      }

      .pq-tab {
        flex: 1;
        background: none;
        border: none;
        color: white;
        padding: 8px;
        cursor: pointer;
        font-size: 11px;
        border-bottom: 2px solid transparent;
      }

      .pq-tab.active {
        border-bottom-color: #4CAF50;
        background: rgba(76, 175, 80, 0.1);
      }

      .pq-tab-content {
        display: none;
        padding: 15px;
      }

      .pq-tab-content.active {
        display: block;
      }

      .pq-input-group {
        margin-bottom: 15px;
      }

      .pq-input-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
      }

      .pq-input-group textarea {
        width: 100%;
        min-height: 60px;
        padding: 8px;
        border: 1px solid #444;
        border-radius: 4px;
        background: #333;
        color: white;
        font-size: 11px;
        resize: vertical;
        font-family: inherit;
      }

      .pq-button {
        width: 100%;
        padding: 8px;
        border: none;
        border-radius: 4px;
        background: #444;
        color: white;
        font-size: 11px;
        cursor: pointer;
        margin-bottom: 8px;
        transition: background 0.2s;
      }

      .pq-button:hover {
        background: #555;
      }

      .pq-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .pq-button.primary {
        background: #4CAF50;
      }

      .pq-button.primary:hover {
        background: #45a049;
      }

      .pq-button.warning {
        background: #ff9800;
      }

      .pq-button.warning:hover {
        background: #f57c00;
      }

      .pq-button.danger {
        background: #f44336;
      }

      .pq-button.danger:hover {
        background: #da190b;
      }

      .pq-queue-list {
        max-height: 150px;
        overflow-y: auto;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 15px;
      }

      .pq-queue-item {
        display: flex;
        align-items: center;
        padding: 5px;
        margin-bottom: 5px;
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        font-size: 11px;
      }

      .pq-queue-item.processing {
        background: rgba(255, 152, 0, 0.2);
        border-left: 3px solid #ff9800;
      }

      .pq-queue-item.completed {
        background: rgba(76, 175, 80, 0.1);
        border-left: 3px solid #4CAF50;
        opacity: 0.7;
      }

      .pq-queue-item .index {
        font-weight: 600;
        margin-right: 8px;
        min-width: 20px;
      }

      .pq-queue-item .text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .pq-queue-item .status {
        margin-left: 5px;
        font-size: 10px;
      }

      .pq-remove-btn {
        background: none;
        border: none;
        color: #ff4444;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        padding: 0 5px;
        margin-left: 5px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .pq-remove-btn:hover {
        opacity: 1;
        color: #ff6666;
      }

      .pq-empty-state {
        text-align: center;
        padding: 20px;
        opacity: 0.6;
      }

      .pq-empty-state p {
        font-size: 11px;
        margin-bottom: 5px;
      }

      .pq-progress {
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 15px;
        text-align: center;
      }

      .pq-progress-bar {
        width: 100%;
        height: 4px;
        background: rgba(255,255,255,0.2);
        border-radius: 2px;
        overflow: hidden;
        margin: 8px 0;
      }

      .pq-progress-fill {
        height: 100%;
        background: #4CAF50;
        transition: width 0.3s ease;
      }

      .pq-status {
        font-size: 11px;
        opacity: 0.8;
      }

      .pq-mode-selector {
        display: flex;
        margin-bottom: 15px;
      }

      .pq-mode-btn {
        flex: 1;
        background: #444;
        border: none;
        color: white;
        padding: 6px;
        cursor: pointer;
        font-size: 10px;
        border-radius: 4px 0 0 4px;
      }

      .pq-mode-btn:last-child {
        border-radius: 0 4px 4px 0;
      }

      .pq-mode-btn.active {
        background: #4CAF50;
      }

      .pq-stats {
        display: flex;
        justify-content: space-between;
        margin-bottom: 15px;
        font-size: 10px;
        opacity: 0.8;
      }

      .pq-stat-item {
        text-align: center;
      }

      .pq-stat-value {
        font-size: 14px;
        font-weight: 600;
        display: block;
      }

      .pq-history-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 15px;
      }

      .pq-history-controls .pq-button {
        flex: 1;
        padding: 6px;
        font-size: 10px;
        margin-bottom: 0;
      }

      .pq-history-list {
        max-height: 200px;
        overflow-y: auto;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 10px;
      }

      .pq-history-item {
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 8px;
        font-size: 11px;
      }

      .pq-history-prompt {
        font-weight: 600;
        margin-bottom: 8px;
        color: #fff;
      }

      .pq-history-response {
        background: rgba(0,0,0,0.2);
        border-radius: 4px;
        padding: 8px;
        margin-top: 6px;
        max-height: 100px;
        overflow-y: auto;
        line-height: 1.4;
        font-size: 10px;
      }

      .pq-history-meta {
        font-size: 9px;
        opacity: 0.6;
        margin-top: 6px;
      }

      .pq-history-actions {
        display: flex;
        gap: 4px;
        margin-top: 6px;
      }

      .pq-history-actions button {
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        padding: 3px 6px;
        border-radius: 3px;
        font-size: 9px;
        cursor: pointer;
      }

      .pq-history-actions button:hover {
        background: rgba(255,255,255,0.2);
      }

      .pq-tabs-info {
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 15px;
      }

      .pq-tab-info {
        display: flex;
        align-items: center;
        padding: 6px;
        margin-bottom: 4px;
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        font-size: 10px;
      }

      .pq-status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 8px;
      }

      .pq-status-indicator.active {
        background: #4CAF50;
      }

      .pq-status-indicator.inactive {
        background: #666;
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(container);

    return container;
  }

  // Initialize the UI
  function initUI() {
    const container = createUIContainer();
    setupEventListeners(container);
    loadQueue();
    loadHistory(container);
  }

  // Setup event listeners
  function setupEventListeners(container) {
    // Toggle UI visibility
    container.querySelector('#pq-toggle').addEventListener('click', () => {
      const content = container.querySelector('#pq-content');
      isUIVisible = !isUIVisible;
      content.style.display = isUIVisible ? 'block' : 'none';
    });

    // Close UI
    container.querySelector('#pq-close').addEventListener('click', () => {
      container.remove();
    });

    // Tab switching
    container.querySelectorAll('.pq-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchTab(tab.dataset.tab, container);
      });
    });

    // Mode switching
    container.querySelectorAll('.pq-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchMode(btn.dataset.mode, container);
      });
    });

    // Manual prompt addition
    container.querySelector('#pq-add-single').addEventListener('click', () => {
      addSinglePrompt(container);
    });

    // Matrix parsing
    container.querySelector('#pq-parse-matrix').addEventListener('click', () => {
      parseMatrix(container);
    });

    // Queue controls
    container.querySelector('#pq-start-queue').addEventListener('click', () => {
      startQueue(container);
    });

    container.querySelector('#pq-stop-queue').addEventListener('click', () => {
      stopQueue(container);
    });

    container.querySelector('#pq-clear-queue').addEventListener('click', () => {
      clearQueue(container);
    });

    // Multi-tab controls
    container.querySelector('#pq-start-multi-queue').addEventListener('click', () => {
      startMultiTabQueue(container);
    });

    container.querySelector('#pq-stop-multi-queue').addEventListener('click', () => {
      stopMultiTabQueue(container);
    });

    container.querySelector('#pq-refresh-tabs').addEventListener('click', () => {
      refreshTabList(container);
    });

    // History controls
    container.querySelector('#pq-load-history').addEventListener('click', () => {
      loadHistory(container);
    });

    container.querySelector('#pq-clear-history').addEventListener('click', () => {
      clearHistory(container);
    });

    container.querySelector('#pq-export-history').addEventListener('click', () => {
      exportHistory(container);
    });

    // Enter key support
    container.querySelector('#pq-single-prompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        addSinglePrompt(container);
      }
    });

    // Queue item remove buttons (delegated event listener)
    container.querySelector('#pq-queue-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('pq-remove-btn')) {
        const index = parseInt(e.target.dataset.index);
        queue.splice(index, 1);
        saveQueue();
        updateUI(container);
        console.log(`🗑️ Removed queue item at index ${index}`);
      }
    });
  }

  // Tab switching
  function switchTab(tabName, container) {
    container.querySelectorAll('.pq-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    container.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    container.querySelectorAll('.pq-tab-content').forEach(content => {
      content.classList.remove('active');
    });
    container.querySelector(`#${tabName}`).classList.add('active');

    if (tabName === 'multi') {
      refreshTabList(container);
    } else if (tabName === 'history') {
      loadHistory(container);
    }
  }

  // Mode switching
  function switchMode(mode, container) {
    multiTabMode = mode === 'multi';
    
    container.querySelectorAll('.pq-mode-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    container.querySelector(`[data-mode="${mode}"]`).classList.add('active');

    updateUI(container);
  }

  // Add single prompt
  function addSinglePrompt(container) {
    const textarea = container.querySelector('#pq-single-prompt');
    const prompt = textarea.value.trim();
    
    if (prompt) {
      queue.push(prompt);
      saveQueue();
      updateUI(container);
      textarea.value = '';
      switchTab('queue', container);
    }
  }

  // Parse matrix
  function parseMatrix(container) {
    const textarea = container.querySelector('#pq-matrix-input');
    const input = textarea.value.trim();
    
    if (!input) return;

    try {
      const parsed = parseMatrixLocal(input);
      
      if (parsed && parsed.length > 0) {
        queue.push(...parsed);
        saveQueue();
        updateUI(container);
        textarea.value = '';
        switchTab('queue', container);
      } else {
        alert('No valid messages found in matrix data');
      }
    } catch (error) {
      console.error('Error parsing matrix:', error);
      alert('Error parsing matrix data. Please check the format.');
    }
  }

  // List parsing logic (same as popup)
  function parseMatrixLocal(input) {
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
  }

  // Start queue
  async function startQueue(container) {
    if (queue.length === 0 || isProcessing) return;

    try {
      if (multiTabMode) {
        await startMultiTabQueue(container);
      } else {
        console.log('Starting single tab queue with messages:', queue);
        isProcessing = true;
        saveQueue();
        updateUI(container);
        showProgress(container);

        // Initialize progress bar
        updateProgressBar(container, 0, queue.length);

        // Delegate to content script via message passing
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'START_SINGLE_TAB_QUEUE',
            messages: queue
          });
          
          if (response && response.success) {
            console.log('✅ Single tab queue started via content script');
          } else {
            throw new Error(response?.error || 'Failed to start single tab queue');
          }
        } catch (error) {
          console.error('❌ Failed to start queue via content script, trying direct method:', error);
          
          // Fallback: try direct content script access
          if (window.runPromptQueuerSingleTab) {
            window.localQueue = [...queue];
            window.localQueueIndex = 0;
            if (window.setActive) window.setActive(true);
            window.runPromptQueuerSingleTab();
          } else {
            throw new Error('Content script not available');
          }
        }
        
        console.log('Content script queue started');
      }
    } catch (error) {
      console.error('Error starting queue:', error);
      alert('Error starting queue. Make sure you\'re on ChatGPT.');
      isProcessing = false;
      updateUI(container);
    }
  }

  // Stop queue
  async function stopQueue(container) {
    try {
      // Stop the content script queue directly
      window.localQueue = null;
      window.localQueueIndex = 0;
      
      isProcessing = false;
      hideProgress(container);
      
      queue = [];
      saveQueue();
      
      updateUI(container);
      console.log('🛑 Queue stopped and cleared');
    } catch (error) {
      console.error('Error stopping queue:', error);
    }
  }

  // Clear queue
  function clearQueue(container) {
    queue = [];
    saveQueue();
    updateUI(container);
  }

  // Multi-tab functions
  async function startMultiTabQueue(container) {
    if (queue.length === 0) {
      alert('No prompts in queue');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_MULTI_TAB_QUEUE',
        messages: queue
      });

      if (response.success) {
        isProcessing = true;
        saveQueue();
        updateUI(container);
        console.log(`Started multi-tab queue with ${response.activeTabs} tabs`);
      } else {
        if (response.error && response.error.includes('No active ChatGPT tabs')) {
          alert('No ChatGPT tabs found. Please open ChatGPT in one or more tabs to use multi-tab mode.');
        } else {
          alert(response.error || 'Failed to start multi-tab queue');
        }
      }
    } catch (error) {
      console.error('Error starting multi-tab queue:', error);
      alert('Error starting multi-tab queue');
    }
  }

  async function stopMultiTabQueue(container) {
    try {
      await chrome.runtime.sendMessage({
        type: 'STOP_MULTI_TAB_QUEUE'
      });
      
      isProcessing = false;
      queue = [];
      saveQueue();
      
      updateUI(container);
      console.log('🛑 Multi-tab queue stopped and cleared');
    } catch (error) {
      console.error('Error stopping multi-tab queue:', error);
    }
  }

  async function refreshTabList(container) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ACTIVE_TABS'
      });

      activeTabs = response.tabs || [];
      updateMultiTabUI(container);
    } catch (error) {
      console.error('Error refreshing tab list:', error);
    }
  }

  // History functions
  async function loadHistory(container) {
    try {
      const result = await chrome.storage.local.get(['conversations']);
      const conversations = result.conversations || [];
      
      console.log(`📚 Loading history: ${conversations.length} conversations found`);
      
      const historyList = container.querySelector('#pq-history-list');
      
      if (conversations.length === 0) {
        historyList.innerHTML = `
          <div class="pq-empty-state">
            <p>No conversation history</p>
            <p>Complete some prompts to see them here</p>
          </div>
        `;
        return;
      }
      
      conversations.sort((a, b) => b.timestamp - a.timestamp);
      
      historyList.innerHTML = conversations.map((conv, index) => {
        const date = new Date(conv.timestamp).toLocaleString();
        const promptPreview = conv.prompt.length > 100 ? 
          conv.prompt.substring(0, 100) + '...' : conv.prompt;
        
        return `
          <div class="pq-history-item">
            <div class="pq-history-prompt">${escapeHtml(promptPreview)}</div>
            <div class="pq-history-response">${conv.response || 'No response captured'}</div>
            <div class="pq-history-meta">${date} • Tab: ${conv.tabId}</div>
            <div class="pq-history-actions">
              <button onclick="copyToClipboard('${escapeHtml(conv.prompt)}')">Copy Prompt</button>
              <button onclick="copyToClipboard('${escapeHtml(conv.response)}')">Copy Response</button>
            </div>
          </div>
        `;
      }).join('');
      
      console.log(`✅ History loaded: ${conversations.length} conversations displayed`);
      
    } catch (error) {
      console.error('Error loading history:', error);
    }
  }

  async function clearHistory(container) {
    if (confirm('Are you sure you want to clear all conversation history?')) {
      try {
        await chrome.storage.local.remove(['conversations']);
        loadHistory(container);
        console.log('History cleared');
      } catch (error) {
        console.error('Error clearing history:', error);
      }
    }
  }

  async function exportHistory(container) {
    try {
      const result = await chrome.storage.local.get(['conversations']);
      const conversations = result.conversations || [];
      
      if (conversations.length === 0) {
        alert('No history to export');
        return;
      }
      
      const exportData = {
        exportDate: new Date().toISOString(),
        totalConversations: conversations.length,
        conversations: conversations
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatgpt-conversations-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      console.log('History exported');
    } catch (error) {
      console.error('Error exporting history:', error);
    }
  }

  // Clipboard functions with better permissions
  function copyToClipboard(text) {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        console.log('✅ Copied to clipboard (modern API)');
      }).catch(err => {
        console.error('❌ Modern clipboard API failed:', err);
        fallbackCopyToClipboard(text);
      });
    } else {
      fallbackCopyToClipboard(text);
    }
  }

  function fallbackCopyToClipboard(text) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      
      document.body.removeChild(textArea);
      
      if (successful) {
        console.log('✅ Copied to clipboard (fallback method)');
      } else {
        console.error('❌ Fallback copy failed');
        alert('Copy failed. Please copy manually: ' + text.substring(0, 100) + '...');
      }
    } catch (err) {
      console.error('❌ Fallback copy error:', err);
      alert('Copy failed. Please copy manually: ' + text.substring(0, 100) + '...');
    }
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function saveQueue() {
    chrome.storage.local.set({ queue: queue });
  }

  async function loadQueue() {
    try {
      const result = await chrome.storage.local.get(['queue']);
      queue = result.queue || [];
      console.log('Loaded queue:', queue);
    } catch (error) {
      console.error('Error loading queue:', error);
      queue = [];
    }
  }

  function updateUI(container) {
    const queueList = container.querySelector('#pq-queue-list');
    const startButton = container.querySelector('#pq-start-queue');
    const stopButton = container.querySelector('#pq-stop-queue');

    console.log('Updating UI with queue length:', queue.length);

    // Update start button
    startButton.disabled = queue.length === 0 || isProcessing;
    startButton.textContent = isProcessing ? 'Processing...' : 'Start Queue';
    
    // Update stop button
    stopButton.disabled = !isProcessing;
    stopButton.style.display = isProcessing ? 'block' : 'none';

    // Update queue list
    if (queue.length === 0) {
      queueList.innerHTML = `
        <div class="pq-empty-state">
          <p>No prompts in queue</p>
          <p>Add prompts from Manual or List tabs</p>
        </div>
      `;
    } else {
      queueList.innerHTML = queue.map((prompt, index) => {
        const isProcessingItem = isProcessing && currentProcessingIndex === index;
        const isCompleted = completedPrompts.has(index);
        
        let statusClass = '';
        let statusText = '';
        
        if (isCompleted) {
          statusClass = 'completed';
          statusText = '✅';
        } else if (isProcessingItem) {
          statusClass = 'processing';
          statusText = '⏳';
        }
        
        return `
          <div class="pq-queue-item ${statusClass}">
            <div class="index">${index + 1}</div>
            <div class="text">${escapeHtml(prompt)}</div>
            <div class="status">${statusText}</div>
            <button class="pq-remove-btn" data-index="${index}" title="Remove from queue">×</button>
          </div>
        `;
      }).join('');
    }

    // Update multi-tab UI if on multi tab
    if (container.querySelector('#multi').classList.contains('active')) {
      updateMultiTabUI(container);
    }
  }

  function updateMultiTabUI(container) {
    const startButton = container.querySelector('#pq-start-multi-queue');
    const stopButton = container.querySelector('#pq-stop-multi-queue');

    if (activeTabs.length === 0) {
      container.querySelector('#pq-tabs-info').innerHTML = `
        <div class="pq-empty-state">
          <p>No ChatGPT tabs detected</p>
          <p>Open multiple ChatGPT tabs to use multi-tab mode</p>
        </div>
      `;
    } else {
      container.querySelector('#pq-tabs-info').innerHTML = activeTabs.map(tab => `
        <div class="pq-tab-info">
          <div class="pq-status-indicator ${tab.isActive ? 'active' : 'inactive'}"></div>
          <div class="tab-details">
            <div>Tab ${tab.tabId}</div>
            <div style="font-size: 9px; opacity: 0.7;">
              ${tab.isActive ? 'Processing' : 'Ready'}
              ${tab.currentPrompt ? `: "${tab.currentPrompt.substring(0, 20)}..."` : ''}
            </div>
          </div>
        </div>
      `).join('');
    }

    startButton.disabled = queue.length === 0 || isProcessing || activeTabs.length === 0;
    stopButton.disabled = !isProcessing;
  }

  function showProgress(container) {
    container.querySelector('#pq-progress').style.display = 'block';
  }

  function hideProgress(container) {
    container.querySelector('#pq-progress').style.display = 'none';
  }

  // Progress update function for content script to call
  window.updateQueueProgress = function(promptIndex, status) {
    console.log(`📊 Progress update: ${promptIndex} - ${status}`);
    
    if (status === 'processing') {
      currentProcessingIndex = promptIndex;
    } else if (status === 'completed') {
      completedPrompts.add(promptIndex);
      currentProcessingIndex = -1;
    }
    
    // Update the UI
    const container = document.querySelector('#prompt-queuer-ui');
    if (container) {
      updateUI(container);
      updateProgressBar(container, promptIndex + 1, queue.length);
    }
  };

  // Update progress bar
  function updateProgressBar(container, current, total) {
    const progressFill = container.querySelector('#pq-progress-fill');
    const progressText = container.querySelector('#pq-progress-text');
    
    if (progressFill && progressText) {
      const percentage = (current / total) * 100;
      progressFill.style.width = `${percentage}%`;
      progressText.textContent = `${current} / ${total}`;
    }
  }

  // Message listener for progress updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 In-page UI received message:', message.type);
    
    if (message.type === 'PROGRESS_UPDATE') {
      updateProgress(message.tabId, message.prompt, message.status, message.promptIndex);
    } else if (message.type === 'QUEUE_COMPLETE') {
      onQueueComplete(message.totalPrompts, message.activeTabs);
    }
    
    // Don't block other listeners
    return false;
  });

  function updateProgress(tabId, prompt, status, promptIndex) {
    const container = document.querySelector('#prompt-queuer-ui');
    if (!container) return;

    const progressFill = container.querySelector('#pq-progress-fill');
    const progressText = container.querySelector('#pq-progress-text');
    const statusEl = container.querySelector('#pq-status');

    console.log('Progress update:', { tabId, prompt, status, promptIndex });

    if (status === 'sending') {
      statusEl.textContent = `[Tab ${tabId}] Sending: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`;
      
      if (multiTabMode && promptIndex !== undefined) {
        currentProcessingIndex = promptIndex;
        completedPrompts.add(promptIndex);
        updateUI(container);
      } else if (!multiTabMode && queue.length > 0) {
        const queueIndex = queue.indexOf(prompt);
        currentProcessingIndex = queueIndex;
        
        const estimatedProgress = Math.min(90, (queueIndex + 1) / queue.length * 100);
        progressFill.style.width = `${estimatedProgress}%`;
        progressText.textContent = `${queueIndex + 1} / ${queue.length}`;
        
        updateUI(container);
      }
    } else if (status === 'completed') {
      if (multiTabMode && promptIndex !== undefined) {
        completedPrompts.add(promptIndex);
      } else {
        const queueIndex = queue.indexOf(prompt);
        if (queueIndex !== -1) {
          completedPrompts.add(queueIndex);
        }
      }
      updateUI(container);
    }
  }

  function onQueueComplete(totalPrompts, activeTabs) {
    console.log(`🏁 Queue completion received: ${totalPrompts} prompts, ${activeTabs} tabs`);
    console.log(`🏁 Current queue length: ${queue.length}, isProcessing: ${isProcessing}`);
    
    const container = document.querySelector('#prompt-queuer-ui');
    if (!container) return;
    
    if (isProcessing && queue.length > 0) {
      isProcessing = false;
      currentProcessingIndex = -1;
      
      queue = [];
      saveQueue();
      
      hideProgress(container);
      updateUI(container);
      
      const status = container.querySelector('#pq-status');
      if (status) {
        status.textContent = `✅ Queue completed! Processed ${totalPrompts} prompts across ${activeTabs} tabs`;
        setTimeout(() => {
          hideProgress(container);
        }, 3000);
      }
      
      console.log(`🏁 Queue completed and cleared. Processed ${totalPrompts} prompts across ${activeTabs} tabs`);
    } else {
      console.log(`⚠️ Ignoring queue completion - not processing or queue already empty`);
    }
  }

  // Initialize when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // Make copyToClipboard globally available for onclick handlers
  window.copyToClipboard = copyToClipboard;

  console.log('✅ In-page Prompt Queuer UI loaded');
})(); 