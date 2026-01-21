# Implementation Plan: Hybrid Storage (DB + Object Storage)

## 1. Goal
Optimize system performance and cost by offloading large, static, or archival data from the primary PostgreSQL database to Object Storage (S3/Backblaze B2).

**Success Metrics:**
- `space_notes` table size remains small (metadata only).
- Dashboard load times improve (loading pre-calculated state from S3).
- Database backups remain fast and lightweight.

## 2. Infrastructure Prerequisite
- [x] **StorageManager Service**: Generic interface for S3/B2 operations. (Completed in Step Id 62)
- [ ] **Environment Check**: Ensure endpoints (B2) are correctly configured in `.env`.

## 3. Database Schema Updates
We need to add a pointer (`storage_id` or similar) to relevant tables to indicate that the content is stored externally.

### 3.1 Notes Table (`space_notes`)
Current: `content` (text)
Change:
- Add `storage_id` (text, nullable).
- Add `content_preview` (text, nullable) - first 200 chars for list views.

### 3.2 Dashboards Table (`dashboards`)
Current: `config` (jsonb), `messages` (jsonb)
Change:
- Add `state_storage_id` (text, nullable) - for full, frozen dashboard states.

### 3.3 Chats Table (`chats`)
Current: `messages` (jsonb)
Change:
- Add `archive_storage_id` (text, nullable) - for archived history.

## 4. Implementation Steps

### Phase 1: Notes Offloading (Priority High)
Large notes are the most common source of DB bloat.

- [ ] **Modify `spaceNote` schema**: Add `storageId`.
- [ ] **Update POST/PUT `/notes` logic**:
    - **Logic**:
      ```javascript
      if (content.length > 2000) { // arbitrary threshold, e.g., 2KB
         const storageKey = `notes/${userId}/${noteId}.json`;
         await StorageManager.upload(storageKey, JSON.stringify({ content }));
         db.update(spaceNotes).set({ 
             content: null, 
             storageId: storageKey 
         });
      }
      ```
- [ ] **Update GET `/notes/:id` logic**:
    - **Logic**:
      ```javascript
      if (note.storageId) {
          const remoteData = await StorageManager.download(note.storageId);
          note.content = remoteData.content;
      }
      ```

### Phase 2: File Uploads Consolidation
Ensure all file endpoints use the central `StorageManager`.

- [ ] Audit `routes/storage.js` to ensure it uses `StorageManager` (Already done).
- [ ] Ensure `routes/space.js` (files section) uses `StorageManager` for `spaceFiles`.

### Phase 3: Dashboard Caching (Performance)
- [ ] **Snapshot Trigger**: When a dashboard is "saved" or "published".
- [ ] **Storage Logical**: Upload the full `messages` array and `config` to S3.
- [ ] **Update Dashboard Route**: On load, check `storageId`. If present, fetch S3 URL (presigned) and load from client OR fetch backend-side and return.

## 5. Migration Strategy (for existing data)
- [ ] Create a script `scripts/migrate-notes-to-storage.js`.
- [ ] Logic:
    1. Iterate all notes where `length(content) > 2000`.
    2. Upload to S3.
    3. Update DB record with `storageId` and nullify `content`.

## 6. Verification
- Manual Test: Create a generic "Lorem Ipsum" note > 2KB. Check DB (content should be null). Check S3 (file exists). Read Note (UI should show full content).
