
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
        const resolve = (col) => this.resolveIdentifier(col, context.schema);

        if (!resource) throw new Error("Intent missing 'resource' (table name).");

        // 1. SELECT Clause
        let selectParts = [];

        // Handle Group By / Aggregations (using resolved names)
        if (groupBy && groupBy.length > 0) {
            selectParts.push(...groupBy.map(g => this.quoteIdentifier(resolve(g))));
        }

        if (aggregations && aggregations.length > 0) {
            aggregations.forEach(agg => {
                if (!this.allowedAggregations.includes(agg.op)) throw new Error(`Unknown aggregation: ${agg.op}`);
                const col = agg.field === '*' ? '*' : this.quoteIdentifier(resolve(agg.field));
                const alias = agg.alias ? ` AS ${this.quoteIdentifier(agg.alias)}` : '';
                selectParts.push(`${agg.op.toUpperCase()}(${col})${alias}`);
            });
        }

        // ... (rest is similar but using resolve())

        // Default Select All
        if (selectParts.length === 0) {
            selectParts.push('*');
        }

        const selectSql = `SELECT ${selectParts.join(', ')}`;

        // 2. FROM Clause
        const fromSql = `FROM ${this.quoteIdentifier(resource)}`;

        // 3. WHERE Clause
        let whereSql = '';
        if (filters && filters.length > 0) {
            const conditions = filters.map(f => {
                const col = this.quoteIdentifier(resolve(f.field));
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
            groupBySql = `GROUP BY ${groupBy.map(g => this.quoteIdentifier(resolve(g))).join(', ')}`;
        }

        // 5. ORDER BY Clause
        let orderBySql = '';
        if (orderBy && orderBy.length > 0) {
            const orders = orderBy.map(o => {
                return `${this.quoteIdentifier(resolve(o.field))} ${o.direction === 'desc' ? 'DESC' : 'ASC'}`;
            });
            orderBySql = `ORDER BY ${orders.join(', ')}`;
        }

        // 6. LIMIT Clause
        let limitSql = '';
        if (limit) {
            limitSql = `LIMIT ${parseInt(limit, 10)}`;
        }

        return [selectSql, fromSql, whereSql, groupBySql, orderBySql, limitSql]
            .filter(part => part.length > 0)
            .join(' ');
    }

    resolveIdentifier(name, schema) {
        if (!schema || !schema.mappings || !schema.mappings.columns) return name;
        // Check if the name exists in the mapping (normalized -> raw)
        // The mapping is usually { normalized: 'Raw Name' }
        return schema.mappings.columns[name] || name;
    }

    quoteIdentifier(id) {
        if (id === '*') return '*';
        // Basic double quote for Postgres/Standard SQL. 
        // Could be customized by dialect if needed (e.g. backticks for MySQL)
        return `"${id.replace(/"/g, '""')}"`;
    }

    formatValue(val) {
        if (typeof val === 'number') return val;
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (val === null) return 'NULL';
        // Escape single quotes for string
        return `'${String(val).replace(/'/g, "''")}'`;
    }
}
