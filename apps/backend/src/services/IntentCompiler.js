
export class IntentCompiler {
    constructor() {
        this.allowedOperations = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'like', 'in'];
        this.allowedAggregations = ['sum', 'count', 'avg', 'min', 'max'];
    }

    /**
     * Compiles a structured intent (or array of intents) into SQL.
     * @param {object|object[]} intent - The query intent object or array of objects.
     * @param {object|string} contextOrDialect - The context object (with schema/dialect) OR dialect string (legacy).
     * @returns {string|string[]} The generated SQL string (or array of strings).
     */
    compile(intent, contextOrDialect = 'postgres') {
        const context = typeof contextOrDialect === 'string' ? { dialect: contextOrDialect } : contextOrDialect;

        if (Array.isArray(intent)) {
            return intent.map(i => this.compileSingle(i, context));
        }
        return this.compileSingle(intent, context);
    }

    compileSingle(intent, context) {
        const { resource, filters, groupBy, aggregations, limit, orderBy } = intent;
        const dialect = context.dialect || 'postgres';

        // Helper to resolve normalized names -> Raw DB names
        const resolveCol = (col) => this.resolveIdentifier(col, context.schema, 'column');
        const resolveTable = (table) => this.resolveIdentifier(table, context.schema, 'table');

        if (!resource) throw new Error("Intent missing 'resource' (table name).");

        // 1. SELECT Clause
        let selectParts = [];

        // Handle Group By / Aggregations (using resolved names)
        if (groupBy && groupBy.length > 0) {
            selectParts.push(...groupBy.map(g => this.quoteIdentifier(resolveCol(g))));
        }

        if (aggregations && aggregations.length > 0) {
            aggregations.forEach(agg => {
                if (!this.allowedAggregations.includes(agg.op)) throw new Error(`Unknown aggregation: ${agg.op}`);
                const col = agg.field === '*' ? '*' : this.quoteIdentifier(resolveCol(agg.field));
                const alias = agg.alias ? ` AS ${this.quoteIdentifier(agg.alias)}` : '';
                selectParts.push(`${agg.op.toUpperCase()}(${col})${alias}`);
            });
        }

        // Default Select All
        if (selectParts.length === 0) {
            selectParts.push('*');
        }

        const selectSql = `SELECT ${selectParts.join(', ')}`;

        // 2. FROM Clause
        // Resolve table name using mappings
        const resolvedResource = resolveTable(resource);
        const fromSql = `FROM ${this.quoteIdentifier(resolvedResource)}`;

        // 3. WHERE Clause
        let whereSql = '';
        if (filters && filters.length > 0) {
            const conditions = filters.map(f => {
                const col = this.quoteIdentifier(resolveCol(f.field));
                const val = this.formatValue(f.value);

                switch (f.op) {
                    case 'eq': return `${col} = ${val}`;
                    case 'neq': return `${col} != ${val}`;
                    case 'gt': return `${col} > ${val}`;
                    case 'lt': return `${col} < ${val}`;
                    case 'gte': return `${col} >= ${val}`;
                    case 'lte': return `${col} <= ${val}`;
                    case 'contains':
                    case 'like': return `${col} LIKE '%${String(f.value).replace(/'/g, "''")}%'`;
                    case 'in': return `${col} IN (${Array.isArray(f.value) ? f.value.map(v => this.formatValue(v)).join(', ') : this.formatValue(f.value)})`;
                    default: throw new Error(`Unknown filter op: ${f.op}`);
                }
            });
            whereSql = `WHERE ${conditions.join(' AND ')}`;
        }

        // 4. GROUP BY Clause
        let groupBySql = '';
        if (groupBy && groupBy.length > 0) {
            groupBySql = `GROUP BY ${groupBy.map(g => this.quoteIdentifier(resolveCol(g))).join(', ')}`;
        }

        // 5. ORDER BY Clause
        let orderBySql = '';
        if (orderBy && orderBy.length > 0) {
            const orders = orderBy.map(o => {
                return `${this.quoteIdentifier(resolveCol(o.field))} ${o.direction === 'desc' ? 'DESC' : 'ASC'}`;
            });
            orderBySql = `ORDER BY ${orders.join(', ')}`;
        }

        // 6. LIMIT Clause
        const limitSql = limit ? `LIMIT ${limit}` : '';

        return [selectSql, fromSql, whereSql, groupBySql, orderBySql, limitSql]
            .filter(part => part.length > 0)
            .join(' ');
    }

    resolveIdentifier(id, context, type = 'table') {
        if (!id) return id;

        // Handle both full context or just schema object
        const schema = context?.schema || context;
        if (!schema || !schema.mappings) {
            return id;
        }

        const mappings = type === 'table' ? schema.mappings.tables : schema.mappings.columns;
        if (!mappings) {
            return id;
        }

        // 1. Precise Match
        if (mappings[id]) return mappings[id];

        // 2. Case-Insensitive Match
        const lowId = typeof id === 'string' ? id.toLowerCase() : id;
        if (mappings[lowId]) return mappings[lowId];

        // 3. Reverse mapping check if keys are normalized but AI provides raw
        // (Rare but handles cases where AI might "guess" the real table name)
        const entries = Object.entries(mappings);
        const matchByValue = entries.find(([k, v]) => v.toLowerCase() === lowId);
        if (matchByValue) return matchByValue[1];

        // 4. Slug-based fuzzy match (ignore underscores/special chars)
        if (typeof id === 'string') {
            const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/pct$|usd$|eur$|gbp$/g, '');
            const targetSlug = clean(id);

            for (const [key, value] of entries) {
                const keySlug = clean(key);
                const valueSlug = clean(value);

                if (keySlug === targetSlug || valueSlug === targetSlug) return value;

                // Partial matches (e.g. AI uses name with UUID, registry has cleaned name)
                if (targetSlug.includes(keySlug) && keySlug.length > 5) return value;
                if (keySlug.includes(targetSlug) && targetSlug.length > 5) return value;
            }
        }

        return id;
    }

    quoteIdentifier(id) {
        if (id === '*') return '*';
        if (id === null || id === undefined) {
            return 'NULL';
        }

        // Basic double quote for Postgres/Standard SQL.
        // Could be customized by dialect if needed (e.g. backticks for MySQL)
        const idStr = String(id);
        return `"${idStr.replace(/"/g, '""')}"`;
    }

    formatValue(val) {
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number' || typeof val === 'boolean') return val;
        return `'${String(val).replace(/'/g, "''")}'`;
    }
}
