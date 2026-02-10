/**
 * Data Profiler Service
 * Generates column statistics and cardinality insights for smarter AI decisions.
 */

export class DataProfiler {
    /**
     * Profile a table's columns with cardinality and distribution stats
     * @param {object} adapter - Database adapter instance
     * @param {string} tableName - Name of the table to profile
     * @param {Array} columns - Column definitions from schema
     * @param {string} dialect - SQL dialect (postgres, duckdb, etc.)
     * @returns {object} Column profiles with cardinality and suggestions
     */
    static async profile(adapter, tableName, columns, dialect = 'duckdb') {
        const profile = {};

        if (!columns || columns.length === 0) {
            return profile;
        }

        try {
            // Get total row count first
            const countResult = await adapter.query(`SELECT COUNT(*) as total FROM "${tableName}"`);
            const totalRows = countResult?.[0]?.total || 0;

            if (totalRows === 0) {
                return { _meta: { totalRows: 0, isEmpty: true } };
            }

            // Profile each column
            for (const col of columns.slice(0, 20)) { // Limit to 20 columns for performance
                const colName = col.originalName || col.name;
                const colType = (col.type || 'unknown').toLowerCase();

                try {
                    const stats = await this._getColumnStats(adapter, tableName, colName, colType, dialect);

                    profile[col.name] = {
                        type: colType,
                        cardinality: stats.cardinality,
                        totalRows,
                        cardinalityRatio: totalRows > 0 ? stats.cardinality / totalRows : 0,
                        nullRatio: totalRows > 0 ? stats.nullCount / totalRows : 0,

                        // Smart classifications
                        isHighCardinality: stats.cardinality > 50,
                        isLikelyCategory: stats.cardinality <= 20 && stats.cardinality > 1,
                        isLikelyId: stats.cardinality === totalRows && stats.cardinality > 10,
                        isLikelyBoolean: stats.cardinality <= 3,
                        isTimeColumn: this._isTimeColumn(colName, colType),
                        isNumeric: this._isNumericType(colType),

                        // Value range for numerics
                        range: stats.min !== undefined ? { min: stats.min, max: stats.max } : null,

                        // Sample values for categories
                        sampleValues: stats.sampleValues || [],

                        // Chart recommendations
                        chartRole: this._inferChartRole(col.name, colType, stats, totalRows)
                    };

                } catch (colError) {
                    console.warn(`[DataProfiler] Failed to profile column ${colName}:`, colError.message);
                    profile[col.name] = {
                        type: colType,
                        error: colError.message
                    };
                }
            }

            profile._meta = {
                totalRows,
                profiledAt: new Date().toISOString(),
                columnCount: columns.length
            };

            return profile;

        } catch (error) {
            console.error('[DataProfiler] Profile failed:', error);
            return { _meta: { error: error.message } };
        }
    }

    /**
     * Get column-level statistics
     * @private
     */
    static async _getColumnStats(adapter, tableName, colName, colType, dialect) {
        const isNumeric = this._isNumericType(colType);
        const escapedCol = `"${colName}"`;

        let query;

        if (dialect === 'cosmosdb') {
            // Cosmos DB has limited aggregation support
            query = `SELECT COUNT(1) as cardinality FROM (SELECT DISTINCT c.${colName} FROM c)`;
        } else {
            // Standard SQL dialects
            if (isNumeric) {
                query = `
                    SELECT 
                        COUNT(DISTINCT ${escapedCol}) as cardinality,
                        COUNT(*) - COUNT(${escapedCol}) as null_count,
                        MIN(${escapedCol}) as min_val,
                        MAX(${escapedCol}) as max_val
                    FROM "${tableName}"
                `;
            } else {
                query = `
                    SELECT 
                        COUNT(DISTINCT ${escapedCol}) as cardinality,
                        COUNT(*) - COUNT(${escapedCol}) as null_count
                    FROM "${tableName}"
                `;
            }
        }

        const result = await adapter.query(query);
        const row = result?.[0] || {};

        // Get sample values for categorical columns
        let sampleValues = [];
        if (!isNumeric && row.cardinality && row.cardinality <= 30) {
            try {
                const sampleQuery = `SELECT DISTINCT ${escapedCol} as val FROM "${tableName}" WHERE ${escapedCol} IS NOT NULL LIMIT 10`;
                const samples = await adapter.query(sampleQuery);
                sampleValues = samples.map(s => s.val).filter(v => v != null);
            } catch (e) {
                // Sampling failed, continue without samples
            }
        }

        return {
            cardinality: Number(row.cardinality) || 0,
            nullCount: Number(row.null_count) || 0,
            min: row.min_val,
            max: row.max_val,
            sampleValues
        };
    }

    /**
     * Check if column name/type suggests a time column
     * @private
     */
    static _isTimeColumn(name, type) {
        const timePatterns = /date|time|timestamp|created|updated|modified|year|month|day|quarter/i;
        const timeTypes = /date|time|timestamp|datetime/i;
        return timePatterns.test(name) || timeTypes.test(type);
    }

    /**
     * Check if type is numeric
     * @private
     */
    static _isNumericType(type) {
        return /int|float|decimal|numeric|double|real|number|money|currency/i.test(type);
    }

    /**
     * Infer the role this column should play in a chart
     * @private
     */
    static _inferChartRole(name, type, stats, totalRows) {
        // ID columns - never chart
        if (stats.cardinality === totalRows && stats.cardinality > 10) {
            return 'id'; // Not suitable for visualization
        }

        // Time columns - X-axis for line charts
        if (this._isTimeColumn(name, type)) {
            return 'x-axis-time';
        }

        // Low cardinality text - good for categories/grouping
        if (stats.cardinality <= 15 && !this._isNumericType(type)) {
            return 'x-axis-category';
        }

        // Numeric columns - Y-axis or metrics
        if (this._isNumericType(type)) {
            return 'y-axis-metric';
        }

        // High cardinality text - not suitable for charts
        if (stats.cardinality > 50) {
            return 'label-only'; // Can be used as labels but not for grouping
        }

        return 'unknown';
    }

    /**
     * Generate a prompt-friendly summary of the profile
     */
    static summarizeForPrompt(profile, tableName) {
        if (!profile || profile._meta?.isEmpty) {
            return `Table "${tableName}" is empty.`;
        }

        const lines = [`\nDATA PROFILE for "${tableName}" (${profile._meta?.totalRows || '?'} rows):`];

        for (const [colName, info] of Object.entries(profile)) {
            if (colName === '_meta') continue;
            if (info.error) continue;

            let desc = `- ${colName}: ${info.type}`;

            if (info.isLikelyId) {
                desc += ' [ID - unique per row]';
            } else if (info.isLikelyCategory) {
                const samples = info.sampleValues || [];
                desc += ` [Category - ${info.cardinality} values${samples.length > 0 ? ': ' + samples.slice(0, 5).join(', ') + (samples.length > 5 ? '...' : '') : ''}]`;
            } else if (info.isTimeColumn) {
                desc += ` [Time - ${info.chartRole}]`;
            } else if (info.isNumeric) {
                desc += ` [Numeric - range ${info.range?.min} to ${info.range?.max}]`;
            } else if (info.isHighCardinality) {
                desc += ` [High Cardinality (${info.cardinality}) - not for grouping]`;
            }

            // Add chart recommendation
            if (info.chartRole && info.chartRole !== 'unknown') {
                desc += ` → ${info.chartRole}`;
            }

            lines.push(desc);
        }

        return lines.join('\n');
    }
}
