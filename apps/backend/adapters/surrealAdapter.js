import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { db as globalDb } from "../db/surreal.js"
import { Surreal } from 'surrealdb';

export class SurrealAdapter extends DatabaseAdapter {
    constructor(connection) {
        super(connection);
        // Robust check: it's internal if it has an uploadId OR if it's missing both URL and Host
        this.isInternal = !!connection?.uploadId || (!connection?.url && !connection?.host);

        console.log(`[SurrealDB] Creating adapter. isInternal: ${this.isInternal}, uploadId: ${connection?.uploadId}, host: ${connection?.host}`);

        this.db = this.isInternal ? globalDb : new Surreal();
    }

    async connect() {
        if (this.isInternal) {
            console.log('[SurrealDB] Using managed internal connection');
            return;
        }

        // Connect to external SurrealDB instance
        const protocol = this.connection.protocol || 'ws'; // ws or http
        const host = this.connection.host || '127.0.0.1';
        const port = this.connection.port || 8000;
        const url = this.connection.url || `${protocol}://${host}:${port}/rpc`;

        console.log(`[SurrealDB] Connecting to external database at: ${url}`);

        try {
            await this.db.connect(url);

            const user = this.connection.username || this.connection.user || 'root';
            const pass = this.connection.password || 'root';

            await this.db.signin({ username: user, password: pass });

            if (this.connection.namespace && this.connection.database) {
                await this.db.use({
                    namespace: this.connection.namespace,
                    database: this.connection.database
                });
            }

            console.log(`[SurrealDB] Successfully connected`);
        } catch (e) {
            console.error(`[SurrealDB] Failed to connect:`, e);
            throw e;
        }
    }

    async query(query) {
        try {
            // Resolve table names (handle friendly display names -> internal data_uuid_name)
            const resolvedQuery = await this.resolveTableNames(query);

            // console.log(`[SurrealDB] Executing query: ${resolvedQuery}`);
            const result = await this.db.query(resolvedQuery);
            // console.log(`[SurrealDB] Raw result type: ${typeof result}`);
            // console.log(`[SurrealDB] Raw result stringified:`, JSON.stringify(result, null, 2));

            if (!Array.isArray(result)) {
                // console.log('[SurrealDB] Result is not an array');
                return result;
            }

            const firstRes = result[0];
            // console.log(`[SurrealDB] First response item type: ${typeof firstRes}`);
            // console.log(`[SurrealDB] First response item:`, JSON.stringify(firstRes, null, 2));

            // Check for error
            if (firstRes && firstRes.status === 'ERR') {
                throw new Error(firstRes.detail || firstRes.result);
            }

            // Helper function to remove internal fields from records
            const cleanRecord = (record) => {
                if (!record || typeof record !== 'object') return record;
                const cleaned = { ...record };
                delete cleaned.id;
                delete cleaned.__id;
                delete cleaned._row_order;
                return cleaned;
            };

            const cleanResults = (data) => {
                if (Array.isArray(data)) {
                    return data.map(cleanRecord);
                }
                return cleanRecord(data);
            };

            // Based on our INFO FOR DB testing, the structure is result[0] directly
            // Not result[0].result
            // If firstRes is an array, it's the data
            if (Array.isArray(firstRes)) {
                // console.log(`[SurrealDB] Returning ${firstRes.length} rows (direct array)`);
                return cleanResults(firstRes);
            }

            // If firstRes has a result property that's an array
            if (firstRes && firstRes.result && Array.isArray(firstRes.result)) {
                // console.log(`[SurrealDB] Returning ${firstRes.result.length} rows from result property`);
                return cleanResults(firstRes.result);
            }

            // For mutations or other responses
            // console.log(`[SurrealDB] Returning metadata response`);
            return {
                affectedRows: Array.isArray(firstRes) ? firstRes.length : 1,
                rows: cleanRecord(firstRes)
            };

        } catch (error) {
            // Don't log "already exists" errors for field definitions (expected when re-defining fields)
            if (!error.message.includes('already exists')) {
                console.error(`[SurrealDB] Query failed: ${query}`, error);
            }
            throw new Error(`SurrealDB query error: ${error.message}`);
        }
    }

    /**
     * Resolve table aliases in query (friendly names -> internal names)
     */
    async resolveTableNames(query) {
        if (!this.isInternal) return query;

        // Try to find the upload ID from connection
        let uid = this.connection.uploadId;
        if (!uid) {
            // If uploadId is missing, check if we can infer it from the connection info
            // (Sometimes it's passed via connection object rather than being explicitly set)
            return query;
        }

        // Process uid (remove hyphens, handle uploads: prefix)
        if (uid.includes(':')) uid = uid.split(':')[1];
        uid = uid.replace(/-/g, '');

        try {
            // 1. Get all tables belonging to this upload context
            const allTables = await this.listCollections();
            if (!allTables || allTables.length === 0) return query;

            const mapping = {};

            // 2. Map internal names to friendly names (data_<uuid>_<name> -> <name>)
            for (const realTable of allTables) {
                const prefix = `data_${uid}_`;
                if (realTable.startsWith(prefix)) {
                    const shortName = realTable.substring(prefix.length);
                    if (shortName) mapping[shortName] = realTable;
                }
            }

            // 3. Map user-defined display name from upload metadata
            const uploadRecordId = `uploads:${uid}`;
            const [upload] = await this.db.query(`SELECT display_name FROM \`${uploadRecordId}\``);
            if (upload && upload[0] && upload[0].display_name) {
                const displayName = upload[0].display_name;
                // If there's only one table, or a clear match
                if (allTables.length === 1) {
                    mapping[displayName] = allTables[0];
                } else {
                    // Try to match display name to one of the tables if possible
                    // Or if display_name matches a shortName already, it's already covered
                }
            }

            // 4. Perform replacements
            let resolvedQuery = query;
            let replacementsMade = false;

            // Sort keys by length descending to avoid partial matches (e.g., 'Portfolio' before 'Portfolio_1')
            const sortedShortNames = Object.keys(mapping).sort((a, b) => b.length - a.length);

            for (const shortName of sortedShortNames) {
                const realName = mapping[shortName];

                // Heuristic: only replace if it looks like a table name usage
                // (Preceded by FROM, JOIN, UPDATE, etc. or quoted)
                // We use a regex that looks for the name as a standalone word or quoted
                // Use a negative lookbehind to ensure we don't double-prefix
                // Note: JS support for negative lookbehind varies, using a safer word boundary approach
                const escapedShortName = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(\\b|['"\`])${escapedShortName}(\\b|['"\`])`, 'g');

                resolvedQuery = resolvedQuery.replace(regex, (match, prefix, suffix) => {
                    // Check if it's already prefixed (i.e., preceded by data_<uuid>_)
                    // Since we already matched the word, we can check the context if we had it
                    // Simple check: if the match is already the real name, don't change it
                    if (match === realName || match === `\`${realName}\`` || match === `"${realName}"`) {
                        return match;
                    }

                    replacementsMade = true;
                    return `${prefix}${realName}${suffix}`;
                });
            }

            if (replacementsMade) {
                console.log(`[SurrealDB] Translated Query: "${query}" -> "${resolvedQuery}"`);
            }

            return resolvedQuery;
        } catch (e) {
            console.error('[SurrealDB] Error resolving table names:', e.message);
            return query;
        }
    }

    async listCollections() {
        try {
            // console.log('[SurrealDB] Listing collections, uploadId:', this.connection.uploadId);

            // INFO FOR DB
            const result = await this.db.query('INFO FOR DB');
            // console.log('[SurrealDB] INFO FOR DB raw result length:', result?.length);

            if (!result || !result[0]) {
                // console.warn('[SurrealDB] INFO FOR DB returned empty result');
                return [];
            }

            // The structure is: result[0] contains { tables: {...}, ... } directly
            // NOT result[0].result
            const info = result[0];
            // console.log('[SurrealDB] Info has tables:', !!info.tables);

            if (!info || !info.tables) {
                // console.warn('[SurrealDB] No tables info in result');
                return [];
            }

            let tables = Object.keys(info.tables || {});

            // Filter out 'uploads:' records (these are metadata, not data tables)
            tables = tables.filter(t => !t.startsWith('uploads:'));
            // console.log('[SurrealDB] Found tables:', tables.length, 'tables');

            // Filter logic similar to SQLite/Uploads
            if (this.connection.uploadId) {
                let uid = this.connection.uploadId;
                console.log('[SurrealDB] Original uploadId:', uid);

                // Extract UUID from "uploads:uuid" format
                if (uid.includes(':')) uid = uid.split(':')[1];
                // Remove any hyphens
                uid = uid.replace(/-/g, '');
                console.log('[SurrealDB] Processed uploadId:', uid);

                // Filter for tables matching pattern: data_{uuid}_{tablename}
                tables = tables.filter(t => t.startsWith(`data_${uid}_`));
                // console.log(`[SurrealDB] Filtered to ${tables.length} tables for upload`);
            }

            return tables;
        } catch (e) {
            console.error('[SurrealDB] Error listing tables:', e);
            return [];
        }
    }

    async sampleCollection(name, limit = 5) {
        try {
            const result = await this.db.query(`SELECT * FROM ${name} LIMIT ${limit}`);

            // Helper to clean internal fields
            const cleanRecord = (record) => {
                if (!record || typeof record !== 'object') return record;
                const cleaned = { ...record };
                delete cleaned.id;
                delete cleaned.__id;
                delete cleaned._row_order;
                return cleaned;
            };

            // SurrealDB returns data in result[0] directly, not result[0].result
            if (Array.isArray(result[0])) {
                return result[0].map(cleanRecord);
            }
            const data = result[0]?.result || [];
            return Array.isArray(data) ? data.map(cleanRecord) : [];
        } catch (error) {
            console.warn(`[SurrealDB] Failed to sample table ${name}:`, error.message);
            return [];
        }
    }

    async getOneTableSchema(table) {
        try {
            const infoRes = await this.db.query(`INFO FOR TABLE \`${table}\``);
            const info = infoRes[0];

            const fields = info.fields || {};
            let columns = Object.entries(fields)
                .filter(([fname]) => fname !== '_row_order')
                .map(([fname, fdef]) => ({
                    name: fname.replace(/`/g, ''),
                    type: fdef,
                    nullable: true,
                    pk: false
                }));

            if (columns.length === 0) {
                // Infer from sample
                const sample = await this.sampleCollection(table, 10); // Small sample for speed
                if (sample.length > 0) {
                    const allColumns = new Set();
                    const columnTypes = {};

                    for (const row of sample) {
                        for (const key of Object.keys(row)) {
                            if (key !== 'id' && key !== '__id' && key !== '_row_order') {
                                allColumns.add(key);
                                if (!columnTypes[key]) {
                                    columnTypes[key] = typeof row[key];
                                }
                            }
                        }
                    }

                    columns = Array.from(allColumns).map(k => ({
                        name: k,
                        type: columnTypes[k],
                        nullable: true
                    }));
                }
            }
            return columns;
        } catch (e) {
            console.error(`[SurrealDB] Error fetching schema for ${table}:`, e);
            return [];
        }
    }

    async getSchema() {
        try {
            const tables = await this.listCollections();
            const schema = {};

            // SurrealDB is schemaless by default but we can infer or `INFO FOR TABLE`
            // `INFO FOR TABLE` gives defined fields.
            // If fields are not defined, we might need to infer from sample?
            // Let's try INFO first.

            for (const table of tables) {
                const infoRes = await this.db.query(`INFO FOR TABLE \`${table}\``);
                const info = infoRes[0]; // Direct access, not .result

                const fields = info.fields || {};
                schema[table] = Object.entries(fields)
                    .filter(([fname]) => fname !== '_row_order') // Filter out internal fields
                    .map(([fname, fdef]) => ({
                        name: fname.replace(/`/g, ''), // Remove backticks from field names
                        type: fdef, // e.g. 'FLEXIBLE' or 'string'
                        nullable: true,
                        pk: false // ID is implicit PK
                    }));

                // If no fields defined (dynamic), infer from sample rows
                if (schema[table].length === 0) {
                    // console.log(`[SurrealDB] No defined fields for ${table}, inferring from sample`);
                    // Sample a reasonable number of rows to capture most columns
                    // 500 rows balances completeness with performance for large tables
                    const sample = await this.sampleCollection(table, 500);
                    // console.log(`[SurrealDB] Sampled ${sample.length} rows for ${table}`);

                    if (sample.length > 0) {
                        // Merge all unique column names from sampled rows
                        const allColumns = new Set();
                        const columnTypes = {};

                        for (const row of sample) {
                            for (const key of Object.keys(row)) {
                                if (key !== 'id' && key !== '__id' && key !== '_row_order') {
                                    allColumns.add(key);
                                    // Store type from first occurrence
                                    if (!columnTypes[key]) {
                                        columnTypes[key] = typeof row[key];
                                    }
                                }
                            }
                        }

                        schema[table] = Array.from(allColumns).map(k => ({
                            name: k,
                            type: columnTypes[k],
                            nullable: true
                        }));
                        // console.log(`[SurrealDB] Inferred schema for ${table}:`, schema[table]);
                    }
                }
            }
            // console.log('[SurrealDB] Final schema:', schema);
            return schema;
        } catch (e) {
            console.error('[SurrealDB] Error fetching schema:', e);
            return {};
        }
    }

    /**
     * Detect schema mode for a table
     * Returns 'named-headers' if columns have semantic names, 'column-letters' if using A, B, C pattern
     */
    async detectSchemaMode(tableName) {
        try {
            const schema = await this.getSchema();
            const tableSchema = schema[tableName];

            if (!tableSchema || tableSchema.length === 0) {
                console.log(`[SurrealDB] No schema for ${tableName}, defaulting to column-letters`);
                return 'column-letters';
            }

            // Check if column names follow the A, B, C... pattern
            const columnNames = tableSchema.map(col => col.name);
            const allLetterPattern = columnNames.every((name, index) => {
                // Convert index to expected letter (0->A, 1->B, etc.)
                const expectedLetter = this.colIndexToLetter(index);
                return name === expectedLetter;
            });

            if (allLetterPattern) {
                console.log(`[SurrealDB] Table ${tableName} uses column-letters schema`);
                return 'column-letters';
            }

            console.log(`[SurrealDB] Table ${tableName} uses named-headers schema`);
            return 'named-headers';
        } catch (e) {
            console.error(`[SurrealDB] Error detecting schema mode for ${tableName}:`, e);
            return 'column-letters'; // Safe default
        }
    }

    /**
     * Convert column index to Excel-style letter (0->A, 25->Z, 26->AA)
     */
    colIndexToLetter(index) {
        let label = '';
        let i = index;
        while (i >= 0) {
            label = String.fromCharCode(65 + (i % 26)) + label;
            i = Math.floor(i / 26) - 1;
        }
        return label;
    }

    async disconnect() {
        if (!this.isInternal && this.db) {
            // Only close if we opened it
            // Surreal client doesn't explicitly 'close' usually required? 
            // It has .close() in websocket strategy.
            try { await this.db.close(); } catch (e) { }
        }
    }
}
