# File & Image Attachments Feature 📎

## Overview

Queue items now support file and image attachments! You can attach files/images to any prompt in the queue, and they'll be automatically uploaded to ChatGPT when that prompt is sent.

## How to Add Attachments

### Method 1: Drag & Drop (Easiest!)
1. Add prompts to your queue
2. Drag files or images from your file explorer
3. Drop them directly onto the queue item you want to attach them to
4. The queue item will highlight blue when you hover over it with files

### Method 2: Click the Attach Button
1. Click the blue 📎 button on any queue item
2. Select one or more files from the file picker
3. Files will be added as thumbnails below the prompt text

### Method 3: Paste from Clipboard
1. Copy an image to your clipboard (Ctrl+C on an image)
2. Make sure the Queue tab is active and visible
3. Paste (Ctrl+V) - the image will be added to the **last queue item**

## Supported File Types

- **Images**: All image formats (PNG, JPG, GIF, WebP, etc.)
- **Documents**: PDF, TXT, MD, JSON, CSV
- **Office Files**: DOC, DOCX, XLS, XLSX
- *More formats coming soon!*

## Visual Feedback

### Image Thumbnails
- Images show as 32x32px thumbnails with the actual image preview
- Hover to see the full filename

### File Thumbnails
- Files show as colored boxes with the file extension (e.g., "PDF", "TXT")
- Blue background for easy identification

### Remove Attachments
- Hover over any thumbnail to see a red × button
- Click it to remove that attachment

## Queue Item Actions

Each queue item now has **three action buttons**:

1. **📎 (Blue)** - Add file/image attachment
2. **↓ (Green)** - Copy this item (with all attachments!) to bottom of queue
3. **× (Red)** - Remove this item from queue

## How It Works

When a queue item's turn comes up:

1. **Attachments Upload First** - All attached files/images are uploaded to ChatGPT
2. **Then Text Sends** - The prompt text is sent
3. **ChatGPT Processes** - ChatGPT receives both the files and your prompt together

The extension waits for uploads to complete before sending the text, ensuring everything arrives correctly.

## Storage

- Files are converted to base64 and stored in Chrome's local storage
- Each attachment includes: type, data, filename, MIME type, and size
- **Size Limits**: Chrome has a ~10MB total storage limit for extensions
  - Try to keep individual files under 5MB
  - The extension will alert you if storage is full

## Backwards Compatibility

- Existing queue items (text-only) continue to work perfectly
- Old queues are automatically upgraded to support attachments
- No data is lost during the upgrade

## Use Cases

### Code Review
```
Prompt: "Review this code for security issues"
Attach: script.js, config.json
```

### Design Feedback
```
Prompt: "What design improvements would you suggest?"
Attach: mockup_v1.png, mockup_v2.png
```

### Document Analysis
```
Prompt: "Summarize the key points from these documents"
Attach: report.pdf, notes.txt
```

### Data Processing
```
Prompt: "Analyze this data and create visualizations"
Attach: data.csv
```

### Multi-Pass Workflows (Codex Mode!)
```
Queue Item 1: "Set up a Flask app" (no attachments)
Queue Item 2: "Add these routes" (attach: routes.py)
Queue Item 3: "Connect to this database" (attach: schema.sql)
```

## Tips & Tricks

1. **Batch Operations**: Drag multiple files at once onto a queue item
2. **Iterative Refinement**: Copy a queue item, modify it, and attach different files
3. **Template Prompts**: Create a prompt with attachments, then copy it multiple times and modify as needed
4. **Screen Captures**: Use Windows Snipping Tool (Win+Shift+S), then paste directly into queue
5. **File Preparation**: Rename files to be descriptive before attaching (helps ChatGPT understand context)

## Known Limitations

1. **Upload Mechanism**: The extension simulates file drag-drop/upload. If ChatGPT's UI changes significantly, this may need updates.
2. **File Size**: Very large files (>10MB) may fail or exhaust Chrome storage
3. **Paste**: Only works when the queue UI is visible and the Queue tab is active
4. **ChatGPT Plus**: Some file types may require ChatGPT Plus/Pro subscription

## Troubleshooting

### "Could not find file upload mechanism"
- This means the extension couldn't locate ChatGPT's file upload UI
- Make sure you're on the ChatGPT chat page (not settings/history)
- Try refreshing the page
- Check console logs for more details

### Files not uploading
- Check file size (keep under 5MB)
- Verify file type is supported by ChatGPT
- Look for errors in the browser console (F12)
- Try uploading manually first to ensure ChatGPT accepts the file type

### Thumbnails not showing
- This is likely a storage issue
- Check Chrome's storage quota: chrome://settings/content/all
- Clear some data if needed

### Paste not working
- Make sure the queue UI is visible (toggle with ⚡ button)
- Make sure you're on the Queue tab
- Verify you have at least one item in the queue
- Check that you're pasting an image (not text or files)

## Technical Details

### Data Structure
```javascript
{
  text: "Your prompt text here",
  attachments: [
    {
      type: 'image',        // or 'file'
      data: 'data:image/png;base64,...',
      name: 'screenshot.png',
      mimeType: 'image/png',
      size: 45123
    }
  ]
}
```

### Storage Format
Queue items are stored as JSON in `chrome.storage.local` under the `queue` key.

### Upload Process
1. Base64 data URL → Blob → File object
2. Locate ChatGPT's file input or drop zone
3. Simulate file selection via DataTransfer
4. Trigger change/drop event
5. Wait for upload completion

## Future Enhancements

Potential improvements for future versions:

- [ ] Attachment size warnings
- [ ] Image preview modal (click thumbnail to view full size)
- [ ] Drag to reorder attachments
- [ ] Attach files during prompt creation (Manual tab)
- [ ] Cloud storage integration for large files
- [ ] Attachment templates/presets
- [ ] Batch attach same files to multiple queue items

## Feedback

Found a bug? Have a feature request? Let us know!

This feature is brand new and we'd love to hear your experience using it.


