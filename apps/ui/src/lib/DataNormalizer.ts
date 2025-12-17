/**
 * Data Normalization Layer
 * 
 * Normalizes data from any source (SQL, NoSQL, Excel, CSV) into a common format
 * for the universal data editor. Handles smart header detection and schema inference.
 */

export type SchemaMode = 'named-headers' | 'column-letters';

export interface NormalizedColumn {
    name: string;        // Actual name (e.g., "Name") or letter (e.g., "A")
    displayName: string; // What to show in UI
    index: number;       // Column index (0-based)
}

export interface NormalizedData {
    rows: Array<Record<string, any>>;
    columns: NormalizedColumn[];
    schemaMode: SchemaMode;
    metadata: {
        source: string;
        provider: string;
        hasHeaders: boolean;
        originalHeaders?: string[]; // Original header values if detected
    };
}

export class DataNormalizer {
    /**
     * Detect if the first row contains headers
     * 
     * Algorithm:
     * 1. If first row is all strings and second row has different types → headers
     * 2. If first row values look like column names (no special chars, reasonable length) → headers
     * 3. If data is all same type → no headers (use column letters)
     */
    static detectHeaders(rows: Array<Record<string, any>>): boolean {
        if (rows.length === 0) return false;
        if (rows.length === 1) return false; // Can't determine with single row

        const firstRow = rows[0];
        const secondRow = rows[1];

        // Get all values from first row
        const firstRowValues = Object.values(firstRow);
        const secondRowValues = Object.values(secondRow);

        // Check 1: Are all first row values strings?
        const allStrings = firstRowValues.every(val => typeof val === 'string');

        if (!allStrings) {
            // If first row has numbers/dates, likely not headers
            return false;
        }

        // Check 2: Do second row values have different types than first?
        let hasDifferentTypes = false;
        for (let i = 0; i < Math.min(firstRowValues.length, secondRowValues.length); i++) {
            const firstType = typeof firstRowValues[i];
            const secondType = typeof secondRowValues[i];

            if (firstType !== secondType) {
                hasDifferentTypes = true;
                break;
            }
        }

        if (hasDifferentTypes) {
            return true; // First row is strings, second row has different types → headers
        }

        // Check 3: Do first row values look like column names?
        const looksLikeHeaders = firstRowValues.every(val => {
            if (typeof val !== 'string') return false;

            const str = val.trim();

            // Empty strings are not headers
            if (str.length === 0) return false;

            // Very long strings (>50 chars) are probably data, not headers
            if (str.length > 50) return false;

            // Check if it looks like a column name (letters, numbers, spaces, underscores)
            // Allow some special chars but not too many
            const specialCharCount = (str.match(/[^a-zA-Z0-9\s_-]/g) || []).length;
            if (specialCharCount > 2) return false;

            return true;
        });

        return looksLikeHeaders;
    }

    /**
     * Convert column index to Excel-style letter (0→A, 25→Z, 26→AA)
     */
    static colIndexToLetter(index: number): string {
        let label = '';
        let i = index;
        while (i >= 0) {
            label = String.fromCharCode(65 + (i % 26)) + label;
            i = Math.floor(i / 26) - 1;
        }
        return label;
    }

    /**
     * Normalize data from any provider into common format
     */
    static normalize(
        data: Array<Record<string, any>>,
        provider: string,
        source: string
    ): NormalizedData {
        if (data.length === 0) {
            return {
                rows: [],
                columns: [],
                schemaMode: 'column-letters',
                metadata: {
                    source,
                    provider,
                    hasHeaders: false
                }
            };
        }

        // Detect if first row contains headers
        const hasHeaders = this.detectHeaders(data);

        let columns: NormalizedColumn[];
        let rows: Array<Record<string, any>>;
        let schemaMode: SchemaMode;
        let originalHeaders: string[] | undefined;

        if (hasHeaders) {
            // Use first row as headers
            const firstRow = data[0];
            const headerNames = Object.values(firstRow).map(v => String(v));
            originalHeaders = headerNames;

            columns = headerNames.map((name, index) => ({
                name,
                displayName: name,
                index
            }));

            // Data starts from second row
            rows = data.slice(1);
            schemaMode = 'named-headers';
        } else {
            // No headers detected - use column letters
            const firstRow = data[0];
            const columnCount = Object.keys(firstRow).length;

            columns = Array.from({ length: columnCount }, (_, index) => {
                const letter = this.colIndexToLetter(index);
                return {
                    name: letter,
                    displayName: letter,
                    index
                };
            });

            // All rows are data
            rows = data;
            schemaMode = 'column-letters';
        }

        return {
            rows,
            columns,
            schemaMode,
            metadata: {
                source,
                provider,
                hasHeaders,
                originalHeaders
            }
        };
    }

    /**
     * Denormalize data back to provider format
     * Converts from editor format back to database format
     */
    static denormalize(
        normalizedData: NormalizedData
    ): Array<Record<string, any>> {
        const { rows, columns, schemaMode, metadata } = normalizedData;

        if (schemaMode === 'named-headers' && metadata.hasHeaders) {
            // Include headers as first row
            const headerRow: Record<string, any> = {};
            columns.forEach(col => {
                headerRow[col.name] = col.displayName;
            });

            return [headerRow, ...rows];
        } else {
            // No headers - just return data
            return rows;
        }
    }

    /**
     * Remap data from one column naming scheme to another
     * Useful when converting between providers
     */
    static remapColumns(
        data: Array<Record<string, any>>,
        fromColumns: string[],
        toColumns: string[]
    ): Array<Record<string, any>> {
        if (fromColumns.length !== toColumns.length) {
            throw new Error('Column count mismatch in remapping');
        }

        return data.map(row => {
            const newRow: Record<string, any> = {};
            fromColumns.forEach((fromCol, index) => {
                const toCol = toColumns[index];
                newRow[toCol] = row[fromCol];
            });
            return newRow;
        });
    }
}
