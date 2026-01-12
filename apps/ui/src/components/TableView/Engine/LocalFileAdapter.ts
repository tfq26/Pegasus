
import type { DatabaseAdapter, Operation } from './SyncManager';

export class LocalFileAdapter implements DatabaseAdapter {
    private data: any[] = [];
    private columns: any[] = [];

    constructor(data: any[] = [], columns: any[] = []) {
        this.data = data;
        this.columns = columns; // [{ name: 'col1', type: 'string' }]
    }

    public setData(data: any[]) {
        this.data = data;
    }

    public setColumns(columns: any[]) {
        this.columns = columns;
    }

    public async fetchRows(startRow: number, endRow: number): Promise<any> {
        // Simulate async
        await new Promise(r => setTimeout(r, 10));

        const rows = this.data.slice(startRow, endRow);

        return {
            rows: rows.map(r => ({ ...r })), // Clone to prevent ref issues
            totalCount: this.data.length
        };
    }

    public async getMetadata() {
        return { totalRows: this.data.length, columns: this.columns };
    }

    public async commit(operations: Operation[]): Promise<void> {
        // Apply edits locally
        for (const op of operations) {
            try {
                if (op.type === 'UPDATE') {
                    if (op.row === undefined || op.col === undefined) continue;

                    const rowIdx = op.row;
                    const colIdx = op.col;

                    // Map col index to key
                    let key = '';
                    if (this.columns[colIdx] && this.columns[colIdx].name) {
                        key = this.columns[colIdx].name;
                    } else {
                        // Fallback key detection
                        const fallbackKeys = Object.keys(this.data[0] || {});
                        key = fallbackKeys[colIdx] || '';
                    }

                    if (rowIdx < this.data.length && key) {
                        this.data[rowIdx][key] = op.value;
                    }
                } else if (op.type === 'INSERT_ROW') {
                    const newRow = op.value || {};
                    const insertIndex = typeof op.row === 'number' ? op.row : this.data.length;
                    this.data.splice(insertIndex, 0, newRow);
                } else if (op.type === 'DELETE_ROW') {
                    if (op.row !== undefined) {
                        this.data.splice(op.row, op.count || 1);
                    }
                }
            } catch (e) {
                console.error('[LocalFileAdapter] Error applying operation:', op, e);
            }
        }
    }
}
