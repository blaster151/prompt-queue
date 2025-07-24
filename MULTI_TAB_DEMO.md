# Multi-Tab Demo Guide

## Quick Setup for Multi-Tab Testing

### 1. Prepare Your Environment

1. **Install the Extension**: Follow the installation instructions in README.md
2. **Open Multiple ChatGPT Tabs**: Open 3-5 ChatGPT conversations in separate tabs (chat.openai.com or chatgpt.com)
3. **Ensure Tabs are Active**: Make sure all ChatGPT tabs are visible (not minimized)

### 2. Test Multi-Tab Functionality

#### Step 1: Add Test Prompts
1. Click the extension icon
2. Go to the "Manual" tab
3. Add these test prompts:
   ```
   What is the capital of France?
   How do you make coffee?
   Explain machine learning in simple terms
   What is the speed of light?
   Tell me a joke
   What is photosynthesis?
   How do computers work?
   What is the meaning of life?
   ```

#### Step 2: Check Multi-Tab Detection
1. Go to the "Multi-Tab" tab
2. You should see all your ChatGPT tabs listed
3. Each tab should show "Ready" status
4. The stats should show the number of active tabs

#### Step 3: Start Multi-Tab Processing
1. Go to the "Queue" tab
2. Click "Multi Tab" mode
3. Click "Start Queue"
4. Watch the magic happen! 🎉

### 3. What You Should See

#### In the Extension Popup:
- **Progress Bar**: Shows overall completion across all tabs
- **Tab Status**: Each tab shows "Processing" with current prompt
- **Stats**: Real-time updates of completed prompts
- **Live Updates**: Prompts being sent to different tabs simultaneously

#### In ChatGPT Tabs:
- **Tab 1**: Might be processing "What is the capital of France?"
- **Tab 2**: Might be processing "How do you make coffee?"
- **Tab 3**: Might be processing "Explain machine learning in simple terms"
- **And so on...**

#### In Browser Console:
- Each tab will show its unique ID and current prompt
- Background script will show prompt distribution
- Progress updates from all tabs

### 4. Advanced Testing Scenarios

#### Scenario 1: Interleaved Processing
- **Setup**: 3 tabs, 6 prompts
- **Expected**: Each tab processes 2 prompts
- **Timing**: Tabs will process in parallel, not waiting for each other

#### Scenario 2: Tab Management
- **Test**: Close one tab during processing
- **Expected**: Remaining tabs continue, background script adapts
- **Result**: No prompts lost, processing continues

#### Scenario 3: Error Handling
- **Test**: Refresh one tab during processing
- **Expected**: Tab re-registers, continues with next available prompt
- **Result**: Graceful recovery, no queue interruption

### 5. Performance Testing

#### Test Different Configurations:
- **2 tabs**: Good for basic testing
- **5 tabs**: Optimal for most use cases
- **10+ tabs**: Test browser performance limits

#### Monitor:
- **Memory Usage**: Check Task Manager
- **CPU Usage**: Monitor browser performance
- **Network**: Ensure stable connection for all tabs

### 6. Troubleshooting Multi-Tab Issues

#### "No ChatGPT tabs detected"
- **Solution**: Refresh the tab list
- **Check**: All tabs are on chat.openai.com or chatgpt.com
- **Verify**: Tabs are not minimized

#### "Queue stopped unexpectedly"
- **Check**: All tabs are still open
- **Verify**: No tabs were refreshed
- **Try**: Stop and restart the queue

#### "Some tabs not processing"
- **Check**: Tab visibility (not minimized)
- **Verify**: Tab is on ChatGPT conversation page
- **Try**: Refresh the problematic tab

### 7. Real-World Use Cases

#### Research Assistant
- **Tab 1**: Research topic A
- **Tab 2**: Research topic B
- **Tab 3**: Research topic C
- **Result**: Parallel research across multiple topics

#### Content Creation
- **Tab 1**: Generate blog post outline
- **Tab 2**: Create social media posts
- **Tab 3**: Write email templates
- **Result**: Multiple content pieces simultaneously

#### Learning Sessions
- **Tab 1**: Math problems
- **Tab 2**: History questions
- **Tab 3**: Science explanations
- **Result**: Multi-subject learning session

### 8. Tips for Best Performance

1. **Tab Management**: Keep tabs organized and visible
2. **Browser Resources**: Close unnecessary tabs during processing
3. **Network Stability**: Ensure good internet connection
4. **Prompt Quality**: Write clear, specific prompts for better results
5. **Monitoring**: Watch the progress to ensure smooth operation

### 9. Debugging Commands

Open browser console in any ChatGPT tab and try:
```javascript
// Check tab status
window.getTabStatus()

// Manually trigger next prompt
window.runPromptQueuer()

// Check if content script is loaded
console.log('Content script loaded:', typeof window.getTabStatus === 'function')
```

### 10. Success Indicators

✅ **Multi-tab is working when you see:**
- Multiple tabs processing different prompts simultaneously
- Progress bar advancing smoothly
- Real-time updates in the extension popup
- Console logs showing tab coordination
- All prompts completed across all tabs

🎉 **You've mastered multi-tab when you can:**
- Set up 5+ tabs efficiently
- Handle tab interruptions gracefully
- Use it for real productivity tasks
- Troubleshoot common issues quickly

---

**Ready to try?** Open multiple ChatGPT tabs and start queuing those prompts! 🚀 