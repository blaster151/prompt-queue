# ChatGPT Prompt Queuer

A Chrome extension that allows you to queue and automatically send multiple prompts to ChatGPT, with intelligent waiting for responses to complete before sending the next prompt. **Now with multi-tab support for interleaved processing across multiple ChatGPT conversations!**

## Features

- **Manual Prompt Entry**: Add individual prompts to the queue
- **Matrix Data Import**: Parse tab-separated matrix data (4 columns) to bulk import prompts
- **Smart Response Detection**: Automatically waits for ChatGPT to finish responding before sending the next prompt
- **Multi-Tab Processing**: Process prompts across multiple ChatGPT tabs simultaneously with interleaved execution
- **Progress Tracking**: Real-time progress updates during queue processing
- **Queue Management**: Add, remove, and clear prompts from the queue
- **Persistent Storage**: Queue is saved between browser sessions
- **Tab Coordination**: Intelligent distribution of prompts across available ChatGPT tabs

## Installation

### Method 1: Load Unpacked Extension (Development)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your toolbar

### Method 2: Install from Chrome Web Store (Coming Soon)

*Note: This extension is not yet published to the Chrome Web Store*

## Usage

### Basic Workflow

1. **Navigate to ChatGPT**: Go to [chat.openai.com](https://chat.openai.com) or [chatgpt.com](https://chatgpt.com)
2. **Open the Extension**: Click the extension icon in your Chrome toolbar
3. **Add Prompts**: Use either the Manual or Matrix tab to add prompts to your queue
4. **Choose Mode**: Select Single Tab or Multi Tab mode in the Queue tab
5. **Start Queue**: Click "Start Queue" to begin processing
6. **Monitor Progress**: Watch the progress bar and status updates
7. **Complete**: The extension will automatically send all prompts and wait for responses

### Single Tab Mode

- Processes prompts sequentially in one ChatGPT tab
- Best for focused conversations or when you want to maintain context
- Traditional queue processing behavior

### Multi-Tab Mode 🆕

- **Interleaved Processing**: Distributes prompts across multiple ChatGPT tabs
- **Parallel Execution**: Multiple tabs can process different prompts simultaneously
- **Automatic Tab Detection**: Automatically finds all open ChatGPT tabs
- **Real-time Coordination**: Background script manages prompt distribution
- **Progress Tracking**: Shows progress across all active tabs

#### Multi-Tab Setup

1. **Open Multiple ChatGPT Tabs**: Open 2 or more ChatGPT conversations
2. **Switch to Multi-Tab Mode**: In the Queue tab, click "Multi Tab" mode
3. **Check Tab Status**: Go to the "Multi-Tab" tab to see detected ChatGPT tabs
4. **Start Processing**: Click "Start Multi-Tab Queue" to begin interleaved processing

#### How Multi-Tab Processing Works

- Each ChatGPT tab gets a unique ID when the content script loads
- The background script maintains a shared queue of prompts
- Tabs request the next available prompt when ready
- Prompts are distributed in order but processed in parallel
- The system waits for each tab to complete before assigning the next prompt
- Progress is tracked across all tabs in real-time

### Manual Prompt Entry

1. Click the "Manual" tab
2. Enter your prompt in the text area
3. Click "Add to Queue" or press Ctrl+Enter
4. Repeat for additional prompts

### Matrix Data Import

1. Click the "Matrix" tab
2. Paste your tab-separated data in the format:
   ```
   Header1	Header2	Header3	Header4
   Data1	Data2	Data3	Data4
   Data5	Data6	Data7	Data8
   ```
3. Click "Parse & Add to Queue"
4. The extension will combine all columns into single prompts

**Supported Formats:**
- **2 columns**: `Question	Answer`
- **3 columns**: `Topic	Question	Context`
- **4 columns**: `Header1	Header2	Header3	Header4`

The extension automatically detects the number of columns and combines them with double spaces.

### Queue Management

- **View Queue**: Switch to the "Queue" tab to see all queued prompts
- **Remove Items**: Click the "×" button next to any prompt to remove it
- **Clear All**: Click "Clear Queue" to remove all prompts
- **Start Processing**: Click "Start Queue" to begin sending prompts
- **Mode Selection**: Choose between Single Tab and Multi Tab processing

### Multi-Tab Management

- **Tab Detection**: Automatically detects all open ChatGPT tabs
- **Tab Status**: View which tabs are active and their current prompts
- **Real-time Updates**: See live progress across all tabs
- **Stop Processing**: Stop the queue on all tabs simultaneously
- **Refresh Tabs**: Manually refresh the tab list

## Technical Details

### Response Detection

The extension uses sophisticated UI state detection to determine when ChatGPT has finished responding:

- Monitors the visibility of stop/send buttons
- Tracks message ID changes to detect new responses
- Waits for the stop button to disappear and send button to reappear
- Includes timeout protection (30 seconds) to prevent infinite waiting

### Multi-Tab Architecture

- **Content Scripts**: Each ChatGPT tab runs an independent content script
- **Background Service Worker**: Coordinates prompt distribution and tracks progress
- **Tab Registration**: Tabs automatically register when content scripts load
- **Message Passing**: Chrome extension messaging for inter-tab communication
- **State Management**: Centralized queue and progress tracking

### Matrix Parsing

The matrix parser supports:
- 2-4 columns separated by tabs
- Automatic column count detection
- First row is treated as header and skipped
- All columns are combined with double spaces between them
- Handles multi-line cells within the matrix

### Browser Compatibility

- Chrome 88+ (Manifest V3)
- Requires active tab permission for ChatGPT
- Uses Chrome Storage API for queue persistence
- Supports multiple tabs with independent content scripts

## Development

### Project Structure

```
prompt-queue/
├── manifest.json          # Extension manifest
├── popup.html            # Extension popup interface
├── popup.js              # Popup logic and UI management
├── content.js            # Content script for ChatGPT interaction
├── background.js         # Background service worker (multi-tab coordinator)
├── icons/                # Extension icons
└── README.md            # This file
```

### Key Components

- **Content Script** (`content.js`): Handles all ChatGPT page interaction and tab registration
- **Popup** (`popup.html` + `popup.js`): User interface for queue management and multi-tab controls
- **Background** (`background.js`): Service worker for multi-tab coordination and prompt distribution
- **Storage**: Chrome storage API for queue persistence

### Multi-Tab Message Flow

1. **Tab Registration**: Content script registers with background script
2. **Queue Start**: Popup sends queue to background script
3. **Prompt Distribution**: Background script assigns prompts to requesting tabs
4. **Progress Updates**: Tabs report completion back to background script
5. **UI Updates**: Background script forwards updates to popup

### Debugging

1. Open Chrome DevTools
2. Go to the Extensions tab
3. Find "ChatGPT Prompt Queuer" and click "inspect views: popup"
4. Check the Console tab for debug messages
5. For multi-tab debugging, check the background script console

## Troubleshooting

### Common Issues

**"Please navigate to ChatGPT" error**
- Make sure you're on chat.openai.com or chatgpt.com
- Refresh the page and try again

**"Input box not found" error**
- Ensure you're on a ChatGPT conversation page
- Try refreshing the page

**"No active ChatGPT tabs found" error (Multi-Tab)**
- Open multiple ChatGPT tabs (chat.openai.com or chatgpt.com)
- Make sure tabs are visible (not minimized)
- Click "Refresh Tab List" in the Multi-Tab tab

**Matrix parsing fails**
- Check that your data has exactly 4 columns
- Ensure columns are separated by tabs, not spaces
- Verify the first row is a header row

**Queue doesn't start**
- Check that you have prompts in the queue
- Ensure you're on ChatGPT
- Try refreshing the page

**Multi-tab processing stops unexpectedly**
- Check that all ChatGPT tabs are still open
- Verify tabs haven't been refreshed or navigated away
- Try stopping and restarting the queue

### Performance Notes

- The extension includes a 30-second timeout for response detection
- Progress updates are sent every 300ms during processing
- Multi-tab coordination updates every 1 second
- Queue data is automatically saved to Chrome storage
- Tab cleanup occurs every minute to remove inactive tabs

### Multi-Tab Best Practices

- **Tab Management**: Keep ChatGPT tabs open and visible during processing
- **Browser Performance**: Limit to 5-10 tabs for optimal performance
- **Network Stability**: Ensure stable internet connection for all tabs
- **Memory Usage**: Close unused tabs to free up resources

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on ChatGPT (both single and multi-tab modes)
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please create an issue on the GitHub repository. 