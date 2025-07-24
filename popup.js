// Popup JavaScript for ChatGPT Prompt Queuer
class PromptQueuer {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.multiTabMode = false;
        this.activeTabs = [];
        this.currentProcessingIndex = -1;
        this.completedPrompts = new Set();
        this.queueStatus = {
            isProcessing: false,
            queueLength: 0,
            currentIndex: 0,
            completedCount: 0,
            activeTabs: 0
        };
        this.init();
    }

    async init() {
        await this.loadQueue();
        this.setupEventListeners();
        this.setupMessageListener();
        this.updateUI();
        this.refreshTabList();
        this.loadHistory(); // Load history on startup
        
        // Refresh tab list periodically
        setInterval(() => {
            if (this.getCurrentTab() === 'multi') {
                this.refreshTabList();
            }
        }, 5000);
        
        // Sync queue state periodically to ensure all popup instances stay in sync
        setInterval(() => {
            this.saveQueue(); // Broadcast current state to other popups
        }, 2000);
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Mode switching in queue tab
        document.querySelectorAll('.mode-button').forEach(button => {
            button.addEventListener('click', () => {
                this.switchMode(button.dataset.mode);
            });
        });

        // Manual prompt addition
        document.getElementById('add-single').addEventListener('click', () => {
            this.addSinglePrompt();
        });

        // Matrix parsing
        document.getElementById('parse-matrix').addEventListener('click', () => {
            this.parseMatrix();
        });

        // Queue controls
        document.getElementById('start-queue').addEventListener('click', () => {
            this.startQueue();
        });

        document.getElementById('stop-queue').addEventListener('click', () => {
            if (confirm('Stop processing and clear the queue? This will remove all remaining prompts.')) {
                this.stopSingleTabQueue();
            }
        });

        document.getElementById('clear-queue').addEventListener('click', () => {
            this.clearQueue();
        });

        // Multi-tab controls
        document.getElementById('start-multi-queue').addEventListener('click', () => {
            this.startMultiTabQueue();
        });

        document.getElementById('stop-multi-queue').addEventListener('click', () => {
            if (confirm('Stop processing and clear the queue? This will remove all remaining prompts.')) {
                this.stopMultiTabQueue();
            }
        });

        document.getElementById('refresh-tabs').addEventListener('click', () => {
            this.refreshTabList();
        });

        // History controls
        document.getElementById('load-history').addEventListener('click', () => {
            this.loadHistory();
        });

        document.getElementById('clear-history').addEventListener('click', () => {
            this.clearHistory();
        });

        document.getElementById('export-history').addEventListener('click', () => {
            this.exportHistory();
        });

        // Debug button for storage issues
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                this.debugStorage();
            }
        });

        // Enter key support for textareas
        document.getElementById('single-prompt').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.addSinglePrompt();
            }
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'PROGRESS_UPDATE') {
                this.updateProgress(message.tabId, message.prompt, message.status, message.promptIndex);
            } else if (message.type === 'QUEUE_COMPLETE') {
                this.onQueueComplete(message.totalPrompts, message.activeTabs);
            } else if (message.type === 'PROMPT_COMPLETED') {
                // Refresh history when a new conversation is completed
                if (this.getCurrentTab() === 'history') {
                    this.loadHistory();
                }
            } else if (message.type === 'QUEUE_STATE_CHANGED') {
                // Synchronize queue state across popup instances
                this.syncQueueState(message.queue, message.isProcessing);
            }
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Refresh data for specific tabs
        if (tabName === 'multi') {
            this.refreshTabList();
        } else if (tabName === 'history') {
            this.loadHistory();
        }
    }

    switchMode(mode) {
        this.multiTabMode = mode === 'multi';
        
        // Update mode buttons
        document.querySelectorAll('.mode-button').forEach(button => {
            button.classList.remove('active');
        });
        document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

        // Update UI based on mode
        this.updateUI();
    }

    getCurrentTab() {
        const activeTab = document.querySelector('.tab.active');
        return activeTab ? activeTab.dataset.tab : 'manual';
    }

    addSinglePrompt() {
        const textarea = document.getElementById('single-prompt');
        const prompt = textarea.value.trim();
        
        if (prompt) {
            this.queue.push(prompt);
            this.saveQueue();
            this.updateUI();
            textarea.value = '';
            this.switchTab('queue');
        }
    }

    async parseMatrix() {
        const textarea = document.getElementById('matrix-input');
        const input = textarea.value.trim();
        
        if (!input) return;

        try {
            // Parse matrix locally (no need to be on ChatGPT)
            const parsed = this.parseMatrixLocal(input);
            
            if (parsed && parsed.length > 0) {
                this.queue.push(...parsed);
                this.saveQueue();
                this.updateUI();
                textarea.value = '';
                this.switchTab('queue');
            } else {
                alert('No valid messages found in matrix data');
            }
        } catch (error) {
            console.error('Error parsing matrix:', error);
            alert('Error parsing matrix data. Please check the format.');
        }
    }

    parseMatrixLocal(input) {
        // Remove trailing whitespace and newlines that could cause issues
        const cleanInput = input.trim();
        const lines = cleanInput.split(/\r?\n/);
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
            // Skip empty lines
            if (line.trim() === '') continue;
            
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
    }

        async startQueue() {
        if (this.queue.length === 0 || this.isProcessing) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we're on ChatGPT - more robust check
            const isChatGPT = tab.url.includes('chat.openai.com') || 
                             tab.url.includes('chatgpt.com') ||
                             tab.url.includes('chat.openai.com/c/') ||
                             tab.url.includes('chatgpt.com/c/');
            
            if (!isChatGPT) {
              alert('Please navigate to ChatGPT (chat.openai.com or chatgpt.com) to start the queue');
              return;
            }
            
            console.log('Current tab URL:', tab.url);

            if (this.multiTabMode) {
                await this.startMultiTabQueue();
            } else {
                console.log('Starting single tab queue with messages:', this.queue);
                this.isProcessing = true;
                this.saveQueue(); // Broadcast processing state to other popups
                this.updateUI();
                this.showProgress();

                // Send messages to content script
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: 'START_QUEUE',
                    messages: this.queue
                });
                
                console.log('Content script response:', response);
            }

        } catch (error) {
            console.error('Error starting queue:', error);
            alert('Error starting queue. Make sure you\'re on ChatGPT.');
            this.isProcessing = false;
            this.updateUI();
        }
    }

    async startMultiTabQueue() {
        if (this.queue.length === 0) {
            alert('No prompts in queue');
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'START_MULTI_TAB_QUEUE',
                messages: this.queue
            });

            if (response.success) {
                this.isProcessing = true;
                this.saveQueue(); // Broadcast processing state to other popups
                this.updateUI();
                this.showMultiProgress();
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

    async stopMultiTabQueue() {
        try {
            await chrome.runtime.sendMessage({
                type: 'STOP_MULTI_TAB_QUEUE'
            });
            
            this.isProcessing = false;
            this.hideMultiProgress();
            
            // Clear the queue since processing was interrupted
            this.queue = [];
            this.saveQueue(); // Broadcast state change to other popups
            
            this.updateUI();
            console.log('🛑 Multi-tab queue stopped and cleared');
        } catch (error) {
            console.error('Error stopping multi-tab queue:', error);
        }
    }

    async stopSingleTabQueue() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, {
                type: 'STOP_QUEUE'
            });
            
            this.isProcessing = false;
            this.hideProgress();
            
            // Clear the queue since processing was interrupted
            this.queue = [];
            this.saveQueue(); // Broadcast state change to other popups
            
            this.updateUI();
            console.log('🛑 Single-tab queue stopped and cleared');
        } catch (error) {
            console.error('Error stopping single-tab queue:', error);
        }
    }

    async refreshTabList() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_ACTIVE_TABS'
            });

            this.activeTabs = response.tabs || [];
            this.updateMultiTabUI();
        } catch (error) {
            console.error('Error refreshing tab list:', error);
        }
    }

    async updateQueueStatus() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_QUEUE_STATUS'
            });

            this.queueStatus = response;
            this.updateMultiTabUI();
        } catch (error) {
            console.error('Error updating queue status:', error);
        }
    }

    clearQueue() {
        this.queue = [];
        this.saveQueue();
        this.updateUI();
    }

    removeFromQueue(index) {
        this.queue.splice(index, 1);
        this.saveQueue();
        this.updateUI();
    }

    updateProgress(tabId, prompt, status, promptIndex) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const statusEl = document.getElementById('status');

        console.log('Progress update:', { tabId, prompt, status, promptIndex });

        if (status === 'sending') {
            statusEl.textContent = `[Tab ${tabId}] Sending: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`;
            
            if (this.multiTabMode && promptIndex !== undefined) {
                // Multi-tab mode: use provided index
                this.currentProcessingIndex = promptIndex;
                this.completedPrompts.add(promptIndex); // Mark as in progress
                this.updateUI();
            } else if (!this.multiTabMode && this.queue.length > 0) {
                // Single tab mode: find index in queue
                const queueIndex = this.queue.indexOf(prompt);
                this.currentProcessingIndex = queueIndex;
                
                // Update progress bar
                const estimatedProgress = Math.min(90, (queueIndex + 1) / this.queue.length * 100);
                progressFill.style.width = `${estimatedProgress}%`;
                progressText.textContent = `${queueIndex + 1} / ${this.queue.length}`;
                
                // Update UI to show processing status
                this.updateUI();
            }
        } else if (status === 'completed') {
            if (this.multiTabMode && promptIndex !== undefined) {
                // Multi-tab mode: use provided index
                this.completedPrompts.add(promptIndex);
            } else {
                // Single tab mode: find index in queue
                const queueIndex = this.queue.indexOf(prompt);
                if (queueIndex !== -1) {
                    this.completedPrompts.add(queueIndex);
                }
            }
            this.updateUI();
            
            // Refresh history if on history tab
            if (this.getCurrentTab() === 'history') {
                this.loadHistory();
            }
        }
    }

    updateMultiProgress() {
        const progressFill = document.getElementById('multi-progress-fill');
        const progressText = document.getElementById('multi-progress-text');
        const statusEl = document.getElementById('multi-status');

        if (this.queueStatus.queueLength > 0) {
            const percentage = (this.queueStatus.completedCount / this.queueStatus.queueLength) * 100;
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `${this.queueStatus.completedCount} / ${this.queueStatus.queueLength}`;
            statusEl.textContent = `Processing across ${this.queueStatus.activeTabs} tabs...`;
        }
    }

    onQueueComplete(totalPrompts, activeTabs) {
        console.log(`🏁 Queue completion received: ${totalPrompts} prompts, ${activeTabs} tabs`);
        console.log(`🏁 Current queue length: ${this.queue.length}, isProcessing: ${this.isProcessing}`);
        
        // Only clear queue if we're actually processing and this is a legitimate completion
        if (this.isProcessing && this.queue.length > 0) {
            this.isProcessing = false;
            this.currentProcessingIndex = -1;
            
            // Clear the queue since all prompts have been processed
            this.queue = [];
            this.saveQueue();
            
            this.hideProgress();
            this.hideMultiProgress();
            this.updateUI();
            
            // Show completion message
            const status = document.getElementById('status');
            if (status) {
                status.textContent = `✅ Queue completed! Processed ${totalPrompts} prompts across ${activeTabs} tabs`;
                setTimeout(() => {
                    this.hideProgress();
                }, 3000);
            }
            
            console.log(`🏁 Queue completed and cleared. Processed ${totalPrompts} prompts across ${activeTabs} tabs`);
        } else {
            console.log(`⚠️ Ignoring queue completion - not processing or queue already empty`);
        }
    }

    showProgress() {
        document.getElementById('progress').style.display = 'block';
    }

    hideProgress() {
        document.getElementById('progress').style.display = 'none';
    }

    showMultiProgress() {
        document.getElementById('multi-progress').style.display = 'block';
        // Update progress periodically
        this.progressInterval = setInterval(() => {
            this.updateQueueStatus();
            this.updateMultiProgress();
        }, 1000);
    }

    hideMultiProgress() {
        document.getElementById('multi-progress').style.display = 'none';
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateMultiTabUI() {
        // Update stats
        document.getElementById('active-tabs-count').textContent = this.activeTabs.length;
        document.getElementById('queue-length').textContent = this.queueStatus.queueLength;
        document.getElementById('completed-count').textContent = this.queueStatus.completedCount;

        // Update tabs info
        const tabsInfo = document.getElementById('tabs-info');
        const startButton = document.getElementById('start-multi-queue');
        const stopButton = document.getElementById('stop-multi-queue');

        if (this.activeTabs.length === 0) {
            tabsInfo.innerHTML = `
                <div class="empty-state">
                    <p>No ChatGPT tabs detected</p>
                    <p>Open multiple ChatGPT tabs to use multi-tab mode</p>
                </div>
            `;
        } else {
            tabsInfo.innerHTML = this.activeTabs.map(tab => `
                <div class="tab-info">
                    <div class="status-indicator ${tab.isActive ? 'active' : 'inactive'}"></div>
                    <div class="tab-details">
                        <div class="tab-id">Tab ${tab.tabId}</div>
                        <div class="tab-status">
                            ${tab.isActive ? 'Processing' : 'Ready'}
                            ${tab.currentPrompt ? `: "${tab.currentPrompt.substring(0, 30)}..."` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // Update buttons
        startButton.disabled = this.queue.length === 0 || this.isProcessing || this.activeTabs.length === 0;
        stopButton.disabled = !this.isProcessing;
    }

    updateUI() {
        const queueList = document.getElementById('queue-list');
        const startButton = document.getElementById('start-queue');
        const stopButton = document.getElementById('stop-queue');
        const clearButton = document.getElementById('clear-queue');

        console.log('Updating UI with queue length:', this.queue.length);

        // Update start button
        startButton.disabled = this.queue.length === 0 || this.isProcessing;
        startButton.textContent = this.isProcessing ? 'Processing...' : 'Start Queue';
        
        // Update stop button
        stopButton.disabled = !this.isProcessing;
        stopButton.style.display = this.isProcessing ? 'block' : 'none';
        
        // Update button tooltip based on ChatGPT availability
        this.updateStartButtonStatus();

        // Update extension badge
        this.updateBadge();

        // Update queue list
        if (this.queue.length === 0) {
            queueList.innerHTML = `
                <div class="empty-state">
                    <p>No prompts in queue</p>
                    <p>Add prompts from Manual or Matrix tabs</p>
                </div>
            `;
            document.getElementById('queue-info').style.display = 'none';
        } else {
            queueList.innerHTML = this.queue.map((prompt, index) => {
                const isProcessing = this.isProcessing && this.currentProcessingIndex === index;
                const isCompleted = this.completedPrompts.has(index);
                
                let statusClass = '';
                let statusText = '';
                
                if (isCompleted) {
                    statusClass = 'completed';
                    statusText = '✅';
                } else if (isProcessing) {
                    statusClass = 'processing';
                    statusText = '⏳';
                }
                
                return `
                    <div class="queue-item ${statusClass}">
                        <div class="index">${index + 1}</div>
                        <div class="text">${this.escapeHtml(prompt)}</div>
                        <div class="status">${statusText}</div>
                        <button class="remove" data-index="${index}" ${this.isProcessing ? 'disabled' : ''}>×</button>
                    </div>
                `;
            }).join('');
            
            // Add event listeners to remove buttons
            queueList.querySelectorAll('.remove').forEach(button => {
                button.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    this.removeFromQueue(index);
                });
            });
            
            // Show info when queue has items
            document.getElementById('queue-info').style.display = 'block';
        }

        // Update clear button
        clearButton.disabled = this.isProcessing;

        // Update multi-tab UI if on multi tab
        if (this.getCurrentTab() === 'multi') {
            this.updateMultiTabUI();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    saveQueue() {
        chrome.storage.local.set({ queue: this.queue });
        // Broadcast queue state change to other popup instances
        chrome.runtime.sendMessage({
            type: 'QUEUE_STATE_CHANGED',
            queue: this.queue,
            isProcessing: this.isProcessing
        });
    }

    syncQueueState(queue, isProcessing) {
        // Only update if the state is different to avoid loops
        if (JSON.stringify(this.queue) !== JSON.stringify(queue)) {
            this.queue = queue;
            console.log('🔄 Synced queue state from another popup instance');
        }
        if (this.isProcessing !== isProcessing) {
            this.isProcessing = isProcessing;
            console.log('🔄 Synced processing state from another popup instance');
        }
        this.updateUI();
        
        // Show brief sync indicator
        this.showSyncIndicator();
    }

    showSyncIndicator() {
        // Add a brief visual indicator that sync occurred
        const queueList = document.getElementById('queue-list');
        if (queueList) {
            queueList.style.border = '2px solid #4CAF50';
            setTimeout(() => {
                queueList.style.border = '';
            }, 500);
        }
    }

    async loadQueue() {
        try {
            const result = await chrome.storage.local.get(['queue']);
            this.queue = result.queue || [];
            console.log('Loaded queue:', this.queue);
            console.log('Storage result:', result);
        } catch (error) {
            console.error('Error loading queue:', error);
            this.queue = [];
        }
    }

    async debugStorage() {
        try {
            const result = await chrome.storage.local.get(null);
            console.log('All storage:', result);
        } catch (error) {
            console.error('Error reading storage:', error);
        }
    }

    updateBadge() {
        if (this.isProcessing) {
            chrome.action.setBadgeText({ text: '⏳' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff9800' });
        } else if (this.queue.length > 0) {
            chrome.action.setBadgeText({ text: this.queue.length.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    }

    async loadHistory() {
        try {
            const result = await chrome.storage.local.get(['conversations']);
            const conversations = result.conversations || [];
            
            console.log(`📚 Loading history: ${conversations.length} conversations found`);
            
            const historyList = document.getElementById('history-list');
            
            if (conversations.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-state">
                        <p>No conversation history</p>
                        <p>Complete some prompts to see them here</p>
                    </div>
                `;
                return;
            }
            
            // Sort by timestamp (newest first)
            conversations.sort((a, b) => b.timestamp - a.timestamp);
            
            historyList.innerHTML = conversations.map((conv, index) => {
                const date = new Date(conv.timestamp).toLocaleString();
                const promptPreview = conv.prompt.length > 100 ? 
                    conv.prompt.substring(0, 100) + '...' : conv.prompt;
                
                // Extract tabular data from response
                const tabularData = conv.response ? this.extractTabularData(conv.response) : null;
                const hasTabularData = tabularData && tabularData.columns && tabularData.columns.length > 0;
                
                return `
                    <div class="history-item">
                        <div class="history-prompt">${this.escapeHtml(promptPreview)}</div>
                        <div class="history-response">${conv.response || 'No response captured'}</div>
                        <div class="history-meta">${date} • Tab: ${conv.tabId}</div>
                        <div class="history-actions">
                            <button onclick="promptQueuer.copyToClipboard('${this.escapeHtml(conv.prompt)}')">Copy Prompt</button>
                            <button onclick="promptQueuer.copyToClipboard('${this.escapeHtml(conv.response)}')">Copy Response</button>
                            <button onclick="promptQueuer.addToQueue('${this.escapeHtml(conv.prompt)}')">Re-queue</button>
                            ${hasTabularData ? `
                                <div class="tabular-controls">
                                    <div class="tabular-info">
                                        📊 ${tabularData.type} (${tabularData.columns.length} columns)
                                    </div>
                                    <div class="column-selector">
                                        <select id="column-select-${index}" onchange="promptQueuer.showColumnPreview(${index}, this.value)">
                                            <option value="">Select column...</option>
                                            ${tabularData.columns.map((col, colIndex) => 
                                                `<option value="${colIndex}">${colIndex + 1}: ${this.escapeHtml(col)}</option>`
                                            ).join('')}
                                        </select>
                                        <button onclick="promptQueuer.copySelectedColumn(${index})" class="copy-column-btn">Copy Column</button>
                                        <button onclick="promptQueuer.showColumnRangeSelector(${index})" class="range-selector-btn">Range</button>
                                        <button onclick="promptQueuer.copyAllColumns(${index})" class="copy-all-btn">Copy All</button>
                                    </div>
                                    <div id="column-preview-${index}" class="column-preview"></div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            console.log(`✅ History loaded: ${conversations.length} conversations displayed`);
            
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async clearHistory() {
        if (confirm('Are you sure you want to clear all conversation history?')) {
            try {
                await chrome.storage.local.remove(['conversations']);
                this.loadHistory();
                console.log('History cleared');
            } catch (error) {
                console.error('Error clearing history:', error);
            }
        }
    }

    async exportHistory() {
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

    copyToClipboard(text) {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                console.log('✅ Copied to clipboard (modern API)');
            }).catch(err => {
                console.error('❌ Modern clipboard API failed:', err);
                this.fallbackCopyToClipboard(text);
            });
        } else {
            // Fallback for older browsers
            this.fallbackCopyToClipboard(text);
        }
    }

    fallbackCopyToClipboard(text) {
        try {
            // Create temporary textarea element
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            
            // Select and copy
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            
            // Clean up
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

    // Tabular data extraction functions
    extractTabularData(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Try to find tables first
        const tables = doc.querySelectorAll('table');
        if (tables.length > 0) {
            return this.extractTableData(tables[0]);
        }
        
        // Try to find lists that might be tabular
        const lists = doc.querySelectorAll('ul, ol');
        if (lists.length > 0) {
            return this.extractListData(lists[0]);
        }
        
        // Try to parse as tab-separated or comma-separated data
        const textContent = doc.textContent || htmlContent;
        return this.extractTextData(textContent);
    }

    extractTableData(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) return null;
        
        const data = rows.map(row => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            return cells.map(cell => cell.textContent.trim());
        });
        
        return {
            type: 'table',
            data: data,
            columns: data[0] || [],
            rows: data.slice(1) || []
        };
    }

    extractListData(list) {
        const items = Array.from(list.querySelectorAll('li'));
        if (items.length === 0) return null;
        
        // Try to detect if list items contain tabular data
        const data = items.map(item => {
            const text = item.textContent.trim();
            // Check if item contains tab-separated or pipe-separated data
            if (text.includes('\t') || text.includes('|')) {
                return text.split(/[\t|]/).map(cell => cell.trim());
            }
            return [text];
        });
        
        // If all items have the same number of columns, treat as table
        const columnCounts = data.map(row => row.length);
        const isUniform = columnCounts.every(count => count === columnCounts[0]);
        
        if (isUniform && columnCounts[0] > 1) {
            return {
                type: 'list-table',
                data: data,
                columns: data[0] || [],
                rows: data.slice(1) || []
            };
        }
        
        // Single column list
        return {
            type: 'list',
            data: data.map(row => row[0]),
            columns: ['Items'],
            rows: data.map(row => [row[0]])
        };
    }

    extractTextData(text) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) return null;
        
        // Try to detect tab-separated data
        if (lines.some(line => line.includes('\t'))) {
            const data = lines.map(line => line.split('\t').map(cell => cell.trim()));
            return {
                type: 'tsv',
                data: data,
                columns: data[0] || [],
                rows: data.slice(1) || []
            };
        }
        
        // Try to detect comma-separated data
        if (lines.some(line => line.includes(',') && line.split(',').length > 1)) {
            const data = lines.map(line => line.split(',').map(cell => cell.trim()));
            return {
                type: 'csv',
                data: data,
                columns: data[0] || [],
                rows: data.slice(1) || []
            };
        }
        
        // Single column of text
        return {
            type: 'text',
            data: lines,
            columns: ['Content'],
            rows: lines.map(line => [line])
        };
    }

    getColumnData(tabularData, columnIndex, startRow = 0, endRow = null) {
        if (!tabularData || !tabularData.rows) return [];
        
        const rows = tabularData.rows;
        const end = endRow !== null ? Math.min(endRow, rows.length) : rows.length;
        
        return rows.slice(startRow, end).map(row => row[columnIndex] || '').filter(cell => cell.trim());
    }

    copyColumnData(tabularData, columnIndex, startRow = 0, endRow = null) {
        const columnData = this.getColumnData(tabularData, columnIndex, startRow, endRow);
        const text = columnData.join('\n');
        this.copyToClipboard(text);
        console.log(`📋 Copied column ${columnIndex + 1} (${columnData.length} items)`);
    }

    // Column selection and preview functions
    showColumnPreview(historyIndex, columnIndex) {
        if (!columnIndex || columnIndex === '') return;
        
        const result = chrome.storage.local.get(['conversations'], (result) => {
            const conversations = result.conversations || [];
            const conv = conversations[historyIndex];
            if (!conv || !conv.response) return;
            
            const tabularData = this.extractTabularData(conv.response);
            if (!tabularData) return;
            
            const columnData = this.getColumnData(tabularData, parseInt(columnIndex), 0, 10); // Show first 10 items
            const previewElement = document.getElementById(`column-preview-${historyIndex}`);
            
            if (previewElement) {
                previewElement.innerHTML = `
                    <div class="preview-header">Preview (first 10 items):</div>
                    <div class="preview-content">
                        ${columnData.map(item => `<div class="preview-item">${this.escapeHtml(item)}</div>`).join('')}
                        ${tabularData.rows.length > 10 ? `<div class="preview-more">... and ${tabularData.rows.length - 10} more items</div>` : ''}
                    </div>
                `;
            }
        });
    }

    copySelectedColumn(historyIndex) {
        const columnSelect = document.getElementById(`column-select-${historyIndex}`);
        if (!columnSelect || !columnSelect.value) {
            alert('Please select a column first');
            return;
        }
        
        const columnIndex = parseInt(columnSelect.value);
        
        chrome.storage.local.get(['conversations'], (result) => {
            const conversations = result.conversations || [];
            const conv = conversations[historyIndex];
            if (!conv || !conv.response) return;
            
            const tabularData = this.extractTabularData(conv.response);
            if (!tabularData) return;
            
            this.copyColumnData(tabularData, columnIndex);
        });
    }

    showColumnRangeSelector(historyIndex) {
        const columnSelect = document.getElementById(`column-select-${historyIndex}`);
        if (!columnSelect || !columnSelect.value) {
            alert('Please select a column first');
            return;
        }
        
        const columnIndex = parseInt(columnSelect.value);
        
        chrome.storage.local.get(['conversations'], (result) => {
            const conversations = result.conversations || [];
            const conv = conversations[historyIndex];
            if (!conv || !conv.response) return;
            
            const tabularData = this.extractTabularData(conv.response);
            if (!tabularData) return;
            
            const totalRows = tabularData.rows.length;
            
            const startRow = prompt(`Enter start row (1-${totalRows}):`, '1');
            if (!startRow) return;
            
            const endRow = prompt(`Enter end row (${startRow}-${totalRows}):`, totalRows.toString());
            if (!endRow) return;
            
            const start = parseInt(startRow) - 1; // Convert to 0-based
            const end = parseInt(endRow);
            
            if (start >= 0 && end > start && end <= totalRows) {
                this.copyColumnData(tabularData, columnIndex, start, end);
            } else {
                alert('Invalid range. Please enter valid row numbers.');
            }
        });
    }

    copyAllColumns(historyIndex) {
        chrome.storage.local.get(['conversations'], (result) => {
            const conversations = result.conversations || [];
            const conv = conversations[historyIndex];
            if (!conv || !conv.response) return;
            
            const tabularData = this.extractTabularData(conv.response);
            if (!tabularData) return;
            
            // Create tab-separated format with all columns
            const allData = [tabularData.columns, ...tabularData.rows];
            const text = allData.map(row => row.join('\t')).join('\n');
            
            this.copyToClipboard(text);
            console.log(`📋 Copied all ${tabularData.columns.length} columns (${tabularData.rows.length} rows)`);
        });
    }

    addToQueue(prompt) {
        this.queue.push(prompt);
        this.saveQueue();
        this.updateUI();
        this.switchTab('queue');
    }

    async updateStartButtonStatus() {
        const startButton = document.getElementById('start-queue');
        
        if (this.queue.length === 0 || this.isProcessing) {
            startButton.title = '';
            return;
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const isChatGPT = tab.url.includes('chat.openai.com') || 
                             tab.url.includes('chatgpt.com') ||
                             tab.url.includes('chat.openai.com/c/') ||
                             tab.url.includes('chatgpt.com/c/');
            
            if (isChatGPT) {
                startButton.title = 'Click to start processing the queue';
                startButton.disabled = false;
            } else {
                startButton.title = 'Navigate to ChatGPT to start processing';
                startButton.disabled = false; // Keep enabled but show tooltip
            }
        } catch (error) {
            startButton.title = 'Navigate to ChatGPT to start processing';
            startButton.disabled = false;
        }
    }
}

// Initialize the prompt queuer when popup loads
let promptQueuer;
document.addEventListener('DOMContentLoaded', async () => {
    promptQueuer = new PromptQueuer();
}); 