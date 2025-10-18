# Multi-Tab Feature Fix

## Problem

The Multi-Tab feature was showing "No ChatGPT tabs found" even when the extension was running inside a ChatGPT tab. This made the feature completely unusable.

## Root Cause

The `GET_ACTIVE_TABS` handler in `background.js` was filtering for `tab.isActive`, which only becomes `true` when a tab is **actively processing prompts**. 

When tabs first register (on page load), they have:
```javascript
{
  tabId: "...",
  url: "...",
  isActive: false,  // ← Not processing yet
  isVisible: true,
  currentPrompt: null
}
```

The Multi-Tab UI was asking "show me active tabs" but really meant "show me **registered** tabs". So it would only display tabs that were currently in the middle of processing prompts, not tabs that were ready and waiting.

## The Fix

### 1. Changed `GET_ACTIVE_TABS` to Return All Registered Tabs

**File: `background.js` Lines 85-93**

**Before:**
```javascript
case 'GET_ACTIVE_TABS':
  sendResponse({
    tabs: Array.from(this.tabs.values()).filter(tab => tab.isActive)
  });
  break;
```

**After:**
```javascript
case 'GET_ACTIVE_TABS':
  // Return ALL registered ChatGPT tabs, not just ones actively processing
  const allTabs = Array.from(this.tabs.values()).map(tab => ({
    ...tab,
    status: tab.isActive ? 'processing' : 'ready'
  }));
  console.log(`📋 GET_ACTIVE_TABS: Returning ${allTabs.length} registered tab(s)`);
  sendResponse({ tabs: allTabs });
  break;
```

Now it returns:
- **All registered tabs** (not just active ones)
- With a `status` field indicating whether they're `'processing'` or `'ready'`

### 2. Updated Multi-Tab UI to Show Status

**File: `page-ui.js` Lines 1404-1444**

Enhanced the UI to:
- Show whether each tab is "Processing" or "Ready"
- Display shortened tab IDs (first 8 chars) for readability
- Show current prompt if processing
- Show "Waiting for prompts" if ready
- Better empty state messaging with troubleshooting hints
- Update stats to count processing vs ready tabs

### 3. Added Better Logging

- Tab registration now logs when tabs are detected
- GET_ACTIVE_TABS logs how many tabs it's returning
- refreshTabList shows tab details in console
- Error states are displayed in the UI with helpful messages

### 4. Auto-Refresh on Tab Switch

When you switch to the Multi-Tab tab, it automatically refreshes the tab list to show the latest registered tabs.

## How It Works Now

### Tab Registration
1. When you open ChatGPT in a tab, the content script runs
2. It registers itself with the background script via `REGISTER_TAB`
3. Background script stores the tab with `isActive: false` (ready state)

### Multi-Tab UI
1. When you open the Multi-Tab tab, it calls `GET_ACTIVE_TABS`
2. Background returns **all registered tabs** (not just processing ones)
3. UI shows each tab with its status:
   - 🟢 Green dot = Processing
   - ⚪ Gray dot = Ready
4. Stats show how many tabs are ready vs processing

### Starting Multi-Tab Queue
1. You add prompts to the queue
2. Switch to Multi-Tab tab
3. See all your registered ChatGPT tabs
4. Click "Start Multi-Tab Queue"
5. Prompts are distributed across all ready tabs
6. Tabs process prompts in parallel!

## Testing the Fix

1. **Reload the extension** in Chrome (`chrome://extensions/`)
2. **Open ChatGPT** in 2-3 tabs
3. **Click the extension icon** in one of the tabs
4. **Go to Multi-Tab tab**
5. You should see all your ChatGPT tabs listed!

### Expected Console Output

In the background service worker console (inspect the extension):
```
📝 Registered ChatGPT tab: mgfo7aip-8sz517x8o-ue5yx0 (https://chatgpt.com/...)
📝 Registered ChatGPT tab: xyz123ab-4cd567ef8-gh9ij0 (https://chatgpt.com/...)
📋 GET_ACTIVE_TABS: Returning 2 registered tab(s)
```

In the page console (F12 on ChatGPT tab):
```
📡 Switching to multi-tab view, refreshing tab list...
📡 Requesting tab list from background script...
✅ Received 2 tab(s): [
  {id: "mgfo7aip", url: "https://chatgpt.com/...", status: "ready"},
  {id: "xyz123ab", url: "https://chatgpt.com/...", status: "ready"}
]
```

## Troubleshooting

### Still Seeing "No ChatGPT tabs found"?

1. **Check background console:**
   - Open `chrome://extensions/`
   - Find "ChatGPT Prompt Queuer"
   - Click "Inspect views: service worker"
   - Look for "Registered ChatGPT tab" messages
   - If none appear, the content script isn't loading

2. **Refresh the ChatGPT tabs:**
   - Sometimes tabs need a refresh after updating the extension
   - Press F5 in each ChatGPT tab

3. **Check the URL:**
   - Make sure you're on `chatgpt.com` or `chat.openai.com`
   - Not on settings pages or other OpenAI domains

4. **Try "Refresh Tab List" button:**
   - The button manually re-queries registered tabs
   - Useful if tabs registered while the UI was closed

### Tabs showing but won't start?

1. **Check queue has prompts:** Need at least one prompt in queue
2. **Check console for errors:** Look for red error messages
3. **Try single-tab mode first:** Helps isolate if it's a multi-tab coordination issue

## Per-Tab Controls (NEW!)

Each tab in the Multi-Tab list now has its own **▶️ Start** or **⏹️ Stop** button!

### How It Works

- **Individual Control:** Start and stop specific tabs independently
- **Dynamic Adding:** Start more tabs mid-processing!
- **Selective Processing:** Choose which tabs to use
- **Visual Feedback:** See which tabs are processing vs ready

### Usage

1. **Go to Multi-Tab tab** - See all registered ChatGPT tabs
2. **Add prompts to queue** - Need at least one prompt
3. **Click "▶️ Start" on any tab** - That specific tab starts processing
4. **Click "▶️ Start" on more tabs** - Add more parallel processors
5. **Click "⏹️ Stop" on any tab** - Stop that specific tab

### Global Controls Still Available

- **"▶️ Start All"** or **"▶️ Start Remaining (X)"** - Starts all inactive tabs at once
- **"⏹️ Stop All (X)"** - Stops all processing tabs

### Example Workflows

**Scenario 1: Staggered Start**
```
1. Open 3 ChatGPT tabs
2. Add 10 prompts to queue
3. Click "▶️ Start" on Tab 1 - processes prompts 1, 4, 7, 10
4. Wait a minute, then click "▶️ Start" on Tab 2 - processes prompts 2, 5, 8
5. Click "▶️ Start" on Tab 3 - processes prompts 3, 6, 9
```

**Scenario 2: Selective Processing**
```
1. Have 5 tabs open (different conversation contexts)
2. Only start 2 specific tabs that have relevant context
3. Other tabs remain available for manual use
```

**Scenario 3: Mid-Process Adding**
```
1. Start Tab 1 and Tab 2
2. See they're making good progress
3. Open a new ChatGPT tab
4. Click "Refresh Tab List"
5. Click "▶️ Start" on the new tab - joins the processing!
```

## Benefits of Multi-Tab Mode

- **Parallel Processing:** Multiple prompts run simultaneously
- **Faster Completion:** 3 tabs = ~3x faster for independent prompts
- **Better for ChatGPT Plus:** Utilize parallel message limits
- **Separate Contexts:** Each tab maintains its own conversation context
- **Granular Control:** Start/stop individual tabs as needed
- **Dynamic Scaling:** Add more tabs mid-processing

## Known Limitations

1. **Codex Mode:** Multi-tab not yet tested in Codex mode (use single-tab for now)
2. **Tab Cleanup:** Inactive tabs are cleaned up after 2-5 minutes
3. **Chrome Tab ID:** If you close/reopen tabs quickly, they may need re-registration
4. **Storage:** Tab info stored in memory only (lost on extension reload)

## Future Improvements

- [ ] Show actual Chrome tab titles in the list
- [ ] Click tab in list to focus that ChatGPT tab
- [ ] Drag-drop to reorder tabs for priority
- [ ] Save tab preferences/favorites
- [ ] Show tab thumbnails/previews
- [ ] Smart prompt distribution based on tab context

