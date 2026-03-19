function isEmpty(value) {
    return value === null || value === undefined || value === '';
}

function looksLikeNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^-?\d+(?:\.\d+)?$/.test(trimmed.replace(/,/g, ''));
}

function looksLikeDate(value) {
    if (value instanceof Date) return true;
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
}

function normalizeDate(value) {
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    const trimmed = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return trimmed;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
}

function inferColumnType(values) {
    const nonEmpty = values.filter((value) => !isEmpty(value));
    if (nonEmpty.length === 0) return 'VARCHAR';
    if (nonEmpty.every(looksLikeNumber)) {
        return nonEmpty.some((value) => String(value).includes('.')) ? 'DOUBLE' : 'BIGINT';
    }
    if (nonEmpty.every(looksLikeDate)) {
        return 'DATE';
    }
    return 'VARCHAR';
}

function toSqlLiteral(value, columnType) {
    if (isEmpty(value)) return 'NULL';
    if (columnType === 'DATE') {
        return `DATE '${normalizeDate(value)}'`;
    }
    if (columnType === 'DOUBLE' || columnType === 'BIGINT') {
        return String(value).replace(/,/g, '');
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

export class StructuredDuckDBImportService {
    static inferSchema(rows) {
        const columns = new Map();

        for (const row of rows) {
            for (const [key, value] of Object.entries(row)) {
                if (!columns.has(key)) columns.set(key, []);
                columns.get(key).push(value);
            }
        }

        return Array.from(columns.entries()).map(([name, values]) => ({
            name,
            type: inferColumnType(values)
        }));
    }

    static async importTable(adapter, tableName, rows, options = {}) {
        const { temporary = false, replace = false } = options;
        const schema = StructuredDuckDBImportService.inferSchema(rows);
        const columnsSql = schema.map((column) => `"${column.name}" ${column.type}`).join(', ');
        if (replace) {
            await adapter.execute(`DROP TABLE IF EXISTS "${tableName}"`);
        }
        await adapter.execute(`CREATE ${temporary ? 'TEMP ' : ''}TABLE "${tableName}" (${columnsSql})`);

        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            for (const row of batch) {
                const keys = schema.map((column) => column.name);
                const values = schema.map((column) => toSqlLiteral(row[column.name], column.type));
                const keysSql = keys.map((key) => `"${key}"`).join(', ');
                const valuesSql = values.join(', ');
                await adapter.execute(`INSERT INTO "${tableName}" (${keysSql}) VALUES (${valuesSql})`);
            }
        }

        return schema;
    }
}
