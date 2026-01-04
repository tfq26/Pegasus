

import type { CellPosition, CellData, EngineConfig, Note, NoteEntityType, UserPresence, RowDiff } from './types';
import { CellType, posToKey } from './types';
import { DependencyGraph } from './DependencyGraph';
import { FormulaParser } from './FormulaParser';
import { UndoManager } from './UndoManager';
import { ChangeTracker } from './ChangeTracker';

export class Engine {
    private cells: Map<string, CellData> = new Map();
    private graph: DependencyGraph;
    public parser: FormulaParser;
    public config: EngineConfig;
    private changeCallbacks: Set<() => void> = new Set();
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

    public saveStatus: 'saved' | 'saving' | 'error' = 'saved';

    // Branching state
    public parentBranch: Engine | null = null;
    public currentBranchName: string = 'main';

    // Undo/Redo system
    public undoManager: UndoManager = new UndoManager();
    public isUndoRedoOperation = false; // Flag to prevent recording undo operations during undo/redo

    // Header row tracking - row 0 is always the header row for database tables
    public headerRowIndex = 0;

    // Schema mode - determines how columns are named
    public schemaMode: 'named-headers' | 'column-letters' = 'column-letters';
    public hasDetectedHeaders: boolean = false;

    // Change Tracking System
    public changeTracker: ChangeTracker;

    // Transient view state (preserved in memory for tab switching)
    public viewState = {
        scrollTop: 0,
        selection: null as CellPosition | null,
    };

    constructor(config: EngineConfig, storageKey = 'spreadsheet-data') {
        this.config = config;
        this.graph = new DependencyGraph();
        this.parser = new FormulaParser();
        this.changeTracker = new ChangeTracker();
        this.storageKey = storageKey;
        this.loadFromStorage();
    }

    /**
     * Explicitly set the original data snapshot.
     * Use this when loading data from a source ensuring that the 'original'
     * values match the backend source exactly (e.g. preserving nulls), 
     * which might differ from the stringified values in the grid.
     */
    public setOriginalData(data: Record<string, any>[]) {
        this.originalData.clear();
        this.rowIdMap.clear();

        // rows are 0...N-1 in array, but 1...N in grid
        // cols are 0...M in array/grid

        data.forEach((row, rowIndex) => {
            const gridRow = rowIndex + 1; // 1-based rows

            // Store hidden ID
            if ('__id' in row) {
                this.rowIdMap.set(gridRow, row.__id);
            } else if ('_rowid_' in row) {
                this.rowIdMap.set(gridRow, row._rowid_);
            }

            this.columnNames.forEach((colName, colIndex) => {
                const val = row[colName];
                const key = `${gridRow},${colIndex}`;

                // Store as a mock CellData used for original value retrieval
                this.originalData.set(key, {
                    rawInput: String(val ?? ''),
                    value: val, // Store raw value (e.g. null, number)
                    type: typeof val === 'number' ? CellType.NUMBER : CellType.TEXT
                });
            });
        });
    }

    /**
     * Set the source table for database persistence
     */
    public setSource(tableName: string, connection: any, columns: string[], provider?: string, schemaMode?: 'named-headers' | 'column-letters') {
        this.sourceTable = tableName;
        this.sourceConnection = connection;
        this.sourceProvider = provider || 'sqlite'; // Default if missing
        this.columnNames = columns; // visible columns only

        // Set schema mode if provided, otherwise auto-detect
        if (schemaMode) {
            this.schemaMode = schemaMode;
        } else {
            // Auto-detect based on column names
            this.schemaMode = this.detectSchemaMode(columns);
        }

        // Take snapshot of current data as "original" (if not set by setOriginalData)
        if (this.originalData.size === 0) {
            this.originalData = new Map(this.cells);
        }
        this.clearModifiedTracking();
        this.changeTracker.clear();
        this.changeTracker.setColumnNames(columns);
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
     */
    public getState() {
        return {
            version: 2,
            cells: Array.from(this.cells.entries()),
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
        } else if (state.version === 2) {
            // V2 format: cells + source metadata
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
        const totalRows = this.getNonEmptyRowCount();
        const modifiedCount = this.changeTracker.getModifiedCellKeys().size;
        const deletedCount = this.changeTracker.getDeletedRows().length;
        const deletedColsCount = this.changeTracker.getDeletedColumns().length;
        const addedColsCount = this.changeTracker.getAddedColumns().length;

        // Use full replacement if:
        // 1. Table is small (< 10k rows)
        // 2. More than 30% of rows changed
        // 3. Schema changed (columns added/deleted)
        const changeRatio = (modifiedCount + deletedCount) / Math.max(totalRows, 1);
        const schemaChanged = deletedColsCount > 0 || addedColsCount > 0;

        if (totalRows < 10000 || changeRatio > 0.3 || schemaChanged) {
            return 'full_replacement';
        }

        return 'delta_operations';
    }

    /**
     * Commit all pending changes to the database
     */
    public async commit(): Promise<void> {
        if (!this.sourceTable || !this.sourceConnection || !this.sourceProvider) {
            throw new Error('Cannot commit: Missing source metadata (table, connection, or provider)');
        }

        if (!this.hasPendingModifications()) {
            console.log('[Engine] No pending modifications to commit');
            return;
        }

        this.saveStatus = 'saving';
        this.notifyChange();

        try {
            const strategy = this.getSaveStrategy();
            let ops: any[] = [];

            if (strategy === 'full_replacement') {
                const allRows = this.getAllNonEmptyRows();

                // Add schema change operations first
                this.changeTracker.getDeletedColumns().forEach(col => {
                    ops.push({ type: 'drop_column', column: col });
                });
                this.changeTracker.getAddedColumns().forEach(col => {
                    ops.push({ type: 'add_column', column: col });
                });

                ops.push({ type: 'full_replacement', rows: allRows });
            } else {
                ops = this.getPendingOperations();
                // Add schema change operations
                this.changeTracker.getDeletedColumns().forEach(col => {
                    ops.push({ type: 'drop_column', column: col });
                });
            }

            const response = await fetch(`${(window as any).VITE_QUERY_API_URL || import.meta.env.VITE_QUERY_API_URL}/api/table/${this.sourceTable}/operations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    connection: this.sourceConnection,
                    provider: this.sourceProvider,
                    operations: ops
                })
            });

            if (!response.ok) {
                const body = await response.json();
                throw new Error(body.error || 'Save failed');
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
     */
    public getAllNonEmptyRows(): Array<Record<string, any>> {
        const rowsMap = new Map<number, Record<string, any>>();

        // Determine starting row based on schema mode
        const startRow = this.schemaMode === 'named-headers' ? 1 : 0;

        // Collect all rows using smart field names
        for (const [key, cell] of this.cells.entries()) {
            const parts = key.split(',');
            if (parts.length < 2) continue;
            const rowStr = parts[0];
            const colStr = parts[1];
            if (rowStr === undefined || colStr === undefined) continue;
            const row = parseInt(rowStr);
            const col = parseInt(colStr);

            // Skip header row in named-headers mode
            if (row < startRow) continue;

            if (!rowsMap.has(row)) {
                rowsMap.set(row, {});
            }

            // Use smart field name (either actual column name or letter)
            const fieldName = this.getFieldName(col);
            rowsMap.get(row)![fieldName] = cell.value ?? null;
        }

        // Filter out completely empty rows
        const result: Array<Record<string, any>> = [];
        for (const rowData of rowsMap.values()) {
            const isEmpty = Object.values(rowData).every(val =>
                val === null || val === undefined || val === ''
            );
            if (!isEmpty) {
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
     * Manually trigger change notification (useful after silent edits)
     */
    public notifyChange() {
        if (this.isBatching) return; // Skip if batching
        this.changeCallbacks.forEach(cb => cb());
        this.saveToStorage();
    }

    private saveToStorage() {
        try {
            const data = Array.from(this.cells.entries());

            // If cells map is empty, remove the localStorage item entirely
            if (data.length === 0) {
                localStorage.removeItem(this.storageKey);
                return;
            }

            // For large datasets without database backing, skip localStorage persistence
            if (data.length > 5000 && !this.sourceTable) {
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
     */
    public async setValue(pos: CellPosition, input: string, silent: boolean = false) {
        const key = posToKey(pos);

        // Record undo command (unless this is an undo/redo operation itself)
        if (!this.isUndoRedoOperation && !silent) {
            const oldValue = this.getCell(pos)?.rawInput || '';
            const { SetValueCommand } = await import('./UndoManager');
            const command = new SetValueCommand(this, pos, input, oldValue);
            this.undoManager.execute(command);
            return; // Command.execute() will call setValue again with silent=true
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
        this.cells.set(key, cellData);

        // 4. Recalculate Dependents
        const dependents = this.graph.getDependents(pos);
        for (const dep of dependents) {
            await this.recalculate(dep);
        }

        // 5. Notify change (unless silent mode)
        if (!silent) {
            this.changeTracker.markCellModified(pos);
            this.notifyChange();
        }
    }

    public getCell(pos: CellPosition): CellData | null {
        return this.cells.get(posToKey(pos)) || null;
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

    private async recalculate(pos: CellPosition) {
        const key = posToKey(pos);
        const cell = this.cells.get(key);
        if (!cell || cell.type !== CellType.FORMULA) return;

        const parsed = this.parser.parse(cell.rawInput);
        cell.value = this.evaluateParsed(parsed);
        this.cells.set(key, { ...cell });
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
        let cell = this.cells.get(key);

        if (!cell) {
            cell = {
                rawInput: '',
                value: '',
                type: CellType.TEXT,
                style: {}
            };
            this.cells.set(key, cell);
        }

        if (!cell.style) cell.style = {};
        Object.assign(cell.style, style);

        this.changeTracker.markKeyModified(key);
        this.notifyChange();
    }

    public clear(options: { keepStyles?: boolean } = {}) {
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
        this.notifyChange();
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

