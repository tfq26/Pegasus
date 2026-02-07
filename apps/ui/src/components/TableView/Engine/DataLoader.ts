import type { CellPosition, CellData } from './types';
import { CellType } from './types';

/**
 * Table data structure returned by DataLoader
 */
export interface TableData {
    headers: string[];
    rows: Record<string, any>[];
    totalCount?: number;
}

/**
 * Progress callback for chunked operations
 */
export interface ProgressCallback {
    (progress: { current: number; total: number; phase: string }): void;
}

/**
 * Interface for Engine-like objects that DataLoader can populate
 */
export interface IEngineWritable {
    columnNames: string[];
    setValue(pos: CellPosition, value: string, silent?: boolean): Promise<void>;
    setSource(tableName: string, connection: any, columns: string[], provider?: string): void;
    setOriginalData(data: Record<string, any>[]): void;
    beginBatch(): void;
    endBatch(): void;
    clear(): void;
}

/**
 * DataLoader - Handles data import/export operations
 * 
 * Responsibilities:
 * - Fetch table schema and data from backend API
 * - Load data into Engine with proper header deduplication
 * - Handle chunked loading for large datasets
 * - Consolidate duplicate loading logic from Workspace.vue
 */
export class DataLoader {
    private static baseUrl = import.meta.env?.VITE_QUERY_API_URL || '';

    /**
     * Fetch table schema from backend
     */
    static async fetchSchema(
        tableName: string,
        connection: any,
        provider: string
    ): Promise<{ columns: { name: string; type: string }[] }> {
        const response = await fetch(`${this.baseUrl}/api/table/${tableName}/schema`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ connection, provider })
        });

        const body = await response.json();
        if (!response.ok) {
            throw new Error(body.error || 'Failed to load schema');
        }

        return { columns: body.columns || [] };
    }

    /**
     * Fetch table data from backend
     */
    static async fetchData(
        tableName: string,
        connection: any,
        provider: string,
        options: { limit?: number; offset?: number } = {}
    ): Promise<{ rows: Record<string, any>[] }> {
        const { limit = 500, offset = 0 } = options;

        const response = await fetch(`${this.baseUrl}/api/table/${tableName}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ connection, provider, limit, offset })
        });

        const body = await response.json();
        if (!response.ok) {
            throw new Error(body.error || 'Failed to load data');
        }

        return { rows: body.rows || [] };
    }

    /**
     * Fetch complete table data (schema + rows)
     */
    static async fetchTableData(
        tableName: string,
        connection: any,
        provider: string
    ): Promise<TableData> {
        // Fetch schema and data in parallel
        const [schemaResult, dataResult] = await Promise.all([
            this.fetchSchema(tableName, connection, provider),
            this.fetchData(tableName, connection, provider)
        ]);

        // Filter out internal columns
        const headers = schemaResult.columns
            .map(c => c.name)
            .filter(n => n !== '__id' && n !== '_rowid_');

        return {
            headers,
            rows: dataResult.rows
        };
    }

    /**
     * Detect if the first row of data matches the headers (prevents duplication)
     * This happens when the data already includes a header row
     */
    static detectHeaderDuplication(headers: string[], firstRow: Record<string, any>): boolean {
        if (!firstRow || headers.length === 0) return false;

        return headers.every(h => {
            const val = firstRow[h];
            return val === h || val === String(h);
        });
    }

    /**
     * Load data into an Engine instance
     * Handles header deduplication and proper cell population
     */
    static async loadIntoEngine(
        engine: IEngineWritable,
        tableData: TableData,
        tableName: string,
        connection: any,
        provider: string
    ): Promise<void> {
        const { headers, rows } = tableData;

        // Clear any existing data to prevent duplication
        engine.clear();

        // Start batch mode to prevent multiple change notifications
        engine.beginBatch();

        try {
            // Detect if headers are duplicated in data
            let dataStartsAtRow = 1;
            let injectHeaders = true;

            if (rows.length > 0) {
                if (this.detectHeaderDuplication(headers, rows[0])) {
                    console.log('[DataLoader] Detected headers in data, preventing duplication');
                    dataStartsAtRow = 0;
                    injectHeaders = false;
                }
            }

            // Set headers (if not already in data)
            if (injectHeaders) {
                for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                    await engine.setValue({ row: 0, col: colIndex }, headers[colIndex], true);
                }
            }

            // Set data rows
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                    const header = headers[colIndex];
                    const value = row[header];
                    await engine.setValue(
                        { row: rowIndex + dataStartsAtRow, col: colIndex },
                        String(value ?? ''),
                        true
                    );
                }
            }
        } finally {
            engine.endBatch();
        }

        // Set source metadata
        engine.setSource(tableName, connection, headers, provider);
        engine.setOriginalData(rows);
    }

    /**
     * Load table data in chunks for large datasets
     * Uses progress callback to report loading status
     */
    static async loadChunked(
        tableName: string,
        connection: any,
        provider: string,
        onProgress?: ProgressCallback
    ): Promise<TableData> {
        const CHUNK_SIZE = 5000;

        // First, get schema and count
        const schema = await this.fetchSchema(tableName, connection, provider);
        const headers = schema.columns
            .map(c => c.name)
            .filter(n => n !== '__id' && n !== '_rowid_');

        // For now, load all data (chunked loading will be implemented with backend streaming endpoints)
        // This is a placeholder that will use the new /stream endpoints when available
        onProgress?.({ current: 0, total: 1, phase: 'Loading data...' });

        const dataResult = await this.fetchData(tableName, connection, provider, { limit: CHUNK_SIZE });

        onProgress?.({ current: 1, total: 1, phase: 'Complete' });

        return {
            headers,
            rows: dataResult.rows,
            totalCount: dataResult.rows.length
        };
    }

    /**
     * Convert row data to CellData format
     */
    static rowToCellData(value: any): CellData {
        const strValue = String(value ?? '');

        if (typeof value === 'number' || (!isNaN(Number(strValue)) && strValue.trim() !== '')) {
            return {
                rawInput: strValue,
                value: Number(strValue),
                type: CellType.NUMBER
            };
        }

        return {
            rawInput: strValue,
            value: strValue,
            type: CellType.TEXT
        };
    }
}
