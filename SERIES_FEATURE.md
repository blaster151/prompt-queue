# Prompt Series Feature 📚

## Overview

Save and reuse your prompt workflows! The Series feature lets you save your current queue (with all attachments!) as a reusable template. Perfect for repetitive workflows, testing variations, or sharing with team members.

## Why Series?

- **Codex Workflows**: Save multi-step development processes
- **Testing Variations**: Run the same prompts with different data
- **Templates**: Create prompt templates for common tasks
- **Share Workflows**: Export and share with your team
- **Iterate**: Update series as your workflow improves

## How to Use

### Saving a Series

1. **Build your queue** with prompts (and attachments if needed)
2. Go to the **Queue** tab
3. Click **"💾 Save as Series"**
4. Enter a **name** (e.g., "Flask App Setup Workflow")
5. Enter a **description** (optional, e.g., "Multi-step process for setting up Flask apps")
6. Click OK - series saved!

### Loading a Series

1. Go to the **Series** tab
2. Find the series you want
3. Click **"📂 Load"**
4. Series prompts (with attachments!) are now in your queue
5. Switch to **Queue** tab to run them

### Managing Series

Each saved series has these actions:

- **📂 Load** - Load into current queue (replaces existing queue)
- **🔄 Update** - Replace series with current queue
- **✏️ Rename** - Change name and description
- **📤 Export** - Download as JSON file
- **🗑️ Delete** - Remove from saved series

### Exporting & Importing

**Export a Series:**
1. In Series tab, click **"📤 Export"** on any series
2. JSON file downloads automatically
3. Share this file with team members!

**Import a Series:**
1. In Series tab, click **"📥 Import Series"**
2. Select the JSON file
3. Series is imported and ready to use!

## Data Structure

Each saved series includes:

```javascript
{
  id: "unique-id",
  name: "My Workflow",
  description: "Optional description",
  prompts: [
    {
      text: "Prompt text",
      attachments: [
        {
          type: "image",
          data: "base64...",
          name: "screenshot.png",
          mimeType: "image/png",
          size: 45123
        }
      ]
    }
  ],
  createdAt: 1234567890,
  updatedAt: 1234567890,
  promptCount: 5,
  hasAttachments: true
}
```

## Storage

- Series are stored in Chrome local storage
- Survives browser restarts
- Separate from queue (series persist even after queue is cleared)
- Export to JSON for backup or sharing

## Use Cases

### 1. Codex Multi-Step Development

**Series Name:** "React Component Development"

```
Prompt 1: "Create a new React component for user authentication"
Prompt 2: "Add form validation" + [schema.json]
Prompt 3: "Add error handling"
Prompt 4: "Write unit tests" + [component.jsx]
Prompt 5: "Add accessibility features"
```

**Benefits:**
- Reuse for every new component
- Consistent development process
- Include schema files as attachments
- Update the series as your process improves

### 2. Code Review Template

**Series Name:** "Code Review Checklist"

```
Prompt 1: "Review this code for security issues" + [code.js]
Prompt 2: "Check for performance bottlenecks" + [code.js]
Prompt 3: "Suggest improvements for readability" + [code.js]
Prompt 4: "Identify potential bugs" + [code.js]
```

**Benefits:**
- Consistent review process
- Just update the attachment
- Share with team for standardized reviews

### 3. Documentation Generation

**Series Name:** "API Documentation Generator"

```
Prompt 1: "Generate API documentation" + [routes.js]
Prompt 2: "Create usage examples"
Prompt 3: "Add error response documentation"
Prompt 4: "Generate OpenAPI spec"
```

### 4. Testing Workflow

**Series Name:** "Backend API Testing"

```
Prompt 1: "Review API structure" + [api.js]
Prompt 2: "Generate test cases"
Prompt 3: "Create integration tests"
Prompt 4: "Add edge case tests"
Prompt 5: "Performance testing recommendations"
```

### 5. Learning Series

**Series Name:** "Python Concepts Tutorial"

```
Prompt 1: "Explain decorators with examples"
Prompt 2: "Show me context managers"
Prompt 3: "Demonstrate generators"
Prompt 4: "Explain metaclasses"
```

**Benefits:**
- Save learning paths
- Return later to review concepts
- Share with students/colleagues

## Series Tab UI

The Series tab shows all your saved series with:

- **Name** (bold, prominent)
- **Description** (italic, if provided)
- **Metadata:**
  - Prompt count
  - 📎 icon if has attachments
  - Last updated date/time
- **Action buttons** (all in one row)

**Purple border** on left distinguishes series items from queue items.

## Best Practices

### Naming Conventions

Good series names are:
- **Descriptive**: "Flask Setup Workflow" not "Workflow 1"
- **Action-oriented**: "Debug Memory Leak" not "Memory stuff"
- **Context-specific**: "Frontend Code Review" not "Review"

### Descriptions

Use descriptions for:
- When to use this series
- What files/attachments to include
- Expected outcome
- Prerequisites

Example:
```
Name: "Database Migration Helper"
Description: "Use when migrating to new schema. Attach old schema.sql 
and new schema.sql. Generates migration scripts and validates data integrity."
```

### Organization Tips

1. **Use prefixes** for categories:
   - "DEV-" for development workflows
   - "TEST-" for testing workflows
   - "DOC-" for documentation
   - "LEARN-" for learning series

2. **Update regularly**: Use "🔄 Update" to keep series current

3. **Export important series**: Backup critical workflows

4. **Share with team**: Export and import for team consistency

### Attachment Management

- Attachments are stored with each series
- Large attachments can consume storage
- Consider keeping attachments small or export/re-import when needed
- Check Chrome storage if you have many large-attachment series

## Advanced Features

### Updating a Series

**Scenario:** You've improved your workflow and want to save the changes.

1. Load the series
2. Make modifications (add/remove/reorder prompts, update attachments)
3. Go to Series tab
4. Click "🔄 Update" on the original series
5. Confirm - series updated!

### Version Control (Manual)

Want to keep multiple versions?

1. Load series "v1"
2. Make changes
3. Save as NEW series "v2" (don't update)
4. Now you have both versions!

### Series Templates

Create "template" series with placeholder prompts:

```
Name: "Code Review Template"
Prompt 1: "[REPLACE] Review this code for..."
Prompt 2: "[REPLACE] Check for performance..."
```

After loading:
1. Edit prompts to replace placeholders
2. Add specific files
3. Run or save as new series

## Troubleshooting

### "Cannot save empty series"
- Add at least one prompt to queue before saving
- Check queue tab to verify prompts are present

### Series not appearing
- Reload extension
- Check Series tab (auto-refreshes when you switch to it)
- Check browser console for errors

### Import fails
- Verify JSON file format
- Ensure file was exported from this extension
- Check file isn't corrupted

### Attachments missing after load
- Attachments should load automatically
- Check browser storage quota
- May need to re-attach if storage was cleared

### "Series not found" error
- Series may have been deleted
- Try refreshing the page
- Check if series exists in Series tab

## Storage Limits

Chrome extensions have a storage limit (~5MB for local storage):

- Text prompts: ~1KB each
- Small images: ~50-500KB each
- Large files: 1MB+ each

**Tips for storage:**
- Keep attachments reasonably sized
- Export series you don't use frequently
- Clear old/unused series
- Consider using file references instead of embedding large files

## Future Enhancements

Potential improvements for future versions:

- [ ] Series folders/categories
- [ ] Search/filter series
- [ ] Duplicate series
- [ ] Series variables (parameterized prompts)
- [ ] Cloud sync for series
- [ ] Series marketplace/sharing
- [ ] Version history within series
- [ ] Merge two series
- [ ] Schedule series execution

## Keyboard Shortcuts (Future)

Planned shortcuts:
- `Ctrl+S` - Save current queue as series
- `Ctrl+L` - Load last used series
- `Ctrl+E` - Export current series

## Tips & Tricks

1. **Quick iterations**: Load series, make small change, run, update series
2. **A/B testing**: Save series "Approach A" and "Approach B", test both
3. **Daily standup**: Create series with your regular standup prompts
4. **Learning journal**: Save interesting prompt series as you learn
5. **Emergency toolkit**: Save debugging workflows for quick access

## Examples Library

### "Bug Investigation Workflow"
```
1. "Analyze these error logs" + [logs.txt]
2. "Identify root cause"
3. "Suggest fixes with code examples"
4. "Recommend preventive measures"
```

### "Content Creation Pipeline"
```
1. "Generate blog post outline about [TOPIC]"
2. "Write introduction paragraph"
3. "Develop main sections"
4. "Create conclusion"
5. "Suggest SEO improvements"
```

### "Data Analysis Workflow"
```
1. "Analyze this dataset" + [data.csv]
2. "Identify trends and patterns"
3. "Create visualization recommendations"
4. "Generate summary report"
```

## Feedback

Love this feature? Have suggestions? We'd love to hear how you're using Series!

Common requests to consider:
- Series sharing marketplace
- Cloud sync
- Scheduled execution
- Parameterized prompts

Try it out and let us know what workflows you create! 🚀


