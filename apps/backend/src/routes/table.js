
import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { users, sanitizationMetadata, spreadsheetPermissions, connections } from "../db/schema.js"
import { eq, and, sql, or, inArray } from "drizzle-orm"
import { uploadsDb } from "../../db/uploads.js"
import { adapters } from "../../adapters/index.js"
import { analyzeForSanitization, applySanitization, interpretDataset } from "../../ai/sanitizer.js"

import { ConfigService } from "../services/ConfigService.js"
import { SyncService } from "../services/SyncService.js"

const table = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Helper
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id

        const existing = await db.query.users.findFirst({
            where: eq(users.id, userId)
        })

        const userData = {
            id: userId,
            email: payload.email,
            firstName: payload.firstName || payload.first_name,
            lastName: payload.lastName || payload.last_name,
            profilePictureUrl: (payload.profilePictureUrl || payload.profile_picture_url) ?? null,
            updatedAt: new Date()
        }

        if (existing) {
            await db.update(users)
                .set(userData)
                .where(eq(users.id, userId))
            return existing
        } else {
            const [newUser] = await db.insert(users)
                .values({ ...userData, createdAt: new Date() })
                .returning()
            return newUser
        }
    } catch (e) {
        console.error("[Table] Failed to upsert user:", e)
        throw e
    }
}


table.post("/rename-table", async (c) => {
    try {
        let { connection, oldTableName, newTableName, provider } = await c.req.json()
        if (provider === 'surrealdb' || (connection && connection.provider === 'surrealdb')) {
            provider = 'postgres';
        }

        console.log(`[Rename] Received rename request:`, { oldTableName, newTableName, provider })

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        let userId = null
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) {
            return c.json({ error: "Invalid session" }, 401)
        }

        let actualConnection = connection
        let extractedUploadId = null
        const tursoPath = connection?.sqlite?.path || connection?.sqlite?.url

        if (provider === 'sqlite' && tursoPath?.includes('turso.io')) {
            const uuidMatch = oldTableName.match(/data_([a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/);
            const uuidWithUnderscores = uuidMatch ? uuidMatch[1] : null;
            const uploadId = uuidWithUnderscores ? uuidWithUnderscores.replace(/_/g, '-') : null;
            extractedUploadId = uploadId

            if (uploadId) {
                const result = await uploadsDb.execute({
                    sql: "SELECT * FROM uploads WHERE id = ?",
                    args: [uploadId]
                })
                const upload = result.rows[0]
                if (!upload || upload.user_id !== userId) {
                    return c.json({ error: 'Unauthorized to rename this table' }, 403)
                }
                actualConnection = {
                    path: process.env.TURSO_UPLOAD_DB_URL,
                    authToken: process.env.TURSO_UPLOAD_TOKEN
                }
            }
        } else if (provider === 'surrealdb') {
            const uuidMatch = oldTableName.match(/^data_([a-f0-9]{32}|[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/i);
            if (uuidMatch) {
                extractedUploadId = uuidMatch[1];
            }
        }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: `Provider '${provider}' not supported` }, 400)
        const adapter = new Adapter(actualConnection)

        try {
            await adapter.connect()
            const sqlStr = (provider === 'surrealdb')
                ? `RENAME TABLE ${oldTableName} TO ${newTableName}`
                : `ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`

            await adapter.query(sqlStr)

            if (connection.id) {
                const connRow = await db.query.connections.findFirst({
                    where: eq(connections.id, connection.id)
                });

                if (connRow) {
                    const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
                    if (extractedUploadId && config.sqlite) {
                        config.sqlite.uploadId = extractedUploadId
                        if (config.sqlite.tables) delete config.sqlite.tables
                    } else if (config.sqlite && Array.isArray(config.sqlite.tables)) {
                        const idx = config.sqlite.tables.indexOf(oldTableName)
                        if (idx !== -1) config.sqlite.tables[idx] = newTableName
                    }
                    await db.update(connections).set({ config, updatedAt: new Date() }).where(eq(connections.id, connection.id))
                }
            }

            await adapter.disconnect()
            return c.json({ ok: true })
        } catch (error) {
            console.error('[Rename] Error:', error)
            await adapter.disconnect().catch(() => { })
            return c.json({ error: error.message || 'Failed to rename table' }, 500)
        }
    } catch (error) {
        console.error('[Rename] Request error:', error)
        return c.json({ error: error.message || 'Internal server error' }, 500)
    }
})

table.post("/delete-table", async (c) => {
    try {
        let { connection, tableName, provider } = await c.req.json()
        if (provider === 'surrealdb' || (connection && connection.provider === 'surrealdb')) {
            provider = 'postgres';
        }
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        let userId = null
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) {
            return c.json({ error: "Invalid session" }, 401)
        }

        let actualConnection = connection
        const tursoPath = connection?.sqlite?.path || connection?.sqlite?.url

        if (provider === 'sqlite' && tursoPath?.includes('turso.io')) {
            const uuidMatch = tableName.match(/data_([a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/);
            const uploadId = uuidMatch ? uuidMatch[1].replace(/_/g, '-') : null;

            if (uploadId) {
                const result = await uploadsDb.execute({
                    sql: "SELECT * FROM uploads WHERE id = ?",
                    args: [uploadId]
                })
                const upload = result.rows[0]
                if (!upload || upload.user_id !== userId) return c.json({ error: 'Unauthorized' }, 403)

                await uploadsDb.execute({ sql: "DELETE FROM uploads WHERE id = ?", args: [uploadId] })
                actualConnection = {
                    path: process.env.TURSO_UPLOAD_DB_URL,
                    authToken: process.env.TURSO_UPLOAD_TOKEN
                }
            }
        }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: 'Unsupported provider' }, 400)
        const adapter = new Adapter(actualConnection)

        try {
            await adapter.connect()
            const sql = (provider === 'surrealdb') ? `REMOVE TABLE ${tableName}` : `DROP TABLE "${tableName}"`
            await adapter.query(sql)

            if (connection.id) {
                const connRow = await db.query.connections.findFirst({ where: eq(connections.id, connection.id) });
                if (connRow) {
                    const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
                    if (config.sqlite && Array.isArray(config.sqlite.tables)) {
                        const idx = config.sqlite.tables.indexOf(tableName)
                        if (idx !== -1) {
                            config.sqlite.tables.splice(idx, 1)
                            await db.update(connections).set({ config, updatedAt: new Date() }).where(eq(connections.id, connection.id))
                        }
                    }
                }
            }
            await adapter.disconnect()
            return c.json({ ok: true })
        } catch (error) {
            await adapter.disconnect().catch(() => { })
            return c.json({ error: error.message }, 500)
        }
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

table.post("/save-table-data", async (c) => {
    try {
        let { tableName, updates, deletedRowIds = [], deletedColumns = [], connection, provider } = await c.req.json()
        if (provider === 'surrealdb' || (connection && connection.provider === 'surrealdb')) {
            provider = 'postgres';
        }
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        let userId
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) {
            return c.json({ error: "Unauthorized" }, 401)
        }

        // For uploaded files (SQLite provider with Turso), verify user owns the upload
        if (provider === 'sqlite' && connection?.url?.includes('turso')) {

            const uploadIdMatch = tableName.match(/^data_([a-f0-9-]+)_/)
            if (uploadIdMatch) {
                const uploadId = uploadIdMatch[1]

                try {
                    const uploadCheck = await uploadsDb.execute({
                        sql: 'SELECT user_id FROM uploads WHERE id = ?',
                        args: [uploadId]
                    })

                    if (uploadCheck.rows.length === 0) {
                        return c.json({ error: "Upload not found" }, 404)
                    }

                    const uploadUserId = uploadCheck.rows[0].user_id
                    if (uploadUserId !== userId) {
                        return c.json({ error: "Unauthorized - Not your upload" }, 403)
                    }
                } catch (err) {
                    console.error('[Save] Error verifying upload ownership:', err)
                    return c.json({ error: "Failed to verify upload ownership" }, 500)
                }
            }
        }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: 'Unsupported provider' }, 400)
        const adapter = new Adapter(connection)

        try {
            await adapter.connect()

            // For DuckDB file uploads, map the requested table name to the actual table name
            let actualTableName = tableName
            if ((provider === 'duckdb' || provider === 'file')) {
                console.log(`[Table Save] Mapping table. Requested: ${tableName}. Connection tables:`, connection?.tables ? JSON.stringify(connection.tables) : 'undefined');

                if (connection && connection.tables && Array.isArray(connection.tables)) {
                    // Strategy 1: Fuzzy Match
                    const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const targetSanitized = sanitize(tableName)

                    const matchedTable = connection.tables.find(t => {
                        const tSanitized = sanitize(t)
                        return tSanitized === targetSanitized || tSanitized.includes(targetSanitized) || targetSanitized.includes(tSanitized)
                    })

                    if (matchedTable) {
                        actualTableName = matchedTable
                        console.log(`[Table Save] Mapped table name via fuzzy match: ${tableName} -> ${actualTableName}`)
                    }
                    // Strategy 2: Single Table Fallback
                    else if (connection.tables.length === 1) {
                        actualTableName = connection.tables[0]
                        console.log(`[Table Save] Fallback to single available table: ${actualTableName}`)
                    }
                }
            }

            if (typeof adapter.saveData === 'function') {
                await adapter.saveData(actualTableName, updates, deletedRowIds, deletedColumns)
                return c.json({ ok: true, saved: updates?.length || 0 })
            }

            const queries = []
            for (const rowid of deletedRowIds) {
                if (rowid) queries.push(`DELETE FROM "${actualTableName}" WHERE rowid = ${Number(rowid)}`)
            }
            for (const col of deletedColumns) {
                if (col && col !== '_rowid_') queries.push(`ALTER TABLE "${actualTableName}" DROP COLUMN "${col}"`)
            }

            for (const update of updates) {
                const rowData = update.data
                const originalData = update.original
                if (!rowData) continue

                const idKey = Object.keys(rowData).find(k => k === '_rowid_' || k.toLowerCase().endsWith('id'))

                if (idKey && rowData[idKey] !== undefined) {
                    const setClause = Object.keys(rowData).filter(k => k !== idKey).map(k => `"${k}" = ${rowData[k] === null ? 'NULL' : `'${String(rowData[k]).replace(/'/g, "''")}'`}`).join(', ')
                    if (setClause) queries.push(`UPDATE "${actualTableName}" SET ${setClause} WHERE "${idKey}" = '${String(rowData[idKey]).replace(/'/g, "''")}'`)
                } else if (originalData) {
                    const setClause = Object.keys(rowData).filter(k => k !== '_rowid_').map(k => `"${k}" = ${rowData[k] === null ? 'NULL' : `'${String(rowData[k]).replace(/'/g, "''")}'`}`).join(', ')
                    const whereClause = Object.keys(originalData).filter(k => k !== '_rowid_').map(k => `"${k}" ${originalData[k] === null ? 'IS NULL' : `= '${String(originalData[k]).replace(/'/g, "''")}'`}`).join(' AND ')
                    if (setClause && whereClause) queries.push(`UPDATE "${actualTableName}" SET ${setClause} WHERE ${whereClause}`)
                } else {
                    const keys = Object.keys(rowData).filter(k => k !== '_rowid_')
                    if (keys.length) {
                        const cols = keys.map(k => `"${k}"`).join(', ')
                        const vals = keys.map(k => rowData[k] === null ? 'NULL' : `'${String(rowData[k]).replace(/'/g, "''")}'`).join(', ')
                        queries.push(`INSERT INTO "${actualTableName}" (${cols}) VALUES (${vals})`)
                    }
                }
            }

            if (queries.length) {
                if (adapter.batch) await adapter.batch(queries)
                else for (const q of queries) await adapter.query(q)
            }

            return c.json({ ok: true, saved: queries.length })
        } finally {
            await adapter.disconnect()
            if (connection?.enableSync) {
                SyncService.syncUpdates(connection, tableName, updates, deletedRowIds, userId).catch(console.error)
            }
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.post("/copy-table", async (c) => {
    try {
        let { sourceTableName, newTableName, connection, provider } = await c.req.json()
        if (provider === 'surrealdb' || (connection && connection.provider === 'surrealdb')) {
            provider = 'postgres';
        }
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: 'Unsupported provider' }, 400)
        const adapter = new Adapter(connection)

        try {
            await adapter.connect()
            const sql = (provider === 'surrealdb')
                ? `INSERT INTO ${newTableName} SELECT * FROM ${sourceTableName}`
                : `CREATE TABLE "${newTableName}" AS SELECT * FROM "${sourceTableName}"`
            await adapter.query(sql)
            await adapter.disconnect()
            return c.json({ ok: true, tableName: newTableName })
        } catch (e) {
            await adapter.disconnect().catch(() => { })
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.post("/table/:tableName/schema", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        let { connection, provider } = await c.req.json()

        console.log('[Table Schema] Request:', { tableName, provider, hasConnection: !!connection })

        // Fallback to 'duckdb' if provider is undefined (faster for uploaded files/spreadsheets)
        if (!provider) {
            provider = 'duckdb'
            console.log('[Table Schema] Provider was undefined, defaulting to duckdb')
        }

        if (provider === 'surrealdb') provider = 'postgres';
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: `Unsupported provider: ${provider}` }, 400)

        // Force Read Only for DuckDB schema - but NOT for in-memory DBs
        if (provider === 'duckdb' && connection) {
            const dbPath = connection.path || ':memory:'
            if (dbPath !== ':memory:') {
                connection = { ...connection, readOnly: true }
            }
        }

        console.log('[Table Schema] Connection object:', JSON.stringify(connection, null, 2))
        const adapter = new Adapter(connection)

        try {
            await adapter.connect()

            // For DuckDB file uploads, map the requested table name to the actual table name
            let actualTableName = tableName
            if ((provider === 'duckdb' || provider === 'file')) {
                console.log(`[Table Schema] Mapping table. Requested: ${tableName}. Connection tables:`, connection?.tables ? JSON.stringify(connection.tables) : 'undefined');

                if (connection && connection.tables && Array.isArray(connection.tables)) {
                    // Strategy 1: Fuzzy Match
                    const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const targetSanitized = sanitize(tableName)

                    const matchedTable = connection.tables.find(t => {
                        const tSanitized = sanitize(t)
                        return tSanitized === targetSanitized || tSanitized.includes(targetSanitized) || targetSanitized.includes(tSanitized)
                    })

                    if (matchedTable) {
                        actualTableName = matchedTable
                        console.log(`[Table Schema] Mapped table name via fuzzy match: ${tableName} -> ${actualTableName}`)
                    }
                    // Strategy 2: Single Table Fallback
                    else if (connection.tables.length === 1) {
                        actualTableName = connection.tables[0]
                        console.log(`[Table Schema] Fallback to single available table: ${actualTableName}`)
                    }
                }
            }

            const fullSchema = await adapter.getSchema()
            await adapter.disconnect()
            return c.json({ columns: fullSchema[actualTableName] || [] })
        } catch (e) {
            await adapter.disconnect().catch(() => { })
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.post("/table/:tableName/query", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        let { connection, provider, limit = 100, offset = 0 } = await c.req.json()

        console.log('[Table Query] Request:', { tableName, provider, hasConnection: !!connection, limit, offset })

        // Fallback to 'duckdb' if provider is undefined (faster for uploaded files/spreadsheets)
        if (!provider) {
            provider = 'duckdb'
            console.log('[Table Query] Provider was undefined, defaulting to duckdb')
        }

        if (provider === 'surrealdb') provider = 'postgres';
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: `Unsupported provider: ${provider}` }, 400)

        // Force Read Only for DuckDB query - but NOT for in-memory DBs
        if (provider === 'duckdb' && connection) {
            const dbPath = connection.path || ':memory:'
            if (dbPath !== ':memory:') {
                connection = { ...connection, readOnly: true }
            }
        }

        console.log('[Table Query] Connection object:', JSON.stringify(connection, null, 2))
        const adapter = new Adapter(connection)

        try {
            await adapter.connect()

            // For DuckDB file uploads, map the requested table name to the actual table name
            let actualTableName = tableName
            if ((provider === 'duckdb' || provider === 'file')) {
                console.log(`[Table Query] Mapping table. Requested: ${tableName}. Connection tables:`, connection?.tables ? JSON.stringify(connection.tables) : 'undefined');

                if (connection && connection.tables && Array.isArray(connection.tables)) {
                    // Strategy 1: Fuzzy Match
                    const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const targetSanitized = sanitize(tableName)

                    const matchedTable = connection.tables.find(t => {
                        const tSanitized = sanitize(t)
                        return tSanitized === targetSanitized || tSanitized.includes(targetSanitized) || targetSanitized.includes(tSanitized)
                    })

                    if (matchedTable) {
                        actualTableName = matchedTable
                        console.log(`[Table Query] Mapped table name via fuzzy match: ${tableName} -> ${actualTableName}`)
                    }
                    // Strategy 2: Single Table Fallback
                    else if (connection.tables.length === 1) {
                        actualTableName = connection.tables[0]
                        console.log(`[Table Query] Fallback to single available table: ${actualTableName}`)
                    }
                }
            }

            let query
            if (provider === 'surrealdb') {
                query = `SELECT *, meta::id(id) as __id FROM ${actualTableName} ORDER BY _row_order LIMIT ${Number(limit)} START ${Number(offset)}`
            } else if (provider === 'mongodb') {
                query = { collection: actualTableName, limit: Number(limit), skip: Number(offset) }
            } else if (provider === 'postgres' || provider === 'mysql') {
                const q = provider === 'mysql' ? '`' : '"'
                query = `SELECT * FROM ${q}${actualTableName}${q} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
            } else {
                query = `SELECT rowid as __id, * FROM "${actualTableName}" LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
            }

            const rows = await adapter.query(query)
            await adapter.disconnect()

            // Convert BigInt values to regular numbers for JSON serialization
            const serializedRows = Array.isArray(rows) ? rows.map(row => {
                const newRow = {}
                for (const [key, value] of Object.entries(row)) {
                    newRow[key] = typeof value === 'bigint' ? Number(value) : value
                }
                return newRow
            }) : []

            return c.json({ rows: serializedRows })
        } catch (e) {
            await adapter.disconnect().catch(() => { })
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

// 3. Atomic Operations
table.post("/table/:tableName/operations", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        let { connection, provider, operations } = await c.req.json()
        if (provider === 'surrealdb') provider = 'postgres';

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        let userId;
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: 'Unsupported provider' }, 400)
        const adapter = new Adapter(connection)

        try {
            await adapter.connect()
            if (typeof adapter.applyOperations === 'function') {
                await adapter.applyOperations(tableName, operations)
                await adapter.disconnect()
                return c.json({ ok: true })
            }

            const queries = []
            if (provider === 'surrealdb') {
                for (const op of operations) {
                    if (op.type === 'full_replacement') {
                        const rows = op.rows || []
                        // Case: SurrealDB full replacement
                        queries.push(`DELETE ${tableName}`)
                        const batchSize = 1000
                        for (let i = 0; i < rows.length; i += batchSize) {
                            const batch = rows.slice(i, i + batchSize).map((row, idx) => {
                                const { id, __id, ...cleanRow } = row;
                                return { ...cleanRow, _row_order: i + idx };
                            })
                            if (batch.length > 0) {
                                queries.push(`INSERT INTO ${tableName} ${JSON.stringify(batch)}`)
                            }
                        }
                    }
                }
            } else {
                // Simplified fallback for other providers
                for (const op of operations) {
                    // Logic for update, delete, create...
                }
            }

            if (queries.length > 0) {
                if (adapter.batch) await adapter.batch(queries)
                else {
                    for (const q of queries) await adapter.query(q)
                }
            }

            await adapter.disconnect()
            return c.json({ ok: true })
        } catch (e) {
            await adapter.disconnect().catch(() => { })
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

// 4. Re-Sanitize Endpoint (Versioning)
// 4. Sanitize Endpoint (On-Demand)
// 4. Sanitize Endpoint (On-Demand)
table.post("/table/:tableName/sanitize", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        // Find metadata using Drizzle
        const metadata = await db.query.sanitizationMetadata.findFirst({
            where: or(
                eq(sanitizationMetadata.originalTable, tableName),
                sql`${sanitizationMetadata.versions} @> ${JSON.stringify([{ table: tableName }])}::jsonb`
            )
        })

        let originalTable = tableName
        let currentVersion = 0

        if (!metadata) {
            originalTable = `${tableName}_original`
            // Logic to create _original table and copy data...
        } else {
            originalTable = metadata.originalTable
            currentVersion = metadata.currentVersion
        }

        return c.json({ success: true, message: "Sanitization stub - logic being migrated" })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.get("/table/:tableName/versions", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const meta = await db.query.sanitizationMetadata.findFirst({
            where: or(
                eq(sanitizationMetadata.originalTable, tableName),
                sql`${sanitizationMetadata.versions} @> ${JSON.stringify([{ table: tableName }])}::jsonb`
            )
        })

        if (!meta) {
            return c.json({ original_table: tableName, current_version: 1, versions: [] })
        }

        return c.json({
            original_table: meta.originalTable,
            current_version: meta.currentVersion,
            versions: meta.versions || []
        })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.get('/:tableName/interpret', async (c) => {
    try {
        const { tableName } = c.req.param()
        let { connection, provider } = await c.req.query() // Actually it's a GET, so query params or defaults
        if (provider === 'surrealdb') provider = 'postgres';

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const Adapter = adapters[provider || 'duckdb']
        if (!Adapter) return c.json({ error: 'Unsupported provider' }, 400)

        if ((provider === 'duckdb' || provider === 'file') && connection) {
            const dbPath = connection.path || ':memory:'
            if (dbPath !== ':memory:') {
                connection = { ...connection, readOnly: true }
            }
        }

        const adapter = new Adapter(connection)

        try {
            await adapter.connect()

            // For DuckDB file uploads, map the requested table name to the actual table name
            let actualTableName = tableName
            if ((provider === 'duckdb' || provider === 'file')) {
                console.log(`[Table Interpret] Mapping table. Requested: ${tableName}. Connection tables:`, connection?.tables ? JSON.stringify(connection.tables) : 'undefined');

                if (connection && connection.tables && Array.isArray(connection.tables)) {
                    // Strategy 1: Fuzzy Match
                    const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const targetSanitized = sanitize(tableName)

                    const matchedTable = connection.tables.find(t => {
                        const tSanitized = sanitize(t)
                        return tSanitized === targetSanitized || tSanitized.includes(targetSanitized) || targetSanitized.includes(tSanitized)
                    })

                    if (matchedTable) {
                        actualTableName = matchedTable
                        console.log(`[Table Interpret] Mapped table name via fuzzy match: ${tableName} -> ${actualTableName}`)
                    }
                    // Strategy 2: Single Table Fallback
                    else if (connection.tables.length === 1) {
                        actualTableName = connection.tables[0]
                        console.log(`[Table Interpret] Fallback to single available table: ${actualTableName}`)
                    }
                }
            }

            const rows = await adapter.query(`SELECT * FROM "${actualTableName}" LIMIT 100`)
            await adapter.disconnect()

            if (!rows?.length) return c.json({ message: "No data to interpret" })

            const interpretation = await interpretDataset(actualTableName, rows)
            return c.json({ table: actualTableName, interpretation })
        } catch (e) {
            await adapter.disconnect().catch(() => { })
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

// === SHARING ROUTES ===

table.post("/:tableName/share", async (c) => {
    try {
        const { tableName } = c.req.param()
        const { email, accessLevel = 'view' } = await c.req.json()
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const payload = await verify(token, jwtSecret)
        const user = await upsertUser(payload)

        const [recipient] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!recipient) return c.json({ error: "User not found" }, 404)

        await db.insert(spreadsheetPermissions)
            .values({
                spreadsheet: tableName,
                userEmail: email,
                accessLevel,
                grantedBy: user.id,
                grantedAt: new Date()
            })
            .onConflictDoUpdate({
                target: [spreadsheetPermissions.spreadsheet, spreadsheetPermissions.userEmail],
                set: { accessLevel, grantedAt: new Date() }
            })

        return c.json({ success: true, email, accessLevel })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.get("/:tableName/permissions", async (c) => {
    try {
        const { tableName } = c.req.param()
        const perms = await db.select().from(spreadsheetPermissions).where(eq(spreadsheetPermissions.spreadsheet, tableName))
        return c.json({ permissions: perms })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.delete("/:tableName/share/:email", async (c) => {
    try {
        const { tableName, email } = c.req.param()
        await db.delete(spreadsheetPermissions)
            .where(and(
                eq(spreadsheetPermissions.spreadsheet, tableName),
                eq(spreadsheetPermissions.userEmail, email)
            ))
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.post("/table/:tableName/load", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        let { connection, provider, limit = 2000, offset = 0 } = await c.req.json()
        if (provider === 'surrealdb' || (connection && connection.provider === 'surrealdb')) {
            provider = 'postgres';
        }
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: 'Unsupported provider' }, 400)

        // Force Read Only for table loading - but NOT for in-memory DBs
        if (provider === 'duckdb' && connection) {
            const dbPath = connection.path || ':memory:'
            if (dbPath !== ':memory:') {
                connection = { ...connection, readOnly: true }
            }
        }

        const adapter = new Adapter(connection)

        try {
            await adapter.connect()

            // For DuckDB file uploads, map the requested table name to the actual table name
            let actualTableName = tableName
            if ((provider === 'duckdb' || provider === 'file')) {
                console.log(`[Table Load] Mapping table. Requested: ${tableName}. Connection tables:`, connection?.tables ? JSON.stringify(connection.tables) : 'undefined');

                if (connection && connection.tables && Array.isArray(connection.tables)) {
                    // Strategy 1: Fuzzy Match
                    const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const targetSanitized = sanitize(tableName)

                    const matchedTable = connection.tables.find(t => {
                        const tSanitized = sanitize(t)
                        return tSanitized === targetSanitized || tSanitized.includes(targetSanitized) || targetSanitized.includes(tSanitized)
                    })

                    if (matchedTable) {
                        actualTableName = matchedTable
                        console.log(`[Table Load] Mapped table name via fuzzy match: ${tableName} -> ${actualTableName}`)
                    }
                    // Strategy 2: Single Table Fallback
                    else if (connection.tables.length === 1) {
                        actualTableName = connection.tables[0]
                        console.log(`[Table Load] Fallback to single available table: ${actualTableName}`)
                    }
                }
            }

            const [fullSchema, rows] = await Promise.all([
                adapter.getSchema(),
                (async () => {
                    let sqlStr
                    if (provider === 'surrealdb') {
                        sqlStr = `SELECT *, meta::id(id) as __id FROM ${actualTableName} ORDER BY _row_order LIMIT ${Number(limit)} START ${Number(offset)}`
                    } else if (provider === 'mongodb') {
                        sqlStr = { collection: actualTableName, limit: Number(limit), skip: Number(offset) }
                    } else if (provider === 'postgres' || provider === 'mysql') {
                        const q = provider === 'mysql' ? '`' : '"'
                        sqlStr = `SELECT * FROM ${q}${actualTableName}${q} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
                    } else {
                        sqlStr = `SELECT rowid as __id, * FROM "${actualTableName}" LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
                    }
                    return adapter.query(sqlStr)
                })()
            ])
            await adapter.disconnect()
            return c.json({ columns: fullSchema[actualTableName] || [], rows: Array.isArray(rows) ? rows : [] })
        } catch (e) {
            await adapter.disconnect().catch(() => { })
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

table.get("/:tableName/access", async (c) => {
    try {
        const { tableName } = c.req.param()
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const payload = await verify(token, jwtSecret)
        const [perm] = await db.select()
            .from(spreadsheetPermissions)
            .where(and(
                eq(spreadsheetPermissions.spreadsheet, tableName),
                eq(spreadsheetPermissions.userEmail, payload.email)
            ))
            .limit(1)

        if (perm) {
            return c.json({ hasAccess: true, accessLevel: perm.accessLevel })
        }

        return c.json({ hasAccess: false, accessLevel: null })
    } catch (e) {
        console.error('[Access] Error:', e)
        return c.json({ error: e.message }, 500)
    }
})

export { table as tableRoutes }

