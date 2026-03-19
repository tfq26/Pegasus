import { quoteIdentifier, toSqlLiteral } from '../utils/sql.js';

const ALLOWED_AGGREGATIONS = new Set(['count', 'sum', 'avg', 'min', 'max']);
const ALLOWED_OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=', 'contains']);

function findTable(catalog, tableName) {
    return catalog.tables.find((table) => table.name === tableName);
}

function ensureColumn(table, columnName) {
    if (columnName === '*') return '*';
    const exists = table.columns.some((column) => column.name === columnName);
    if (!exists) {
        throw new Error(`Unknown column "${columnName}" for table "${table.name}"`);
    }
    return quoteIdentifier(columnName);
}

function buildMetric(table, metric) {
    const aggregation = String(metric.aggregation || '').toLowerCase();
    if (!ALLOWED_AGGREGATIONS.has(aggregation)) {
        throw new Error(`Unsupported aggregation: ${metric.aggregation}`);
    }

    const target = aggregation === 'count' && (!metric.column || metric.column === '*')
        ? '*'
        : ensureColumn(table, metric.column);

    const alias = metric.alias || `${aggregation}_${metric.column || 'rows'}`;
    return `${aggregation.toUpperCase()}(${target}) AS ${quoteIdentifier(alias)}`;
}

function buildFilter(table, filter) {
    if (!ALLOWED_OPERATORS.has(filter.operator)) {
        throw new Error(`Unsupported filter operator: ${filter.operator}`);
    }

    const column = ensureColumn(table, filter.column);
    if (filter.operator === 'contains') {
        return `${column} LIKE ${toSqlLiteral(`%${filter.value}%`)}`;
    }
    return `${column} ${filter.operator} ${toSqlLiteral(filter.value)}`;
}

export class SummaryQueryBuilder {
    build(plan, catalog) {
        const table = findTable(catalog, plan.table);
        if (!table) {
            throw new Error(`Unknown table "${plan.table}"`);
        }

        const dimensions = (plan.dimensions || []).map((columnName) => {
            ensureColumn(table, columnName);
            return columnName;
        });

        const metrics = (plan.metrics && plan.metrics.length > 0)
            ? plan.metrics
            : [{ aggregation: 'count', column: '*', alias: 'row_count' }];

        const selectParts = [
            ...dimensions.map((columnName) => `${quoteIdentifier(columnName)} AS ${quoteIdentifier(columnName)}`),
            ...metrics.map((metric) => buildMetric(table, metric))
        ];

        const whereParts = (plan.filters || []).map((filter) => buildFilter(table, filter));
        const groupByParts = dimensions.map((columnName) => quoteIdentifier(columnName));
        const orderByParts = (plan.orderBy || [])
            .filter((entry) => entry?.column)
            .map((entry) => `${quoteIdentifier(entry.column)} ${String(entry.direction || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`);

        const limit = Number.isInteger(plan.limit) ? Math.min(Math.max(plan.limit, 1), 100) : 25;

        const segments = [
            `SELECT ${selectParts.join(', ')}`,
            `FROM ${quoteIdentifier(table.name)}`
        ];

        if (whereParts.length > 0) segments.push(`WHERE ${whereParts.join(' AND ')}`);
        if (groupByParts.length > 0) segments.push(`GROUP BY ${groupByParts.join(', ')}`);
        if (orderByParts.length > 0) segments.push(`ORDER BY ${orderByParts.join(', ')}`);
        segments.push(`LIMIT ${limit}`);

        return segments.join('\n');
    }
}
