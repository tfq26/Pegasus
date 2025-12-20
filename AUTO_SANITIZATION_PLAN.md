# Auto-Sanitization Implementation Plan

## Goal
Automatically sanitize uploaded data to create an AI-friendly version while preserving the original.

## Changes Needed

### 1. Upload Endpoint (`/upload` in index.js)
**Current Flow:**
- Parse file → Create table → Insert data

**New Flow:**
- Parse file → Create `{table}_original` table → Insert data
- Auto-run sanitization analysis
- Create `{table}_sanitized` table with AI fixes applied
- Return both table names to frontend

### 2. Sanitization Metadata Tracking
Create a new table to track sanitization relationships:
```sql
CREATE TABLE sanitization_metadata (
  id: string,
  original_table: string,
  sanitized_table: string,
  upload_id: string,
  issues_fixed: array,
  created_at: datetime,
  user_id: string
)
```

### 3. Re-Sanitization Flow
When user clicks "Sanitize" button:
- Look up original table from metadata
- Re-run AI analysis on original data
- Drop old sanitized table
- Create new sanitized table with fresh fixes
- Update metadata

### 4. Query Routing
- Default to using `_sanitized` table for AI queries
- Allow user to toggle between original/sanitized view
- Show indicator in UI which version is active

## Implementation Steps

1. ✅ Enhanced sanitizer AI (already done)
2. Create sanitization metadata table schema
3. Modify upload endpoint to auto-sanitize
4. Add re-sanitization endpoint
5. Update frontend to show both versions
6. Add toggle UI for original vs sanitized

## Files to Modify
- `/apps/backend/index.js` - Upload endpoint
- `/apps/backend/src/routes/chat.js` - Sanitize endpoint
- `/apps/backend/ai/sanitizer.js` - Add apply fixes function
- `/apps/ui/src/views/Workspace.vue` - UI for version toggle
