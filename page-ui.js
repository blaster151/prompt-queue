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
  let savedSeries = []; // Saved prompt series

  // Helper functions for queue item structure
  const createQueueItem = (text, attachments = []) => ({
    text: text,
    attachments: attachments // Array of { type, data, name, mimeType, size }
  });

  const normalizeQueueItem = (item) => {
    // Backwards compatibility: convert strings to objects
    if (typeof item === 'string') {
      return createQueueItem(item);
    }
    // Ensure attachments array exists
    if (!item.attachments) {
      item.attachments = [];
    }
    return item;
  };

  const getQueueItemText = (item) => {
    return typeof item === 'string' ? item : item.text;
  };

  const normalizeQueue = (q) => {
    return q.map(item => normalizeQueueItem(item));
  };

  // File/Image handling functions
  const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addAttachmentToQueueItem = async (itemIndex, file) => {
    try {
      const dataURL = await readFileAsDataURL(file);
      const attachment = {
        type: file.type.startsWith('image/') ? 'image' : 'file',
        data: dataURL,
        name: file.name,
        mimeType: file.type,
        size: file.size
      };

      const item = normalizeQueueItem(queue[itemIndex]);
      item.attachments.push(attachment);
      queue[itemIndex] = item;
      
      console.log(`📎 Added attachment "${file.name}" to queue item ${itemIndex + 1}`);
      return attachment;
    } catch (error) {
      console.error('Error adding attachment:', error);
      throw error;
    }
  };

  const removeAttachmentFromQueueItem = (itemIndex, attachmentIndex) => {
    const item = normalizeQueueItem(queue[itemIndex]);
    const removed = item.attachments.splice(attachmentIndex, 1);
    queue[itemIndex] = item;
    console.log(`🗑️ Removed attachment from queue item ${itemIndex + 1}`);
    return removed;
  };

  const createThumbnailPreview = (attachment) => {
    if (attachment.type === 'image') {
      return `<img src="${attachment.data}" alt="${attachment.name}" class="pq-attachment-thumb" title="${attachment.name}">`;
    } else {
      // File icon
      const ext = attachment.name.split('.').pop()?.toUpperCase() || 'FILE';
      return `<div class="pq-attachment-thumb pq-file-thumb" title="${attachment.name}">${ext}</div>`;
    }
  };

  const openFilePicker = (itemIndex, container) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,application/pdf,.txt,.md,.json,.csv,.doc,.docx,.xls,.xlsx';
    
    input.onchange = async (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        for (const file of files) {
          try {
            await addAttachmentToQueueItem(itemIndex, file);
          } catch (error) {
            console.error('Error adding file:', error);
            alert(`Error adding file: ${error.message}`);
          }
        }
        saveQueue();
        updateUI(container);
      }
    };
    
    input.click();
  };

  // Series management functions
  const createSeries = (name, description = '') => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    name: name,
    description: description,
    prompts: JSON.parse(JSON.stringify(queue)), // Deep copy
    createdAt: Date.now(),
    updatedAt: Date.now(),
    promptCount: queue.length,
    hasAttachments: queue.some(item => {
      const normalized = normalizeQueueItem(item);
      return normalized.attachments && normalized.attachments.length > 0;
    })
  });

  const saveSeries = async (name, description = '') => {
    if (!name || name.trim() === '') {
      throw new Error('Series name is required');
    }

    if (queue.length === 0) {
      throw new Error('Cannot save empty series');
    }

    const series = createSeries(name.trim(), description.trim());
    savedSeries.push(series);
    await saveSeriesListToStorage();
    console.log(`💾 Saved series "${name}" with ${series.promptCount} prompts`);
    return series;
  };

  const loadSeries = (seriesId) => {
    const series = savedSeries.find(s => s.id === seriesId);
    if (!series) {
      throw new Error('Series not found');
    }

    // Replace current queue with series prompts
    queue = JSON.parse(JSON.stringify(series.prompts)); // Deep copy
    saveQueue();
    console.log(`📂 Loaded series "${series.name}" with ${queue.length} prompts`);
    return series;
  };

  const deleteSeries = async (seriesId) => {
    const index = savedSeries.findIndex(s => s.id === seriesId);
    if (index === -1) {
      throw new Error('Series not found');
    }

    const series = savedSeries[index];
    savedSeries.splice(index, 1);
    await saveSeriesListToStorage();
    console.log(`🗑️ Deleted series "${series.name}"`);
    return series;
  };

  const renameSeries = async (seriesId, newName, newDescription) => {
    const series = savedSeries.find(s => s.id === seriesId);
    if (!series) {
      throw new Error('Series not found');
    }

    series.name = newName.trim();
    series.description = newDescription?.trim() || '';
    series.updatedAt = Date.now();
    await saveSeriesListToStorage();
    console.log(`✏️ Renamed series to "${newName}"`);
    return series;
  };

  const updateSeries = async (seriesId) => {
    const series = savedSeries.find(s => s.id === seriesId);
    if (!series) {
      throw new Error('Series not found');
    }

    if (queue.length === 0) {
      throw new Error('Cannot update with empty queue');
    }

    series.prompts = JSON.parse(JSON.stringify(queue));
    series.updatedAt = Date.now();
    series.promptCount = queue.length;
    series.hasAttachments = queue.some(item => {
      const normalized = normalizeQueueItem(item);
      return normalized.attachments && normalized.attachments.length > 0;
    });
    
    await saveSeriesListToStorage();
    console.log(`🔄 Updated series "${series.name}" with ${queue.length} prompts`);
    return series;
  };

  const exportSeries = (seriesId) => {
    const series = savedSeries.find(s => s.id === seriesId);
    if (!series) {
      throw new Error('Series not found');
    }

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      series: series
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-series-${series.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`📤 Exported series "${series.name}"`);
  };

  const importSeries = async (fileContent) => {
    try {
      const importData = JSON.parse(fileContent);
      
      if (!importData.series) {
        throw new Error('Invalid series file format');
      }

      const series = importData.series;
      
      // Generate new ID to avoid conflicts
      series.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      series.updatedAt = Date.now();
      
      savedSeries.push(series);
      await saveSeriesListToStorage();
      console.log(`📥 Imported series "${series.name}"`);
      return series;
    } catch (error) {
      throw new Error(`Failed to import series: ${error.message}`);
    }
  };

  const saveSeriesListToStorage = async () => {
    return chrome.storage.local.set({ savedSeries: savedSeries });
  };

  const loadSeriesListFromStorage = async () => {
    try {
      const result = await chrome.storage.local.get(['savedSeries']);
      savedSeries = result.savedSeries || [];
      console.log(`📚 Loaded ${savedSeries.length} saved series`);
    } catch (error) {
      console.error('Error loading saved series:', error);
      savedSeries = [];
    }
  };

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
          <button class="pq-tab" data-tab="series">Series</button>
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
          <button class="pq-button" id="pq-save-as-series">💾 Save as Series</button>
          <button class="pq-button danger" id="pq-clear-queue">Clear Queue</button>
        </div>

        <!-- Series Tab -->
        <div class="pq-tab-content" id="series">
          <div class="pq-series-controls">
            <button class="pq-button" id="pq-import-series">📥 Import Series</button>
          </div>

          <div class="pq-series-list" id="pq-series-list">
            <div class="pq-empty-state">
              <p>No saved series</p>
              <p>Save your current queue as a series to reuse it later</p>
            </div>
          </div>
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

      .pq-queue-actions {
        display: flex;
        gap: 3px;
        margin-left: 5px;
      }

      .pq-remove-btn, .pq-copy-btn {
        background: none;
        border: none;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        padding: 0 5px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .pq-remove-btn {
        color: #ff4444;
      }

      .pq-remove-btn:hover {
        opacity: 1;
        color: #ff6666;
      }

      .pq-copy-btn {
        color: #4CAF50;
      }

      .pq-copy-btn:hover {
        opacity: 1;
        color: #66dd88;
      }

      .pq-attach-btn {
        color: #2196F3;
      }

      .pq-attach-btn:hover {
        opacity: 1;
        color: #64B5F6;
      }

      .pq-attachments {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
        padding: 4px 0;
      }

      .pq-attachment-thumb {
        width: 32px;
        height: 32px;
        border-radius: 4px;
        object-fit: cover;
        border: 1px solid rgba(255,255,255,0.2);
        cursor: pointer;
        position: relative;
      }

      .pq-file-thumb {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(33, 150, 243, 0.2);
        color: #2196F3;
        font-size: 8px;
        font-weight: 600;
      }

      .pq-attachment-wrapper {
        position: relative;
      }

      .pq-attachment-remove {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #f44336;
        color: white;
        border: none;
        font-size: 10px;
        line-height: 1;
        cursor: pointer;
        display: none;
        padding: 0;
      }

      .pq-attachment-wrapper:hover .pq-attachment-remove {
        display: block;
      }

      .pq-queue-item.pq-drag-over {
        background: rgba(33, 150, 243, 0.3) !important;
        border-left: 3px solid #2196F3 !important;
      }

      .pq-series-controls {
        margin-bottom: 15px;
      }

      .pq-series-list {
        max-height: 300px;
        overflow-y: auto;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 10px;
      }

      .pq-series-item {
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 8px;
        border-left: 3px solid #9C27B0;
      }

      .pq-series-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 6px;
      }

      .pq-series-name {
        font-weight: 600;
        font-size: 12px;
        flex: 1;
      }

      .pq-series-meta {
        font-size: 10px;
        opacity: 0.7;
        margin-bottom: 6px;
      }

      .pq-series-description {
        font-size: 10px;
        opacity: 0.8;
        margin-bottom: 8px;
        font-style: italic;
      }

      .pq-series-actions {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .pq-series-actions button {
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 9px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .pq-series-actions button:hover {
        background: rgba(255,255,255,0.2);
      }

      .pq-series-actions button.danger:hover {
        background: rgba(244, 67, 54, 0.3);
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

      .pq-tab-action-btn {
        background: rgba(76, 175, 80, 0.8);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 10px;
        cursor: pointer;
        transition: background 0.2s;
        white-space: nowrap;
      }

      .pq-tab-action-btn:hover:not(:disabled) {
        background: rgba(76, 175, 80, 1);
      }

      .pq-tab-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .pq-tab-stop-btn {
        background: rgba(255, 152, 0, 0.8);
      }

      .pq-tab-stop-btn:hover {
        background: rgba(255, 152, 0, 1);
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(container);

    return container;
  }

  // Initialize the UI
  async function initUI() {
    const container = createUIContainer();
    setupEventListeners(container);
    await loadQueue(); // Wait for queue to load from storage
    updateUI(container); // Update UI with loaded queue
    loadSeriesListFromStorage(); // Load saved series
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

    // Series controls
    container.querySelector('#pq-save-as-series').addEventListener('click', () => {
      saveCurrentQueueAsSeries(container);
    });

    container.querySelector('#pq-import-series').addEventListener('click', () => {
      importSeriesFromFile(container);
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

    // Per-tab start/stop buttons (delegated event listener)
    container.querySelector('#pq-tabs-info').addEventListener('click', async (e) => {
      if (e.target.classList.contains('pq-tab-start-btn')) {
        const tabId = e.target.dataset.tabId;
        await startSingleTab(tabId, container);
      } else if (e.target.classList.contains('pq-tab-stop-btn')) {
        const tabId = e.target.dataset.tabId;
        await stopSingleTab(tabId, container);
      }
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

    // Queue item action buttons (delegated event listener)
    container.querySelector('#pq-queue-list').addEventListener('click', async (e) => {
      if (e.target.classList.contains('pq-remove-btn')) {
        const index = parseInt(e.target.dataset.index);
        queue.splice(index, 1);
        saveQueue();
        updateUI(container);
        console.log(`🗑️ Removed queue item at index ${index}`);
      } else if (e.target.classList.contains('pq-copy-btn')) {
        const index = parseInt(e.target.dataset.index);
        const item = queue[index];
        queue.push(JSON.parse(JSON.stringify(item))); // Deep copy
        saveQueue();
        updateUI(container);
        console.log(`📋 Copied queue item ${index} to bottom: "${getQueueItemText(item).substring(0, 50)}..."`);
      } else if (e.target.classList.contains('pq-attach-btn')) {
        const index = parseInt(e.target.dataset.index);
        openFilePicker(index, container);
      } else if (e.target.classList.contains('pq-attachment-remove')) {
        const wrapper = e.target.closest('.pq-attachment-wrapper');
        const itemIndex = parseInt(wrapper.dataset.itemIndex);
        const attIndex = parseInt(wrapper.dataset.attIndex);
        removeAttachmentFromQueueItem(itemIndex, attIndex);
        saveQueue();
        updateUI(container);
      }
    });

    // Drag and drop support for queue items
    const queueListEl = container.querySelector('#pq-queue-list');
    
    queueListEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const queueItem = e.target.closest('.pq-queue-item');
      if (queueItem) {
        queueItem.classList.add('pq-drag-over');
      }
    });
    
    queueListEl.addEventListener('dragleave', (e) => {
      const queueItem = e.target.closest('.pq-queue-item');
      if (queueItem && !queueItem.contains(e.relatedTarget)) {
        queueItem.classList.remove('pq-drag-over');
      }
    });
    
    queueListEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const queueItem = e.target.closest('.pq-queue-item');
      if (queueItem) {
        queueItem.classList.remove('pq-drag-over');
        const index = parseInt(queueItem.dataset.index);
        
        if (e.dataTransfer.files.length > 0) {
          for (const file of e.dataTransfer.files) {
            try {
              await addAttachmentToQueueItem(index, file);
            } catch (error) {
              console.error('Error adding dropped file:', error);
              alert(`Error adding file: ${error.message}`);
            }
          }
          saveQueue();
          updateUI(container);
        }
      }
    });

    // Paste support for images
    document.addEventListener('paste', async (e) => {
      // Only handle paste if queue UI is visible and we're on the queue tab
      if (!isUIVisible) return;
      const queueTab = container.querySelector('#queue');
      if (!queueTab.classList.contains('active')) return;
      
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file && queue.length > 0) {
            // Add to the last queue item
            const lastIndex = queue.length - 1;
            try {
              await addAttachmentToQueueItem(lastIndex, file);
              saveQueue();
              updateUI(container);
              console.log('📋 Pasted image to last queue item');
            } catch (error) {
              console.error('Error pasting image:', error);
            }
          }
        }
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
      console.log('📡 Switching to multi-tab view, refreshing tab list...');
      refreshTabList(container);
    } else if (tabName === 'series') {
      console.log('📚 Switching to series view, refreshing series list...');
      updateSeriesUI(container);
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
      queue.push(createQueueItem(prompt));
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
        // Convert parsed strings to queue items
        queue.push(...parsed.map(text => createQueueItem(text)));
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

        // Use direct content script access for single tab mode
        // (We're already on the ChatGPT tab, no need for message passing)
        if (window.runPromptQueuerSingleTab) {
          window.localQueue = [...queue];
          window.localQueueIndex = 0;
          if (window.setActive) window.setActive(true);
          window.runPromptQueuerSingleTab();
          console.log('✅ Content script queue started');
        } else {
          throw new Error('Content script not available - please refresh the page');
        }
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
      if (window.setActive) window.setActive(false);
      
      isProcessing = false;
      completedPrompts.clear(); // Clear completion tracking
      currentProcessingIndex = -1; // Reset processing index
      hideProgress(container);
      
      // Don't clear the queue - just stop processing it
      // The user can use "Clear Queue" if they want to empty it
      
      updateUI(container);
      console.log('🛑 Queue stopped (queue preserved)');
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

  // Series functions
  async function saveCurrentQueueAsSeries(container) {
    if (queue.length === 0) {
      alert('Cannot save empty queue. Add some prompts first!');
      return;
    }

    const name = prompt('Enter a name for this series:');
    if (!name) return;

    const description = prompt('Enter a description (optional):') || '';

    try {
      await saveSeries(name, description);
      alert(`✅ Saved "${name}" with ${queue.length} prompts!`);
      updateSeriesUI(container);
    } catch (error) {
      alert(`Error saving series: ${error.message}`);
    }
  }

  async function importSeriesFromFile(container) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const series = await importSeries(text);
        alert(`✅ Imported "${series.name}"!`);
        updateSeriesUI(container);
      } catch (error) {
        alert(`Error importing series: ${error.message}`);
      }
    };

    input.click();
  }

  function updateSeriesUI(container) {
    const seriesList = container.querySelector('#pq-series-list');

    if (savedSeries.length === 0) {
      seriesList.innerHTML = `
        <div class="pq-empty-state">
          <p>No saved series</p>
          <p>Save your current queue as a series to reuse it later</p>
        </div>
      `;
      return;
    }

    seriesList.innerHTML = savedSeries
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(series => {
        const date = new Date(series.updatedAt).toLocaleDateString();
        const time = new Date(series.updatedAt).toLocaleTimeString();
        
        return `
          <div class="pq-series-item">
            <div class="pq-series-header">
              <div class="pq-series-name">${escapeHtml(series.name)}</div>
            </div>
            ${series.description ? `<div class="pq-series-description">"${escapeHtml(series.description)}"</div>` : ''}
            <div class="pq-series-meta">
              ${series.promptCount} prompt${series.promptCount !== 1 ? 's' : ''}
              ${series.hasAttachments ? '📎' : ''}
              • Updated ${date} ${time}
            </div>
            <div class="pq-series-actions">
              <button onclick="window.loadSeriesById('${series.id}')">📂 Load</button>
              <button onclick="window.updateSeriesById('${series.id}')">🔄 Update</button>
              <button onclick="window.renameSeriesById('${series.id}')">✏️ Rename</button>
              <button onclick="window.exportSeriesById('${series.id}')">📤 Export</button>
              <button class="danger" onclick="window.deleteSeriesById('${series.id}')">🗑️ Delete</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Global functions for onclick handlers
  window.loadSeriesById = (seriesId) => {
    try {
      const series = loadSeries(seriesId);
      const container = document.querySelector('#prompt-queuer-ui');
      updateUI(container);
      switchTab('queue', container);
      alert(`✅ Loaded "${series.name}" with ${queue.length} prompts!`);
    } catch (error) {
      alert(`Error loading series: ${error.message}`);
    }
  };

  window.updateSeriesById = async (seriesId) => {
    if (queue.length === 0) {
      alert('Queue is empty. Add prompts before updating.');
      return;
    }

    const series = savedSeries.find(s => s.id === seriesId);
    if (!confirm(`Update "${series.name}" with current queue (${queue.length} prompts)?`)) {
      return;
    }

    try {
      await updateSeries(seriesId);
      const container = document.querySelector('#prompt-queuer-ui');
      updateSeriesUI(container);
      alert(`✅ Updated "${series.name}"!`);
    } catch (error) {
      alert(`Error updating series: ${error.message}`);
    }
  };

  window.renameSeriesById = async (seriesId) => {
    const series = savedSeries.find(s => s.id === seriesId);
    const newName = prompt('Enter new name:', series.name);
    if (!newName) return;

    const newDescription = prompt('Enter new description (optional):', series.description || '');

    try {
      await renameSeries(seriesId, newName, newDescription);
      const container = document.querySelector('#prompt-queuer-ui');
      updateSeriesUI(container);
      alert(`✅ Renamed to "${newName}"!`);
    } catch (error) {
      alert(`Error renaming series: ${error.message}`);
    }
  };

  window.exportSeriesById = (seriesId) => {
    try {
      exportSeries(seriesId);
    } catch (error) {
      alert(`Error exporting series: ${error.message}`);
    }
  };

  window.deleteSeriesById = async (seriesId) => {
    const series = savedSeries.find(s => s.id === seriesId);
    if (!confirm(`Delete "${series.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteSeries(seriesId);
      const container = document.querySelector('#prompt-queuer-ui');
      updateSeriesUI(container);
      alert(`✅ Deleted "${series.name}"`);
    } catch (error) {
      alert(`Error deleting series: ${error.message}`);
    }
  };

  // Multi-tab functions
  async function startSingleTab(tabId, container) {
    if (queue.length === 0) {
      alert('No prompts in queue');
      return;
    }

    try {
      console.log(`▶️ Starting tab ${tabId}...`);
      
      // Start multi-tab mode if not already processing
      if (!isProcessing) {
        const response = await chrome.runtime.sendMessage({
          type: 'START_MULTI_TAB_QUEUE',
          messages: queue
        });
        
        if (!response.success) {
          throw new Error(response.error || 'Failed to initialize multi-tab queue');
        }
        
        isProcessing = true;
      }
      
      // Send start message to specific tab
      const tab = activeTabs.find(t => t.tabId === tabId);
      if (tab && tab.chromeTabId) {
        await chrome.tabs.sendMessage(tab.chromeTabId, {
          type: 'START_QUEUE'
        });
        console.log(`✅ Started tab ${tabId}`);
        
        // Refresh UI after a moment
        setTimeout(() => refreshTabList(container), 500);
      } else {
        throw new Error('Tab not found or no Chrome tab ID');
      }
    } catch (error) {
      console.error('Error starting tab:', error);
      alert(`Error starting tab: ${error.message}`);
    }
  }

  async function stopSingleTab(tabId, container) {
    try {
      console.log(`⏹️ Stopping tab ${tabId}...`);
      
      const tab = activeTabs.find(t => t.tabId === tabId);
      if (tab && tab.chromeTabId) {
        await chrome.tabs.sendMessage(tab.chromeTabId, {
          type: 'STOP_QUEUE'
        });
        console.log(`✅ Stopped tab ${tabId}`);
        
        // Refresh UI after a moment
        setTimeout(() => refreshTabList(container), 500);
      } else {
        throw new Error('Tab not found or no Chrome tab ID');
      }
    } catch (error) {
      console.error('Error stopping tab:', error);
      alert(`Error stopping tab: ${error.message}`);
    }
  }

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
        
        // Start all inactive tabs
        const inactiveTabs = activeTabs.filter(t => !t.isActive && t.status !== 'processing');
        for (const tab of inactiveTabs) {
          if (tab.chromeTabId) {
            try {
              await chrome.tabs.sendMessage(tab.chromeTabId, {
                type: 'START_QUEUE'
              });
            } catch (error) {
              console.error(`Failed to start tab ${tab.tabId}:`, error);
            }
          }
        }
        
        updateUI(container);
        setTimeout(() => refreshTabList(container), 500);
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
      console.log('📡 Requesting tab list from background script...');
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ACTIVE_TABS'
      });

      activeTabs = response.tabs || [];
      console.log(`✅ Received ${activeTabs.length} tab(s):`, activeTabs.map(t => ({
        id: t.tabId.substring(0, 8),
        url: t.url.substring(0, 50),
        status: t.status || (t.isActive ? 'processing' : 'ready')
      })));
      
      updateMultiTabUI(container);
    } catch (error) {
      console.error('❌ Error refreshing tab list:', error);
      // Show error in UI
      if (container.querySelector('#pq-tabs-info')) {
        container.querySelector('#pq-tabs-info').innerHTML = `
          <div class="pq-empty-state">
            <p style="color: #f44336;">Error loading tabs</p>
            <p style="font-size: 10px;">${error.message}</p>
            <p style="font-size: 10px; margin-top: 8px;">Try refreshing the page</p>
          </div>
        `;
      }
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
      queue = normalizeQueue(result.queue || []);
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
      queueList.innerHTML = queue.map((item, index) => {
        const queueItem = normalizeQueueItem(item);
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
        
        // Generate attachment previews
        const attachmentPreviews = queueItem.attachments.map((att, attIdx) => {
          return `
            <div class="pq-attachment-wrapper" data-item-index="${index}" data-att-index="${attIdx}">
              ${createThumbnailPreview(att)}
              <button class="pq-attachment-remove" title="Remove attachment">×</button>
            </div>
          `;
        }).join('');
        
        return `
          <div class="pq-queue-item ${statusClass}" data-index="${index}" draggable="false">
            <div class="index">${index + 1}</div>
            <div style="flex: 1;">
              <div class="text">${escapeHtml(queueItem.text)}</div>
              ${queueItem.attachments.length > 0 ? `<div class="pq-attachments">${attachmentPreviews}</div>` : ''}
            </div>
            <div class="status">${statusText}</div>
            <div class="pq-queue-actions">
              <button class="pq-attach-btn" data-index="${index}" title="Add file/image">📎</button>
              <button class="pq-copy-btn" data-index="${index}" title="Copy to bottom of queue">↓</button>
              <button class="pq-remove-btn" data-index="${index}" title="Remove from queue">×</button>
            </div>
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
    const startAllButton = container.querySelector('#pq-start-multi-queue');
    const stopAllButton = container.querySelector('#pq-stop-multi-queue');

    if (activeTabs.length === 0) {
      container.querySelector('#pq-tabs-info').innerHTML = `
        <div class="pq-empty-state">
          <p>No ChatGPT tabs detected</p>
          <p>Make sure this page is open in a ChatGPT tab, or open additional tabs</p>
          <p style="font-size: 10px; margin-top: 8px;">Try clicking "Refresh Tab List" below</p>
        </div>
      `;
    } else {
      container.querySelector('#pq-tabs-info').innerHTML = activeTabs.map(tab => {
        const status = tab.status || (tab.isActive ? 'processing' : 'ready');
        const statusText = status === 'processing' ? 'Processing' : 
                          status === 'ready' ? 'Ready' : 'Unknown';
        const statusColor = status === 'processing' ? 'active' : 'inactive';
        const isProcessingNow = status === 'processing' || tab.isActive;
        
        return `
          <div class="pq-tab-info">
            <div class="pq-status-indicator ${statusColor}"></div>
            <div class="tab-details" style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div>Tab ${tab.tabId.substring(0, 8)}... <span style="opacity: 0.5; font-size: 9px;">(${statusText})</span></div>
                  <div style="font-size: 9px; opacity: 0.7;">
                    ${tab.currentPrompt ? `"${tab.currentPrompt.substring(0, 30)}..."` : 'Waiting for prompts'}
                  </div>
                </div>
                <div style="display: flex; gap: 4px;">
                  ${isProcessingNow ? 
                    `<button class="pq-tab-action-btn pq-tab-stop-btn" data-tab-id="${tab.tabId}" title="Stop this tab">⏹️ Stop</button>` :
                    `<button class="pq-tab-action-btn pq-tab-start-btn" data-tab-id="${tab.tabId}" title="Start processing on this tab" ${queue.length === 0 ? 'disabled' : ''}>▶️ Start</button>`
                  }
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Update stats
    const activeCount = activeTabs.filter(t => t.isActive || t.status === 'processing').length;
    const totalTabs = activeTabs.length;
    container.querySelector('#pq-active-tabs-count').textContent = activeCount;
    container.querySelector('#pq-queue-length').textContent = queue.length;
    
    // Update completed count if we have the data
    const completedEl = container.querySelector('#pq-completed-count');
    if (completedEl) {
      // Get completed count from queue or multi-tab manager
      completedEl.textContent = completedPrompts.size || 0;
    }

    // Start All: enabled if we have queue items and at least one inactive tab
    const hasInactiveTabs = activeTabs.some(t => !t.isActive && t.status !== 'processing');
    startAllButton.disabled = queue.length === 0 || !hasInactiveTabs;
    startAllButton.textContent = activeCount > 0 ? `▶️ Start Remaining (${totalTabs - activeCount})` : '▶️ Start All';
    
    // Stop All: enabled if any tab is processing
    stopAllButton.disabled = activeCount === 0;
    stopAllButton.textContent = `⏹️ Stop All (${activeCount})`;
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
      
      // Don't clear the queue - user might want to re-run it
      // They can use "Clear Queue" if they want to empty it
      
      hideProgress(container);
      updateUI(container);
      
      const status = container.querySelector('#pq-status');
      if (status) {
        status.textContent = `✅ Queue completed! Processed ${totalPrompts} prompts across ${activeTabs} tabs`;
        setTimeout(() => {
          hideProgress(container);
        }, 3000);
      }
      
      console.log(`🏁 Queue completed (queue preserved). Processed ${totalPrompts} prompts across ${activeTabs} tabs`);
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