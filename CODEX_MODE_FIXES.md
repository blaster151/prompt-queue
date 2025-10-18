# Prompt Queue Fixes

## Summary

This document tracks all critical fixes made to the Prompt Queuer extension, including Codex mode compatibility, timeout handling, and UI synchronization issues.

## Problems

The Prompt Queuer had several critical issues:

### 1. False Completion Detection
- Mark prompt 1 as complete before the response actually finished
- Send prompt 2 prematurely
- Continue marking prompts as complete without waiting for actual responses

### 2. Accidental Navigation Away From Workspace
- When attempting to send the second (phantom) prompt, the extension would click the wrong button
- This caused navigation back to the Codex tasks list, exiting the current workspace
- Happened because button-finding logic was too broad and matched back/exit buttons

### 3. False "No Available ChatGPT Tabs" Error (Single Tab Mode)
- In single tab mode, an error message appeared: "No available ChatGPT tabs found"
- This happened because the code tried to use the MultiTabManager message passing system
- The fallback worked fine, but the error was confusing and noisy
- Fixed by using direct content script access in single tab mode (no message passing needed)

### 4. Empty Queue UI on Initial Load (In-Page UI)
- The in-page UI (page-ui.js) would sometimes show an empty queue on initial load
- When adding a new item, old queue entries would suddenly appear
- This happened because `loadQueue()` is async but wasn't being awaited in `initUI()`
- The UI would render before the queue data loaded from storage
- Fixed by making `initUI()` async and awaiting `loadQueue()` before calling `updateUI()`

### 5. Stop Queue Button Clears Queue (Critical!)
- Clicking "Stop Queue" would completely empty the queue instead of just stopping processing
- Also happened when queue completed naturally - all items were deleted
- This was a major data loss bug - users lost their queued prompts
- Fixed by removing `queue = []` and `saveQueue()` from both `stopQueue()` and `onQueueComplete()`
- Now Stop Queue preserves the queue (user can use "Clear Queue" if they want to empty it)
- Re-running the same queue is now possible

### 6. Async Message Listener Error
- Console error: "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"
- `background.js` was returning `true` for ALL message types, even ones that don't need async responses
- Some message handlers didn't call `sendResponse()` at all (TAB_VISIBILITY_CHANGE, PROGRESS_UPDATE)
- Fixed by only returning `true` for message types that actually need async responses
- Added `sendResponse()` calls to all message handlers that were missing them

## Root Cause

The `isResponseComplete()` function was too aggressive - it returned `true` if **ANY** of 5 detection strategies indicated completion. In Codex mode, the UI differs significantly:

- **The stop button is visible during response generation** (correctly indicating in-progress)
- **BUT the send button is also visible** (incorrectly suggesting completion)
- **AND the input field remains enabled** (incorrectly suggesting completion)
- **AND there are no loading indicators** (incorrectly suggesting completion)

This caused 3 out of 5 strategies to falsely indicate completion, even though the stop button was clearly showing the response was still generating. The stop button is the only reliable indicator in Codex mode.

## Solution

### 1. **Stop Button Hard Veto (CRITICAL FIX for Codex)**
The stop button is now a **hard requirement** - if it's visible, the response is definitely in progress, period. This check happens FIRST and overrides all other strategies. In Codex mode, other UI elements like the send button and input field can be enabled while a response is still generating, but the stop button never lies.

### 2. **Consensus-Based Completion Detection**
Changed from "any strategy" to requiring **at least 3 out of 4 secondary strategies** to agree before declaring completion (after verifying no stop button). This prevents false positives from single indicators.

### 3. **Content Length Validation**
Added a check to ensure the response has actual content (>5 characters) before declaring completion. This catches cases where the response element exists but hasn't started generating yet.

### 4. **Minimum Wait Time**
Added a 500ms minimum wait before checking completion. This ensures the response has time to start before we begin checking if it's done.

### 5. **Enhanced Logging**
Added detailed logging to see which strategies agree/disagree, making it easy to debug future issues:
- Enable debug mode: `window.enableDebugMode()` in the browser console
- Disable debug mode: `window.disableDebugMode()`

### 6. **Smart Timeout (CRITICAL FIX)**
The timeout mechanism was fundamentally flawed - it would assume the response was done after 60 seconds, even if the stop button was still visible. This caused false completion detection and race conditions.

**New behavior:**
- Timeout increased to 5 minutes (from 60 seconds) for longer Codex responses
- **NEVER assumes response is done if stop button is visible**
- Only triggers timeout if stop button is NOT visible
- If timeout is reached but stop button is still visible, keeps waiting indefinitely
- This prevents the "Cannot send message while response is in progress" error

## How to Test

1. Load the extension in Chrome
2. Open ChatGPT Codex mode: `https://chatgpt.com/codex/tasks/...`
3. Add 2-3 prompts to the queue
4. Open browser DevTools Console
5. (Optional) Enable debug mode: `window.enableDebugMode()`
6. Start the queue
7. Watch the console logs to verify:
   - Each prompt waits at least 500ms before checking completion
   - Completion requires 3+ strategies to agree
   - Responses have content before being marked complete
   - Next prompt doesn't send until previous response is truly complete

## Debug Mode

When enabled via `window.enableDebugMode()`, you'll see detailed logs like:

```
🔍 Completion check: 2/5 strategies agree | No stop button: ✓, Send button visible: ✗, Mic button visible: ✓, No loading indicators: ✗, Input enabled: ✗
⏳ Still waiting for response...
🔍 Completion check: 4/5 strategies agree | No stop button: ✓, Send button visible: ✓, Mic button visible: ✓, No loading indicators: ✓, Input enabled: ✗
✅ Response completion confirmed: 4/5 strategies agree | ...
```

This helps identify which UI elements Codex mode presents differently.

## Changes Made

**File: `content.js`**

1. **Lines 181-256**: Rewrote `isResponseComplete()` function
   - **CRITICAL**: Added stop button hard veto - if visible, response is in progress (no exceptions)
   - Changed from "any strategy" to "3+ out of 4 secondary strategies must agree"
   - Added strategy result tracking
   - Added content length validation
   - Added detailed debug logging

2. **Lines 284-339**: Enhanced `waitForResponseToFinish()` function
   - Added 500ms minimum wait time
   - Added elapsed time tracking
   - Added periodic progress logging
   - Increased timeout to 5 minutes (300 seconds)
   - **CRITICAL**: Timeout now checks stop button visibility before resolving
   - If stop button is still visible at timeout, continues waiting indefinitely
   - NEVER assumes response is done while stop button is visible

3. **Lines 333-441**: Enhanced `sendMessage()` function
   - Added safety check to prevent sending while stop button is visible
   - Prevents race conditions where a second message tries to send while first is in progress
   - Throws clear error if attempted (caught by calling function)

4. **Lines 569-602 & 694-726**: Added double-check safety before next prompt
   - After completion detection, double-checks stop button isn't still visible
   - If visible, waits additional 1 second before retrying
   - Increased inter-prompt delay from 100ms to 500ms for Codex mode safety
   - Prevents "Cannot send message while response is in progress" race condition

5. **Lines 55-134**: Enhanced `getSendButton()` function to prevent accidental navigation
   - Added `isLikelyNavigationButton()` filter to avoid clicking back/close/cancel/exit buttons
   - Prioritizes data-testid strategy (most reliable)
   - Filters out navigation buttons from all strategies
   - Added logging to show which button is being clicked
   - **Fixes the Codex mode navigation bug** where clicking wrong button exits the workspace

6. **Lines 735-743**: Added debug mode helpers
   - `window.enableDebugMode()` - Enable detailed logging
   - `window.disableDebugMode()` - Disable detailed logging

**File: `background.js`**

1. **Lines 19-30**: Fixed async message listener error
   - Only returns `true` for message types that actually need async responses
   - Prevents "message channel closed before a response was received" error
   - Checks message type against whitelist of async operations

2. **Lines 52-55, 105-108**: Added missing sendResponse calls
   - TAB_VISIBILITY_CHANGE now calls sendResponse
   - PROGRESS_UPDATE now calls sendResponse
   - Prevents hanging message channels

**File: `page-ui.js`**

1. **Lines 1001-1008**: Fixed empty queue UI on initial load
   - Made `initUI()` async and properly awaits `loadQueue()`
   - Calls `updateUI(container)` after queue is loaded from storage
   - Ensures queue items are displayed immediately on UI initialization
   - Fixes race condition where UI rendered before data loaded

2. **Lines 1371-1391**: Fixed Stop Queue button (Critical!)
   - Removed `queue = []` and `saveQueue()` that were clearing the queue
   - Now only stops processing, preserves queue items
   - Added `completedPrompts.clear()` to reset completion tracking
   - User can re-run the same queue or use "Clear Queue" to empty it

3. **Lines 2107-2136**: Fixed queue clearing on completion
   - Removed `queue = []` and `saveQueue()` from `onQueueComplete()`
   - Queue is now preserved after natural completion
   - Allows users to re-run the same queue multiple times

4. **Lines 1349-1359**: Fixed single tab mode startup
   - Removed unnecessary message passing through MultiTabManager
   - Uses direct content script access since we're already on the ChatGPT tab
   - Eliminates the false "No available ChatGPT tabs found" error
   - Cleaner, more direct startup process

5. **Lines 332-365**: Added styles for copy-to-queue button
   - Green color scheme to distinguish from red remove button
   - Hover effects for better UX

6. **Lines 651-667**: Added event handler for copy button
   - Copies queue item to bottom of queue
   - Preserves original item

7. **Lines 1103-1129**: Updated queue item rendering
   - Added "↓" copy button next to remove button
   - Grouped action buttons together
   - Added tooltips for both buttons

## New Features

### Copy Queue Item to Bottom
Each queue item now has a green "↓" button that copies it to the bottom of the queue. Useful for:
- Repeating a prompt after others complete
- Creating variations of a prompt
- Building iterative workflows

The button appears next to the red "×" remove button on each queue item.

## If Issues Persist

If you still see premature completion in Codex mode:

1. Enable debug mode in the console: `window.enableDebugMode()`
2. Check which strategies are agreeing when false completion happens
3. Look for the log: `🎯 Found send button via strategy: ...` to see which button is being clicked
4. If specific strategies are problematic in Codex mode, we can:
   - Adjust the threshold (e.g., require 4/4 instead of 3/4)
   - Add Codex-specific selectors
   - Increase the minimum wait time
   - Add more content validation
   - Add more navigation keywords to the filter

The detailed logging will tell us exactly what's happening!

