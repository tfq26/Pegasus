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

        if (this.connection.endpoint) {
            this.connection.endpoint = this.connection.endpoint.replace(/:443\/?$/, '').replace(/\/$/, '')
        }

        const endpoint = this.connection.endpoint || process.env.COSMOS_ENDPOINT
        const key = this.connection.key || this.connection.password || process.env.COSMOS_KEY
        const databaseId = (this.connection.database || process.env.COSMOS_DATABASE)?.trim() || null
        const containerId = this.connection.container || this.connection.collection || process.env.COSMOS_CONTAINER

        const logMsg = `[CosmosAdapter] Connecting with: endpoint=${endpoint}, db=${databaseId}, container=${containerId}, keyLen=${key ? key.length : 0}\n`
        try { fs.appendFileSync('/tmp/cosmos_debug.log', logMsg) } catch (e) { }
        console.log(logMsg)

        if (endpoint && (endpoint.includes('localhost') || endpoint.includes('127.0.0.1')) && !endpoint.includes('https')) {
            console.warn('[CosmosAdapter] Non-HTTPS endpoint detected for local Cosmos Emulator. Ensure SSL certificate verification is handled if needed.');
        }

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
            return containers.map(c => c.id)
        } catch (e) {
            throw e
        }
    }

    async sampleCollection(collectionName, limit = 5) {
        try {
            if (!this.client) await this.connect()
            const container = this.database.container(collectionName)
            const query = `SELECT TOP ${limit} * FROM c`
            const { resources } = await container.items.query(query).fetchAll()
            return resources
        } catch (e) {
            throw e
        }
    }

    async translate(queryString) {
        // Try AI-Powered Translation with Speculative Fallback
        let translated;
        let addSyntheticId = false;

        try {
            const { queryTranslationService } = await import('../src/services/QueryTranslationService.js');
            const schema = {
                columns: await this.getOneTableSchema(this.container?.id || ''),
                mappings: {
                    columns: {
                        'cpu_usage': 'cpuPercent', 'cpu_percent': 'cpuPercent',
                        'memory_usage': 'memoryPercent', 'memory_percent': 'memoryPercent',
                        'server_id': 'serverId', 'server_type': 'serverType',
                        'server_name': 'serverName', 'energy_watts': 'energyWatts',
                        'requests_per_sec': 'requestsPerSec', 'network_mbps': 'networkMbps',
                        'disk_io_ops': 'diskIoOps', 'latency_ms': 'latencyMs',
                        'error_message': 'errorMessage'
                    }
                }
            };

            const aiResult = await queryTranslationService.translateQuery(queryString, 'cosmosdb', schema);

            if (aiResult.confidence >= 90) {
                console.log(`[CosmosAdapter] Using AI Translation (${aiResult.confidence}%): ${aiResult.translatedQuery}`);
                translated = aiResult.translatedQuery;
                addSyntheticId = /rowid\s+as\s+__id/i.test(queryString);
            } else {
                console.warn(`[CosmosAdapter] AI Confidence low (${aiResult.confidence}%). Falling back to heuristics.`);
                const heuristic = await this._heuristicTranslate(queryString);
                translated = heuristic.translated;
                addSyntheticId = heuristic.addSyntheticId;
            }
        } catch (e) {
            console.error(`[CosmosAdapter] AI Translation failed, falling back to heuristics: ${e.message}`);
            const heuristic = await this._heuristicTranslate(queryString);
            translated = heuristic.translated;
            addSyntheticId = heuristic.addSyntheticId;
        }

        return { translated, addSyntheticId };
    }

    async _heuristicTranslate(queryString) {
        // 0. Strip trailing semicolon
        let translated = queryString.trim().replace(/;$/, '');

        // 0.1. Translate snake_case column names to camelCase
        const snakeToCamelMap = {
            'cpu_usage': 'cpuPercent', 'cpu_percent': 'cpuPercent',
            'memory_usage': 'memoryPercent', 'memory_percent': 'memoryPercent',
            'server_id': 'serverId', 'server_type': 'serverType',
            'server_name': 'serverName', 'energy_watts': 'energyWatts',
            'requests_per_sec': 'requestsPerSec', 'network_mbps': 'networkMbps',
            'disk_io_ops': 'diskIoOps', 'latency_ms': 'latencyMs',
            'error_message': 'errorMessage'
        };

        Object.entries(snakeToCamelMap).forEach(([snake, camel]) => {
            const regex = new RegExp(`\\b${snake}\\b`, 'gi');
            translated = translated.replace(regex, camel);
        });

        const addSyntheticId = /rowid\s+as\s+__id/i.test(queryString);
        if (addSyntheticId) {
            translated = translated.replace(/rowid\s+as\s+__id\s*,?\s*/gi, '');
        }
        translated = translated.replace(/"rowid"/gi, 'c.id');

        // 2. Handle FROM clause
        translated = translated.replace(/FROM\s+["']?\w+["']?/i, 'FROM c');

        // 3. Handle identifier quoting
        translated = translated.replace(/\bAS\s+"?([^"\s]+)"?/gi, 'AS $1');

        translated = translated.replace(/"([^"]+)"/g, (match, p1) => {
            if (p1 === '*' || p1 === 'c') return p1;
            if (p1.includes(' ') || p1.includes(':') || p1.includes('-') || !isNaN(p1)) {
                return `'${p1}'`;
            }
            return `c.${p1}`;
        });

        const keywords = [
            'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'OFFSET',
            'ASC', 'DESC', 'AND', 'OR', 'NOT', 'AS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
            'TOP', 'DISTINCT', 'STARTSWITH', 'ENDSWITH', 'CONTAINS', 'LOWER', 'UPPER',
            'VALUE', 'SUBSTRING', 'CONCAT', 'STRLEN', 'DATETIMEPART', 'DATETIMEDIFF',
            'DATETIMEADD', 'IS_DEFINED', 'IS_NULL', 'IS_NUMBER', 'IS_STRING', 'IS_BOOL',
            'IN', 'IS', 'NULL', 'TRUE', 'FALSE', 'EXISTS', 'JOIN', 'ON', 'LIKE', 'C', 'ID'
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
                let cleanCol = col.trim();
                if (/^DISTINCT\s+/i.test(cleanCol)) cleanCol = cleanCol.replace(/^DISTINCT\s+/i, '').trim();
                const parts = cleanCol.split(/\s+AS\s+/i);
                if (parts.length > 1) knownAliases.add(parts[1].trim());
                else {
                    const spaceParts = cleanCol.split(/\s+/);
                    if (spaceParts.length === 2 && !keywords.includes(spaceParts[1].toUpperCase())) {
                        knownAliases.add(spaceParts[1].trim());
                    }
                }
            });
        }

        // Clause Fixes
        const clauseRegex = /(WHERE|GROUP\s+BY|ORDER\s+BY)\s+([\s\S]+?)(?=\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/gi;
        translated = translated.replace(clauseRegex, (match, clause, content) => {
            const fixedContent = content.replace(/'[^']*'|"[^"]*"|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m, identifier, offset, fullString) => {
                if (identifier) {
                    const pre = fullString.substring(Math.max(0, offset - 2), offset);
                    if (pre.endsWith('.') || pre === 'c.') return m;
                    return prefixIfCol(identifier, knownAliases);
                }
                return m;
            });
            return `${clause} ${fixedContent} `;
        });

        // SELECT list atoms
        translated = translated.replace(/SELECT\s+(?:(TOP\s+\d+)\s+)?(.+?)\s+FROM/i, (match, topClause, selectList) => {
            const newSelectList = splitByComma(selectList).map(col => {
                let trimmed = col.trim();
                let distinctPrefix = "";
                if (/^DISTINCT\s+/i.test(trimmed)) {
                    distinctPrefix = "DISTINCT ";
                    trimmed = trimmed.replace(/^DISTINCT\s+/i, "");
                }
                const parts = trimmed.split(/\s+AS\s+/i);
                if (parts.length > 1) return `${distinctPrefix}${prefixIfCol(parts[0], knownAliases)} AS ${parts[1]}`;
                const spaceParts = trimmed.split(/\s+/);
                if (spaceParts.length === 2 && !keywords.includes(spaceParts[1].toUpperCase())) {
                    return `${distinctPrefix}${prefixIfCol(spaceParts[0], knownAliases)} ${spaceParts[1]}`;
                }
                return `${distinctPrefix}${prefixIfCol(trimmed, knownAliases)}`;
            }).join(', ');
            return `SELECT ${topClause ? topClause + ' ' : ''}${newSelectList} FROM`;
        });

        // Transform Functions
        translated = translated.replace(/COUNT\(\*\)/gi, 'COUNT(1)');
        ['AVG', 'SUM', 'MIN', 'MAX', 'COUNT'].forEach(fn => {
            const regex = new RegExp(`${fn}\\(([a-zA-Z_][a-zA-Z0-9_]*)\\)`, 'gi');
            translated = translated.replace(regex, (match, col) => {
                if (col === '1' || col.startsWith('c.')) return match;
                return `${fn.toUpperCase()}(c.${col})`;
            });
        });

        // ORDER BY
        translated = translated.replace(/ORDER\s+BY\s+([a-zA-Z0-9_, \(\)'"c\.]+)/gi, (match, orderCols) => {
            const newCols = splitByComma(orderCols).map(col => {
                const parts = col.trim().split(/\s+(ASC|DESC)\b/i);
                return `${prefixIfCol(parts[0].trim(), knownAliases)}${parts[1] ? ' ' + parts[1] : ''}`;
            }).join(', ');
            return `ORDER BY ${newCols}`;
        });

        // LIKE
        translated = translated.replace(/c\.(\w+)\s+LIKE\s+'%([^%]*)%'/gi, (match, field, val) => `CONTAINS(LOWER(c.${field}), '${val.toLowerCase()}')`);
        translated = translated.replace(/c\.(\w+)\s+LIKE\s+'([^%]+)'/gi, "c.$1 = '$2'");
        translated = translated.replace(/c\.(\w+)\s+LIKE\s+'([^%]+)%'/gi, (match, field, val) => `STARTSWITH(LOWER(c.${field}), '${val.toLowerCase()}')`);
        translated = translated.replace(/c\.(\w+)\s+LIKE\s+'%([^%]+)'/gi, (match, field, val) => `ENDSWITH(LOWER(c.${field}), '${val.toLowerCase()}')`);

        // LIMIT/OFFSET
        const limitMatch = translated.match(/LIMIT\s+(\d+)/i);
        const offsetMatch = translated.match(/OFFSET\s+(\d+)/i);
        const topMatch = translated.match(/SELECT\s+TOP\s+(\d+)/i);

        if (limitMatch || offsetMatch) {
            const limitVal = limitMatch ? limitMatch[1] : null;
            const offsetVal = offsetMatch ? offsetMatch[1] : null;
            translated = translated.replace(/LIMIT\s+\d+/i, '').replace(/OFFSET\s+\d+/i, '').trim();
            if (offsetVal !== null) {
                if (!translated.match(/ORDER\s+BY/i)) translated += ' ORDER BY c.id';
                translated += ` OFFSET ${offsetVal} LIMIT ${limitVal || 1000}`;
            } else if (limitVal !== null) {
                if (translated.match(/ORDER\s+BY/i)) translated += ` OFFSET 0 LIMIT ${limitVal}`;
                else translated = translated.replace(/SELECT\s+/i, `SELECT TOP ${limitVal} `);
            }
        } else if (!topMatch) {
            translated = translated.replace(/SELECT\s+/i, 'SELECT TOP 1000 ');
        }

        return { translated, addSyntheticId };
    }

    cleanRow(doc) {
        if (!doc || typeof doc !== 'object') return doc;

        const COSMOS_INTERNAL_FIELDS = new Set(['_rid', '_self', '_etag', '_attachments', '_ts']);
        const cleaned = {};
        for (const [key, value] of Object.entries(doc)) {
            if (!COSMOS_INTERNAL_FIELDS.has(key)) cleaned[key] = value;
        }
        return cleaned;
    }

    async *queryStream(queryString, options = {}) {
        if (!this.client) await this.connect();
        if (!this.container) {
            const containers = await this.listCollections();
            if (containers.length === 1) this.container = this.database.container(containers[0]);
            else throw new Error("Cosmos DB requires a container.");
        }

        const { translated, addSyntheticId } = await this.translate(queryString);
        const iterator = this.container.items.query(translated).getAsyncIterator();

        for await (const { resources } of iterator) {
            for (const doc of resources) {
                const cleaned = this.cleanRow(doc);
                if (addSyntheticId && doc && typeof doc === 'object') cleaned.__id = doc.id;
                yield cleaned;
            }
        }
    }

    async getSchema() {
        try {
            if (!this.client) await this.connect()
            const containers = await this.listCollections()
            const schema = {}
            for (const containerId of containers) {
                const container = this.database.container(containerId)
                const { resources } = await container.items.query("SELECT TOP 50 * FROM c").fetchAll()
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
                    schema[containerId] = Array.from(allKeys).map(k => ({ name: k, type: keyTypes[k], nullable: true }));
                } else {
                    schema[containerId] = []
                }
            }
            return schema
        } catch (e) {
            console.error('[CosmosAdapter] getSchema failed:', e.message)
            return {}
        }
    }

    async getOneTableSchema(tableName) {
        try {
            if (!this.client) await this.connect()
            const container = this.database.container(tableName)
            const { resources } = await container.items.query("SELECT TOP 5 * FROM c").fetchAll()
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
                return Array.from(allKeys).map(k => ({ name: k, type: keyTypes[k], nullable: true }));
            }
            return []
        } catch (e) {
            return []
        }
    }
}
