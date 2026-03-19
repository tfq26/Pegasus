import {
    detectRepeatedHeaderRow,
    firstMeaningfulColumn,
    isEmptyRow,
    looksLikeTotalRow,
    normalizeRows,
    normalizeText,
    nonEmptyEntries,
} from './utils.js';

function isNumericMarker(text) {
    return /^\d+$/.test(text);
}

function inferContextKey(value, index) {
    if (isNumericMarker(value)) return 'context_entity_id';
    return `context_label_${index}`;
}

export class StructuredReportStrategy {
    constructor() {
        this.name = 'structured_report';
    }

    score({ rows }) {
        const normalizedRows = normalizeRows(rows);
        if (normalizedRows.length === 0) return 0;

        const headers = Object.keys(normalizedRows[0] || {});
        const primaryColumn = firstMeaningfulColumn(headers, normalizedRows);
        const singletonRows = normalizedRows.filter((row) => {
            const entries = nonEmptyEntries(row);
            return entries.length === 1 && entries[0][0] === primaryColumn;
        }).length;
        const totalRows = normalizedRows.filter((row) => looksLikeTotalRow(row)).length;
        const repeatedHeaders = normalizedRows.filter((row) => detectRepeatedHeaderRow(row, headers)).length;

        const signal = (singletonRows + totalRows + repeatedHeaders) / Math.max(1, normalizedRows.length);
        return Math.max(0, Math.min(1, 0.35 + signal * 2.2));
    }

    clean({ rows, tableName }) {
        const normalizedRows = normalizeRows(rows);
        const headers = Object.keys(normalizedRows[0] || {});
        const primaryColumn = firstMeaningfulColumn(headers, normalizedRows);

        const warnings = [];
        const cleanedRows = [];
        const activeContext = {};
        let labelDepth = 0;
        let removedTotals = 0;
        let removedHeaders = 0;
        let removedEmpty = 0;
        let extractedContextRows = 0;
        let sawDataRows = false;

        for (const row of normalizedRows) {
            if (isEmptyRow(row)) {
                removedEmpty++;
                continue;
            }

            if (detectRepeatedHeaderRow(row, headers)) {
                removedHeaders++;
                continue;
            }

            if (looksLikeTotalRow(row)) {
                removedTotals++;
                continue;
            }

            const entries = nonEmptyEntries(row);
            const firstValue = normalizeText(row[primaryColumn]);
            const isSingletonContext = entries.length === 1 && entries[0][0] === primaryColumn;

            if (isSingletonContext) {
                extractedContextRows++;
                if (isNumericMarker(firstValue)) {
                    activeContext.context_entity_id = Number(firstValue);
                    labelDepth = 0;
                    sawDataRows = false;
                    delete activeContext.context_label_1;
                    delete activeContext.context_label_2;
                    delete activeContext.context_label_3;
                } else {
                    if (!activeContext.context_label_1) {
                        labelDepth = 1;
                    } else if (!activeContext.context_label_2) {
                        labelDepth = 2;
                    } else if (sawDataRows) {
                        labelDepth = 2;
                    } else {
                        labelDepth = Math.min(labelDepth + 1, 3);
                    }
                    activeContext[inferContextKey(firstValue, labelDepth)] = firstValue;
                    for (let i = labelDepth + 1; i <= 3; i++) {
                        delete activeContext[`context_label_${i}`];
                    }
                    sawDataRows = false;
                }
                continue;
            }

            if (entries.length < Math.max(2, Math.ceil(headers.length * 0.25))) {
                continue;
            }

            cleanedRows.push({
                ...row,
                ...activeContext
            });
            sawDataRows = true;
        }

        if (removedEmpty > 0) warnings.push(`Removed ${removedEmpty} empty rows`);
        if (removedHeaders > 0) warnings.push(`Removed ${removedHeaders} repeated header rows`);
        if (removedTotals > 0) warnings.push(`Removed ${removedTotals} total/subtotal rows`);
        if (extractedContextRows > 0) warnings.push(`Extracted ${extractedContextRows} context rows into context columns`);

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
                        columns: Object.keys(cleanedRows[0] || normalizedRows[0] || {}).length,
                        contextColumns: Object.keys(cleanedRows[0] || {}).filter((key) => key.startsWith('context_'))
                    }
                }
            }]
        };
    }
}
