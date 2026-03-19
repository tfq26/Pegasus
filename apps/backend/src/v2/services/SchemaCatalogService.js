import { isNumericValue } from '../utils/sql.js';

function normalizeColumnShape(column) {
    if (!column) return null;
    if (typeof column === 'string') {
        return { name: column, type: 'unknown' };
    }
    return {
        name: column.name || column.column_name,
        type: column.type || column.dataType || column.data_type || 'unknown'
    };
}

function scoreTable(tableName, prompt, tableHint) {
    const haystack = `${tableName} ${tableHint || ''}`.toLowerCase();
    const terms = String(prompt || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) + (tableHint && tableName === tableHint ? 5 : 0);
}

export class SchemaCatalogService {
    async describe(adapter, { prompt, tableHint, maxTables = 4, sampleRows = 3 } = {}) {
        const tables = await adapter.listCollections();
        if (!Array.isArray(tables) || tables.length === 0) {
            throw new Error('No tables were found for this connection');
        }

        const selectedTables = [...tables]
            .sort((a, b) => scoreTable(b, prompt, tableHint) - scoreTable(a, prompt, tableHint))
            .slice(0, maxTables);

        const hasGetSchema = typeof adapter.getSchema === 'function';
        const fullSchema = hasGetSchema ? await adapter.getSchema().catch(() => ({})) : {};

        const catalogTables = [];
        for (const tableName of selectedTables) {
            const schemaColumns = (fullSchema?.[tableName] || []).map(normalizeColumnShape).filter(Boolean);
            const sample = await adapter.sampleCollection(tableName, sampleRows).catch(() => []);
            const sampleColumns = Object.keys(sample[0] || {}).map((name) => ({ name, type: 'unknown' }));
            const columns = schemaColumns.length > 0 ? schemaColumns : sampleColumns;
            const numericColumns = columns
                .filter((column) => {
                    const type = String(column.type || '').toLowerCase();
                    if (/(int|decimal|numeric|double|float|real|number)/.test(type)) return true;
                    return sample.some((row) => isNumericValue(row?.[column.name]));
                })
                .map((column) => column.name);

            catalogTables.push({
                name: tableName,
                columns,
                numericColumns,
                sample
            });
        }

        return {
            tables: catalogTables,
            defaultTable: tableHint && selectedTables.includes(tableHint) ? tableHint : catalogTables[0]?.name || null
        };
    }
}
