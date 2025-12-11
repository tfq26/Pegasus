
import type { CellPosition, CellData, EngineConfig } from './types';
import { CellType, posToKey } from './types';
import { DependencyGraph } from './DependencyGraph';
import { FormulaParser } from './FormulaParser';

export class Engine {
    private cells: Map<string, CellData> = new Map();
    private graph: DependencyGraph;
    public parser: FormulaParser;
    public config: EngineConfig;
    private changeCallbacks: Set<() => void> = new Set();
    private storageKey: string;
    private isBatching = false;

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
        // Group modified cells by row
        const rowsToProcess = new Set<number>();
        for (const cellKey of this.modifiedCells) {
            const row = parseInt(cellKey.split(',')[0]);
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
    public deleteRow(row: number) {
        // Get the _rowid_ from the original data if it exists
        const rowidCol = this.columnNames.indexOf('_rowid_');
        if (rowidCol !== -1) {
            const rowidCell = this.originalData.get(`${row},${rowidCol}`);
            if (rowidCell && rowidCell.value !== null) {
                this.deletedRows.add(Number(rowidCell.value));
                this.saveStatus = 'saving';
            }
        }

        // Clear all cells in the row
        for (let col = 0; col < this.columnNames.length; col++) {
            const key = posToKey({ row, col });
            this.cells.delete(key);
            this.originalData.delete(key);
        }

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
    public deleteColumn(col: number) {
        const columnName = this.columnNames[col];
        if (columnName && columnName !== '_rowid_') {
            this.deletedColumns.add(columnName);
            this.saveStatus = 'saving';
        }

        // Clear all cells in the column
        for (let row = 0; row < 1000; row++) { // Arbitrary large number
            const key = posToKey({ row, col });
            this.cells.delete(key);
            this.originalData.delete(key);
        }

        this.notifyChange();
    }

    /**
     * Get list of deleted column names
     */
    public getDeletedColumns(): string[] {
        return Array.from(this.deletedColumns);
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
        for (const [key, cell] of this.cells.entries()) {
            const [rowStr, colStr] = key.split(',');
            const row = parseInt(rowStr);
            const col = parseInt(colStr);

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
     * Begin batch mode - notifications will be deferred until endBatch()
     */
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
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
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
        this.notifyChange();
    }
}
