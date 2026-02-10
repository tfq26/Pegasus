/**
 * Query Repair Service
 * Automatically fixes common SQL errors based on dialect.
 */
import { aiClient } from '../../ai/AIClient.js';

export class QueryRepair {
    // Common error patterns and their fixes
    static ERROR_PATTERNS = {
        // Case sensitivity issues
        'column.*not found': {
            type: 'column_not_found',
            fix: 'Check column name case sensitivity and use double quotes'
        },
        'relation.*does not exist': {
            type: 'table_not_found',
            fix: 'Check table name spelling and case'
        },
        // Cosmos DB specific
        'cross partition query': {
            type: 'cosmos_partition',
            fix: 'Add partition key to query or enable cross-partition queries'
        },
        'order by.*not supported': {
            type: 'cosmos_orderby',
            fix: 'Remove ORDER BY when using GROUP BY with expressions in Cosmos DB'
        },
        // Type mismatches
        'cannot compare': {
            type: 'type_mismatch',
            fix: 'Use explicit CAST() for type conversions'
        },
        'invalid input syntax': {
            type: 'syntax_error',
            fix: 'Check value format matches column type'
        },
        // Aggregation errors
        'must appear in.*group by': {
            type: 'group_by_missing',
            fix: 'Add non-aggregated columns to GROUP BY clause'
        },
        // Null handling
        'null value in column': {
            type: 'null_constraint',
            fix: 'Use COALESCE() or filter out NULL values'
        }
    };

    /**
     * Attempt to repair a failed query
     * @param {string} query - The original query
     * @param {string} error - The error message
     * @param {string} dialect - SQL dialect
     * @param {object} schema - Available schema for reference
     * @returns {object} { fixed: boolean, newQuery: string, explanation: string }
     */
    static async repair(query, error, dialect, schema = {}) {
        const errorLower = error.toLowerCase();

        // 1. Try pattern-based quick fixes first
        const quickFix = this._tryQuickFix(query, errorLower, dialect, schema);
        if (quickFix.fixed) {
            console.log(`[QueryRepair] Quick fix applied: ${quickFix.explanation}`);
            return quickFix;
        }

        // 2. Fall back to AI-powered repair
        try {
            return await this._aiRepair(query, error, dialect, schema);
        } catch (aiError) {
            console.warn('[QueryRepair] AI repair failed:', aiError.message);
            return { fixed: false, newQuery: query, explanation: 'Could not auto-repair' };
        }
    }

    /**
     * Try pattern-based quick fixes
     * @private
     */
    static _tryQuickFix(query, error, dialect, schema) {
        // Fix 1: Column not found - try different casing
        if (error.includes('column') && error.includes('not found')) {
            const colMatch = error.match(/column[:\s]+["`']?(\w+)["`']?/i);
            if (colMatch) {
                const badCol = colMatch[1];

                // Find similar column in schema
                const tables = schema.tables || [];
                const detailed = schema.detailedSchema || {};

                for (const table of tables) {
                    const columns = detailed[table] || [];
                    for (const col of columns) {
                        const colName = col.name || col;
                        if (colName.toLowerCase() === badCol.toLowerCase() && colName !== badCol) {
                            const newQuery = query.replace(
                                new RegExp(`\\b${badCol}\\b`, 'g'),
                                `"${colName}"`
                            );
                            return {
                                fixed: true,
                                newQuery,
                                explanation: `Fixed column case: ${badCol} → "${colName}"`
                            };
                        }
                    }
                }
            }
        }

        // Fix 2: Cosmos DB ORDER BY with GROUP BY
        if (dialect === 'cosmosdb' && error.includes('order by')) {
            if (query.toLowerCase().includes('group by') && query.toLowerCase().includes('order by')) {
                const newQuery = query.replace(/\s+ORDER\s+BY\s+.+$/i, '');
                return {
                    fixed: true,
                    newQuery,
                    explanation: 'Removed ORDER BY (not supported with GROUP BY expressions in Cosmos DB)'
                };
            }
        }

        // Fix 3: Missing GROUP BY
        if (error.includes('must appear in') && error.includes('group by')) {
            const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
            if (selectMatch) {
                const columns = selectMatch[1].split(',').map(c => c.trim());
                const nonAggCols = columns.filter(c =>
                    !c.toLowerCase().includes('sum(') &&
                    !c.toLowerCase().includes('avg(') &&
                    !c.toLowerCase().includes('count(') &&
                    !c.toLowerCase().includes('max(') &&
                    !c.toLowerCase().includes('min(') &&
                    !c.includes(' as ')
                );

                if (nonAggCols.length > 0) {
                    const groupByClause = ` GROUP BY ${nonAggCols.join(', ')}`;
                    let newQuery = query;

                    if (query.toLowerCase().includes('group by')) {
                        // Append to existing GROUP BY
                        newQuery = query.replace(
                            /(GROUP\s+BY\s+)([^ORDER|LIMIT|;]+)/i,
                            `$1$2, ${nonAggCols.join(', ')}`
                        );
                    } else if (query.toLowerCase().includes('order by')) {
                        newQuery = query.replace(/(\s+ORDER\s+BY)/i, `${groupByClause}$1`);
                    } else {
                        newQuery = query + groupByClause;
                    }

                    return {
                        fixed: true,
                        newQuery,
                        explanation: `Added missing columns to GROUP BY: ${nonAggCols.join(', ')}`
                    };
                }
            }
        }

        // Fix 4: Type mismatch - wrap in CAST
        if (error.includes('cannot compare') || error.includes('type mismatch')) {
            // This is complex - defer to AI repair
        }

        return { fixed: false, newQuery: query, explanation: '' };
    }

    /**
     * Use AI to repair complex query errors
     * @private
     */
    static async _aiRepair(query, error, dialect, schema) {
        const schemaHint = schema.tables
            ? `Available tables: ${schema.tables.slice(0, 10).join(', ')}`
            : '';

        const prompt = `
A ${dialect.toUpperCase()} query failed with this error:
"${error}"

Original Query:
\`\`\`sql
${query}
\`\`\`

${schemaHint}

DIALECT-SPECIFIC RULES:
${this._getDialectRules(dialect)}

YOUR TASK:
1. Identify the root cause
2. Fix the query if possible
3. Return ONLY valid JSON:

{
    "fixed": true,
    "newQuery": "the corrected SQL query",
    "explanation": "brief explanation of the fix"
}

If you cannot fix it, return:
{
    "fixed": false,
    "newQuery": "",
    "explanation": "why it cannot be fixed"
}
`;

        const response = await aiClient.generateContent([
            { role: 'system', content: 'You are a SQL expert. Return only valid JSON with no markdown.' },
            { role: 'user', content: prompt }
        ], { json: true });

        let result;
        if (typeof response === 'string') {
            result = JSON.parse(response.replace(/```json\s*|\s*```/g, '').trim());
        } else if (response.text) {
            result = JSON.parse(response.text.replace(/```json\s*|\s*```/g, '').trim());
        } else {
            result = response;
        }

        return {
            fixed: !!result.fixed,
            newQuery: result.newQuery || query,
            explanation: result.explanation || 'AI-assisted repair'
        };
    }

    /**
     * Get dialect-specific repair rules
     * @private
     */
    static _getDialectRules(dialect) {
        const rules = {
            postgres: `
- Use double quotes for case-sensitive identifiers: "ColumnName"
- Use :: for type casting: value::integer
- ILIKE for case-insensitive matching`,
            duckdb: `
- Strongly typed - use explicit CAST()
- date_trunc() for date bucketing
- Double quotes for identifiers`,
            cosmosdb: `
- CRITICAL: Cannot use expressions in ORDER BY with GROUP BY
- Always alias root as 'c': SELECT c.column FROM c
- Use SUBSTRING for date extraction, not DATE_TRUNC`,
            mysql: `
- Use backticks for identifiers: \`column\`
- DATE_FORMAT for date formatting`,
            sqlite: `
- Use strftime() for date functions
- No native boolean type`
        };

        return rules[dialect] || rules.postgres;
    }

    /**
     * Execute query with automatic repair on failure
     * @param {object} adapter - Database adapter
     * @param {string} query - Query to execute
     * @param {string} dialect - SQL dialect
     * @param {object} schema - Schema for repair hints
     * @param {number} maxRetries - Maximum repair attempts
     */
    static async executeWithRepair(adapter, query, dialect, schema = {}, maxRetries = 2) {
        let currentQuery = query;
        let lastError = null;
        let lastRepair = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return {
                    success: true,
                    data: await adapter.query(currentQuery),
                    query: currentQuery,
                    repaired: attempt > 0,
                    explanation: lastRepair?.explanation || null
                };
            } catch (error) {
                lastError = error;
                console.log(`[QueryRepair] Attempt ${attempt + 1} failed:`, error.message);

                if (attempt < maxRetries) {
                    lastRepair = await this.repair(currentQuery, error.message, dialect, schema);
                    if (lastRepair.fixed) {
                        console.log(`[QueryRepair] Attempting fix: ${lastRepair.explanation}`);
                        currentQuery = lastRepair.newQuery;
                    } else {
                        break; // Can't repair, stop retrying
                    }
                }
            }
        }

        return {
            success: false,
            error: lastError?.message || 'Query failed',
            query: currentQuery,
            originalQuery: query
        };
    }
}
