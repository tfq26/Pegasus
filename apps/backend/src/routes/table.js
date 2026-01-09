import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { uploadsDb } from "../../db/uploads.js"
import { adapters } from "../../adapters/index.js"
import { analyzeForSanitization, applySanitization, interpretDataset } from "../../ai/sanitizer.js"

import { ConfigService } from "../services/ConfigService.js"

const table = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Helper
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`

        const [existing] = await db.query(`SELECT id FROM ${userRecordId}`);

        if (existing && existing.length > 0) {
            await db.query(`
                UPDATE ${userRecordId} SET 
                    email = $email,
                    first_name = $firstName,
                    last_name = $lastName,
                    profile_picture_url = $pic,
                    updated_at = time::now();
            `, {
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });
        } else {
            await db.query(`
                CREATE ${userRecordId} CONTENT {
                    email: $email,
                    first_name: $firstName,
                    last_name: $lastName,
                    profile_picture_url: $pic,
                    created_at: time::now(),
                    updated_at: time::now()
                };
            `, {
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });
        }
    } catch (e) {
        console.error("[Table] Failed to upsert user:", e)
        throw e
    }
}


table.post("/rename-table", async (c) => {
    try {
        const { connection, oldTableName, newTableName, provider } = await c.req.json()

        console.log(`[Rename] Received rename request:`, {
            oldTableName,
            newTableName,
            provider
        })

        // Verify user session with JWT
        const token = getAuthToken(c)
        if (!token) {
            return c.json({ error: "Unauthorized" }, 401)
        }

        let userId = null
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) {
            return c.json({ error: "Invalid session" }, 401)
        }

        console.log('[Rename] Verified user:', userId)

        // For SQLite/Turso uploads, verify ownership and get correct connection
        let actualConnection = connection
        let extractedUploadId = null
        const tursoPath = connection?.sqlite?.path || connection?.sqlite?.url

        if (provider === 'sqlite' && tursoPath?.includes('turso.io')) {
            // ... existing Turso logic ...
            // UUID in table name uses underscores, but in DB it uses hyphens
            const uuidMatch = oldTableName.match(/data_([a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/);
            const uuidWithUnderscores = uuidMatch ? uuidMatch[1] : null;

            const uploadId = uuidWithUnderscores ? uuidWithUnderscores.replace(/_/g, '-') : null;
            extractedUploadId = uploadId

            if (uploadId) {
                // Query uploads table directly using SQL
                const result = await uploadsDb.execute({
                    sql: "SELECT * FROM uploads WHERE id = ?",
                    args: [uploadId]
                })
                const upload = result.rows[0]

                if (!upload || upload.user_id !== userId) {
                    return c.json({ error: 'Unauthorized to rename this table' }, 403)
                }

                // Reconstruct the Turso connection from environment
                actualConnection = {
                    path: process.env.TURSO_UPLOAD_DB_URL,
                    authToken: process.env.TURSO_UPLOAD_TOKEN
                }
            }
        }
        else if (provider === 'surrealdb') {
            // For SurrealDB uploads (internal)
            // Table name format: data_{uuid}_{name}
            // UUID can be 32 hex chars (no hyphens) or with underscores
            const uuidMatch = oldTableName.match(/^data_([a-f0-9]{32}|[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/i);
            if (uuidMatch) {
                let uploadUuid = uuidMatch[1];
                // Note: SurrealDB uploads are stored without hyphens (see /upload route)
                const uploadId = `uploads:${uploadUuid}`;

                // Verify ownership in internal DB
                try {
                    console.log(`[Rename] Verifying ownership for ${uploadId}...`)
                    const [upload] = await db.query(`SELECT user_id FROM \`${uploadId}\``);
                    const ownerId = upload[0]?.user_id;

                    if (!ownerId || ownerId !== `user:${userId}`) {
                        console.log('[Rename] Ownership check failed:', { ownerId, expectedUserId: `user:${userId}` });
                        return c.json({ error: 'Unauthorized to rename this table' }, 403)
                    }
                } catch (e) {
                    // Upload record might not exist (e.g., old uploads or manual tables)
                    // Allow rename for authenticated users
                    console.log('[Rename] Upload record not found, allowing authenticated user to proceed:', e.message);
                }

                // Connection is effectively empty/internal, handled by adapter
                actualConnection = {
                    uploadId: uploadUuid // Hint to adapter if needed
                }
                extractedUploadId = uploadUuid;
            }
        }

        const Adapter = adapters[provider]
        if (!Adapter) {
            return c.json({ error: `Provider '${provider}' not supported` }, 400)
        }

        const adapter = new Adapter(actualConnection)

        try {
            await adapter.connect()
            console.log('[Rename] Adapter connected successfully')

            // SurrealDB: Update display name in metadata instead of copying data
            if (provider === 'surrealdb') {
                console.log('[Rename] Using SurrealDB metadata strategy (update display_name)')

                // Extract the display name from the new table name
                // Format: data_{uuid}_{displayName}
                const displayNameMatch = newTableName.match(/^data_[a-f0-9]{32}_(.+)$/i)
                const displayName = displayNameMatch ? displayNameMatch[1] : newTableName

                if (extractedUploadId) {
                    // Note: SurrealDB uploads are stored without hyphens
                    let uploadUuid = extractedUploadId

                    const uploadId = `uploads:${uploadUuid}`

                    // Update the display_name in the uploads record
                    try {
                        const query = `UPDATE \`${uploadId}\` SET display_name = $displayName`
                        console.log(`[Rename] Executing SurrealDB update:`, query)
                        await db.query(query, { displayName })
                        console.log(`[Rename] Updated display_name to "${displayName}" for ${uploadId}`)
                    } catch (e) {
                        console.error('[Rename] Failed to update display_name:', e.message)
                        // If upload record doesn't exist, we can't store the display name
                        // Fall back to showing the table name as-is
                    }
                }

                console.log('[Rename] Metadata updated successfully (no data copied)')
            } else {
                // For other databases, use ALTER TABLE RENAME TO
                const sql = `ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`
                console.log('[Rename] Executing SQL:', sql)
                await adapter.query(sql)
            }

            console.log('[Rename] Table renamed successfully')


            // Update persistently saved connection if exists
            if (connection.id) {
                try {
                    const [connRows] = await db.query("SELECT * FROM connection WHERE id = type::thing('connection', $id)", { id: connection.id })
                    const connRow = connRows[0]

                    if (connRow) {
                        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config

                        // Upgrade to robust 'uploadId' linking if available
                        if (extractedUploadId) {
                            config.sqlite.uploadId = extractedUploadId
                            // We can remove the static tables list since we now search dynamically
                            if (config.sqlite.tables) delete config.sqlite.tables

                            await db.query(
                                "UPDATE connection SET config = $config WHERE id = type::thing('connection', $id)",
                                { config: JSON.stringify(config), id: connection.id }
                            )
                        }
                        // Fallback for legacy connections without uploadId (shouldn't happen for Turso uploads ideally)
                        else if (config.sqlite && Array.isArray(config.sqlite.tables)) {
                            // Update tables list
                            const idx = config.sqlite.tables.indexOf(oldTableName)
                            if (idx !== -1) {
                                config.sqlite.tables[idx] = newTableName
                                // Save back
                                await db.query(
                                    "UPDATE connection SET config = $config WHERE id = type::thing('connection', $id)",
                                    { config: JSON.stringify(config), id: connection.id }
                                )
                            }
                        }
                    }
                } catch (e) {
                    console.error('[Rename] Failed to update persistent connection:', e)
                }
            }


            await adapter.disconnect()

            return c.json({ ok: true })
        } catch (error) {
            console.error('[Rename] Error:', error)
            await adapter.disconnect().catch(() => { })

            // Provide more helpful error messages
            let errorMessage = error.message || 'Failed to rename table'
            if (errorMessage.includes('no such table')) {
                errorMessage = 'Table not found. It may have already been renamed or deleted.'
            }

            return c.json({ error: errorMessage }, 500)
        }
    } catch (error) {
        console.error('[Rename] Request error:', error)
        return c.json({ error: error.message || 'Internal server error' }, 500)
    }
})

table.post("/delete-table", async (c) => {
    try {
        const { connection, tableName, provider } = await c.req.json()

        console.log(`[Delete] Received delete request:`, {
            tableName,
            provider
        })

        // Verify user session with JWT
        const token = getAuthToken(c)
        if (!token) {
            return c.json({ error: "Unauthorized" }, 401)
        }

        let userId = null
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) {
            return c.json({ error: "Invalid session" }, 401)
        }

        console.log('[Delete] Verified user:', userId)

        // For SQLite/Turso uploads, verify ownership and get correct connection
        let actualConnection = connection
        const tursoPath = connection?.sqlite?.path || connection?.sqlite?.url

        if (provider === 'sqlite' && tursoPath?.includes('turso.io')) {
            // UUID in table name uses underscores, but in DB it uses hyphens
            const uuidMatch = tableName.match(/data_([a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/);
            const uuidWithUnderscores = uuidMatch ? uuidMatch[1] : null;

            const uploadId = uuidWithUnderscores ? uuidWithUnderscores.replace(/_/g, '-') : null;

            if (uploadId) {
                // Query uploads table directly using SQL
                const result = await uploadsDb.execute({
                    sql: "SELECT * FROM uploads WHERE id = ?",
                    args: [uploadId]
                })
                const upload = result.rows[0]

                if (!upload || upload.user_id !== userId) {
                    console.error('[Delete] Upload not found or unauthorized')
                    return c.json({ error: 'Unauthorized to delete this table' }, 403)
                }

                // Delete the upload record from the database
                await uploadsDb.execute({
                    sql: "DELETE FROM uploads WHERE id = ?",
                    args: [uploadId]
                })
                console.log('[Delete] Deleted upload record:', uploadId)

                // Reconstruct the Turso connection from environment
                actualConnection = {
                    path: process.env.TURSO_UPLOAD_DB_URL,
                    authToken: process.env.TURSO_UPLOAD_TOKEN
                }
            }
        }
        else if (provider === 'surrealdb') {
            // For SurrealDB uploads (internal)
            const uuidMatch = tableName.match(/^data_([a-zA-Z0-9]+)_/);
            if (uuidMatch) {
                const uploadUuid = uuidMatch[1];
                const uploadId = `uploads:${uploadUuid}`;

                // Verify ownership (lenient for missing upload records)
                try {
                    const [upload] = await db.query(`SELECT user_id FROM ${uploadId}`);

                    if (upload && upload.length > 0 && upload[0]) {
                        const ownerId = upload[0].user_id;
                        if (ownerId !== `user:${userId}`) {
                            console.log('[Delete] Ownership mismatch');
                            return c.json({ error: 'Unauthorized to delete this table' }, 403)
                        }

                        // Delete metadata if it exists
                        await db.delete(uploadId);
                        console.log('[Delete] Deleted upload record:', uploadId);
                    } else {
                        console.log('[Delete] Upload record not found, allowing authenticated user to delete');
                    }
                } catch (e) {
                    console.log('[Delete] Error checking ownership, allowing delete:', e.message);
                }

                // Actual table drop happens below via adapter
                actualConnection = { uploadId: uploadUuid };
            }
        }

        const Adapter = adapters[provider]
        if (!Adapter) {
            return c.json({ error: `Provider '${provider}' not supported` }, 400)
        }

        const adapter = new Adapter(actualConnection)

        try {
            await adapter.connect()
            console.log('[Delete] Adapter connected successfully')

            // Execute DROP/REMOVE TABLE
            const sql = provider === 'surrealdb'
                ? `REMOVE TABLE ${tableName}` // SurrealDB syntax (no quotes)
                : `DROP TABLE "${tableName}"`; // SQL syntax
            console.log('[Delete] Executing SQL:', sql)

            await adapter.query(sql)

            console.log('[Delete] Table deleted successfully')


            // Update persistently saved connection if exists
            if (connection.id) {
                try {
                    const [connRows] = await db.query("SELECT * FROM connection WHERE id = type::thing('connection', $id)", { id: connection.id })
                    const connRow = connRows[0]

                    if (connRow) {
                        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
                        if (config.sqlite && Array.isArray(config.sqlite.tables)) {
                            // Remove table from list
                            const idx = config.sqlite.tables.indexOf(tableName)
                            if (idx !== -1) {
                                config.sqlite.tables.splice(idx, 1)
                                // Save back
                                await db.query(
                                    "UPDATE connection SET config = $config WHERE id = type::thing('connection', $id)",
                                    { config: JSON.stringify(config), id: connection.id }
                                )
                                console.log('[Delete] Updated persistent connection config')
                            }
                        }
                    }
                } catch (e) {
                    console.error('[Delete] Failed to update persistent connection:', e)
                }
            }

            await adapter.disconnect()

            return c.json({ ok: true })
        } catch (error) {
            console.error('[Delete] Error:', error)
            await adapter.disconnect().catch(() => { })

            // Provide more helpful error messages
            let errorMessage = error.message || 'Failed to delete table'
            if (errorMessage.includes('no such table')) {
                errorMessage = 'Table not found. It may have already been deleted.'
            }

            return c.json({ error: errorMessage }, 500)
        }
    } catch (error) {
        console.error('[Delete] Request error:', error)
        return c.json({ error: error.message || 'Internal server error' }, 500)
    }
})

table.post("/save-table-data", async (c) => {
    try {
        const { tableName, updates, deletedRowIds = [], deletedColumns = [], connection, provider } = await c.req.json()
        console.log(`[Save] Received save request:`, {
            tableName,
            updateCount: updates?.length,
            deleteCount: deletedRowIds?.length,
            deletedColumnsCount: deletedColumns?.length,
            provider,
            hasConnection: !!connection
        })

        // Verify user session with JWT
        const token = getAuthToken(c)
        if (!token) {
            return c.json({ error: "Unauthorized - No session" }, 401)
        }

        let userId
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) {
            return c.json({ error: "Unauthorized - Invalid session" }, 401)
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
        else if (provider === 'surrealdb') {
            const uuidMatch = tableName.match(/^data_([a-zA-Z0-9]+)_/);
            if (uuidMatch) {
                const uploadUuid = uuidMatch[1];
                const uploadId = `uploads:${uploadUuid}`;

                try {
                    const [upload] = await db.query(`SELECT user_id FROM ${uploadId}`);
                    const ownerId = upload[0]?.user_id;

                    if (!ownerId || ownerId !== `user:${userId}`) {
                        return c.json({ error: "Unauthorized - Not your upload" }, 403)
                    }
                } catch (err) {
                    return c.json({ error: "Failed to verify upload ownership" }, 500)
                }
            }
        }

        const Adapter = adapters[provider]
        if (!Adapter) {
            return c.json({ error: `Provider '${provider}' not supported` }, 400)
        }

        const adapter = new Adapter(connection)

        try {
            await adapter.connect()
            let successCount = 0
            const queries = []

            // Process deletions first
            const deletedRowIdSet = new Set(deletedRowIds)

            for (const rowid of deletedRowIds) {
                if (rowid !== null && rowid !== undefined && rowid !== '') {
                    const sql = `DELETE FROM "${tableName}" WHERE rowid = ${Number(rowid)}`
                    queries.push(sql)
                }
            }

            // Process column deletions
            for (const columnName of deletedColumns) {
                if (columnName && columnName !== '_rowid_') {
                    const sql = `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`
                    queries.push(sql)
                }
            }

            for (const update of updates) {
                const rowData = update.data
                const originalData = update.original

                if (!rowData) continue

                const idKey = Object.keys(rowData).find(k =>
                    k.toLowerCase() === 'id' ||
                    k.toLowerCase() === '_id' ||
                    k.toLowerCase().endsWith('_id') ||
                    k === '_rowid_'
                )

                if (idKey && rowData[idKey] !== undefined && rowData[idKey] !== null) {
                    const setClause = Object.keys(rowData)
                        .filter(k => k !== idKey)
                        .map(k => {
                            const val = rowData[k]
                            if (val === null) return `"${k}" = NULL`
                            const escapedVal = String(val).replace(/'/g, "''")
                            return `"${k}" = '${escapedVal}'`
                        })
                        .join(', ')

                    if (setClause.length > 0) {
                        const escapedId = String(rowData[idKey]).replace(/'/g, "''")
                        const sql = `UPDATE "${tableName}" SET ${setClause} WHERE "${idKey}" = '${escapedId}'`
                        queries.push(sql)
                    }
                }
                else if (originalData) {
                    const setClause = Object.keys(rowData)
                        .filter(k => k !== 'undefined' && k !== '_rowid_')
                        .map(k => {
                            const val = rowData[k]
                            if (val === null) return `"${k}" = NULL`
                            const escapedVal = String(val).replace(/'/g, "''")
                            return `"${k}" = '${escapedVal}'`
                        })
                        .join(', ')

                    const whereClause = Object.keys(originalData)
                        .filter(k => {
                            if (k === 'undefined') return false
                            if (k === '_rowid_' && originalData[k] === null) return false
                            return true
                        })
                        .map(k => {
                            const val = originalData[k]
                            if (val === null) return `"${k}" IS NULL`
                            const escapedVal = String(val).replace(/'/g, "''")
                            return `"${k}" = '${escapedVal}'`
                        })
                        .join(' AND ')

                    if (setClause.length > 0 && whereClause.length > 0) {
                        const sql = `UPDATE "${tableName}" SET ${setClause} WHERE ${whereClause}`
                        queries.push(sql)
                    }
                }
                else {
                    const insertCols = Object.keys(rowData).filter(k =>
                        k !== 'undefined' &&
                        k !== '_rowid_' &&
                        !((k.toLowerCase() === 'id' || k.toLowerCase() === '_id') && (rowData[k] === null || rowData[k] === ''))
                    )

                    if (insertCols.length > 0) {
                        const cols = insertCols.map(k => `"${k}"`).join(', ')
                        const values = insertCols.map(k => {
                            const val = rowData[k]
                            if (val === null) return 'NULL'
                            return `'${String(val).replace(/'/g, "''")}'`
                        }).join(', ')

                        const sql = `INSERT INTO "${tableName}" (${cols}) VALUES (${values})`
                        queries.push(sql)
                    }
                }
            }

            if (queries.length > 0) {
                if (adapter.batch) {
                    const batchResult = await adapter.batch(queries)
                    if (Array.isArray(batchResult)) {
                        successCount = batchResult.reduce((sum, res) => sum + (res.rowsAffected || 0), 0)
                    } else {
                        successCount = batchResult.count || batchResult.affectedRows || 0
                    }
                } else {
                    for (const sql of queries) {
                        await adapter.query(sql)
                        successCount++
                    }
                }
            }

            return c.json({ ok: true, saved: successCount })

        } catch (err) {
            console.error("[Save] Database error:", err)
            return c.json({ error: err.message }, 500)
        } finally {
            await adapter.disconnect()
        }
    } catch (e) {
        console.error("[Save] API Error:", e)
        return c.json({ error: "Internal Server Error" }, 500)
    }
})

// === New Table API Routes ===

// 1. Fetch Table Schema
table.post("/table/:tableName/schema", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        const { connection, provider } = await c.req.json()

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider] || adapters[provider?.toLowerCase()]
        if (!Adapter) {
            console.error(`[Schema] Provider not supported: "${provider}". Available:`, Object.keys(adapters))
            return c.json({ error: `Provider not supported: ${provider}` }, 400)
        }

        const adapter = new Adapter(connection)

        try {
            await adapter.connect()
            const fullSchema = await adapter.getSchema()
            await adapter.disconnect()

            const columns = fullSchema[tableName] || []
            return c.json({ columns })
        } catch (e) {
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

// 2. Fetch Table Data (with hidden ID)
table.post("/table/:tableName/query", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        const { connection, provider, limit = 100, offset = 0 } = await c.req.json()

        // console.log(`[Query] Table: ${tableName}, Provider: ${provider}, Limit: ${limit}`);

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider] || adapters[provider?.toLowerCase()]
        if (!Adapter) {
            console.log(`[Query] Provider ${provider} not supported. Available:`, Object.keys(adapters));
            return c.json({ error: `Provider not supported: ${provider}` }, 400)
        }

        const adapter = new Adapter(connection)

        try {
            // console.log(`[Query] Connecting to ${provider}...`);
            await adapter.connect()
            // console.log(`[Query] Connected successfully`);

            // Generate provider-specific SQL
            let sql
            if (provider === 'surrealdb') {
                // SurrealDB: no quotes, uses START instead of OFFSET, id is implicit
                // Order by _row_order to preserve original row order
                sql = `SELECT *, meta::id(id) as __id FROM ${tableName} ORDER BY _row_order LIMIT ${Number(limit)} START ${Number(offset)}`
            } else if (provider === 'postgres' || provider === 'mysql') {
                // PostgreSQL and MySQL use standard SQL
                const quote = provider === 'mysql' ? '`' : '"'
                sql = `SELECT * FROM ${quote}${tableName}${quote} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
            } else {
                // SQLite and others
                sql = `SELECT rowid as __id, * FROM "${tableName}" LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
            }

            // console.log(`[Query] Executing: ${sql}`);
            const rows = await adapter.query(sql)
            // console.log(`[Query] Returned ${rows?.length || 0} rows`);
            await adapter.disconnect()

            return c.json({ rows: Array.isArray(rows) ? rows : [] })
        } catch (e) {
            console.error(`[Query] Error:`, e.message);
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        console.error(`[Query] Outer error:`, e.message);
        return c.json({ error: e.message }, 500)
    }
})

// 3. Atomic Operations
table.post("/table/:tableName/operations", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        const { connection, provider, operations } = await c.req.json()

        console.log(`[Operations] Received for ${provider} table ${tableName}, ${operations.length} operations`)

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        let userId;
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        if (provider === 'sqlite' && connection?.url?.includes('turso')) {
            const uploadIdMatch = tableName.match(/^data_([a-f0-9-]+)_/) || tableName.match(/^data_([a-f0-9_]+)_/)
            if (uploadIdMatch) {
                const uploadId = uploadIdMatch[1].replace(/_/g, '-')
                try {
                    const uploadCheck = await uploadsDb.execute({
                        sql: 'SELECT user_id FROM uploads WHERE id = ?',
                        args: [uploadId]
                    })
                    if (uploadCheck.rows.length === 0 || uploadCheck.rows[0].user_id !== userId) {
                        return c.json({ error: "Unauthorized - Not your upload" }, 403)
                    }
                } catch (e) { console.error('Upload verify failed', e) }
            }
        }
        else if (provider === 'surrealdb') {
            const uuidMatch = tableName.match(/^data_([a-zA-Z0-9]+)_/);
            if (uuidMatch) {
                const uploadId = `uploads:${uuidMatch[1]}`;
                console.log(`[Operations] Checking ownership for uploadId: ${uploadId}, userId: ${userId}`);
                try {
                    const [upload] = await db.query(`SELECT user_id FROM ${uploadId}`);
                    console.log(`[Operations] Upload query result:`, upload);

                    if (upload && upload.length > 0 && upload[0]) {
                        // Upload record exists, verify ownership
                        const ownerId = upload[0].user_id;
                        console.log(`[Operations] Owner ID: ${ownerId}, Expected: user:${userId}`);

                        if (ownerId !== `user:${userId}`) {
                            console.log(`[Operations] Authorization failed - user mismatch`);
                            return c.json({ error: "Unauthorized - Not your upload" }, 403)
                        }
                        console.log(`[Operations] Authorization passed`);
                    } else {
                        // Upload record doesn't exist (legacy upload or missing metadata)
                        // Allow authenticated users to proceed (they can only see their own tables anyway)
                        console.log(`[Operations] Upload record not found, allowing authenticated user to proceed`);
                    }
                } catch (e) {
                    console.error(`[Operations] Verification error:`, e);
                    // Don't block on verification errors for now
                    console.log(`[Operations] Allowing operation despite verification error`);
                }
            }
        }

        const Adapter = adapters[provider] || adapters[provider?.toLowerCase()]
        if (!Adapter) {
            console.error(`[Save] Provider not supported: "${provider}". Available:`, Object.keys(adapters))
            return c.json({ error: `Provider not supported: ${provider}` }, 400)
        }

        const adapter = new Adapter(connection)

        try {
            await adapter.connect()
            const queries = []

            if (provider === 'surrealdb') {
                for (const op of operations) {
                    if (op.type === 'full_replacement') {
                        const rows = op.rows || []

                        // Define schema fields for all columns in the data
                        if (rows.length > 0) {
                            const allColumns = new Set();
                            rows.forEach(row => {
                                Object.keys(row).forEach(key => {
                                    if (key !== '_row_order') allColumns.add(key);
                                });
                            });

                            console.log(`[Operations] Defining ${allColumns.size} fields for ${tableName}`);
                            for (const colName of allColumns) {
                                // Don't add to queries array - execute immediately to avoid batch issues
                                try {
                                    await adapter.query(`DEFINE FIELD \`${colName}\` ON TABLE ${tableName} FLEXIBLE PERMISSIONS FULL;`);
                                } catch (e) {
                                    // Ignore "already exists" errors (SurrealDB returns this when field is already defined)
                                    if (!e.message.includes('already exists')) {
                                        console.warn(`[Operations] Failed to define field ${colName}:`, e.message);
                                    }
                                }
                            }
                        }

                        // 1. Delete all
                        queries.push(`DELETE ${tableName}`)

                        // 2. Insert all with row_order to preserve order
                        const batchSize = 1000
                        for (let i = 0; i < rows.length; i += batchSize) {
                            const batch = rows.slice(i, i + batchSize).map((row, idx) => ({
                                ...row,
                                _row_order: i + idx  // Add order field
                            }))
                            if (batch.length > 0) {
                                queries.push(`INSERT INTO ${tableName} ${JSON.stringify(batch)}`)
                            }
                        }
                    }
                    else if (op.type === 'create') {
                        queries.push(`INSERT INTO ${tableName} ${JSON.stringify(op.data)}`)
                    }
                    else if (op.type === 'update') {
                        if (op.id) {
                            queries.push(`UPDATE ${op.id} MERGE ${JSON.stringify(op.changes)}`)
                        } else {
                            // Fallback if no ID (should rely on full_replacement usually)
                            console.warn('[SurrealDB] Update operation missing ID, skipping')
                        }
                    }
                    else if (op.type === 'delete') {
                        if (op.id) {
                            queries.push(`DELETE ${op.id}`)
                        }
                    }
                }
            } else {
                // SQLite / Others logic
                for (const op of operations) {
                    if (op.type === 'update') {
                        const setClause = Object.keys(op.changes).map(k => {
                            const val = op.changes[k]
                            if (val === null) return `"${k}" = NULL`
                            return `"${k}" = '${String(val).replace(/'/g, "''")}'`
                        }).join(', ')

                        if (setClause) {
                            queries.push(`UPDATE "${tableName}" SET ${setClause} WHERE rowid = ${Number(op.id)}`)
                        }
                    }
                    else if (op.type === 'delete') {
                        queries.push(`DELETE FROM "${tableName}" WHERE rowid = ${Number(op.id)}`)
                    }
                    else if (op.type === 'create') {
                        const keys = Object.keys(op.data)
                        const cols = keys.map(k => `"${k}"`).join(', ')
                        const vals = keys.map(k => {
                            const val = op.data[k]
                            if (val === null) return 'NULL'
                            return `'${String(val).replace(/'/g, "''")}'`
                        }).join(', ')
                        queries.push(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`)
                    }
                    else if (op.type === 'drop_column') {
                        queries.push(`ALTER TABLE "${tableName}" DROP COLUMN "${op.column}"`)
                    }
                    else if (op.type === 'add_column') {
                        queries.push(`ALTER TABLE "${tableName}" ADD COLUMN "${op.column}" TEXT`)
                    }
                    else if (op.type === 'full_replacement') {
                        queries.push(`DELETE FROM "${tableName}"`)
                        const rows = op.rows || []
                        const batchSize = 1000
                        for (let i = 0; i < rows.length; i += batchSize) {
                            const batch = rows.slice(i, i + batchSize)
                            for (const row of batch) {
                                const keys = Object.keys(row)
                                if (keys.length === 0) continue
                                const cols = keys.map(k => `"${k}"`).join(', ')
                                const vals = keys.map(k => {
                                    const val = row[k]
                                    if (val === null || val === undefined) return 'NULL'
                                    return `'${String(val).replace(/'/g, "''")}'`
                                }).join(', ')
                                queries.push(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`)
                            }
                        }
                    }
                    else if (op.type === 'cleanup_empty') {
                        const schemaResult = await adapter.query(`PRAGMA table_info("${tableName}")`)
                        const columns = schemaResult.map(col => col.name).filter(name => name !== 'rowid')
                        if (columns.length > 0) {
                            const conditions = columns.map(col => `("${col}" IS NULL OR "${col}" = '')`).join(' AND ')
                            queries.push(`DELETE FROM "${tableName}" WHERE ${conditions}`)
                        }
                    }
                }
            }

            console.log(`[Operations] Generated ${queries.length} queries`);
            if (queries.length > 0) {
                console.log(`[Operations] First query:`, queries[0].substring(0, 200));

                if (adapter.batch) {
                    console.log(`[Operations] Executing batch...`);
                    await adapter.batch(queries)
                    console.log(`[Operations] Batch executed successfully`);
                } else {
                    console.log(`[Operations] Executing queries individually...`);
                    for (const q of queries) {
                        console.log(`[Operations] Executing:`, q.substring(0, 100));
                        await adapter.query(q)
                    }
                    console.log(`[Operations] All queries executed`);
                }
            } else {
                console.log(`[Operations] No queries to execute`);
            }

            await adapter.disconnect()
            console.log(`[Operations] Success! Executed ${queries.length} queries`);
            return c.json({ success: true, count: queries.length })
        } catch (e) {
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

// 4. Re-Sanitize Endpoint (Versioning)
// 4. Sanitize Endpoint (On-Demand)
table.post("/table/:tableName/sanitize", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        console.log(`[Sanitize] Request for ${tableName}`)

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        // Logic:
        // 1. If table is raw upload (data_uuid_name), treat as First Time Sanitize
        //    -> Rename current to _original
        //    -> Sanitize -> Create _v1
        //    -> Create Metadata
        // 2. If table is already part of versioning (data_uuid_name_vN or _original)
        //    -> Identify Original
        //    -> Increment Version
        //    -> Sanitize -> Create _v(N+1)
        //    -> Update Metadata

        // Helper to check metadata
        let metadata = null;
        // Simplified query - just check if original_table matches or if it's the _original version
        const [metaResult] = await db.query(
            `SELECT * FROM sanitization_metadata WHERE original_table = $t OR original_table = $orig LIMIT 1`,
            { t: tableName, orig: `${tableName}_original` }
        );
        if (metaResult && metaResult[0]) metadata = metaResult[0];

        let originalTable = tableName;
        let currentVersion = 0;

        if (!metadata) {
            // Case 1: First time sanitization
            // Check if this is a raw table (not ending in _vN or _original) behavior
            // We'll rename it to _original to keep it safe
            originalTable = `${tableName}_original`;

            // Check if _original already exists
            const [existingOriginal] = await db.query(`SELECT * FROM ${originalTable} LIMIT 1`);

            if (!existingOriginal || existingOriginal.length === 0) {
                console.log(`[Sanitize] First run: Copying ${tableName} to ${originalTable}`);

                // Copy all data from the raw table to _original
                const [rawData] = await db.query(`SELECT * FROM ${tableName}`);
                if (rawData && rawData.length > 0) {
                    // Insert into _original table
                    for (const row of rawData) {
                        const cleanRow = { ...row };
                        delete cleanRow.id; // Remove the ID so SurrealDB generates a new one
                        await db.create(originalTable, cleanRow);
                    }
                    console.log(`[Sanitize] Copied ${rawData.length} rows to ${originalTable}`);
                } else {
                    return c.json({ error: "Source table is empty" }, 400);
                }
            } else {
                console.log(`[Sanitize] Using existing ${originalTable}`);
            }
        } else {
            // Case 2: Re-sanitization
            originalTable = metadata.original_table;
            currentVersion = metadata.current_version;
        }

        console.log(`[Sanitize] Using original source: ${originalTable}`);

        // Fetch Data from Original
        const [rows] = await db.query(`SELECT * FROM ${originalTable} ORDER BY _row_order ASC`);
        const cleanRows = rows.map(r => {
            const newRow = { ...r };
            delete newRow.id;
            delete newRow._row_order;
            return newRow;
        });

        if (cleanRows.length === 0) return c.json({ error: "Source table is empty" }, 400);

        // Analyze & Interpret
        // The analyeForSanitization now includes interpretDataset internally
        // We pass a hint if we have one (could come from request body)
        const body = await c.req.parseBody().catch(() => ({}));

        // Extract logical name for better context
        let logicalName = originalTable.replace(/^data_[^_]+_/, '').replace(/_original$/, '');

        console.log(`[Sanitize] Analyzing data for ${logicalName}...`);
        const analysis = await analyzeForSanitization(logicalName, cleanRows, { hint: body.hint });
        const issues = analysis.issues || [];
        const interpretation = analysis.interpretation;

        // Apply Fixes
        let sanitizedRows = cleanRows;
        let issuesFixed = [];
        if (issues.length > 0) {
            console.log(`[Sanitize] Auto-fixing ${issues.length} issues`);
            sanitizedRows = applySanitization(cleanRows, issues);
            issuesFixed = issues.map(i => i.column);
        }

        // Determine New Version Name
        const nextVersion = currentVersion + 1;
        // Base name from original (remove _original)
        const baseName = originalTable.replace(/_original$/, '');
        const newTableName = `${baseName}_v${nextVersion}`;

        console.log(`[Sanitize] Creating ${newTableName}`);
        await createTableAndInsertData(newTableName, sanitizedRows);

        // Update/Create Metadata
        const versionRecord = {
            version: nextVersion,
            table: newTableName,
            created_at: new Date(),
            reason: body.reason || (currentVersion === 0 ? 'Initial Sanitization' : 'Re-sanitization'),
            issues_fixed: issuesFixed,
            interpretation_summary: interpretation?.domain?.domain, // Keep for backward compat
            semantic_context: {
                domain: interpretation?.domain,
                columns: interpretation?.columns
            }
        };

        if (metadata) {
            await db.query(`UPDATE ${metadata.id} SET current_version = ${nextVersion}, versions += $ver`, { ver: versionRecord });
        } else {
            await db.create('sanitization_metadata', {
                original_table: originalTable,
                logical_name: logicalName,
                upload_id: `uploads:${originalTable.match(/data_([^_]+)_/)?.[1] || 'unknown'}`,
                current_version: nextVersion,
                versions: [versionRecord]
            });
        }

        const responseObj = {
            success: true,
            newTableName: newTableName,
            version: nextVersion,
            issuesFixed: issuesFixed.length
        };

        console.log('[Sanitize] Returning response:', JSON.stringify(responseObj));
        return c.json(responseObj);

    } catch (e) {
        console.error("[Re-Sanitize] Error:", e)
        return c.json({ error: e.message }, 500)
    }
})

// Internal Helper for Table Creation (Duplicated from index.js to keep file self-contained)
async function createTableAndInsertData(tableName, rows) {
    const columnNames = new Set();
    rows.forEach(row => Object.keys(row).forEach(key => columnNames.add(key)));

    for (const colName of columnNames) {
        try {
            await db.query(`DEFINE FIELD \`${colName}\` ON TABLE ${tableName} FLEXIBLE PERMISSIONS FULL;`);
        } catch (e) { }
    }
    await db.query(`DEFINE FIELD _row_order ON TABLE ${tableName} TYPE option<number> PERMISSIONS FULL;`);

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const safeChunk = chunk.map((row, idx) => {
            const newRow = { _row_order: i + idx };
            for (const key in row) newRow[key] = row[key];
            return newRow;
        });
        await db.insert(tableName, safeChunk);
    }
}

// 5. Get Table Versions
table.get("/table/:tableName/versions", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        // Find metadata where tableName is either the original or one of the versions
        // We look for any record that mentions this table
        // Query: SELECT * FROM sanitization_metadata WHERE original_table = $t OR versions[?].table CONTAINS $t

        let meta = null
        const [result] = await db.query(`
            SELECT * FROM sanitization_metadata 
            WHERE original_table = $t 
            OR $t IN versions[*].table
            LIMIT 1
        `, { t: tableName });

        if (result && result[0]) {
            meta = result[0]
        } else {
            // No history found. Maybe it's a standalone table.
            // Return minimal info
            return c.json({
                original_table: tableName,
                current_version: 1,
                versions: []
            })
        }

        return c.json({
            original_table: meta.original_table,
            current_version: meta.current_version,
            versions: meta.versions || []
        })

    } catch (e) {
        console.error("[Versions] Error:", e)
        return c.json({ error: e.message }, 500)
    }
})


// Semantic Interpretation Endpoint
table.get('/:tableName/interpret', async (c) => {
    try {
        const { tableName } = c.req.param()
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        let rows = []
        try {
            // Limit to 100 rows for analysis
            const result = await db.query(`SELECT * FROM type::table($tb) LIMIT 100`, { tb: tableName });
            rows = result[0] || [];
        } catch (e) {
            console.error('[Interpret] Failed to fetch rows:', e);
            return c.json({ error: "Table not found or access denied" }, 404);
        }

        if (rows.length === 0) {
            return c.json({ message: "No data to interpret" });
        }

        console.log(`[Interpret] Interpreting ${tableName} with ${rows.length} rows`);
        const interpretation = await interpretDataset(tableName, rows);

        return c.json({
            table: tableName,
            interpretation
        });

    } catch (e) {
        console.error('[Interpret] Error:', e);
        return c.json({ error: e.message }, 500);
    }
})

// ========================================
// SPREADSHEET SHARING & PERMISSIONS
// ========================================

// Share spreadsheet with a user
table.post("/:tableName/share", async (c) => {
    try {
        const { tableName } = c.req.param()
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const payload = await verify(token, jwtSecret)
        const user = await upsertUser(payload)

        const { email, accessLevel = 'view' } = await c.req.json()
        if (!email) return c.json({ error: "Email is required" }, 400)
        if (!['view', 'edit'].includes(accessLevel)) {
            return c.json({ error: "accessLevel must be 'view' or 'edit'" }, 400)
        }

        // TODO: Verify user owns or has share permission on this spreadsheet
        // For now, allow any authenticated user to share their data tables

        // Check if user exists in system
        const [existingUsers] = await db.query(
            `SELECT * FROM user WHERE email = $email`,
            { email }
        )
        if (!existingUsers || existingUsers.length === 0) {
            return c.json({ error: "User not found. They must sign up first." }, 404)
        }

        // Create or update permission
        await db.query(`
            INSERT INTO spreadsheet_permission {
                spreadsheet: $spreadsheet,
                user_email: $email,
                access_level: $accessLevel,
                granted_by: $grantedBy,
                granted_at: time::now()
            }
            ON DUPLICATE KEY UPDATE 
                access_level = $accessLevel,
                granted_at = time::now()
        `, {
            spreadsheet: tableName,
            email,
            accessLevel,
            grantedBy: user.id
        })

        console.log(`[Share] ${user.email} shared ${tableName} with ${email} (${accessLevel})`)
        return c.json({ success: true, email, accessLevel })

    } catch (e) {
        console.error('[Share] Error:', e)
        return c.json({ error: e.message }, 500)
    }
})

// Get spreadsheet permissions
table.get("/:tableName/permissions", async (c) => {
    try {
        const { tableName } = c.req.param()
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const [permissions] = await db.query(
            `SELECT * FROM spreadsheet_permission WHERE spreadsheet = $tableName`,
            { tableName }
        )

        return c.json({ permissions: permissions || [] })

    } catch (e) {
        console.error('[Permissions] Error:', e)
        return c.json({ error: e.message }, 500)
    }
})

// Revoke spreadsheet access
table.delete("/:tableName/share/:email", async (c) => {
    try {
        const { tableName, email } = c.req.param()
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const payload = await verify(token, jwtSecret)
        const user = await upsertUser(payload)

        // Delete permission
        await db.query(
            `DELETE FROM spreadsheet_permission WHERE spreadsheet = $tableName AND user_email = $email`,
            { tableName, email }
        )

        console.log(`[Share] ${user.email} revoked ${email}'s access to ${tableName}`)
        return c.json({ success: true })

    } catch (e) {
        console.error('[Revoke] Error:', e)
        return c.json({ error: e.message }, 500)
    }
})

// 4. Combined Load (Schema + Data)
table.post("/table/:tableName/load", async (c) => {
    try {
        const tableName = c.req.param("tableName")
        const { connection, provider, limit = 2000, offset = 0 } = await c.req.json()

        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider] || adapters[provider?.toLowerCase()]
        if (!Adapter) return c.json({ error: `Provider not supported: ${provider}` }, 400)

        const adapter = new Adapter(connection)

        try {
            await adapter.connect()

            // Run schema and data queries in parallel on the server
            const [fullSchema, rows] = await Promise.all([
                adapter.getSchema(),
                (async () => {
                    let sql
                    if (provider === 'surrealdb') {
                        sql = `SELECT *, meta::id(id) as __id FROM ${tableName} ORDER BY _row_order LIMIT ${Number(limit)} START ${Number(offset)}`
                    } else if (provider === 'postgres' || provider === 'mysql') {
                        const quote = provider === 'mysql' ? '`' : '"'
                        sql = `SELECT * FROM ${quote}${tableName}${quote} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
                    } else {
                        sql = `SELECT rowid as __id, * FROM "${tableName}" LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
                    }
                    return adapter.query(sql)
                })()
            ])

            await adapter.disconnect()

            const columns = fullSchema[tableName] || []
            return c.json({ columns, rows: Array.isArray(rows) ? rows : [] })
        } catch (e) {
            console.error(`[Load] Error:`, e.message);
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

// Check if current user has access to a spreadsheet
table.get("/:tableName/access", async (c) => {
    try {
        const { tableName } = c.req.param()
        const token = getAuthToken(c)
        if (!token) return c.json({ error: "Unauthorized" }, 401)

        const payload = await verify(token, jwtSecret)

        const [permissions] = await db.query(
            `SELECT * FROM spreadsheet_permission WHERE spreadsheet = $tableName AND user_email = $email`,
            { tableName, email: payload.email }
        )

        if (permissions && permissions.length > 0) {
            return c.json({
                hasAccess: true,
                accessLevel: permissions[0].access_level
            })
        }

        // TODO: Check if user is owner of the spreadsheet
        return c.json({ hasAccess: false, accessLevel: null })

    } catch (e) {
        console.error('[Access] Error:', e)
        return c.json({ error: e.message }, 500)
    }
})

export { table as tableRoutes }


