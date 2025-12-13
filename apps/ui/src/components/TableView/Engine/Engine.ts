

import type { CellPosition, CellData, EngineConfig } from './types';
import { CellType, posToKey } from './types';
import { DependencyGraph } from './DependencyGraph';
import { FormulaParser } from './FormulaParser';
import { UndoManager } from './UndoManager';

export class Engine {
    private cells: Map<string, CellData> = new Map();
    private graph: DependencyGraph;
    public parser: FormulaParser;
    public config: EngineConfig;
    private changeCallbacks: Set<() => void> = new Set();
    private storageKey: string;
    // Database persistence tracking
    public sourceTable: string | null = null;
    public sourceConnection: any | null = null; // Full connection config
    public sourceProvider: string | null = null;
    public columnNames: string[] = [];
    private originalData: Map<string, CellData> = new Map(); // Snapshot of loaded data
    private modifiedCells: Set<string> = new Set(); // Track which cells changed
    private deletedRows: Set<number> = new Set(); // Track deleted rows by _rowid_
    private deletedColumns: Set<string> = new Set(); // Track deleted column names
    private addedColumns: string[] = []; // Track added columns
    private rowIdMap: Map<number, any> = new Map(); // Store _rowid_ for each row (hidden from grid)
    public saveStatus: 'saved' | 'saving' | 'error' = 'saved';

    // Undo/Redo system
    public undoManager: UndoManager = new UndoManager();
    public isUndoRedoOperation = false; // Flag to prevent recording undo operations during undo/redo

    // Header row tracking - row 0 is always the header row for database tables
    public headerRowIndex = 0;



    // Transient view state (preserved in memory for tab switching)
    public viewState = {
        scrollTop: 0,
        selection: null as CellPosition | null,
    };

    constructor(config: EngineConfig, storageKey = 'spreadsheet-data') {
        this.config = config;
        this.graph = new DependencyGraph();
        this.parser = new FormulaParser();
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
    public setSource(tableName: string, connection: any, columns: string[], provider?: string) {
        this.sourceTable = tableName;
        this.sourceConnection = connection;
        this.sourceProvider = provider || 'sqlite'; // Default if missing
        this.columnNames = columns; // visible columns only
        // Take snapshot of current data as "original" (if not set by setOriginalData)
        if (this.originalData.size === 0) {
            this.originalData = new Map(this.cells);
        }
        this.clearModifiedTracking();
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
     * Legacy method for getting modified rows (deprecated)
     */
    public getModifiedRows(): Map<number, { data: Record<string, any>, original: Record<string, any> | null }> {
        // ... kept for compatibility but should use getPendingOperations ...
        return new Map();
    }

    /**
     * Mark a row as deleted (for database DELETE operation)
     */
    public async deleteRow(row: number) {
        if (!this.isUndoRedoOperation) {
            const { DeleteRowCommand } = await import('./UndoManager');
            this.undoManager.execute(new DeleteRowCommand(this, row));
            return;
        }

        // Get the _rowid_ from the original data if it exists
        const rowidCol = this.columnNames.indexOf('_rowid_');
        if (rowidCol !== -1) {
            const rowidCell = this.originalData.get(`${row},${rowidCol}`);
            if (rowidCell && rowidCell.value !== null) {
                this.deletedRows.add(Number(rowidCell.value));
                this.saveStatus = 'saving';
            }
        }

        // 1. Identify cells to delete (in the target row) and cells to move (below the target row)
        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        // Process this.cells
        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (r === row) {
                keysToDelete.push(key);
            } else if (r > row) {
                keysToDelete.push(key);
                cellsToMove.set(posToKey({ row: r - 1, col: c }), cell);
            }
        }

        // Process this.originalData
        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (r === row) {
                keysToDelete.push(key);
            } else if (r > row) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r - 1, col: c }), cell);
            }
        }

        // Apply changes
        keysToDelete.forEach(k => {
            this.cells.delete(k);
            this.originalData.delete(k);
        });

        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    /**
     * Get list of deleted row IDs
     */
    public getDeletedRows(): number[] {
        return Array.from(this.deletedRows);
    }

    /**
     * Mark a column as deleted (for database ALTER TABLE DROP COLUMN operation)
     */
    /**
     * Mark a column as deleted and update local data structure
     */
    public async deleteColumn(col: number) {
        console.log('[Engine] deleteColumn called, col:', col);
        console.log('[Engine] isUndoRedoOperation:', this.isUndoRedoOperation);
        const columnName = this.columnNames[col];

        if (!this.isUndoRedoOperation) {
            const { DeleteColumnCommand } = await import('./UndoManager');
            await this.undoManager.execute(new DeleteColumnCommand(this, col));
            return;
        }

        // Even if columnName is "undefined" string, we should allow deleting it
        // We only skip if it's strictly undefined (out of bounds)
        if (columnName !== undefined && columnName !== '_rowid_') {
            this.deletedColumns.add(columnName);
            this.saveStatus = 'saving';
        }

        // Even if columnName is "undefined" string, we should allow deleting it
        // We only skip if it's strictly undefined (out of bounds)
        if (columnName !== undefined && columnName !== '_rowid_') {
            this.deletedColumns.add(columnName);
            this.saveStatus = 'saving';
        }

        // 1. Remove from column definitions
        this.columnNames.splice(col, 1);

        // 2. We need to shift all cell data for columns > col to the left
        // This is expensive but necessary for in-memory consistency
        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        // Identify cells that need moving
        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (c === col) {
                keysToDelete.push(key); // Check this column's data
            } else if (c > col) {
                keysToDelete.push(key);
                // Store with new key (c-1)
                cellsToMove.set(posToKey({ row: r, col: c - 1 }), cell);
            }
        }

        // Same for original data
        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (c === col) {
                keysToDelete.push(key);
            } else if (c > col) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r, col: c - 1 }), cell);
            }
        }

        // Apply changes
        keysToDelete.forEach(k => {
            this.cells.delete(k);
            this.originalData.delete(k);
        });

        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    /**
     * Insert a new row at the specified index
     */
    public async insertRow(row: number) {
        if (!this.isUndoRedoOperation) {
            const { InsertRowCommand } = await import('./UndoManager');
            this.undoManager.execute(new InsertRowCommand(this, row));
            return;
        }

        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        // Shift existing cells down
        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (r >= row) {
                keysToDelete.push(key);
                cellsToMove.set(posToKey({ row: r + 1, col: c }), cell);
            }
        }

        // Shift original data
        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (r >= row) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r + 1, col: c }), cell);
            }
        }

        keysToDelete.forEach(k => {
            this.cells.delete(k);
            this.originalData.delete(k);
        });

        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    /**
     * Insert a new column at the specified index
     */
    public async insertColumn(col: number, name?: string) {
        const columnName = name || `Column${this.columnNames.length + 1}`;

        if (!this.isUndoRedoOperation) {
            const { InsertColumnCommand } = await import('./UndoManager');
            this.undoManager.execute(new InsertColumnCommand(this, col, columnName));
            return;
        }

        // Insert into columnNames
        this.columnNames.splice(col, 0, columnName);
        this.addedColumns.push(columnName);

        // Shift cells to right
        const cellsToMove = new Map<string, CellData>();
        const originalToMove = new Map<string, CellData>();
        const keysToDelete: string[] = [];

        for (const [key, cell] of this.cells) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (c >= col) {
                keysToDelete.push(key);
                cellsToMove.set(posToKey({ row: r, col: c + 1 }), cell);
            }
        }

        for (const [key, cell] of this.originalData) {
            const parts = key.split(',').map(Number);
            const r = parts[0];
            const c = parts[1];

            if (r === undefined || c === undefined) continue;

            if (c >= col) {
                keysToDelete.push(key);
                originalToMove.set(posToKey({ row: r, col: c + 1 }), cell);
            }
        }

        keysToDelete.forEach(k => {
            this.cells.delete(k);
            this.originalData.delete(k);
        });

        for (const [k, v] of cellsToMove) this.cells.set(k, v);
        for (const [k, v] of originalToMove) this.originalData.set(k, v);

        this.notifyChange();
    }

    /**
     * Get list of deleted column names
     */
    public getDeletedColumns(): string[] {
        return Array.from(this.deletedColumns);
    }

    /**
     * Get list of added column names
     */
    public getAddedColumns(): string[] {
        return [...this.addedColumns];
    }

    /**
     * Get pending operations for atomic save
     */
    public getPendingOperations() {
        const operations: any[] = [];

        // 0. Column Additions (First to ensure table has columns if we delete others)
        this.addedColumns.forEach(col => {
            operations.push({ type: 'add_column', column: col });
        });

        // 1. Deletions
        this.deletedRows.forEach(rowId => {
            operations.push({ type: 'delete', id: rowId });
        });

        // 2. Updates & Creates
        // Group modified cells by row (skip row 0 - headers)
        const rowsToProcess = new Set<number>();
        for (const cellKey of this.modifiedCells) {
            const row = parseInt(cellKey.split(',')[0]);
            // Skip row 0 as it contains headers, not data
            if (row === 0) continue;
            rowsToProcess.add(row);
        }

        for (const row of rowsToProcess) {
            const rowId = this.rowIdMap.get(row);
            const rowData = this.getRowObject(row);

            // Check if row is completely empty (all values are null/empty)
            const isEmpty = Object.values(rowData).every(val =>
                val === null || val === undefined || val === ''
            );

            if (rowId) {
                if (this.deletedRows.has(rowId)) continue; // Skip if deleted

                // UPDATE (only if not empty)
                if (!isEmpty) {
                    operations.push({ type: 'update', id: rowId, changes: rowData });
                }
            } else {
                // CREATE (No ID) - only if row has content
                if (!isEmpty) {
                    operations.push({ type: 'create', data: rowData });
                }
            }
        }

        return operations;
    }

    /**
     * Determine the optimal save strategy based on table size and change volume
     */
    public getSaveStrategy(): 'full_replacement' | 'delta_operations' {
        const totalRows = this.getNonEmptyRowCount();
        const modifiedCount = this.modifiedCells.size;
        const deletedCount = this.deletedRows.size;
        const deletedColsCount = this.deletedColumns.size;
        const addedColsCount = this.addedColumns.length;

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
     * Count non-empty rows in the table
     */
    private getNonEmptyRowCount(): number {
        const rowsWithData = new Set<number>();

        for (const [key, cell] of this.cells.entries()) {
            if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
                const row = parseInt(key.split(',')[0]);
                rowsWithData.add(row);
            }
        }

        return rowsWithData.size;
    }

    /**
     * Get all non-empty rows for full replacement save
     */
    public getAllNonEmptyRows(): Array<Record<string, any>> {
        const rowsMap = new Map<number, Record<string, any>>();

        // Collect all rows that have at least one non-empty cell
        // Skip row 0 as it contains headers, not data
        for (const [key, cell] of this.cells.entries()) {
            const [rowStr, colStr] = key.split(',');
            const row = parseInt(rowStr);
            const col = parseInt(colStr);

            // IMPORTANT: Skip row 0 as it contains headers, not data
            if (row === 0) continue;

            if (!rowsMap.has(row)) {
                rowsMap.set(row, {});
            }

            const colName = this.columnNames[col];
            if (colName && colName !== '_rowid_' && colName !== '__id') {
                rowsMap.get(row)![colName] = cell.value ?? null;
            }
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
        this.addedColumns.push(name);
        this.saveStatus = 'saving';
        this.notifyChange();
    }

    /**
     * Clear modification tracking after successful save
     */
    public clearModifiedTracking() {
        this.modifiedCells.clear();
        this.deletedRows.clear();
        this.deletedColumns.clear();
        this.addedColumns = [];
        this.originalData = new Map(this.cells);
    }

    /**
     * Check if there are any pending modifications that require a save
     * This prevents unnecessary saves when nothing has changed
     */
    public hasPendingModifications(): boolean {
        // Check for any modifications (excluding header row modifications)
        const hasDataModifications = Array.from(this.modifiedCells).some(key => {
            const row = parseInt(key.split(',')[0]);
            return row !== 0; // Ignore header row changes
        });

        const result = hasDataModifications ||
            this.deletedRows.size > 0 ||
            this.deletedColumns.size > 0 ||
            this.addedColumns.length > 0;

        return result;
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
            // This prevents quota issues and improves performance
            if (data.length > 5000 && !this.sourceTable) {
                console.warn('[Storage] Skipping localStorage for large non-database sheet (performance optimization)');
                return;
            }

            const storageData = {
                version: 2,
                cells: data,
                source: {
                    table: this.sourceTable,
                    connection: this.sourceConnection,
                    provider: this.sourceProvider,
                    columns: this.columnNames
                }
            };

            localStorage.setItem(this.storageKey, JSON.stringify(storageData));
        } catch (e: any) {
            // Handle quota exceeded error
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.warn('[Storage] localStorage quota exceeded, clearing old spreadsheet data');

                // Clear old spreadsheet tab data to free up space
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith('spreadsheet-tab-') && key !== this.storageKey) {
                        keysToRemove.push(key);
                    }
                }

                keysToRemove.forEach(key => localStorage.removeItem(key));
                console.log(`[Storage] Cleared ${keysToRemove.length} old spreadsheet entries`);

                // Try saving again after cleanup
                try {
                    const data = Array.from(this.cells.entries());
                    const storageData = {
                        version: 2,
                        cells: data,
                        source: {
                            table: this.sourceTable,
                            connection: this.sourceConnection,
                            provider: this.sourceProvider,
                            columns: this.columnNames
                        }
                    };
                    localStorage.setItem(this.storageKey, JSON.stringify(storageData));
                    console.log('[Storage] Successfully saved after cleanup');
                } catch (e2) {
                    console.error('[Storage] Still failed after cleanup, skipping persistence:', e2);
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

                // Check if it's the old format (array) or new format (object)
                if (Array.isArray(parsed)) {
                    // V1 format: just cells
                    this.cells = new Map(parsed as [string, CellData][]);
                } else if (parsed.version === 2) {
                    // V2 format: cells + source metadata
                    this.cells = new Map(parsed.cells);
                    if (parsed.source) {
                        this.sourceTable = parsed.source.table;
                        this.sourceConnection = parsed.source.connection;
                        this.sourceProvider = parsed.source.provider;
                        this.columnNames = parsed.source.columns || [];
                    }
                }
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
        this.modifiedCells.add(key);

        // 4. Recalculate Dependents
        const dependents = this.graph.getDependents(pos);
        for (const dep of dependents) {
            await this.recalculate(dep);
        }

        // 5. Notify change (unless silent mode)
        if (!silent) {
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
        this.modifiedCells.add(key);
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

        this.modifiedCells.add(key);
        this.notifyChange();
    }

    public clear() {
        this.cells.clear();
        // Also clear localStorage to prevent data from reappearing
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            console.error('Failed to clear localStorage:', e);
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
}

