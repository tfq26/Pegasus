/**
 * EditOverlay - Sparse edit tracking for the high-performance spreadsheet engine
 * 
 * This provides efficient tracking of pending changes without modifying the main
 * data store. Changes are stored sparsely (only modified cells), making it 
 * memory-efficient even when editing large datasets.
 * 
 * Key features:
 * - O(1) edit operations
 * - Only stores changed cells (sparse)
 * - Tracks row-level changes for efficient delta saves
 * - Supports rollback/commit patterns
 */

import type { CellStyle } from './types';

/**
 * Edit record for a single cell
 */
export interface EditRecord {
    row: number;
    col: number;
    value: any;
    originalValue: any;
    timestamp: number;
}

/**
 * Row-level change summary
 */
export interface RowChange {
    rowId: any;  // Database primary key
    type: 'create' | 'update' | 'delete';
    changes: Map<string, { before: any; after: any }>;  // Column name -> change
}

/**
 * Operation for database persistence (compatible with existing ChangeTracker)
 */
export type Operation =
    | { type: 'create'; data: Record<string, any> }
    | { type: 'update'; id: any; changes: Record<string, any> }
    | { type: 'delete'; id: any }
    | { type: 'add_column'; column: string }
    | { type: 'drop_column'; column: string }
    | { type: 'full_replacement'; rows: Record<string, any>[] };

/**
 * EditOverlay configuration
 */
export interface EditOverlayConfig {
    maxUndoHistory: number;  // Max undo steps (default: 100)
}

const DEFAULT_CONFIG: EditOverlayConfig = {
    maxUndoHistory: 100
};

/**
 * EditOverlay - Main class for tracking spreadsheet edits
 */
export class EditOverlay {
    // Pending value edits: "row,col" -> EditRecord
    private pendingEdits: Map<string, EditRecord> = new Map();

    // Pending style changes: "row,col" -> CellStyle
    private pendingStyles: Map<string, CellStyle> = new Map();

    // Row ID mapping: gridRow -> databaseId
    private rowIdMap: Map<number, any> = new Map();

    // Deleted rows (by database ID)
    private deletedRows: Set<any> = new Set();

    // Deleted columns (by name)
    private deletedColumns: Set<string> = new Set();

    // Added columns (by name)
    private addedColumns: string[] = [];

    // Column names for reference
    private columnNames: string[] = [];

    // Configuration
    private config: EditOverlayConfig;

    // Track if any changes have been made
    private _isDirty: boolean = false;

    constructor(config: Partial<EditOverlayConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Set column names for reference
     */
    setColumnNames(columns: string[]): void {
        this.columnNames = [...columns];
    }

    /**
     * Get column names
     */
    getColumnNames(): string[] {
        return this.columnNames;
    }

    /**
     * Set a cell value
     */
    set(row: number, col: number, value: any, originalValue?: any): void {
        const key = `${row},${col}`;

        const existing = this.pendingEdits.get(key);
        const original = existing?.originalValue ?? originalValue;

        this.pendingEdits.set(key, {
            row,
            col,
            value,
            originalValue: original,
            timestamp: Date.now()
        });

        this._isDirty = true;
    }

    /**
     * Get a pending edit value (returns undefined if no edit)
     */
    get(row: number, col: number): any | undefined {
        const key = `${row},${col}`;
        return this.pendingEdits.get(key)?.value;
    }

    /**
     * Check if a cell has a pending edit
     */
    has(row: number, col: number): boolean {
        return this.pendingEdits.has(`${row},${col}`);
    }

    /**
     * Set cell style
     */
    setStyle(row: number, col: number, style: Partial<CellStyle>): void {
        const key = `${row},${col}`;
        const existing = this.pendingStyles.get(key) || {};
        this.pendingStyles.set(key, { ...existing, ...style });
        this._isDirty = true;
    }

    /**
     * Get pending style for a cell
     */
    getStyle(row: number, col: number): CellStyle | undefined {
        return this.pendingStyles.get(`${row},${col}`);
    }

    /**
     * Store row ID mapping (for linking grid rows to database records)
     */
    setRowId(gridRow: number, id: any): void {
        this.rowIdMap.set(gridRow, id);
    }

    /**
     * Get row ID for a grid row
     */
    getRowId(gridRow: number): any | undefined {
        return this.rowIdMap.get(gridRow);
    }

    /**
     * Mark a row as deleted
     */
    markRowDeleted(rowId: any): void {
        if (rowId !== undefined && rowId !== null) {
            this.deletedRows.add(rowId);
            this._isDirty = true;
        }
    }

    /**
     * Mark a column as deleted
     */
    markColumnDeleted(columnName: string): void {
        if (columnName && columnName !== '_rowid_' && columnName !== '__id') {
            this.deletedColumns.add(columnName);
            this._isDirty = true;
        }
    }

    /**
     * Mark a column as added
     */
    markColumnAdded(columnName: string): void {
        this.addedColumns.push(columnName);
        this._isDirty = true;
    }

    /**
     * Check if there are any pending changes
     */
    hasChanges(): boolean {
        return this._isDirty && (
            this.pendingEdits.size > 0 ||
            this.pendingStyles.size > 0 ||
            this.deletedRows.size > 0 ||
            this.deletedColumns.size > 0 ||
            this.addedColumns.length > 0
        );
    }

    /**
     * Get set of modified rows (grid row indices)
     */
    getModifiedRows(): Set<number> {
        const rows = new Set<number>();

        for (const edit of this.pendingEdits.values()) {
            rows.add(edit.row);
        }

        return rows;
    }

    /**
     * Get deleted row IDs
     */
    getDeletedRows(): any[] {
        return Array.from(this.deletedRows);
    }

    /**
     * Get deleted column names
     */
    getDeletedColumns(): string[] {
        return Array.from(this.deletedColumns);
    }

    /**
     * Get added column names
     */
    getAddedColumns(): string[] {
        return [...this.addedColumns];
    }

    /**
     * Get row as object using column names
     */
    getRowObject(row: number, getBaseValue: (row: number, col: number) => any): Record<string, any> {
        const obj: Record<string, any> = {};

        this.columnNames.forEach((colName, colIndex) => {
            // Check overlay first
            const editValue = this.get(row, colIndex);
            if (editValue !== undefined) {
                obj[colName] = editValue;
            } else {
                obj[colName] = getBaseValue(row, colIndex);
            }
        });

        return obj;
    }

    /**
     * Generate pending operations for database save
     */
    getPendingOperations(getBaseValue: (row: number, col: number) => any): Operation[] {
        const operations: Operation[] = [];

        // 1. Column additions
        for (const col of this.addedColumns) {
            operations.push({ type: 'add_column', column: col });
        }

        // 2. Column deletions
        for (const col of this.deletedColumns) {
            operations.push({ type: 'drop_column', column: col });
        }

        // 3. Row deletions
        for (const rowId of this.deletedRows) {
            operations.push({ type: 'delete', id: rowId });
        }

        // 4. Updates and creates
        const modifiedRows = this.getModifiedRows();

        for (const row of modifiedRows) {
            const rowId = this.rowIdMap.get(row);
            const rowData = this.getRowObject(row, getBaseValue);

            // Skip empty rows
            const isEmpty = Object.values(rowData).every(val =>
                val === null || val === undefined || val === ''
            );
            if (isEmpty) continue;

            // Skip if row was deleted
            if (rowId && this.deletedRows.has(rowId)) continue;

            if (rowId !== undefined) {
                // Existing row - update
                operations.push({ type: 'update', id: rowId, changes: rowData });
            } else {
                // New row - create
                operations.push({ type: 'create', data: rowData });
            }
        }

        return operations;
    }

    /**
     * Determine optimal save strategy
     */
    getSaveStrategy(totalRowCount: number): 'full_replacement' | 'delta_operations' {
        const modifiedCount = this.getModifiedRows().size;
        const deletedCount = this.deletedRows.size;
        const schemaChanged = this.deletedColumns.size > 0 || this.addedColumns.length > 0;

        const changeRatio = (modifiedCount + deletedCount) / Math.max(totalRowCount, 1);

        // Use full replacement if:
        // 1. Table is small (<10k rows)
        // 2. More than 30% of rows changed
        // 3. Schema changed
        if (totalRowCount < 10000 || changeRatio > 0.3 || schemaChanged) {
            return 'full_replacement';
        }

        return 'delta_operations';
    }

    /**
     * Clear all pending changes (call after successful save)
     */
    clear(): void {
        this.pendingEdits.clear();
        this.pendingStyles.clear();
        this.deletedRows.clear();
        this.deletedColumns.clear();
        this.addedColumns = [];
        this._isDirty = false;
    }

    /**
     * Clear row ID mapping (call when data is reloaded)
     */
    clearRowIdMap(): void {
        this.rowIdMap.clear();
    }

    /**
     * Get count of pending edits
     */
    get editCount(): number {
        return this.pendingEdits.size;
    }

    /**
     * Get all pending edit records (for debugging/UI)
     */
    getAllEdits(): EditRecord[] {
        return Array.from(this.pendingEdits.values());
    }

    /**
     * Rollback a specific edit
     */
    rollbackEdit(row: number, col: number): any | undefined {
        const key = `${row},${col}`;
        const edit = this.pendingEdits.get(key);

        if (edit) {
            this.pendingEdits.delete(key);
            return edit.originalValue;
        }

        return undefined;
    }

    /**
     * Rollback all edits for a row
     */
    rollbackRow(row: number): void {
        const keysToDelete: string[] = [];

        for (const [key, edit] of this.pendingEdits) {
            if (edit.row === row) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.pendingEdits.delete(key));
    }
}
