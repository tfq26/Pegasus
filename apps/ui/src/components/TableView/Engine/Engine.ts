import type { CellPosition, CellData, EngineConfig, Note, NoteEntityType, UserPresence, RowDiff } from './types';
import { CellType, posToKey } from './types';
import { DependencyGraph } from './DependencyGraph';
import { FormulaParser } from './FormulaParser';
import { UndoManager, SetValueCommand } from './UndoManager';
import { ChangeTracker } from './ChangeTracker';
import { buildConnectionPayload } from '../../../lib/db-connections';
import { ColumnStore } from './ColumnStore';
import type { ColumnSchema } from './ColumnStore';
import { EditOverlay } from './EditOverlay';
import { SyncManager } from './SyncManager';
import type { Operation } from './SyncManager';
import { RestAdapter } from './RestAdapter';
import { LocalFileAdapter } from './LocalFileAdapter';
import { FileUploadAdapter } from './FileUploadAdapter';
import type { Operation as EditOperation } from './EditOverlay';
import { VirtualDataProvider, createDefaultFetcher } from './VirtualDataProvider';

export class Engine {
    private cells: Map<string, CellData> = new Map();
    private graph: DependencyGraph;
    public parser: FormulaParser;
    public config: EngineConfig;
    private changeCallbacks: Set<() => void> = new Set();
    private valueChangeCallbacks: Set<(pos: CellPosition, value: string, source: 'local' | 'remote') => void> = new Set();
    private storageKey: string;
    public sourceTable: string | null = null;
    public sourceConnection: any | null = null; // Full connection config
    public sourceProvider: string | null = null;
    public columnNames: string[] = [];
    protected originalData: Map<string, CellData> = new Map(); // Snapshot of loaded data
    protected rowIdMap: Map<number, any> = new Map(); // Store _rowid_ for each row (hidden from grid)

    // Notes System
    private notes: Map<string, Note[]> = new Map(); // Key: entityId, Value: Note thread

    // Presence System
    public presence: Map<string, UserPresence> = new Map();

    // Live Data Bindings
    public cellBindings: Map<string, any> = new Map();

    public saveStatus: 'saved' | 'saving' | 'error' = 'saved';

    // Branching state
    public parentBranch: Engine | null = null;
    public currentBranchName: string = 'main';

    // Undo/Redo system
    public undoManager: UndoManager = new UndoManager();
    public isUndoRedoOperation = false; // Flag to prevent recording undo operations during undo/redo

    // Header row tracking - row 0 is always the header row for database tables
    public headerRowIndex = 0;

    // Data Source Metadata
    public schemaMode: 'named-headers' | 'column-letters' = 'column-letters';
    public hasDetectedHeaders: boolean = false;

    // Change Tracking System
    public changeTracker: ChangeTracker;

    // High-Performance Data Storage
    public columnStore: ColumnStore;
    public editOverlay: EditOverlay;
    private virtualProvider: VirtualDataProvider;
    private syncManager: SyncManager | null = null;
    private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

    // Core Data Stores
    public isVirtualized: boolean = false;

    // Transient view state (preserved in memory for tab switching)
    public viewState: {
        scrollTop: number;
        selection: CellPosition | null;
        viewport: { startRow: number; endRow: number };
    } = {
            scrollTop: 0,
            selection: null as CellPosition | null,
            viewport: { startRow: 0, endRow: 100 }
        };

    constructor(config: EngineConfig, storageKey = 'spreadsheet-data') {
        this.config = config;
        this.graph = new DependencyGraph();
        this.parser = new FormulaParser();
        this.changeTracker = new ChangeTracker();

        // Initialize high-performance components
        this.columnStore = new ColumnStore();
        this.editOverlay = new EditOverlay();
        this.virtualProvider = new VirtualDataProvider(this.columnStore);

        // Connect data provider to engine events
        // (If VirtualDataProvider emits events, check signature)

        this.storageKey = storageKey;
        console.log(`[Engine] Initialized with key: ${storageKey}, config:`, config);
        this.loadFromStorage();
    }

    /**
     * Update viewport for virtualized loading
     */
    public setViewport(startRow: number, endRow: number) {
        if (this.viewState.viewport.startRow === startRow && this.viewState.viewport.endRow === endRow) {
            return;
        }

        this.viewState.viewport = { startRow, endRow };

        if (this.isVirtualized) {
            this.virtualProvider.setViewport(startRow, endRow);
        }
    }

    /**
     * Explicitly set the original data snapshot.
     * Use this when loading data from a source ensuring that the 'original'
     * values match the backend source exactly (e.g. preserving nulls), 
     * which might differ from the stringified values in the grid.
     */
    public setOriginalData(rows: any[]) {
        // Load into ColumnStore
        // Assuming chunk 0 for now. In virtual mode, this might be partial.
        this.columnStore.loadChunk(0, rows);
        this.columnStore.setRowCount(rows.length);

        // If LocalFileAdapter, update its data source too so fetching works
        if (this.syncManager && (this.syncManager as any).adapter instanceof LocalFileAdapter) {
            ((this.syncManager as any).adapter as LocalFileAdapter).setData(rows);
        }

        this.changeTracker.clear();
        this.editOverlay.clear(); // Clear sparse edits on reload
    }

    /**
     * Set the source table for database persistence
     */
    public setSource(tableName: string, connection: any, columns: string[] = [], provider: string = 'postgres', schemaMode?: 'named-headers' | 'column-letters') {
        this.sourceTable = tableName;
        this.sourceConnection = connection;
        this.sourceProvider = provider;
        this.columnNames = columns;

        // Initialize Schema from sourceColumns if provided
        if (columns.length > 0) {
            this.columnStore.setSchema(columns.map(name => ({ name, type: 'string', nullable: true })));
        }

        // Initialize Sync & Data Provider
        let adapter;
        if (tableName === 'local-file' || provider === 'local-file') {
            // Local in-memory adapter
            adapter = new LocalFileAdapter([], columns.map(c => ({ name: c })));
        } else if (provider === 'file-upload') {
            // File Upload / Preview Adapter
            // connection should object { file: File, config?: any }
            const file = connection.file;
            const config = connection.config || {};
            if (!file) throw new Error('File object required for file-upload provider');
            adapter = new FileUploadAdapter(file, config);
        } else {
            // Use RestAdapter for remote DBs
            let baseUrl = '';
            try {
                if (typeof window !== 'undefined' && (window as any).VITE_QUERY_API_URL) {
                    baseUrl = (window as any).VITE_QUERY_API_URL;
                } else if (import.meta && import.meta.env && import.meta.env.VITE_QUERY_API_URL) {
                    baseUrl = import.meta.env.VITE_QUERY_API_URL;
                }
            } catch (e) {
                console.warn('[Engine] Failed to resolve API URL', e);
            }

            adapter = new RestAdapter(baseUrl, tableName, connection, provider);
        }

        this.syncManager = new SyncManager(adapter, (err) => {
            console.error('Sync Error:', err);
            // handle error
        });

        // Configure Virtual Data Provider to use SyncManager (Adapter) for fetching
        this.virtualProvider.setDataSource(
            tableName,
            connection,
            async (_t: string, _c: any, offset: number, limit: number) => {
                if (!this.syncManager) return { rows: [], totalCount: 0 };
                const res = await this.syncManager.fetchRows(offset, offset + limit);
                return res as { rows: Record<string, any>[]; totalCount: number };
            }
        );
        this.isVirtualized = true;

        // Set schema mode if provided, otherwise auto-detect
        if (schemaMode) {
            this.schemaMode = schemaMode;
        } else if (this.columnNames.length > 0) { // Use sourceColumns for schema mode detection
            this.schemaMode = this.detectSchemaMode(this.columnNames);
        } else {
            this.schemaMode = 'column-letters'; // Default if no columns provided
        }

        // Take snapshot of current data as "original" (if not set by setOriginalData)
        if (this.originalData.size === 0) {
            this.originalData = new Map(this.cells);
        }
        this.clearModifiedTracking();
        this.changeTracker.clear();
        this.changeTracker.setColumnNames(this.columnNames);
    }

    /**
     * Get pending operations for atomic save - SEE IMPLEMENTATION BELOW
     */

    private getRowObject(row: number) {
        const obj: any = {};
        this.columnNames.forEach((colName, colIndex) => {
            const cell = this.getCell({ row, col: colIndex });
            obj[colName] = cell?.value ?? null;
        });
        return obj;
    }

    /**
     * Get the serializable state of the engine
     * 
     * IMPORTANT: Version 3 format now includes all cells from both the sparse map AND columnStore
     * to fix the bug where data stored only in columnStore was lost on refresh.
     */
    public getState() {
        // Build complete cells array from both sources
        const allCells: [string, CellData][] = [];
        const totalRows = this.config.rowCount || 0;
        const totalCols = this.config.colCount || this.columnNames.length || 26;

        // Iterate over all cells using getCell which checks both sources
        for (let row = 0; row < totalRows; row++) {
            for (let col = 0; col < totalCols; col++) {
                const cell = this.getCell({ row, col });
                if (cell && cell.value !== null && cell.value !== undefined && cell.value !== '') {
                    const key = `${row},${col}`;
                    allCells.push([key, cell]);
                }
            }
        }

        return {
            version: 3,
            cells: allCells,
            rowCount: this.config.rowCount,
            colCount: this.config.colCount,
            source: {
                table: this.sourceTable,
                connection: this.sourceConnection,
                provider: this.sourceProvider,
                columns: this.columnNames,
                schemaMode: this.schemaMode
            },
            notes: Array.from(this.notes.entries())
        };
    }

    /**
     * Load state into the engine
     */
    public loadState(state: any) {
        if (!state) return;

        if (Array.isArray(state)) {
            // V1 format: just cells
            this.cells = new Map(state as [string, CellData][]);
        } else if (state.version === 2 || state.version === 3) {
            // V2/V3 format: cells + source metadata
            this.cells = new Map(state.cells);
            if (state.rowCount) this.config.rowCount = state.rowCount;
            if (state.colCount) this.config.colCount = state.colCount;
            if (state.source) {
                this.sourceTable = state.source.table;
                this.sourceConnection = state.source.connection;
                this.sourceProvider = state.source.provider;
                this.columnNames = state.source.columns || [];
                if (state.source.schemaMode) this.schemaMode = state.source.schemaMode;
            }
            if (state.notes) {
                this.notes = new Map(state.notes);
            }
        }

        // Take snapshot of loaded data as "original"
        this.originalData = new Map(this.cells);
        this.changeTracker.clear();
        this.notifyChange();
    }

    /**
     * Legacy method for getting modified rows (deprecated)
     */
    public getModifiedRows(): Map<number, { data: Record<string, any>, original: Record<string, any> | null }> {
        // ... kept for compatibility but should use getPendingOperations ...
        return new Map();
    }

    public async deleteRow(row: number) {
        if (!this.isUndoRedoOperation) {
            const { DeleteRowCommand } = await import('./UndoManager');
            this.undoManager.execute(new DeleteRowCommand(this, row));
            return;
        }

        const rowId = this.rowIdMap.get(row);
        if (rowId) {
            this.changeTracker.markRowDeleted(rowId);
        }
        // this.deletedRows.add(row); // REMOVED

        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (r === row) keysToDelete.push(key);
            else if (r > row) {
                keysToDelete.push(key);
                cellsToMove.set(posToKey({ row: r - 1, col: c }), cell);
            }
        }
        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (r === row) keysToDelete.push(key);
            else if (r > row) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r - 1, col: c }), cell);
            }
        }

        keysToDelete.forEach(k => { this.cells.delete(k); this.originalData.delete(k); });
        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    public async insertRow(row: number) {
        if (!this.isUndoRedoOperation) {
            const { InsertRowCommand } = await import('./UndoManager');
            this.undoManager.execute(new InsertRowCommand(this, row));
            return;
        }

        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (r >= row) {
                keysToDelete.push(key);
                cellsToMove.set(posToKey({ row: r + 1, col: c }), cell);
            }
        }
        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (r >= row) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r + 1, col: c }), cell);
            }
        }

        keysToDelete.forEach(k => { this.cells.delete(k); this.originalData.delete(k); });
        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    public async deleteColumn(col: number) {
        const columnName = this.columnNames[col];
        if (!this.isUndoRedoOperation) {
            const { DeleteColumnCommand } = await import('./UndoManager');
            await this.undoManager.execute(new DeleteColumnCommand(this, col));
            return;
        }

        if (columnName && columnName !== '_rowid_') {
            this.changeTracker.markColumnDeleted(columnName);
        }

        this.columnNames.splice(col, 1);
        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (c === col) keysToDelete.push(key);
            else if (c > col) {
                keysToDelete.push(key);
                cellsToMove.set(posToKey({ row: r, col: c - 1 }), cell);
            }
        }
        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (c === col) keysToDelete.push(key);
            else if (c > col) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r, col: c - 1 }), cell);
            }
        }

        keysToDelete.forEach(k => { this.cells.delete(k); this.originalData.delete(k); });
        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    public async insertColumn(col: number, name?: string) {
        const columnName = name || `Column${this.columnNames.length + 1}`;

        if (!this.isUndoRedoOperation) {
            const { InsertColumnCommand } = await import('./UndoManager');
            this.undoManager.execute(new InsertColumnCommand(this, col, columnName));
            return;
        }

        this.columnNames.splice(col, 0, columnName);
        this.changeTracker.markColumnAdded(columnName);

        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (c >= col) {
                keysToDelete.push(key);
                cellsToMove.set(posToKey({ row: r, col: c + 1 }), cell);
            }
        }
        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0], c = parts[1];
            if (r === undefined || c === undefined) continue;
            if (c >= col) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r, col: c + 1 }), cell);
            }
        }

        keysToDelete.forEach(k => { this.cells.delete(k); this.originalData.delete(k); });
        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    public getDeletedRows(): any[] { return this.changeTracker.getDeletedRows(); }
    public getDeletedColumns(): string[] { return this.changeTracker.getDeletedColumns(); }
    public getAddedColumns(): string[] { return this.changeTracker.getAddedColumns(); }

    public getPendingOperations() {
        return this.changeTracker.getPendingOperations(this);
    }

    /**
     * Generate a detailed diff of all pending changes for UI review
     */
    public getDiff(): RowDiff[] {
        const diffs: RowDiff[] = [];
        const processedRowIds = new Set<any>();

        // 1. Deleted Rows
        this.changeTracker.getDeletedRows().forEach(rowId => {
            // Find the grid row index this rowId belonged to (if still mapped)
            let gridRow = -1;
            for (const [r, id] of this.rowIdMap.entries()) {
                if (id === rowId) {
                    gridRow = r;
                    break;
                }
            }

            // Get original data for this row
            const data: Record<string, any> = {};
            this.columnNames.forEach((col, colIndex) => {
                const key = `${gridRow},${colIndex}`;
                const originalValue = this.originalData.get(key)?.value;
                data[col] = originalValue ?? null;
            });

            diffs.push({
                type: 'delete',
                row: gridRow,
                rowId,
                data
            });
            processedRowIds.add(rowId);
        });

        // 2. Modified & Created Rows
        const rowsToProcess = new Set<number>();
        this.changeTracker.getModifiedCellKeys().forEach(key => {
            const rowPart = key.split(',')[0];
            if (rowPart !== undefined) {
                const r = parseInt(rowPart);
                if (!isNaN(r)) rowsToProcess.add(r);
            }
        });

        rowsToProcess.forEach(row => {
            const rowId = this.rowIdMap.get(row);
            if (rowId && processedRowIds.has(rowId)) return; // Already processed as deleted

            const changes: Record<string, { before: any, after: any }> = {};
            const currentData: Record<string, any> = {};
            let hasActualChange = false;

            this.columnNames.forEach((col, colIndex) => {
                const key = `${row},${colIndex}`;
                const original = this.originalData.get(key)?.value;
                const current = this.getCell({ row, col: colIndex })?.value;

                currentData[col] = current ?? null;

                if (original !== current) {
                    changes[col] = { before: original ?? null, after: current ?? null };
                    hasActualChange = true;
                }
            });

            if (rowId) {
                // UPDATE
                if (hasActualChange) {
                    diffs.push({
                        type: 'update',
                        row,
                        rowId,
                        changes
                    });
                }
            } else {
                // CREATE
                diffs.push({
                    type: 'create',
                    row,
                    data: currentData
                });
            }
        });

        return diffs;
    }

    /**
     * Determine the optimal save strategy based on table size and change volume
     */
    public getSaveStrategy(): 'full_replacement' | 'delta_operations' {
        // CRITICAL FIX: Always use delta operations to prevent data loss
        // The previous logic triggered full_replacement for small tables (<10k), which caused
        // catastrophic data loss if the replacement payload was incomplete or failed.
        // We now enforce delta updates unless schema changes require a heavier approach.

        const deletedColsCount = this.changeTracker.getDeletedColumns().length;
        const addedColsCount = this.changeTracker.getAddedColumns().length;

        // Only use full replacement if strictly necessary (e.g. massive schema re-structuring)
        // For now, even schema changes should ideally be handled via specific ops if possible
        // but keeping it restrictive.
        const schemaChanged = deletedColsCount > 0 || addedColsCount > 0;

        if (schemaChanged) {
            // Even with schema changes, we might want to be careful, but for now 
            // if columns are added/removed we might need to restructure.
            // However, to be SAFE for MongoDB, let's stick to operations if possible.
            // But if the backend requires full replacement for schema changes:
            // return 'full_replacement'; 

            // Re-evaluating: 'add_column' and 'drop_column' are supported ops now.
            // So we can stick to delta_operations even for schema changes.
            return 'delta_operations';
        }

        // Default to delta operations for everything, including regular updates
        return 'delta_operations';
    }

    /**
     * Save current spreadsheet state to local storage (Snapshots)
     * This creates a full "Save Point" in the user's local session/browser storage
     */
    /**
     * Save current spreadsheet state to User's Pegasus Storage (Full Sync)
     * This creates a full "Save Point" in the user's internal database (SurrealDB)
     * regardless of the external source.
     */
    public async saveToUserStorage(): Promise<void> {
        console.log('[Engine] Saving snapshot to user storage...');
        const allRows = this.getAllNonEmptyRows();

        if (this.syncManager && this.syncManager.save) {
            await this.syncManager.save(allRows);
        } else {
            // Fallback to local storage if no backend connection
            if (this.sourceTable) {
                localStorage.setItem(`pegasus_snapshot_${this.sourceTable}`, JSON.stringify(allRows));
            }
        }

        this.saveStatus = 'saved';
        this.notifyChange();
    }

    /**
     * Save snapshot to External Cloud Provider (S3/Azure/GCP)
     */
    public async saveSnapshot(storageConfig: any): Promise<string> {
        console.log('[Engine] Saving snapshot to external cloud...', storageConfig);

        if (!this.syncManager) {
            throw new Error('SyncManager not initialized');
        }

        const allRows = this.getAllNonEmptyRows();

        // Create a special Full Replacement operation with storage config
        const op: Operation = {
            type: 'full_replacement',
            rows: allRows,
            timestamp: Date.now(),
            storage_config: storageConfig // Pass config to backend
        };

        // We use commit() to send this operation. 
        // The backend intercepts 'full_replacement' + 'storage_config' to trigger cloud upload.
        await this.syncManager.commit([op]);

        return 'Snapshot upload initiated';
    }

    /**
     * Commit all pending changes to the database (Delta Sync)
     */
    public async commit(): Promise<void> {
        if (!this.hasSource()) {
            // If local-only, "Commit" just means Save Snapshot
            return this.saveToUserStorage();
        }

        if (!this.hasPendingModifications()) {
            console.log('[Engine] No pending modifications to commit');
            return;
        }

        this.saveStatus = 'saving';
        this.notifyChange();

        try {
            let ops: Operation[] = [];
            const strategy = this.getSaveStrategy();

            if (strategy === 'full_replacement') {
                console.log('[Engine] Using full replacement strategy');
                const allRows = this.getAllNonEmptyRows();
                ops.push({
                    type: 'full_replacement',
                    rows: allRows,
                    timestamp: Date.now()
                });
            } else {
                const pending = this.getPendingOperations();
                // Convert to typed Operation[]
                ops = pending.map((p: any) => {
                    // Determine operation type
                    // Default to UPDATE

                    // Inject column name if missing
                    let name = p.name;
                    if (!name && p.col !== undefined && this.columnNames[p.col]) {
                        name = this.columnNames[p.col];
                    }

                    return {
                        ...p,
                        type: p.type, // Pass through 'update', 'create', 'delete' directly
                        id: p.rowId || p.id, // Ensure ID is passed for delta ops
                        name,
                        timestamp: Date.now()
                    } as Operation;
                });

                // Schema changes (mapped from ChangeTracker)
                this.changeTracker.getDeletedColumns().forEach(colName => {
                    // Match backend expectation: 'drop_column'
                    ops.push({ type: 'drop_column', column: colName, timestamp: Date.now() });
                });
                this.changeTracker.getAddedColumns().forEach(colName => {
                    // Match backend expectation: 'add_column'
                    ops.push({ type: 'add_column', column: colName, timestamp: Date.now() });
                });
            }

            if (this.syncManager) {
                // Optimistic Commit:
                // SyncManager.commit returns immediately (queueing background sync).
                // We assume success and update UI state.
                await this.syncManager.commit(ops as Operation[]);
            } else {
                throw new Error('SyncManager not initialized');
            }

            // Success: clear tracking and update original state
            this.clearModifiedTracking();
            this.saveStatus = 'saved';
            this.notifyChange();
        } catch (e) {
            console.error('[Engine] Commit failed:', e);
            this.saveStatus = 'error';
            this.notifyChange();
            throw e;
        }
    }

    /**
     * Schedule an auto-save after a debounce period
     */
    private scheduleAutoSave() {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        // Debounce: wait 2 seconds of inactivity before saving
        this.autoSaveTimer = setTimeout(() => {
            this.autoSave();
        }, 2000);
    }

    /**
     * Perform auto-save (background, non-blocking)
     */
    private async autoSave() {
        if (!this.hasSource() || !this.hasPendingModifications()) {
            return;
        }

        console.log('[Engine] Auto-saving...');
        try {
            await this.commit();
            console.log('[Engine] Auto-save complete');
        } catch (e) {
            console.error('[Engine] Auto-save failed:', e);
            // Don't throw - auto-save is silent
        }
    }

    /**
     * Check if the engine has a backing database source
     */
    public hasSource(): boolean {
        return !!(this.sourceTable && this.sourceConnection && this.sourceProvider);
    }

    /**
     * Count non-empty rows in the table
     */
    private getNonEmptyRowCount(): number {
        const rowsWithData = new Set<number>();

        for (const [key, cell] of this.cells.entries()) {
            if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
                const part = key.split(',')[0];
                if (part === undefined) continue;
                const row = parseInt(part);
                rowsWithData.add(row);
            }
        }

        return rowsWithData.size;
    }

    /**
     * Convert column index to Excel-style letter (0->A, 25->Z, 26->AA)
     */
    private colIndexToLabel(index: number): string {
        let label = '';
        let i = index;
        while (i >= 0) {
            label = String.fromCharCode(65 + (i % 26)) + label;
            i = Math.floor(i / 26) - 1;
        }
        return label;
    }

    /**
     * Detect schema mode based on column names
     * Returns 'named-headers' if columns have semantic names, 'column-letters' if using A, B, C pattern
     */
    private detectSchemaMode(columns: string[]): 'named-headers' | 'column-letters' {
        if (columns.length === 0) return 'column-letters';

        // Check if all column names match the A, B, C... pattern
        const allLetterPattern = columns.every((name, index) => {
            const expectedLetter = this.colIndexToLabel(index);
            return name === expectedLetter;
        });

        return allLetterPattern ? 'column-letters' : 'named-headers';
    }

    /**
     * Get field name for a column index based on schema mode
     * Returns either the actual column name or a letter (A, B, C...)
     */
    public getFieldName(colIndex: number): string {
        if (this.schemaMode === 'named-headers' && this.columnNames[colIndex]) {
            return this.columnNames[colIndex];
        }
        return this.colIndexToLabel(colIndex);
    }


    /**
     * Get all non-empty rows for full replacement save
     * Uses smart field naming: actual column names for named-headers mode, letters for column-letters mode
     * 
     * IMPORTANT: This now uses getCell() which checks both the sparse cells map AND the columnStore,
     * fixing the bug where data stored only in columnStore was being ignored.
     */
    public getAllNonEmptyRows(): Array<Record<string, any>> {
        const result: Array<Record<string, any>> = [];

        // Determine starting row based on schema mode
        const startRow = this.schemaMode === 'named-headers' ? 1 : 0;

        // Get actual row count from config
        const totalRows = this.config.rowCount || 0;
        const totalCols = this.config.colCount || this.columnNames.length || 26;

        // Iterate over all rows and columns, using getCell to check both cells map and columnStore
        for (let row = startRow; row < totalRows; row++) {
            const rowData: Record<string, any> = {};
            let hasData = false;

            for (let col = 0; col < totalCols; col++) {
                // Use getCell which properly checks both cells map and columnStore
                const cell = this.getCell({ row, col });
                const value = cell?.value;

                if (value !== null && value !== undefined && value !== '') {
                    hasData = true;
                }

                // Use smart field name (either actual column name or letter)
                const fieldName = this.getFieldName(col);
                rowData[fieldName] = value ?? null;
            }

            // Only include rows that have at least some data
            if (hasData) {
                result.push(rowData);
            }
        }

        return result;
    }


    public addColumn(name: string) {
        this.columnNames.push(name);
        this.changeTracker.markColumnAdded(name);
        this.saveStatus = 'saving';
        this.notifyChange();
    }

    /**
     * Clear modification tracking after successful save
     */
    public clearModifiedTracking() {
        this.changeTracker.clear();
        this.originalData = new Map(this.cells);
    }

    /**
     * Check if there are any pending modifications that require a save
     * This prevents unnecessary saves when nothing has changed
     */
    public hasPendingModifications(): boolean {
        // Check for any modifications (excluding header row modifications)
        const hasDataModifications = Array.from(this.changeTracker.getModifiedCellKeys()).some(key => {
            const rowPart = key.split(',')[0];
            if (rowPart === undefined) return false;
            const row = parseInt(rowPart);
            return row !== 0; // Ignore header row changes
        });

        return hasDataModifications ||
            this.changeTracker.getDeletedRows().length > 0 ||
            this.changeTracker.getDeletedColumns().length > 0 ||
            this.changeTracker.getAddedColumns().length > 0;
    }


    /**
     * Begin batch mode - notifications will be deferred until endBatch()
     */
    public isBatching = false; // Made public for external checks

    public beginBatch() {
        this.isBatching = true;
    }

    /**
     * End batch mode - trigger a single notification
     */
    public endBatch() {
        this.isBatching = false;
        this.notifyChange();
    }

    /**
     * Register a callback to be called when cells change
     */
    public onChange(callback: () => void) {
        this.changeCallbacks.add(callback);
        return () => this.changeCallbacks.delete(callback);
    }

    /**
     * Register a callback to be called when a specific cell value changes
     */
    public onValueChange(callback: (pos: CellPosition, value: string, source: 'local' | 'remote') => void) {
        this.valueChangeCallbacks.add(callback);
        return () => this.valueChangeCallbacks.delete(callback);
    }

    /**
     * Manually trigger change notification (useful after silent edits)
     */
    public notifyChange() {
        if (this.isBatching) return; // Skip if batching
        // console.log('[Engine] notifyChange triggered'); // Commented out to reduce noise, enable if needed
        this.changeCallbacks.forEach(cb => cb());
        this.saveToStorage();
    }

    private saveToStorage() {
        try {
            // Check actual data presence using config, not just sparse cells map
            // This fixes the bug where data in columnStore was being ignored
            const hasData = (this.config.rowCount || 0) > 0 && (this.config.colCount || 0) > 0;

            // If no data configured, remove the localStorage item entirely
            if (!hasData) {
                localStorage.removeItem(this.storageKey);
                return;
            }

            // For large datasets without database backing, skip localStorage persistence
            const estimatedCellCount = (this.config.rowCount || 0) * (this.config.colCount || 0);
            if (estimatedCellCount > 50000 && !this.sourceTable) {
                console.warn('[Storage] Skipping localStorage for large non-database sheet');
                return;
            }

            const state = this.getState();
            localStorage.setItem(this.storageKey, JSON.stringify(state));
        } catch (e: any) {
            // Handle quota exceeded error
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.warn('[Storage] localStorage quota exceeded, clearing old spreadsheet data');

                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith('spreadsheet-tab-') && key !== this.storageKey) {
                        keysToRemove.push(key);
                    }
                }

                keysToRemove.forEach(key => localStorage.removeItem(key));

                try {
                    const state = this.getState();
                    localStorage.setItem(this.storageKey, JSON.stringify(state));
                } catch (e2) {
                    console.error('[Storage] Still failed after cleanup:', e2);
                }
            } else {
                console.error('[Storage] Failed to save to localStorage:', e);
            }
        }
    }

    private loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.loadState(parsed);
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
    }

    /**
     * Sets a value in the grid and triggers recalculation.
     * @param silent - If true, don't trigger onChange callbacks (useful during editing)
     * @param source - Source of the edit ('local' or 'remote')
     */
    public setValue(pos: CellPosition, input: string, silent: boolean = false, source: 'local' | 'remote' = 'local') {
        console.log('[Engine.setValue] pos:', pos, 'input:', input, 'silent:', silent);
        const key = posToKey(pos);

        // Record undo command (unless this is an undo/redo operation itself)
        if (!this.isUndoRedoOperation && !silent) {
            // Track change here - at the entry point when user commits an edit
            // This is the right place because silent=false means user is committing
            if (source === 'local') {
                this.changeTracker.markCellModified(pos);
            }

            const oldValue = this.getCell(pos)?.rawInput || '';
            const command = new SetValueCommand(this, pos, input, oldValue);
            this.undoManager.execute(command);

            // Notify change after the command executes to trigger re-render
            this.notifyChange();

            // Auto-save after a short delay
            this.scheduleAutoSave();
            return;
        }

        // 1. Clear old dependencies
        this.graph.clearDependencies(pos);

        // 2. Parse Input
        const existing = this.getCell(pos);
        let cellData: CellData = {
            rawInput: input,
            value: input,
            type: CellType.TEXT,
            style: existing?.style // Preserve existing styles
        };

        if (input.startsWith('=')) {
            cellData.type = CellType.FORMULA;
            const parsed = this.parser.parse(input);

            // Register new dependencies
            parsed.references.forEach(dep => {
                this.graph.addDependency(pos, dep);
            });

            // Evaluate immediately (first pass)
            cellData.value = this.evaluateParsed(parsed);
        } else if (!isNaN(Number(input)) && input.trim() !== '') {
            cellData.type = CellType.NUMBER;
            cellData.value = Number(input);
        }

        // 3. Store
        if (cellData.type === CellType.FORMULA) {
            this.cells.set(key, cellData); // Store formulas in sparse map
            this.columnStore.setValue(pos.row, pos.col, cellData.value); // Sync result to column store for display
        } else {
            // Simple value - optimize memory by storing only in ColumnStore
            this.columnStore.setValue(pos.row, pos.col, cellData.value);
            this.columnStore.setStyle(pos.row, pos.col, cellData.style || {});

            // Remove from sparse map if it exists (memory optimization)
            this.cells.delete(key);
        }

        // 4. Recalculate Dependents
        const dependents = this.graph.getDependents(pos);
        for (const dep of dependents) {
            this.recalculate(dep);
        }

        // 5. Notify change
        // Change tracking is done at the entry point (when silent=false)
        // Here we just notify callbacks if not in silent mode
        if (!silent) {
            this.notifyChange();
        }

        // 6. Notify value change listeners
        this.valueChangeCallbacks.forEach(cb => cb(pos, input, source));
    }

    public getCell(pos: CellPosition): CellData | null {
        const key = posToKey(pos);

        // 1. Check sparse map (formulas, complex state)
        if (this.cells.has(key)) {
            return this.cells.get(key)!;
        }

        // 2. Check high-performance column store
        return this.columnStore.getCellData(pos.row, pos.col);
    }

    public getCells(): Map<string, CellData> {
        return this.cells;
    }


    public getDisplayValue(pos: CellPosition): string {
        const cell = this.getCell(pos);
        if (!cell) return '';
        return String(cell.value);
    }

    public getRowData(row: number): any[] {
        const rowData: any[] = [];
        const cols = this.config.colCount || 26;
        for (let c = 0; c < cols; c++) {
            rowData.push(this.getDisplayValue({ row, col: c }));
        }
        return rowData;
    }

    private recalculate(pos: CellPosition) {
        const key = posToKey(pos);
        const cell = this.cells.get(key);
        if (!cell || cell.type !== CellType.FORMULA) return;

        const parsed = this.parser.parse(cell.rawInput);
        cell.value = this.evaluateParsed(parsed);
        this.cells.set(key, { ...cell });

        // Sync calculated value to ColumnStore for display
        this.columnStore.setValue(pos.row, pos.col, cell.value);

        this.changeTracker.markKeyModified(key);
    }


    private evaluateParsed(parsed: any): any {
        return parsed.evaluate((ref: CellPosition) => {
            const c = this.getCell(ref);
            return c ? (isNaN(Number(c.value)) ? 0 : Number(c.value)) : 0;
        });
    }

    public setCellStyle(pos: CellPosition, style: Partial<import('./types').CellStyle>) {
        const key = posToKey(pos);

        // 1. Check sparse map (formulas)
        if (this.cells.has(key)) {
            const cell = this.cells.get(key)!;
            if (!cell.style) cell.style = {};
            Object.assign(cell.style, style);
            // Sync to ColumnStore
            this.columnStore.setStyle(pos.row, pos.col, cell.style);
        } else {
            // 2. Simple value (ColumnStore)
            // Just update style in ColumnStore
            this.columnStore.setStyle(pos.row, pos.col, style);
        }

        this.changeTracker.markKeyModified(key);
        this.notifyChange();
    }

    public clear(options: { keepStyles?: boolean, silent?: boolean } = {}) {
        if (options.keepStyles) {
            // Only clear values/rawInput, keep style objects
            for (const [key, cell] of this.cells.entries()) {
                cell.rawInput = '';
                cell.value = '';
                // type remains or changes to TEXT
                cell.type = CellType.TEXT;
            }
        } else {
            this.cells.clear();
            // Also clear localStorage to prevent data from reappearing
            try {
                localStorage.removeItem(this.storageKey);
            } catch (e) {
                console.error('Failed to clear localStorage:', e);
            }
        }

        if (!options.silent) {
            this.notifyChange();
        }
    }

    /**
     * Undo the last operation
     */
    public undo(): boolean {
        this.isUndoRedoOperation = true;
        const result = this.undoManager.undo();
        this.isUndoRedoOperation = false;
        return result;
    }

    /**
     * Redo the last undone operation
     */
    public redo(): boolean {
        this.isUndoRedoOperation = true;
        const result = this.undoManager.redo();
        this.isUndoRedoOperation = false;
        return result;
    }

    /**
     * Check if undo is available
     */
    public canUndo(): boolean {
        return this.undoManager.canUndo();
    }

    /**
     * Check if redo is available
     */
    public canRedo(): boolean {
        return this.undoManager.canRedo();
    }
    // --- Branching / Private Mode Logic (Git for Data) ---

    /**
     * Create a new branch (fork) of this engine.
     * The new engine starts with a copy of current data but tracks its own edits.
     */
    public createBranch(branchName: string): Engine {
        const newConfig = { ...this.config };
        // Use a temporary storage key for the branch
        const branchKey = `${this.storageKey}-branch-${branchName}`;

        const branchEngine = new Engine(newConfig, branchKey);

        // Copy source metadata
        branchEngine.sourceTable = this.sourceTable;
        branchEngine.sourceConnection = this.sourceConnection;
        branchEngine.sourceProvider = this.sourceProvider;
        branchEngine.columnNames = [...this.columnNames];
        branchEngine.rowIdMap = new Map(this.rowIdMap);

        // Deep copy data
        // We copy current cells to new engine's cells AND originalData
        // This effectively "rebases" the branch on the current state
        this.cells.forEach((val, key) => {
            branchEngine.cells.set(key, { ...val });
            branchEngine.originalData.set(key, { ...val });
        });

        branchEngine.parentBranch = this;
        branchEngine.currentBranchName = branchName;

        return branchEngine;
    }

    /**
     * Merge changes from another branch (usually a private draft) into this engine (main).
     * @param sourceEngine The private branch engine containing changes
     */
    public async mergeBranch(sourceEngine: Engine) {
        // 1. Get operations from source
        const operations = sourceEngine.getPendingOperations();

        if (operations.length === 0) {
            console.log('[Merge] No changes to merge');
            return;
        }

        this.beginBatch();

        // 2. Apply operations
        // For now, we apply blindly (Last Write Wins). 
        // Real implementation would check for conflicts against pending changes in changeTracker

        for (const op of operations) {
            if (op.type === 'update') {
                // Update existing row
                // We need to find the grid row index for this database ID
                // This is inefficient (O(N)), in production we need a reverse map
                let gridRow = -1;
                for (const [r, id] of this.rowIdMap.entries()) {
                    if (id === op.id) {
                        gridRow = r;
                        break;
                    }
                }

                if (gridRow !== -1) {
                    const changes = op.changes;
                    Object.keys(changes).forEach(colName => {
                        const colIndex = this.columnNames.indexOf(colName);
                        if (colIndex !== -1) {
                            const val = changes[colName];
                            this.setValue({ row: gridRow, col: colIndex }, String(val ?? ''), true);
                        }
                    });
                }
            } else if (op.type === 'create') {
                // Insert new row at the end
                // Note: This matches simple append behavior. 
                // Creating at specific index would require 'insertRow' logic integration
                const newRowIndex = this.getNonEmptyRowCount() + 1; // logical next row
                const data = op.data;

                Object.keys(data).forEach(colName => {
                    const colIndex = this.columnNames.indexOf(colName);
                    if (colIndex !== -1) {
                        const val = data[colName];
                        this.setValue({ row: newRowIndex, col: colIndex }, String(val ?? ''), true);
                    }
                });
            } else if (op.type === 'delete') {
                let gridRow = -1;
                for (const [r, id] of this.rowIdMap.entries()) {
                    if (id === op.id) {
                        gridRow = r;
                        break;
                    }
                }
                if (gridRow !== -1) {
                    await this.deleteRow(gridRow);
                }
            } else if (op.type === 'add_column') {
                if (!this.columnNames.includes(op.column)) {
                    this.addColumn(op.column);
                }
            } else if (op.type === 'drop_column') {
                const idx = this.columnNames.indexOf(op.column);
                if (idx !== -1) {
                    await this.deleteColumn(idx);
                }
            }
        }

        this.endBatch();
        this.saveStatus = 'saving'; // Trigger persistence to backend
        this.notifyChange();
    }

    // --- Smart Notes System ---

    public addNote(entityType: NoteEntityType, entityId: string, content: string, author: string = 'You'): Note {
        const note: Note = {
            id: crypto.randomUUID(),
            entityType,
            entityId,
            content,
            author,
            timestamp: Date.now(),
            resolved: false,
            replies: []
        };

        if (!this.notes.has(entityId)) {
            this.notes.set(entityId, []);
        }

        this.notes.get(entityId)!.push(note);
        this.notifyChange();
        return note;
    }

    public getNotes(entityId: string): Note[] {
        return this.notes.get(entityId) || [];
    }

    public deleteNote(entityId: string, noteId: string) {
        const thread = this.notes.get(entityId);
        if (!thread) return;

        const idx = thread.findIndex(n => n.id === noteId);
        if (idx !== -1) {
            thread.splice(idx, 1);
            if (thread.length === 0) {
                this.notes.delete(entityId);
            }
            this.notifyChange();
        }
    }

    public resolveNote(entityId: string, noteId: string, resolved: boolean) {
        const thread = this.notes.get(entityId);
        if (!thread) return;

        const note = thread.find(n => n.id === noteId);
        if (note) {
            note.resolved = resolved;
            this.notifyChange();
        }
    }

    public hasNotes(entityId: string): boolean {
        return this.notes.has(entityId) && this.notes.get(entityId)!.length > 0;
    }

    // --- Live Presence System ---

    public updatePresence(p: UserPresence) {
        this.presence.set(p.userId, p);
        this.notifyChange();
    }

    public removePresence(userId: string) {
        this.presence.delete(userId);
        this.notifyChange();
    }

    // Simulation for Demo
    private simulationInterval: any = null;

    public startSimulation() {
        if (this.simulationInterval) return;

        const users = [
            { userId: 'u1', userName: 'Alice', color: '#3b82f6' }, // Blue
            { userId: 'u2', userName: 'Bob', color: '#ef4444' },   // Red
            { userId: 'u3', userName: 'Charlie', color: '#22c55e' } // Green
        ];

        let tick = 0;
        this.simulationInterval = setInterval(() => {
            tick++;
            // Move users randomly
            users.forEach(u => {
                // Determine new pos
                const row = Math.max(1, Math.min(100, Math.floor(Math.random() * 20) + 1));
                const col = Math.max(0, Math.min(25, Math.floor(Math.random() * 10)));

                this.updatePresence({
                    ...u,
                    cursor: { row, col },
                    lastActive: Date.now()
                });

                // Occasionally add a random value (simulate typing)
                if (Math.random() > 0.9) {
                    this.setValue({ row, col }, `Edit by ${u.userName}`, true);
                }
            });
        }, 1000); // Update every second
    }

    public stopSimulation() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
            this.presence.clear();
            this.notifyChange();
        }
    }
}

