import type { CellPosition } from './types';

export interface Operation {
    type: 'UPDATE' | 'INSERT_ROW' | 'DELETE_ROW' | 'INSERT_COL' | 'DELETE_COL' | 'full_replacement' | 'update' | 'create' | 'delete' | 'add_column' | 'drop_column' | 'cleanup_empty';
    row?: number;
    col?: number;
    value?: any;
    count?: number; // for insert/delete
    name?: string; // for columns
    column?: string; // for drop_column/add_column
    id?: string | number;
    changes?: Record<string, any>;
    data?: any;
    timestamp: number;
    rows?: any[]; // for full_replacement
    storage_config?: any; // for cloud snapshots
}

export interface DatabaseAdapter {
    // Read
    fetchRows(startRow: number, endRow: number): Promise<any[]>;
    getMetadata(): Promise<{ totalRows: number; columns: any[] }>;

    // Write
    commit(operations: Operation[]): Promise<void>;

    // Bulk Import (for File adapter)
    import?(data: any[]): Promise<void>;

    // Save (Full State Persistence) - optional, for saving versions to user storage
    save?(data: any[]): Promise<void>;
}

export class SyncManager {
    private adapter: DatabaseAdapter;
    private pendingOperations: Operation[] = [];
    private isSyncing: boolean = false;
    private onError?: (error: any) => void;

    constructor(adapter: DatabaseAdapter, onError?: (error: any) => void) {
        this.adapter = adapter;
        this.onError = onError;
    }

    public async fetchRows(start: number, end: number): Promise<any> {
        const result = await this.adapter.fetchRows(start, end);

        // Optimistic Merge: Apply pending operations on top of fetched data
        if (this.pendingOperations.length > 0) {
            return this.mergePendingOperations(result, start, end);
        }

        return result;
    }

    private mergePendingOperations(result: any, start: number, end: number): any {
        const rows = result.rows.map((r: any) => ({ ...r })); // Shallow clone result rows

        for (const op of this.pendingOperations) {
            // Apply UPDATE
            if (op.type === 'UPDATE' && op.row !== undefined && op.col !== undefined && op.name) {
                if (op.row >= start && op.row < end) {
                    const idx = op.row - start;
                    if (rows[idx]) {
                        rows[idx][op.name] = op.value;
                    }
                }
            }
            // Apply INSERT_ROW / DELETE_ROW?
            // This is harder because it shifts indices.
            // For MVP Optimistic, let's focus on cell updates.
            // Row insertions/deletions might need refetch or complex logic.
        }

        return {
            ...result,
            rows
        };
    }

    public async commit(operations: Operation[]): Promise<void> {
        // Add to queue
        this.pendingOperations.push(...operations);

        // Trigger background sync (Non-blocking)
        console.log(`[SyncManager] Queued ${operations.length} operations. Local state updated.`);
        this.scheduleSync();

        // Return immediately (Optimistic)
        return Promise.resolve();
    }

    private syncTimer: any = null;
    private scheduleSync() {
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => this.sync(), 1000); // 1s auto-save
    }

    public async sync() {
        if (this.isSyncing) {
            console.log('[SyncManager] Sync already in progress, skipping');
            return;
        }
        if (this.pendingOperations.length === 0) return;

        console.log('[SyncManager] Starting sync batch of size:', this.pendingOperations.length);
        this.isSyncing = true;
        const batch = [...this.pendingOperations];
        this.pendingOperations = [];

        try {
            await this.adapter.commit(batch);
            console.log(`[SyncManager] Synced ${batch.length} operations.`);
        } catch (e) {
            console.error('[SyncManager] Sync failed:', e);
            // Re-queue operations?
            // In a robust system, we'd prepend them back or notify user.
            this.pendingOperations.unshift(...batch);
            this.onError?.(e);
        } finally {
            this.isSyncing = false;
            // If more ops arrived during sync, trigger again
            if (this.pendingOperations.length > 0) {
                this.scheduleSync();
            }
        }
    }

    public async save(data: any[]): Promise<void> {
        if (this.adapter.save) {
            return this.adapter.save(data);
        }
        console.warn('[SyncManager] Adapter does not support full state save');
        return Promise.resolve();
    }
}
