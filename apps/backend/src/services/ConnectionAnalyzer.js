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
                    // Match UUID patterns (with hyphens or underscores) or long hexadecimal strings
                    const uuidRegex = /[a-f0-9]{8}[-_][a-f0-9]{4}[-_][a-f0-9]{4}[-_][a-f0-9]{4}[-_][a-f0-9]{12}|[a-f0-9]{32}|[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}/gi;

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

            // Find case-insensitive match for activeTable
            const matchedActiveTable = activeTable
                ? allTables.find(t => t.toLowerCase() === activeTable.toLowerCase())
                : null;

            if (activeTable && matchedActiveTable) {
                tablesToFetch = [matchedActiveTable];
            } else if (!activeTable && allTables.length > 0) {
                // If no active table, fetch first 50 tables to provide context
                tablesToFetch = allTables.slice(0, 50);
            }

            // 3. Fetch Detailed Schema & Samples
            if (typeof adapter.getOneTableSchema === 'function') {
                const analysisPromises = tablesToFetch.map(async (realTableName) => {
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
                            const samples = await adapter.sampleCollection(realTableName, 5); // Increased to 5
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

                                // Store raw head for AI to inspect structure (important for offset headers)
                                normalizedSchema.detailedSchema[normalizedTableName]._rawHead = samples;

                                // Run Header Detection Heuristic
                                const headerInfo = ConnectionAnalyzer.detectHeaderRow(samples);
                                normalizedSchema.detailedSchema[normalizedTableName]._headerInfo = headerInfo;
                            }
                        }

                    } catch (err) {
                        console.warn(`[ConnectionAnalyzer] Failed to analyze table ${realTableName}:`, err.message);
                    }
                });

                await Promise.all(analysisPromises);
            }

            // 5. Attach Final Mappings & Context Metadata
            normalizedSchema.mappings = {
                columns: Object.fromEntries(translator.columnMapping),
                tables: Object.fromEntries(translator.tableMapping)
            };

            normalizedSchema.contextMetadata = {
                provider,
                analyzedAt: new Date().toISOString()
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

    /**
     * Heuristic to detect the "real" header row in a sample set.
     * Looks for a row with the most non-null, unique string values.
     */
    static detectHeaderRow(samples) {
        if (!samples || samples.length === 0) return { offset: 0, confidence: 0 };

        let bestRow = 0;
        let maxScore = -1;

        samples.forEach((row, index) => {
            const values = Object.values(row);
            const nonNullStringValues = values.filter(v => typeof v === 'string' && v.trim().length > 0 && v.length < 100);
            const uniqueValues = new Set(nonNullStringValues);

            // Score: Density of strings + Uniqueness
            let score = uniqueValues.size;

            // Penalty for rows that look like data (contains numbers/dates)
            const containsNumbers = values.some(v => typeof v === 'number');
            if (containsNumbers && index > 0) score -= 5;

            // Penalty for mostly empty rows
            if (values.filter(v => v == null || v === '').length > (values.length / 2)) {
                score -= 10;
            }

            if (score > maxScore) {
                maxScore = score;
                bestRow = index;
            }
        });

        return {
            offset: bestRow,
            confidence: maxScore > 0 ? Math.min(maxScore / 10, 1.0) : 0
        };
    }
}
