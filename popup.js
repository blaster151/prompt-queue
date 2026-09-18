// Minimal popup controller: keeps queue status and control actions, while the in-page UI remains the full editor.
class PromptQueuer {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.multiTabMode = false;
        this.currentProcessingIndex = -1;
        this.completedPrompts = new Set();
        this.activeTabs = [];
        this.queueStatus = {
            isProcessing: false,
            queueLength: 0,
            completedCount: 0,
            activeTabs: 0
        };
        this.progressInterval = null;
        this.init();
    }

    async init() {
        await this.loadQueue();
        this.setupEventListeners();
        this.setupMessageListener();
        this.refreshTabList();
        this.updateUI();

        setInterval(() => {
            if (this.multiTabMode) {
                this.refreshTabList();
            }
        }, 5000);

        setInterval(() => {
            this.saveQueue();
        }, 2000);
    }

    setupEventListeners() {
        document.querySelectorAll('.mode-button').forEach(button => {
            button.addEventListener('click', () => {
                this.multiTabMode = button.dataset.mode === 'multi';
                document.querySelectorAll('.mode-button').forEach(btn => {
                    btn.classList.toggle('active', btn === button);
                });
                this.updateUI();
            });
        });

        document.getElementById('start-queue').addEventListener('click', () => this.startQueue());
        document.getElementById('stop-queue').addEventListener('click', () => this.stopQueue());
        document.getElementById('clear-queue').addEventListener('click', () => {
            this.queue = [];
            this.saveQueue();
            this.updateUI();
        });
        document.getElementById('refresh-tabs').addEventListener('click', () => this.refreshTabList());
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message) => {
            switch (message.type) {
                case 'PROGRESS_UPDATE':
                    this.updateProgress(message.tabId, message.prompt, message.status, message.promptIndex);
                    break;
                case 'QUEUE_COMPLETE':
                    this.onQueueComplete(message.totalPrompts, message.activeTabs);
                    break;
                case 'QUEUE_STATE_CHANGED':
                    this.syncQueueState(message.queue, message.isProcessing);
                    break;
                default:
                    break;
            }
        });
    }

    async startQueue() {
        if (this.queue.length === 0 || this.isProcessing) return;

        try {
            if (this.multiTabMode) {
                await this.startMultiTabQueue();
                return;
            }

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const isChatGPT = tab && tab.url && (
                tab.url.includes('chat.openai.com') ||
                tab.url.includes('chatgpt.com') ||
                tab.url.includes('chat.openai.com/c/') ||
                tab.url.includes('chatgpt.com/c/')
            );

            if (!isChatGPT) {
                alert('Please navigate to ChatGPT (chat.openai.com or chatgpt.com) to start the queue.');
                return;
            }

            this.completedPrompts.clear();
            this.currentProcessingIndex = -1;
            this.isProcessing = true;
            this.saveQueue();
            this.updateUI();
            this.showProgress();

            await chrome.tabs.sendMessage(tab.id, {
                type: 'START_QUEUE',
                messages: this.queue
            });
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
            const response = await Promise.race([
                chrome.runtime.sendMessage({ type: 'START_MULTI_TAB_QUEUE', messages: this.queue }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 10000))
            ]);

            if (response && response.success) {
                this.completedPrompts.clear();
                this.currentProcessingIndex = -1;
                this.isProcessing = true;
                this.saveQueue();
                this.updateUI();
                this.showMultiProgress();
            } else {
                const errorMsg = response?.error || 'Unknown error occurred';
                if (errorMsg.includes('No active ChatGPT tabs')) {
                    alert('No ChatGPT tabs found. Please open ChatGPT in one or more tabs to use multi-tab mode.');
                } else {
                    alert(`Failed to start multi-tab queue: ${errorMsg}`);
                }
            }
        } catch (error) {
            console.error('Error starting multi-tab queue:', error);
            let userMessage = 'Error starting multi-tab queue';
            if (error.message === 'Request timeout') {
                userMessage = 'Request timed out. Please try again.';
            } else if (error.message?.includes('Extension context invalidated')) {
                userMessage = 'Extension was reloaded. Please refresh the page and try again.';
            } else if (error.message?.includes('receiving end does not exist')) {
                userMessage = 'Communication error. Please refresh the ChatGPT page and try again.';
            }
            alert(userMessage);
            this.isProcessing = false;
            this.updateUI();
        }
    }

    async stopQueue() {
        if (this.multiTabMode) {
            await this.stopMultiTabQueue();
            return;
        }
        await this.stopSingleTabQueue();
    }

    async stopSingleTabQueue() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                await chrome.tabs.sendMessage(tab.id, { type: 'STOP_QUEUE' });
            }
            this.isProcessing = false;
            this.hideProgress();
            this.queue = [];
            this.saveQueue();
            this.updateUI();
        } catch (error) {
            console.error('Error stopping queue:', error);
        }
    }

    async stopMultiTabQueue() {
        try {
            await chrome.runtime.sendMessage({ type: 'STOP_MULTI_TAB_QUEUE' });
            this.isProcessing = false;
            this.hideMultiProgress();
            this.queue = [];
            this.saveQueue();
            this.updateUI();
        } catch (error) {
            console.error('Error stopping multi-tab queue:', error);
        }
    }

    async refreshTabList() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TABS' });
            this.activeTabs = response?.tabs || [];
            this.queueStatus = {
                ...this.queueStatus,
                activeTabs: this.activeTabs.length
            };
        } catch (error) {
            console.error('Error refreshing tab list:', error);
            this.activeTabs = [];
        }
        this.updateUI();
    }

    updateProgress(tabId, prompt, status, promptIndex) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const statusEl = document.getElementById('status');

        if (status === 'sending') {
            statusEl.textContent = `[Tab ${tabId}] Sending: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`;

            if (this.multiTabMode && promptIndex !== undefined) {
                this.currentProcessingIndex = promptIndex;
                this.completedPrompts.add(promptIndex);
            } else if (!this.multiTabMode && this.queue.length > 0) {
                const queueIndex = this.queue.indexOf(prompt);
                this.currentProcessingIndex = queueIndex;
                const percentage = this.queue.length > 0 ? Math.min(90, ((queueIndex + 1) / this.queue.length) * 100) : 0;
                progressFill.style.width = `${percentage}%`;
                progressText.textContent = `${queueIndex + 1} / ${this.queue.length}`;
            }
            this.updateUI();
        } else if (status === 'completed') {
            if (this.multiTabMode && promptIndex !== undefined) {
                this.completedPrompts.add(promptIndex);
            } else {
                const queueIndex = this.queue.indexOf(prompt);
                if (queueIndex !== -1) this.completedPrompts.add(queueIndex);
            }

            if (this.queue.length > 0 && this.completedPrompts.size >= this.queue.length) {
                this.isProcessing = false;
                this.currentProcessingIndex = -1;
                this.hideProgress();
            }
            this.updateUI();
        }
    }

    onQueueComplete(totalPrompts, activeTabs) {
        if (this.isProcessing && this.queue.length > 0) {
            this.isProcessing = false;
            this.currentProcessingIndex = -1;
            this.queue = [];
            this.saveQueue();
            this.hideProgress();
            this.hideMultiProgress();
            this.updateUI();
        }
        this.queueStatus = {
            ...this.queueStatus,
            queueLength: totalPrompts,
            completedCount: totalPrompts,
            activeTabs: activeTabs || 0,
            isProcessing: false
        };
    }

    showProgress() {
        const el = document.getElementById('progress');
        if (el) el.style.display = 'block';
    }

    hideProgress() {
        const el = document.getElementById('progress');
        if (el) el.style.display = 'none';
    }

    showMultiProgress() {
        const el = document.getElementById('multi-progress');
        if (el) el.style.display = 'block';
        this.progressInterval = setInterval(() => {
            this.updateQueueStatus();
            this.updateMultiProgress();
        }, 1000);
    }

    hideMultiProgress() {
        const el = document.getElementById('multi-progress');
        if (el) el.style.display = 'none';
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    async updateQueueStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATUS' });
            this.queueStatus = response || this.queueStatus;
            this.updateMultiProgress();
        } catch (error) {
            console.error('Error updating queue status:', error);
        }
    }

    updateMultiProgress() {
        const fill = document.getElementById('multi-progress-fill');
        const text = document.getElementById('multi-progress-text');
        const statusEl = document.getElementById('multi-status');
        if (!fill || !text || !statusEl) return;

        const queueLength = Number(this.queueStatus.queueLength || 0);
        const completedCount = Number(this.queueStatus.completedCount || 0);
        const activeTabs = Number(this.queueStatus.activeTabs || 0);

        if (queueLength > 0) {
            fill.style.width = `${Math.min(100, (completedCount / queueLength) * 100)}%`;
            text.textContent = `${completedCount} / ${queueLength}`;
            statusEl.textContent = `Processing across ${activeTabs} tabs...`;
        } else {
            fill.style.width = '0%';
            text.textContent = '0 / 0';
        }
    }

    updateUI() {
        const queueList = document.getElementById('queue-list');
        const startButton = document.getElementById('start-queue');
        const stopButton = document.getElementById('stop-queue');
        const clearButton = document.getElementById('clear-queue');
        const tabsInfo = document.getElementById('tabs-info');
        const multiStats = document.getElementById('multi-stats');

        startButton.disabled = this.queue.length === 0 || this.isProcessing;
        startButton.textContent = this.isProcessing ? 'Processing...' : 'Start Queue';
        stopButton.disabled = !this.isProcessing;
        clearButton.disabled = this.isProcessing;

        if (this.queue.length === 0) {
            queueList.innerHTML = '<div class="empty-state">No prompts in queue</div>';
        } else {
            queueList.innerHTML = this.queue.map((prompt, index) => {
                const isCurrent = this.isProcessing && this.currentProcessingIndex === index;
                const isDone = this.completedPrompts.has(index);
                const cssClass = isDone ? 'completed' : isCurrent ? 'processing' : '';
                const status = isDone ? '✅' : isCurrent ? '⏳' : '';
                return `
                    <div class="queue-item ${cssClass}">
                        <div class="queue-index">${index + 1}</div>
                        <div class="queue-text">${this.escapeHtml(prompt)}</div>
                        <div class="queue-status">${status}</div>
                    </div>
                `;
            }).join('');
        }

        if (this.multiTabMode) {
            multiStats.style.display = 'flex';
            tabsInfo.style.display = 'block';
            document.getElementById('active-tabs-count').textContent = String(this.activeTabs.length);
            document.getElementById('queue-length').textContent = String(this.queue.length);
            document.getElementById('completed-count').textContent = String(this.completedPrompts.size);

            if (this.activeTabs.length === 0) {
                tabsInfo.innerHTML = '<div class="empty-state">No ChatGPT tabs detected</div>';
            } else {
                tabsInfo.innerHTML = this.activeTabs.map(tab => `
                    <div class="tab-info">
                        <div class="status-indicator ${tab.isActive ? 'active' : ''}"></div>
                        <div>
                            <div>Tab ${tab.tabId}</div>
                            <div class="muted">${tab.isActive ? 'Processing' : 'Ready'}${tab.currentPrompt ? ` • ${tab.currentPrompt.substring(0, 30)}${tab.currentPrompt.length > 30 ? '...' : ''}` : ''}</div>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            multiStats.style.display = 'none';
            tabsInfo.style.display = 'none';
        }

        this.updateBadge();
    }

    updateBadge() {
        if (this.isProcessing) {
            chrome.action.setBadgeText({ text: '⏳' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff9800' });
        } else if (this.queue.length > 0) {
            chrome.action.setBadgeText({ text: String(this.queue.length) });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    }

    syncQueueState(queue, isProcessing) {
        if (JSON.stringify(this.queue) !== JSON.stringify(queue)) {
            this.queue = queue;
        }
        if (this.isProcessing !== isProcessing) {
            this.isProcessing = isProcessing;
        }
        this.updateUI();
    }

    saveQueue() {
        chrome.storage.local.set({ queue: this.queue });
        chrome.runtime.sendMessage({
            type: 'QUEUE_STATE_CHANGED',
            queue: this.queue,
            isProcessing: this.isProcessing
        });
    }

    async loadQueue() {
        try {
            const result = await Promise.race([
                chrome.storage.local.get(['queue']),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout')), 5000))
            ]);
            this.queue = result.queue || [];
        } catch (error) {
            console.error('Error loading queue:', error);
            this.queue = [];
        }
    }

    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PromptQueuer();
});