/**
 * ColumnStore - High-performance columnar data storage for spreadsheets
 * 
 * This replaces the Map<string, CellData> approach with column-oriented storage,
 * providing significant memory and performance improvements for large datasets.
 * 
 * Key benefits:
 * - 50-80% memory reduction for numeric data (TypedArrays)
 * - Cache-friendly sequential access patterns
 * - Efficient serialization for chunks
 * - O(1) cell access
 */

import type { CellData, CellStyle, CellType } from './types';
import { CellType as CellTypeEnum } from './types';

/**
 * Column schema definition
 */
export interface ColumnSchema {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'mixed';
    nullable: boolean;
    width?: number;
}

/**
 * Column data container - stores data efficiently by type
 */
export interface ColumnData {
    schema: ColumnSchema;

    // Data storage (one of these will be used based on type)
    stringData?: string[];
    numericData?: Float64Array;
    booleanData?: Uint8Array;

    // Null bitmap for nullable columns (1 bit per row)
    nullBitmap?: Uint8Array;

    // Style storage (sparse - only for cells with styles)
    styles?: Map<number, CellStyle>;
}

/**
 * Chunk metadata for virtualized loading
 */
export interface ChunkMeta {
    id: number;
    startRow: number;
    endRow: number;
    loaded: boolean;
    lastAccess: number;
}

/**
 * ColumnStore configuration
 */
export interface ColumnStoreConfig {
    chunkSize: number;        // Rows per chunk (default: 5000)
    maxCachedChunks: number;  // Max chunks in memory (default: 10)
    preloadAhead: number;     // Chunks to prefetch (default: 2)
}

const DEFAULT_CONFIG: ColumnStoreConfig = {
    chunkSize: 5000,
    maxCachedChunks: 10,
    preloadAhead: 2
};

/**
 * ColumnStore - Main class for columnar data storage
 */
export class ColumnStore {
    private columns: Map<number, ColumnData> = new Map();
    private schema: ColumnSchema[] = [];
    private _rowCount: number = 0;
    private config: ColumnStoreConfig;

    // Chunk management
    private chunks: Map<number, ChunkMeta> = new Map();
    private loadedChunks: Set<number> = new Set();

    // Edit overlay for pending changes
    private edits: Map<string, any> = new Map();
    private editStyles: Map<string, CellStyle> = new Map();

    constructor(config: Partial<ColumnStoreConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialize schema from column definitions
     */
    setSchema(columns: ColumnSchema[]): void {
        this.schema = columns;
        this.columns.clear();

        columns.forEach((col, index) => {
            this.columns.set(index, {
                schema: col,
                styles: new Map()
            });
        });
    }

    /**
     * Get schema
     */
    getSchema(): ColumnSchema[] {
        return this.schema;
    }

    /**
     * Get column count
     */
    get colCount(): number {
        return this.schema.length;
    }

    /**
     * Get row count
     */
    get rowCount(): number {
        return this._rowCount;
    }

    /**
     * Set row count (for virtualized loading)
     */
    setRowCount(count: number): void {
        this._rowCount = count;
    }

    /**
     * Load a chunk of data into the store
     */
    loadChunk(chunkId: number, rows: Record<string, any>[]): void {
        const startRow = chunkId * this.config.chunkSize;

        rows.forEach((row, rowOffset) => {
            const absoluteRow = startRow + rowOffset;

            this.schema.forEach((col, colIndex) => {
                const value = row[col.name];
                this.setValueInternal(absoluteRow, colIndex, value, false);
            });
        });

        this.loadedChunks.add(chunkId);
        this.chunks.set(chunkId, {
            id: chunkId,
            startRow,
            endRow: startRow + rows.length - 1,
            loaded: true,
            lastAccess: Date.now()
        });

        // Update row count if necessary
        const maxRow = startRow + rows.length;
        if (maxRow > this._rowCount) {
            this._rowCount = maxRow;
        }

        // Evict old chunks if over limit
        this.evictOldChunks();
    }

    /**
     * Internal value setter (no edit tracking)
     */
    private setValueInternal(row: number, col: number, value: any, isEdit: boolean): void {
        const column = this.columns.get(col);
        if (!column) return;

        if (isEdit) {
            // Store in edit overlay
            const key = `${row},${col}`;
            this.edits.set(key, value);
            return;
        }

        // Initialize storage if needed
        const schema = column.schema;

        if (schema.type === 'number' && !column.numericData) {
            // Allocate TypedArray for numeric columns
            const size = Math.max(this._rowCount, row + 1, this.config.chunkSize);
            column.numericData = new Float64Array(size);
            column.nullBitmap = new Uint8Array(Math.ceil(size / 8));
        } else if (schema.type === 'boolean' && !column.booleanData) {
            const size = Math.max(this._rowCount, row + 1, this.config.chunkSize);
            column.booleanData = new Uint8Array(size);
            column.nullBitmap = new Uint8Array(Math.ceil(size / 8));
        } else if (!column.stringData) {
            // Default to string storage
            column.stringData = [];
        }

        // Store value
        if (value === null || value === undefined) {
            const byteIndex = Math.floor(row / 8);
            const bitIndex = row % 8;
            if (column.nullBitmap && column.nullBitmap[byteIndex] !== undefined) {
                column.nullBitmap[byteIndex]! |= (1 << bitIndex);
            }
        } else if (schema.type === 'number' && column.numericData) {
            // Expand array if needed
            if (row >= column.numericData.length) {
                const newData = new Float64Array(Math.max(row + 1, column.numericData.length * 2));
                newData.set(column.numericData);
                column.numericData = newData;

                if (column.nullBitmap) {
                    const newBitmap = new Uint8Array(Math.ceil(newData.length / 8));
                    newBitmap.set(column.nullBitmap);
                    column.nullBitmap = newBitmap;
                }
            }
            column.numericData[row] = Number(value);
        } else if (schema.type === 'boolean' && column.booleanData) {
            if (row >= column.booleanData.length) {
                const newData = new Uint8Array(Math.max(row + 1, column.booleanData.length * 2));
                newData.set(column.booleanData);
                column.booleanData = newData;
            }
            column.booleanData[row] = value ? 1 : 0;
        } else {
            // String storage
            if (!column.stringData) column.stringData = [];
            column.stringData[row] = String(value ?? '');
        }
    }

    /**
     * Set a cell value (creates an edit record)
     */
    setValue(row: number, col: number, value: any): void {
        this.setValueInternal(row, col, value, true);
    }

    /**
     * Get a cell value (checks edit overlay first)
     */
    getValue(row: number, col: number): any {
        const key = `${row},${col}`;

        // Check edit overlay first
        if (this.edits.has(key)) {
            return this.edits.get(key);
        }

        const column = this.columns.get(col);
        if (!column) return null;

        // Check null bitmap
        if (column.nullBitmap) {
            const byteIndex = Math.floor(row / 8);
            const bitIndex = row % 8;
            const byteVal = column.nullBitmap[byteIndex];
            if (byteVal !== undefined && (byteVal & (1 << bitIndex))) {
                return null;
            }
        }

        // Get from typed storage
        if (column.numericData && row < column.numericData.length) {
            return column.numericData[row];
        }
        if (column.booleanData && row < column.booleanData.length) {
            return column.booleanData[row] === 1;
        }
        if (column.stringData && row < column.stringData.length) {
            return column.stringData[row];
        }

        return null;
    }

    /**
     * Get a range of values for a column (efficient for rendering)
     */
    getColumnRange(col: number, startRow: number, endRow: number): any[] {
        const result: any[] = [];
        const column = this.columns.get(col);

        if (!column) {
            return new Array(endRow - startRow + 1).fill(null);
        }

        for (let row = startRow; row <= endRow; row++) {
            result.push(this.getValue(row, col));
        }

        return result;
    }

    /**
     * Get a row as an object
     */
    getRow(row: number): Record<string, any> {
        const result: Record<string, any> = {};

        this.schema.forEach((col, colIndex) => {
            result[col.name] = this.getValue(row, colIndex);
        });

        return result;
    }

    /**
     * Get multiple rows (efficient batch access)
     */
    getRows(startRow: number, endRow: number): Record<string, any>[] {
        const results: Record<string, any>[] = [];

        for (let row = startRow; row <= endRow; row++) {
            results.push(this.getRow(row));
        }

        return results;
    }

    /**
     * Set cell style
     */
    setStyle(row: number, col: number, style: CellStyle): void {
        const key = `${row},${col}`;
        const existing = this.editStyles.get(key) || {};
        this.editStyles.set(key, { ...existing, ...style });
    }

    /**
     * Get cell style
     */
    getStyle(row: number, col: number): CellStyle | undefined {
        const key = `${row},${col}`;

        // Check edit overlay first
        if (this.editStyles.has(key)) {
            return this.editStyles.get(key);
        }

        // Check column storage
        const column = this.columns.get(col);
        return column?.styles?.get(row);
    }

    /**
     * Get all pending edits
     */
    getPendingEdits(): Map<string, any> {
        return new Map(this.edits);
    }

    /**
     * Get modified rows (rows with edits)
     */
    getModifiedRows(): Set<number> {
        const rows = new Set<number>();

        for (const key of this.edits.keys()) {
            const parts = key.split(',');
            const rowStr = parts[0];
            if (rowStr !== undefined) {
                const row = parseInt(rowStr);
                if (!isNaN(row)) rows.add(row);
            }
        }

        return rows;
    }

    /**
     * Clear all pending edits (call after successful save)
     */
    clearEdits(): void {
        this.edits.clear();
        this.editStyles.clear();
    }

    /**
     * Commit edits to main storage
     */
    commitEdits(): void {
        for (const [key, value] of this.edits) {
            const parts = key.split(',');
            const rowStr = parts[0];
            const colStr = parts[1];
            if (rowStr !== undefined && colStr !== undefined) {
                const row = parseInt(rowStr);
                const col = parseInt(colStr);
                if (!isNaN(row) && !isNaN(col)) {
                    this.setValueInternal(row, col, value, false);
                }
            }
        }

        // Commit styles
        for (const [key, style] of this.editStyles) {
            const parts = key.split(',');
            const rowStr = parts[0];
            const colStr = parts[1];
            if (rowStr !== undefined && colStr !== undefined) {
                const row = parseInt(rowStr);
                const col = parseInt(colStr);
                if (!isNaN(row) && !isNaN(col)) {
                    const column = this.columns.get(col);
                    if (column?.styles) {
                        column.styles.set(row, style);
                    }
                }
            }
        }

        this.clearEdits();
    }

    /**
     * Check if a chunk is loaded
     */
    isChunkLoaded(chunkId: number): boolean {
        return this.loadedChunks.has(chunkId);
    }

    /**
     * Get chunk ID for a row
     */
    getChunkId(row: number): number {
        return Math.floor(row / this.config.chunkSize);
    }

    /**
     * Evict least recently used chunks when over limit
     */
    private evictOldChunks(): void {
        if (this.loadedChunks.size <= this.config.maxCachedChunks) {
            return;
        }

        // Sort chunks by last access time
        const chunkArray = Array.from(this.chunks.values())
            .filter(c => c.loaded)
            .sort((a, b) => a.lastAccess - b.lastAccess);

        // Evict oldest chunks
        const toEvict = this.loadedChunks.size - this.config.maxCachedChunks;
        for (let i = 0; i < toEvict && i < chunkArray.length; i++) {
            const chunk = chunkArray[i];
            if (chunk) {
                this.evictChunk(chunk.id);
            }
        }
    }

    /**
     * Evict a specific chunk from memory
     */
    private evictChunk(chunkId: number): void {
        const chunk = this.chunks.get(chunkId);
        if (!chunk) return;

        // Clear data for this chunk's rows
        const startRow = chunk.startRow;
        const endRow = chunk.endRow;

        for (const [_, column] of this.columns) {
            if (column.stringData) {
                for (let row = startRow; row <= endRow; row++) {
                    if (row < column.stringData.length) {
                        column.stringData[row] = '';
                    }
                }
            }
            // Note: We don't clear TypedArrays as they're more memory efficient
            // and clearing them would require tracking which indices belong to which chunk
        }

        chunk.loaded = false;
        this.loadedChunks.delete(chunkId);
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.columns.clear();
        this.chunks.clear();
        this.loadedChunks.clear();
        this.edits.clear();
        this.editStyles.clear();
        this._rowCount = 0;
    }

    /**
     * Get memory usage estimate in bytes
     */
    getMemoryUsage(): number {
        let bytes = 0;

        for (const [_, column] of this.columns) {
            if (column.numericData) {
                bytes += column.numericData.byteLength;
            }
            if (column.booleanData) {
                bytes += column.booleanData.byteLength;
            }
            if (column.nullBitmap) {
                bytes += column.nullBitmap.byteLength;
            }
            if (column.stringData) {
                // Rough estimate: 2 bytes per character + overhead
                bytes += column.stringData.reduce((sum, s) => sum + (s?.length || 0) * 2 + 50, 0);
            }
        }

        return bytes;
    }

    /**
     * Convert CellData format (for compatibility with existing Engine)
     */
    getCellData(row: number, col: number): CellData | null {
        const value = this.getValue(row, col);
        const style = this.getStyle(row, col);

        if (value === null && !style) {
            return null;
        }

        const type = typeof value === 'number'
            ? CellTypeEnum.NUMBER
            : CellTypeEnum.TEXT;

        return {
            rawInput: String(value ?? ''),
            value,
            type,
            style
        };
    }
}
