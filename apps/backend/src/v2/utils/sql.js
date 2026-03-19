const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function quoteIdentifier(identifier) {
    if (!SAFE_IDENTIFIER.test(identifier)) {
        throw new Error(`Unsafe identifier: ${identifier}`);
    }
    return `"${identifier}"`;
}

export function toSqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return `'${String(value).replace(/'/g, "''")}'`;
}

export function isNumericValue(value) {
    return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)));
}
