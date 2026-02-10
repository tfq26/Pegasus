import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { CosmosClient } from "@azure/cosmos"
import fs from 'fs'
import path from 'path'

export class CosmosAdapter extends DatabaseAdapter {
    constructor(config) {
        super(config)
        this.client = null
        this.database = null
        this.container = null
    }

    async connect() {
        if (this.client) return

        // Sanitize endpoint: remove trailing slash and :443 port if present
        if (this.connection.endpoint) { // Fixed reference to this.connection.endpoint
            this.connection.endpoint = this.connection.endpoint.replace(/:443\/?$/, '').replace(/\/$/, '')
        }

        const endpoint = this.connection.endpoint
        const key = this.connection.key || this.connection.password
        const databaseId = this.connection.database ? this.connection.database.trim() : null // Trim database name
        const containerId = this.connection.container || this.connection.collection

        const logMsg = `[CosmosAdapter] Connecting with: endpoint=${endpoint}, db=${databaseId}, container=${containerId}, keyLen=${key ? key.length : 0}\n`
        try { fs.appendFileSync('/tmp/cosmos_debug.log', logMsg) } catch (e) { }
        console.log(logMsg)

        if (!endpoint || !key || !databaseId) {
            const errMsg = '[CosmosAdapter] Missing required fields\n'
            try { fs.appendFileSync('/tmp/cosmos_debug.log', errMsg) } catch (e) { }
            console.error(errMsg)
            throw new Error("Cosmos DB requires endpoint, key, and database name.")
        }

        this.client = new CosmosClient({
            endpoint,
            key,
            serializerOptions: { continueOnSerializationError: true }
        })

        this.database = this.client.database(databaseId)

        if (containerId) {
            this.container = this.database.container(containerId)
        }
    }

    async disconnect() {
        this.client = null
        this.database = null
        this.container = null
    }

    async listCollections() {
        try {
            if (!this.client) await this.connect()

            const { resources: containers } = await this.database.containers.readAll().fetchAll()
            const names = containers.map(c => c.id)

            const logMsg = `[CosmosAdapter] listCollections found: ${names.join(', ')}\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', logMsg) } catch (e) { }

            return names
        } catch (e) {
            const errMsg = `[CosmosAdapter] listCollections ERROR: ${e.message} ${e.stack}\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', errMsg) } catch (e) { }
            throw e
        }
    }

    async sampleCollection(collectionName, limit = 5) {
        try {
            if (!this.client) await this.connect()

            const container = this.database.container(collectionName)
            const query = `SELECT TOP ${limit} * FROM c`

            const logMsg = `[CosmosAdapter] sampleCollection executing query: ${query} on ${collectionName}\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', logMsg) } catch (e) { }

            const { resources } = await container.items
                .query(query)
                .fetchAll()

            const successMsg = `[CosmosAdapter] sampleCollection success. Found ${resources.length} items.\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', successMsg) } catch (e) { }

            return resources
        } catch (e) {
            const errMsg = `[CosmosAdapter] sampleCollection ERROR on ${collectionName}: ${e.message} ${e.stack}\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', errMsg) } catch (e) { }
            // Rethrow so the caller knows it failed (though caller might suppress it)
            throw e
        }
    }

    async query(queryString) {
        try {
            if (!this.client) await this.connect()

            // If a container was specified in connection, use it
            // Otherwise try to infer or require container in query
            if (!this.container) {
                // Fallback: try to list containers and pick the first one if only one exists
                const containers = await this.listCollections()
                if (containers.length === 1) {
                    this.container = this.database.container(containers[0])
                } else {
                    throw new Error("Cosmos DB requires a container to be specified in the connection or only one container to exist.")
                }
            }

            let translated = queryString;

            // 0. Strip trailing semicolon (invalid in Cosmos DB)
            translated = translated.trim().replace(/;$/, '');

            // 0.1. Translate snake_case column names to camelCase (OrionMetrics uses camelCase)
            const snakeToCamelMap = {
                'cpu_usage': 'cpuPercent',
                'cpu_percent': 'cpuPercent',
                'memory_usage': 'memoryPercent',
                'memory_percent': 'memoryPercent',
                'server_id': 'serverId',
                'server_type': 'serverType',
                'server_name': 'serverName',
                'energy_watts': 'energyWatts',
                'requests_per_sec': 'requestsPerSec',
                'network_mbps': 'networkMbps',
                'disk_io_ops': 'diskIoOps',
                'latency_ms': 'latencyMs',
                'error_message': 'errorMessage'
            };

            Object.entries(snakeToCamelMap).forEach(([snake, camel]) => {
                const regex = new RegExp(`\\b${snake}\\b`, 'gi');
                translated = translated.replace(regex, camel);
            });

            // 1. Map rowid and __id to id if they appear in SELECT
            translated = translated.replace(/rowid\s+as\s+__id/gi, 'c.id as __id');
            translated = translated.replace(/"rowid"/gi, 'c.id');

            // 2. Handle FROM clause: replace 'FROM "TableName"' with 'FROM c'
            translated = translated.replace(/FROM\s+["']?\w+["']?/i, 'FROM c');

            // 3. Handle identifier quoting: replace "ColumnName" or plain ColumnName with c.ColumnName
            translated = translated.replace(/\bAS\s+"?([^"\s]+)"?/gi, 'AS $1');

            translated = translated.replace(/"([^"]+)"/g, (match, p1) => {
                if (p1 === '*' || p1 === 'c') return p1;
                if (p1.includes(' ') || p1.includes(':') || p1.includes('-') || !isNaN(p1)) {
                    return `'${p1}'`;
                }
                return `c.${p1}`;
            });

            // Expanded keywords list to avoid incorrect prefixing
            const keywords = [
                'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'OFFSET',
                'ASC', 'DESC', 'AND', 'OR', 'NOT', 'AS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
                'TOP', 'DISTINCT', 'STARTSWITH', 'ENDSWITH', 'CONTAINS', 'LOWER', 'UPPER',
                'VALUE', 'SUBSTRING', 'CONCAT', 'STRLEN', 'DATETIMEPART', 'DATETIMEDIFF',
                'DATETIMEADD', 'IS_DEFINED', 'IS_NULL', 'IS_NUMBER', 'IS_STRING', 'IS_BOOL',
                'IN', 'IS', 'NULL', 'TRUE', 'FALSE', 'EXISTS', 'JOIN', 'ON', 'LIKE'
            ];

            const splitByComma = (str) => {
                const parts = [];
                let current = "";
                let parenLevel = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str[i];
                    if (char === '(') parenLevel++;
                    if (char === ')') parenLevel--;
                    if (char === ',' && parenLevel === 0) {
                        parts.push(current);
                        current = "";
                    } else {
                        current += char;
                    }
                }
                parts.push(current);
                return parts;
            }

            const prefixIfCol = (str, knownAliases = new Set()) => {
                const trimmed = str.trim();
                if (!trimmed || trimmed === '*') return trimmed;
                if (keywords.includes(trimmed.toUpperCase())) return trimmed;
                if (knownAliases.has(trimmed)) return trimmed;
                if (!isNaN(trimmed)) return trimmed;
                if (trimmed.startsWith('c.')) return trimmed;
                if (trimmed.includes('.')) return trimmed;
                if (trimmed.includes('(')) return trimmed;
                if (trimmed.startsWith("'") || trimmed.startsWith('"')) return trimmed;
                if (/[0-9\)]/.test(trimmed[0]) || trimmed.endsWith(')')) return trimmed;

                return `c.${trimmed}`;
            }

            const knownAliases = new Set();
            const aliasMatch = translated.match(/SELECT\s+(?:TOP\s+\d+\s+)?(.+?)\s+FROM/i);
            if (aliasMatch) {
                splitByComma(aliasMatch[1]).forEach(col => {
                    const parts = col.trim().split(/\s+AS\s+/i);
                    if (parts.length > 1) {
                        knownAliases.add(parts[1].trim());
                    } else {
                        const spaceParts = col.trim().split(/\s+/);
                        if (spaceParts.length === 2 && !keywords.includes(spaceParts[1].toUpperCase())) {
                            knownAliases.add(spaceParts[1].trim());
                        }
                    }
                });
            }

            // Fix clauses: WHERE, GROUP BY, ORDER BY
            const clauseRegex = /(WHERE|GROUP\s+BY|ORDER\s+BY)\s+([\s\S]+?)(?=\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/gi;
            translated = translated.replace(clauseRegex, (match, clause, content) => {
                const fixedContent = content.replace(/'[^']*'|"[^"]*"|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m, identifier) => {
                    if (identifier) {
                        return prefixIfCol(identifier, knownAliases);
                    }
                    return m; // Preserve string literals
                });
                return `${clause} ${fixedContent} `;
            });

            // Fix SELECT list atoms (special handling to exclude aliases from prefixing)
            translated = translated.replace(/SELECT\s+(?:(TOP\s+\d+)\s+)?(.+?)\s+FROM/i, (match, topClause, selectList) => {
                const newSelectList = splitByComma(selectList).map(col => {
                    const trimmed = col.trim();
                    const parts = trimmed.split(/\s+AS\s+/i);
                    if (parts.length > 1) {
                        // col AS alias -> prefix col but NOT alias
                        return `${prefixIfCol(parts[0], knownAliases)} AS ${parts[1]}`;
                    }
                    const spaceParts = trimmed.split(/\s+/);
                    if (spaceParts.length === 2 && !keywords.includes(spaceParts[1].toUpperCase())) {
                        return `${prefixIfCol(spaceParts[0], knownAliases)} ${spaceParts[1]}`;
                    }
                    return prefixIfCol(trimmed, knownAliases);
                }).join(', ');

                return `SELECT ${topClause ? topClause + ' ' : ''}${newSelectList} FROM`;
            });



            // 4. Transform Functions
            // COUNT(*) -> COUNT(1)
            translated = translated.replace(/COUNT\(\*\)/gi, 'COUNT(1)');

            // Fix columns inside aggregate functions: AVG(col) -> AVG(c.col)
            const aggFuncs = ['AVG', 'SUM', 'MIN', 'MAX', 'COUNT'];
            aggFuncs.forEach(fn => {
                const regex = new RegExp(`${fn}\\(([a-zA-Z_][a-zA-Z0-9_]*)\\)`, 'gi');
                translated = translated.replace(regex, (match, col) => {
                    if (col === '1' || col.startsWith('c.')) return match;
                    return `${fn.toUpperCase()}(c.${col})`;
                });
            });

            // Fix ORDER BY clause: ORDER BY col -> ORDER BY c.col
            translated = translated.replace(/ORDER\s+BY\s+([a-zA-Z0-9_, \(\)'"c\.]+)/gi, (match, orderCols) => {
                const newCols = splitByComma(orderCols).map(col => {
                    // Parse "col ASC" or "col DESC" or just "col"
                    const parts = col.trim().split(/\s+(ASC|DESC)\b/i);
                    const colName = parts[0].trim();
                    const direction = parts[1] || '';

                    return `${prefixIfCol(colName, knownAliases)}${direction ? ' ' + direction : ''}`;
                }).join(', ');
                return `ORDER BY ${newCols}`;
            });

            // LIKE '%val%' -> CONTAINS(LOWER(c.field), 'val') - Case Insensitive
            translated = translated.replace(/c\.(\w+)\s+LIKE\s+'%([^%]*)%'/gi, (match, field, val) => {
                return `CONTAINS(LOWER(c.${field}), '${val.toLowerCase()}')`;
            });

            // Handle simple LIKE 'val' -> equality
            translated = translated.replace(/c\.(\w+)\s+LIKE\s+'([^%]+)'/gi, "c.$1 = '$2'");

            // Handle LIKE 'val%' -> STARTSWITH
            translated = translated.replace(/c\.(\w+)\s+LIKE\s+'([^%]+)%'/gi, (match, field, val) => {
                return `STARTSWITH(LOWER(c.${field}), '${val.toLowerCase()}')`;
            });

            // Handle LIKE '%val' -> ENDSWITH
            translated = translated.replace(/c\.(\w+)\s+LIKE\s+'%([^%]+)'/gi, (match, field, val) => {
                return `ENDSWITH(LOWER(c.${field}), '${val.toLowerCase()}')`;
            });

            // 5. Handle LIMIT and OFFSET (Translate to Cosmos OFFSET-LIMIT sequence)
            // Cosmos requires: ORDER BY ... OFFSET M LIMIT N
            const limitMatch = translated.match(/LIMIT\s+(\d+)/i);
            const offsetMatch = translated.match(/OFFSET\s+(\d+)/i);

            if (limitMatch || offsetMatch) {
                const limitVal = limitMatch ? limitMatch[1] : null;
                const offsetVal = offsetMatch ? offsetMatch[1] : null;

                // Remove existing LIMIT/OFFSET to re-place them at the end
                translated = translated.replace(/LIMIT\s+\d+/i, '').replace(/OFFSET\s+\d+/i, '').trim();

                if (offsetVal !== null) {
                    // OFFSET requires ORDER BY in Cosmos. If missing, add default.
                    if (!translated.match(/ORDER\s+BY/i)) {
                        translated += ' ORDER BY c.id';
                    }
                    translated += ` OFFSET ${offsetVal} LIMIT ${limitVal || 1000}`;
                } else if (limitVal !== null) {
                    // Simple LIMIT (no offset) can be TOP or LIMIT (if ordered)
                    // We'll use TOP for simplicity if no ordering exists
                    if (translated.match(/ORDER\s+BY/i)) {
                        translated += ` OFFSET 0 LIMIT ${limitVal}`;
                    } else {
                        translated = translated.replace(/SELECT\s+/i, `SELECT TOP ${limitVal} `);
                    }
                }
            }

            const logMsg = `[CosmosAdapter] query executing: ${translated} (Original: ${queryString}) on container ${this.container.id}\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', logMsg) } catch (e) { }
            console.log(logMsg)

            const { resources } = await this.container.items.query(translated).fetchAll()

            const successMsg = `[CosmosAdapter] query success. Found ${resources.length} items.\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', successMsg) } catch (e) { }

            return resources
        } catch (e) {
            const errMsg = `[CosmosAdapter] query ERROR: ${e.message} ${e.stack} (Query: ${queryString})\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', errMsg) } catch (e) { }
            throw e
        }
    }

    async getSchema() {
        try {
            if (!this.client) await this.connect()

            try {
                const containers = await this.listCollections()
                const schema = {}

                for (const containerId of containers) {
                    const container = this.database.container(containerId)
                    // Sample more documents to infer a more complete schema, especially for sparse data
                    const query = "SELECT TOP 50 * FROM c"

                    const logMsg = `[CosmosAdapter] getSchema probing ${containerId} with ${query}\n`
                    try { fs.appendFileSync('/tmp/cosmos_debug.log', logMsg) } catch (e) { }

                    const { resources } = await container.items.query(query).fetchAll()

                    if (resources && resources.length > 0) {
                        // Merge keys from all sampled documents
                        const allKeys = new Set();
                        const keyTypes = {};

                        resources.forEach(doc => {
                            Object.entries(doc).forEach(([k, v]) => {
                                if (k.startsWith('_')) return;
                                allKeys.add(k);
                                if (!keyTypes[k]) keyTypes[k] = typeof v;
                            });
                        });

                        schema[containerId] = Array.from(allKeys).map(k => ({
                            name: k,
                            type: keyTypes[k],
                            nullable: true
                        }));
                    } else {
                        schema[containerId] = []
                    }
                }

                const successMsg = `[CosmosAdapter] getSchema success. Schemas found: ${Object.keys(schema).join(', ')}\n`
                try { fs.appendFileSync('/tmp/cosmos_debug.log', successMsg) } catch (e) { }

                return schema
            } catch (e) {
                const errMsg = `[CosmosDB] Error fetching schema: ${e.message} ${e.stack}\n`
                try { fs.appendFileSync('/tmp/cosmos_debug.log', errMsg) } catch (e) { }
                console.error('[CosmosDB] Error fetching schema:', e)
                return {}
            }
        } catch (e) {
            const fatalMsg = `[CosmosAdapter] getSchema FATAL: ${e.message} ${e.stack}\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', fatalMsg) } catch (e) { }
            throw e
        }
    }

    async getOneTableSchema(tableName) {
        try {
            if (!this.client) await this.connect()

            const container = this.database.container(tableName)
            const query = "SELECT TOP 5 * FROM c"

            const logMsg = `[CosmosAdapter] getOneTableSchema probing ${tableName} with ${query}\n`
            try { fs.appendFileSync('/tmp/cosmos_debug.log', logMsg) } catch (e) { }

            const { resources } = await container.items.query(query).fetchAll()

            if (resources && resources.length > 0) {
                const allKeys = new Set();
                const keyTypes = {};

                resources.forEach(doc => {
                    Object.entries(doc).forEach(([k, v]) => {
                        if (k.startsWith('_')) return;
                        allKeys.add(k);
                        if (!keyTypes[k]) keyTypes[k] = typeof v;
                    });
                });

                return Array.from(allKeys).map(k => ({
                    name: k,
                    type: keyTypes[k],
                    nullable: true
                }));
            }
            return []
        } catch (e) {
            console.error(`[CosmosDB] Error fetching schema for ${tableName}:`, e)
            return []
        }
    }
}
