import type { CellPosition, CellData } from './types';
import { posToKey } from './types';

/**
 * Operation types for database persistence
 */
export type Operation =
    | { type: 'create'; data: Record<string, any> }
    | { type: 'update'; id: number; changes: Record<string, any> }
    | { type: 'delete'; id: number }
    | { type: 'add_column'; column: string }
    | { type: 'drop_column'; column: string }
    | { type: 'full_replacement'; rows: Record<string, any>[] };

/**
 * Interface for Engine-like objects that ChangeTracker needs to read
 */
export interface IEngineReadable {
    columnNames: string[];
    getCell(pos: CellPosition): CellData | null;
    getCells(): Map<string, CellData>;
}

/**
 * ChangeTracker - Tracks modifications to spreadsheet data for persistence
 * 
 * Responsibilities:
 * - Track which cells have been modified
 * - Track deleted rows and columns
 * - Track added columns
 * - Generate pending operations for save
 * - Determine optimal save strategy
 */
export class ChangeTracker {
    private modifiedCells: Set<string> = new Set();
    private deletedRows: Set<number> = new Set();
    private deletedColumns: Set<string> = new Set();
    private addedColumns: string[] = [];
    private rowIdMap: Map<number, any> = new Map();

    /**
     * Mark a cell as modified
     */
    markCellModified(pos: CellPosition): void {
        this.modifiedCells.add(posToKey(pos));
    }

    /**
     * Mark a cell key as modified
     */
    markKeyModified(key: string): void {
        this.modifiedCells.add(key);
    }

    /**
     * Mark a row as deleted by its ID
     */
    markRowDeleted(rowId: number): void {
        this.deletedRows.add(rowId);
    }

    /**
     * Mark a column as deleted by its name
     */
    markColumnDeleted(columnName: string): void {
        if (columnName && columnName !== '_rowid_') {
            this.deletedColumns.add(columnName);
        }
    }

    /**
     * Mark a column as added
     */
    markColumnAdded(columnName: string): void {
        this.addedColumns.push(columnName);
    }

    /**
     * Store the row ID mapping for a grid row
     */
    setRowId(gridRow: number, id: any): void {
        this.rowIdMap.set(gridRow, id);
    }

    /**
     * Get the row ID for a grid row
     */
    getRowId(gridRow: number): any {
        return this.rowIdMap.get(gridRow);
    }

    /**
     * Check if there are any pending modifications
     */
    hasChanges(): boolean {
        return this.modifiedCells.size > 0 ||
            this.deletedRows.size > 0 ||
            this.deletedColumns.size > 0 ||
            this.addedColumns.length > 0;
    }

    /**
     * Get list of deleted row IDs
     */
    getDeletedRows(): number[] {
        return Array.from(this.deletedRows);
    }

    /**
     * Get list of deleted column names
     */
    getDeletedColumns(): string[] {
        return Array.from(this.deletedColumns);
    }

    /**
     * Get list of added column names
     */
    getAddedColumns(): string[] {
        return [...this.addedColumns];
    }

    /**
     * Get set of modified cell keys
     */
    getModifiedCellKeys(): Set<string> {
        return new Set(this.modifiedCells);
    }

    /**
     * Get pending operations for atomic save
     */
    getPendingOperations(engine: IEngineReadable): Operation[] {
        const operations: Operation[] = [];

        // 1. Column Additions (First to ensure table has columns)
        this.addedColumns.forEach(col => {
            operations.push({ type: 'add_column', column: col });
        });

        // 2. Row Deletions
        this.deletedRows.forEach(rowId => {
            operations.push({ type: 'delete', id: rowId });
        });

        // 3. Updates & Creates - Group modified cells by row
        const rowsToProcess = new Set<number>();
        for (const cellKey of this.modifiedCells) {
            const row = parseInt(cellKey.split(',')[0]);
            if (!isNaN(row)) {
                rowsToProcess.add(row);
            }
        }

        for (const row of rowsToProcess) {
            const rowId = this.rowIdMap.get(row);
            const rowData = this.getRowObject(engine, row);

            // Check if row is completely empty
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
     * Determine the optimal save strategy based on change volume
     */
    getSaveStrategy(totalRowCount: number): 'full_replacement' | 'delta_operations' {
        const modifiedCount = this.modifiedCells.size;
        const deletedCount = this.deletedRows.size;
        const deletedColsCount = this.deletedColumns.size;
        const addedColsCount = this.addedColumns.length;

        // Use full replacement if:
        // 1. Table is small (< 10k rows)
        // 2. More than 30% of rows changed
        // 3. Schema changed (columns added/deleted)
        const changeRatio = (modifiedCount + deletedCount) / Math.max(totalRowCount, 1);
        const schemaChanged = deletedColsCount > 0 || addedColsCount > 0;

        if (totalRowCount < 10000 || changeRatio > 0.3 || schemaChanged) {
            return 'full_replacement';
        }

        return 'delta_operations';
    }

    /**
     * Clear all modification tracking after successful save
     */
    clear(): void {
        this.modifiedCells.clear();
        this.deletedRows.clear();
        this.deletedColumns.clear();
        this.addedColumns = [];
    }

    /**
     * Clear row ID mapping (call when data is reloaded)
     */
    clearRowIdMap(): void {
        this.rowIdMap.clear();
    }

    /**
     * Get a row as an object with column names as keys
     */
    private getRowObject(engine: IEngineReadable, row: number): Record<string, any> {
        const obj: Record<string, any> = {};
        engine.columnNames.forEach((colName, colIndex) => {
            const cell = engine.getCell({ row, col: colIndex });
            obj[colName] = cell?.value ?? null;
        });
        return obj;
    }
}
