# SQLite Cloud Sync Architecture Proposal

## Overview
To support seamless access to local SQLite databases across multiple devices, we propose a **Hybrid Sync Architecture**. This ensures that a local SQLite file residing on one device (Device A) is accessible and editable from another device (Device B) by using SurrealDB as an intermediary synchronization layer.

## The Problem
- **Local Access**: SQLite databases are files on a specific device's filesystem.
- **Distributed Access**: Device B cannot directly access Device A's filesystem.
- **Latency**: Direct remote queries (if possible) would be slow.

## Proposed Solution
We will implement a **Cache-and-Sync** strategy as suggested.

### 1. Initial Caching (Ingestion)
When a local SQLite connection is established (and "Sync" is enabled):
1. The backend reads the SQLite schema and data.
2. Creates corresponding tables in **SurrealDB** (e.g., scoped by `connection_id` or `upload_id`).
3. Bulk inserts the existing data into SurrealDB.
4. Marks the Connection as `synced: true`.

### 2. Access Pattern
- **Local Device (Host)**: Can read/write directly to SQLite file OR SurrealDB. To ensure consistency, it's safer to treat SurrealDB as the "Source of Truth" for the application layer, and asynchronously write to disk.
- **Remote Device**: Reads and writes solely to the SurrealDB replica.

### 3. Synchronization & Conflict Resolution
To keep the local file in sync with cloud changes:
- **Cloud-to-Local**: The Host device's backend (or a background worker) subscribes to SurrealDB Live Queries or periodically polls for changes in the replicated tables.
- **Resolution Strategy**:
    - **Cloud Wins**: For simplicity, changes made on SurrealDB (by any device) are propagated to the local SQLite file.
    - **Conflict Handling**: If the local file was modified externally, a "conflict" flag is raised, or we overwrite local with Cloud state (safest for MVP).

## Implementation Steps

### Phase 1: Replication Adapter
- Modify `SQLiteAdapter` to include a `replicateToSurreal(targetTableName)` method.
- Update `ConnectionForm` to include a "Sync to Cloud" toggle for SQLite providers.

### Phase 2: Sync Logic
- Implement `SyncService` in backend.
- Handle `UPDATE`/`INSERT`/`DELETE` events on SurrealDB tables and translate them to SQLite SQL commands on the Host device.

### Phase 3: Conflict UI
- Add UI indicators for "Syncing...", "Offline", and "Conflict".
- Allow users to "Force Push" (Local -> Cloud) or "Force Pull" (Cloud -> Local).

## Technical Considerations
- **Data Volume**: Syncing large SQLite DBs (>100MB) might be slow. We should recommend this for "lightweight" local DBs or use chunked uploads.
- **Security**: synced data resides in user's private SurrealDB namespace.

## Privacy & Security Implications

### 1. Data Residency & Transmission
- **Implication**: By enabling sync, the local SQLite data is uploaded to the Pegasus Cloud (SurrealDB instance). It is no longer strictly "local-only".
- **Mitigation**: 
  - All data transmission occurs over encrypted channels (**TLS 1.2+**).
  - Data at rest in the cloud is encrypted (depending on the underlying storage provider configuration).

### 2. Access Control
- **Implication**: The data is accessible via the network.
- **Security Logic**:
  - **User Isolation**: Pegasus uses strict Row-Level Security (RLS) or Namespace isolation. Data belonging to User A is cryptographically segregated or logically blocked from User B.
  - **Authentication**: Only authenticated sessions with valid JWTs from the owner's account can query the replicated tables.

### 3. "Opt-In" Privacy
- **Strategy**: Creating a cloud replica should be an **explicit opt-in** choice per connection.
- **Default Behavior**: Local SQLite connections remain local-only by default. The user must toggle "Enable Cloud Sync" and acknowledge that data will leave their device.

### 4. Zero-Knowledge Encryption (Future Scope)
- Ideally, the SQLite data would be encrypted on the client side before upload, so the server only stores blobs it cannot read ("Bring Your Own Key").
- *Current Status*: This is a complexity trade-off. For MVP, server-side security (standard SaaS model) is used.

## Recommendation
This architecture is robust and leverages SurrealDB's real-time capabilities. We should proceed with **Phase 1** (Replication) as the foundation.
