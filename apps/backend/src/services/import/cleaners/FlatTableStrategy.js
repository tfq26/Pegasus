import {
    detectRepeatedHeaderRow,
    isEmptyRow,
    normalizeRows,
    normalizeText,
    nonEmptyEntries,
} from './utils.js';

export class FlatTableStrategy {
    constructor() {
        this.name = 'flat_table';
    }

    score({ rows }) {
        const normalizedRows = normalizeRows(rows);
        if (normalizedRows.length === 0) return 0;

        const headers = Object.keys(normalizedRows[0] || {});
        const singletonRows = normalizedRows.filter((row) => nonEmptyEntries(row).length <= 1).length;
        const repeatedHeaders = normalizedRows.filter((row) => detectRepeatedHeaderRow(row, headers)).length;
        const averageDensity = normalizedRows.reduce((sum, row) => sum + nonEmptyEntries(row).length, 0) / normalizedRows.length;

        let score = 0.6;
        if (headers.length >= 2) score += 0.1;
        if (averageDensity >= Math.max(2, headers.length / 3)) score += 0.15;
        score -= Math.min(0.2, singletonRows / Math.max(1, normalizedRows.length));
        score -= Math.min(0.15, repeatedHeaders / Math.max(1, normalizedRows.length));
        return Math.max(0, Math.min(1, score));
    }

    clean({ rows, tableName }) {
        const normalizedRows = normalizeRows(rows);
        const headers = Object.keys(normalizedRows[0] || {});
        const warnings = [];
        let droppedEmptyRows = 0;
        let droppedRepeatedHeaders = 0;

        const cleanedRows = normalizedRows.filter((row) => {
            if (isEmptyRow(row)) {
                droppedEmptyRows++;
                return false;
            }
            if (detectRepeatedHeaderRow(row, headers)) {
                droppedRepeatedHeaders++;
                return false;
            }
            return true;
        }).map((row) => {
            const next = {};
            for (const [key, value] of Object.entries(row)) {
                next[key] = typeof value === 'string' ? normalizeText(value) : value;
            }
            return next;
        });

        if (droppedEmptyRows > 0) warnings.push(`Removed ${droppedEmptyRows} empty rows`);
        if (droppedRepeatedHeaders > 0) warnings.push(`Removed ${droppedRepeatedHeaders} repeated header rows`);

        return {
            tables: [{
                name: tableName,
                rows: cleanedRows,
                metadata: {
                    strategy: this.name,
                    warnings,
                    stats: {
                        inputRows: rows.length,
                        outputRows: cleanedRows.length,
                        columns: headers.length
                    }
                }
            }]
        };
    }
}
