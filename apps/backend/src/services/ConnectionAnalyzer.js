import { SchemaTranslator } from "./SchemaTranslator.js";

/**
 * Service to analyze a database connection and produce an AI-friendly context.
 * It handles:
 * 1. Listing tables
 * 2. Cleaning table names (removing UUIDs from DuckDB/SQLite uploads)
 * 3. Fetching column schemas
 * 4. Sampling data
 * 5. Normalizing names for AI (using SchemaTranslator)
 */
export class ConnectionAnalyzer {

    /**
     * Analyze the adapter's connection and return a normalized schema context.
     * @param {object} adapter - The database adapter instance
     * @param {string} provider - The provider name (duckdb, postgres, etc)
     * @param {string} activeTable - Optional table to focus on (fetches samples for this one)
     * @returns {Promise<object>} { schema, mappings, translator }
     */
    static async analyze(adapter, provider, activeTable = null) {
        const translator = new SchemaTranslator();

        // Output structure
        const normalizedSchema = {
            tables: [],
            detailedSchema: {},
            sampleValues: {},
            mappings: {} // Will store the final mappings
        };

        try {
            // 1. Fetch and Normalize Table Names
            const allTables = await adapter.listCollections();

            // Map: RealTableName -> NormalizedFriendlyName
            const tableMap = new Map();

            console.log(`[ConnectionAnalyzer] Raw tables found:`, allTables);

            for (const realName of allTables) {
                let friendlyName = realName;

                // Special handling for DuckDB/File-uploads (remove UUID prefixes/suffixes)
                if (provider === 'duckdb' || provider === 'sqlite') {
                    // Match UUID patterns (with hyphens or underscores)
                    const uuidRegex = /[a-f0-9]{8}[-_][a-f0-9]{4}[-_][a-f0-9]{4}[-_][a-f0-9]{4}[-_][a-f0-9]{12}|[a-f0-9]{32}/gi;

                    friendlyName = realName.replace(uuidRegex, '').replace(/^_+|_+$/g, '').replace(/_+/g, '_');

                    if (friendlyName !== realName) {
                        console.log(`[ConnectionAnalyzer] Cleaned '${realName}' -> '${friendlyName}'`);
                    }
                }

                // Apply standard normalization (remove special chars, spaces -> underscores)
                const normalizedName = translator.normalizeIdentifier(friendlyName);

                // Store if different
                if (normalizedName !== realName) {
                    translator.tableMapping.set(normalizedName, realName);
                    translator.reverseTableMapping.set(realName, normalizedName);
                }

                tableMap.set(realName, normalizedName);
                normalizedSchema.tables.push(normalizedName);
            }

            // 2. Determine tables to fetch details for
            let tablesToFetch = [];
            if (activeTable && allTables.includes(activeTable)) {
                tablesToFetch = [activeTable];
            } else if (!activeTable && allTables.length > 0) {
                // If no active table, fetch first 10 tables to provide context
                // (Increased from 5 since we filter hidden tables often)
                tablesToFetch = allTables.slice(0, 10);
            }

            // 3. Fetch Detailed Schema & Samples
            if (typeof adapter.getOneTableSchema === 'function') {
                for (const realTableName of tablesToFetch) {
                    const normalizedTableName = tableMap.get(realTableName) || realTableName;

                    try {
                        const columns = await adapter.getOneTableSchema(realTableName);
                        const normalizedCols = [];

                        for (const col of columns) {
                            const originalColName = col.name;
                            const normalizedColName = translator.normalizeIdentifier(originalColName);

                            if (normalizedColName !== originalColName) {
                                translator.columnMapping.set(normalizedColName, originalColName);
                                translator.reverseMapping.set(originalColName, normalizedColName);
                            }

                            normalizedCols.push({
                                ...col,
                                name: normalizedColName,
                                originalName: originalColName
                            });
                        }

                        normalizedSchema.detailedSchema[normalizedTableName] = normalizedCols;

                        // 4. Fetch Samples
                        if (typeof adapter.sampleCollection === 'function') {
                            const samples = await adapter.sampleCollection(realTableName, 3);
                            if (samples && samples.length > 0) {
                                normalizedSchema.sampleValues[normalizedTableName] = {};
                                // Extract unique values per column for context
                                for (const col of normalizedCols) {
                                    const values = samples.map(row => row[col.originalName]).filter(v => v != null);
                                    const uniqueValues = [...new Set(values)].slice(0, 3);
                                    if (uniqueValues.length > 0) {
                                        normalizedSchema.sampleValues[normalizedTableName][col.name] = uniqueValues;
                                    }
                                }
                            }
                        }

                    } catch (err) {
                        console.warn(`[ConnectionAnalyzer] Failed to analyze table ${realTableName}:`, err.message);
                    }
                }
            }

            // 5. Attach Final Mappings to Schema
            normalizedSchema.mappings = {
                columns: Object.fromEntries(translator.columnMapping),
                tables: Object.fromEntries(translator.tableMapping)
            };

            return {
                normalizedSchema,
                translator
            };

        } catch (e) {
            console.error('[ConnectionAnalyzer] Analysis failed:', e);
            throw e;
        }
    }
}
