# Hybrid Storage Strategy: PostgreSQL + Object Storage

## Overview
To maintain high performance and scalability for Pegasus, we are implementing a **Hybrid Storage Model**. This approach leverages PostgreSQL for structured, relational, and frequently accessed metadata, while offloading large, unstructured, and static content to Object Storage (S3/Backblaze B2).

## Storage Allocation Strategy

| Data Type | Primary Storage | Content in Object Storage? | Rationale |
|-----------|-----------------|----------------------------|-----------|
| **User/Auth Data** | PostgreSQL | No | Low volume, requires relational integrity and fast lookups. |
| **Dashboards (Config)** | PostgreSQL | **Yes (Snapshot/Cache)** | Dashboard configs are small JSON, but *rendered results* or *snapshots* can be large. We will cache heavy dashboard states in S3 to speed up loading. |
| **File Uploads** | PostgreSQL (Meta) | **Yes (Primary)** | Files (CSVs, PDFs, Images) are binary blobs. Storing them in DB bloats storage and RAM. Reference ID in DB, content in S3. |
| **Notes** | PostgreSQL (Meta) | **Yes (Content)** | Large notes/docs found in `spaceNotes` should be stored in S3. DB only keeps title, tags, and summary. |
| **Chat History** | PostgreSQL (Active) | **Yes (Archived)** | Active context stays in DB. Long, historical chat sessions are archived to S3 to keep the `chats` table lean. |
| **Data Source Cache** | PostgreSQL (Meta) | **Yes (Large Results)** | API responses (e.g., large JSON from external tools) should be cached in S3. |
| **Vector Embeddings** | PostgreSQL (`pgvector`) | No | Vectors need to be in DB for similarity search (`<->` operator). |

## Implementation details

### 1. Dashboards
**Current**: `dashboards` table has `config` (JSONB) and `messages` (JSONB).
**Optimization**:
- Add `storageId` column to `dashboards`.
- If a dashboard is "published" or "frozen", upload the full state to S3.
- On load: Fetch metadata from DB -> If `storageId` exists, fetch state from S3. Else, compute/render.

### 2. Notes (`spaceNotes`)
**Current**: `content` column is `text`.
**Optimization**:
- Add `storageId` column.
- **Write**: If content > 2KB, upload to S3 -> get Key -> Save Key to DB, set `content` to null (or a preview snippet).
- **Read**: Fetch DB record. If `storageId` is present, fetch content from S3 in parallel.

### 3. Files (`files`, `spaceFiles`)
**Current**: Already supports `storageId` / `storagePath`.
**Optimization**: Ensure the `StorageManager` service is used consistently for all file operations.

### 4. Chat History
**Current**: `messages` is `jsonb` in `chats`.
**Optimization**:
- Add `archiveId` to `chats`.
- Background Job: Move closed/old chats' messages to S3, clear `messages` column in DB, set `archiveId`.
- History View: If user requests old chat, load from S3 transparently.

## Performance Benefits
1.  **Reduced DB Valid Page Size**: Keeping tables small means more rows fit in RAM (Buffer Cache).
2.  **Faster Backups**: DB dumps are smaller and faster to restore.
3.  **Cheaper Storage**: S3/B2 is significantly cheaper per GB than managed PostgreSQL storage (Neon).
4.  **Scalability**: Object storage is effectively infinite.

## Next Steps
1.  Verify `StorageManager` implementation.
2.  Update `spaceNotes` logic to handle offloading.
3.  Implement Dashboard Snapshotting.
