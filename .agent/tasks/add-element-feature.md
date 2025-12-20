# Add Element Feature Implementation

## Completed ✅
1. Moved role badge next to dashboard selector
2. Added "Add Element" button in header

## Next Steps 🚀

### 1. Add Element Dialog
- [ ] Create state variable `showAddElementDialog`
- [ ] Build dialog with element type selection
- [ ] Element types:
  - Chart
  - Table  
  - Stat Card
  - **Text Field** (NEW - rich text editor)
  - **File Upload** (NEW - file/folder upload with download)

### 2. Text Field Element
- [ ] Rich text editor component
- [ ] Save/load text content
- [ ] Markdown support (optional)

### 3. File Upload Element
- [ ] File upload UI
- [ ] Support files & zipped folders
- [ ] Download functionality
- [ ] File size tracking (200MB limit per dashboard)
- [ ] Display file info (name, size, type)
- [ ] Permission-based access

### 4. Backend Changes
- [ ] Add `total_file_size` field to dashboard table
- [ ] File upload endpoint
- [ ] File download endpoint  
- [ ] File size validation
- [ ] Permission checks

### 5. Database Schema
```sql
-- Add to dashboard table
DEFINE FIELD total_file_size ON TABLE dashboard TYPE number DEFAULT 0;

-- File element structure
{
  type: 'file',
  title: 'File Name',
  config: {
    file_url: 'path/to/file',
    file_name: 'document.pdf',
    file_size: 1024000, // bytes
    file_type: 'application/pdf',
    uploaded_at: '2025-12-19T...'
  }
}
```

## File Size Limit
- **200MB per dashboard** (can increase to 500MB-1GB if needed)
- Track cumulative size across all file elements
- Show remaining space in UI

## Permissions
- Inherit from dashboard permissions
- Owner: Full access (upload, download, delete)
- Editor: Upload, download
- Viewer: Download only
