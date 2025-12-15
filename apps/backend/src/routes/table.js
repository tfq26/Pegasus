import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { uploadsDb } from "../../db/uploads.js"
import { adapters } from "../../adapters/index.js"

const table = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Helper
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        await db.query(`
        UPDATE user:${userId} SET 
            email = $email,
            first_name = $firstName,
            last_name = $lastName,
            profile_picture_url = $pic,
            updated_at = time::now()
        RETURN AFTER;
    `, {
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
        });
    } catch (e) {
        console.error("Failed to upsert user:", e)
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
        const token = getCookie(c, "session")
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

        const Adapter = adapters[provider]
        if (!Adapter) {
            return c.json({ error: `Provider '${provider}' not supported` }, 400)
        }

        const adapter = new Adapter(actualConnection)

        try {
            await adapter.connect()
            console.log('[Rename] Adapter connected successfully')

            // Execute ALTER TABLE RENAME TO
            const sql = `ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`
            console.log('[Rename] Executing SQL:', sql)

            await adapter.query(sql)

            console.log('[Rename] Table renamed successfully')

            // Update persistently saved connection if exists
            if (connection.id) {
                try {
                    const connRows = await db.execute({ sql: "SELECT * FROM connections WHERE id = ?", args: [connection.id] })
                    const connRow = connRows.rows[0]

                    if (connRow) {
                        const config = JSON.parse(connRow.config)

                        // Upgrade to robust 'uploadId' linking if available
                        if (extractedUploadId) {
                            config.sqlite.uploadId = extractedUploadId
                            // We can remove the static tables list since we now search dynamically
                            if (config.sqlite.tables) delete config.sqlite.tables

                            await db.execute({
                                sql: "UPDATE connections SET config = ? WHERE id = ?",
                                args: [JSON.stringify(config), connection.id]
                            })
                        }
                        // Fallback for legacy connections without uploadId (shouldn't happen for Turso uploads ideally)
                        else if (config.sqlite && Array.isArray(config.sqlite.tables)) {
                            // Update tables list
                            const idx = config.sqlite.tables.indexOf(oldTableName)
                            if (idx !== -1) {
                                config.sqlite.tables[idx] = newTableName
                                // Save back
                                await db.execute({
                                    sql: "UPDATE connections SET config = ? WHERE id = ?",
                                    args: [JSON.stringify(config), connection.id]
                                })
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
        const token = getCookie(c, "session")
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

        const Adapter = adapters[provider]
        if (!Adapter) {
            return c.json({ error: `Provider '${provider}' not supported` }, 400)
        }

        const adapter = new Adapter(actualConnection)

        try {
            await adapter.connect()
            console.log('[Delete] Adapter connected successfully')

            // Execute DROP TABLE
            const sql = `DROP TABLE "${tableName}"`
            console.log('[Delete] Executing SQL:', sql)

            await adapter.query(sql)

            console.log('[Delete] Table deleted successfully')

            // Update persistently saved connection if exists
            if (connection.id) {
                try {
                    const connRows = await db.execute({ sql: "SELECT * FROM connections WHERE id = ?", args: [connection.id] })
                    const connRow = connRows.rows[0]

                    if (connRow) {
                        const config = JSON.parse(connRow.config)
                        if (config.sqlite && Array.isArray(config.sqlite.tables)) {
                            // Remove table from list
                            const idx = config.sqlite.tables.indexOf(tableName)
                            if (idx !== -1) {
                                config.sqlite.tables.splice(idx, 1)
                                // Save back
                                await db.execute({
                                    sql: "UPDATE connections SET config = ? WHERE id = ?",
                                    args: [JSON.stringify(config), connection.id]
                                })
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
        const token = getCookie(c, "session")
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

        const token = getCookie(c, "session")
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

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

        const token = getCookie(c, "session")
        if (!token) return c.json({ error: "Unauthorized" }, 401)
        try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

        const adapter = new Adapter(connection)
        try {
            await adapter.connect()
            const sql = `SELECT rowid as __id, * FROM "${tableName}" LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
            const rows = await adapter.query(sql)
            await adapter.disconnect()

            return c.json({ rows: Array.isArray(rows) ? rows : [] })
        } catch (e) {
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
        const { connection, provider, operations } = await c.req.json()

        const token = getCookie(c, "session")
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

        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

        const adapter = new Adapter(connection)
        try {
            await adapter.connect()
            const queries = []

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

            if (queries.length > 0) {
                if (adapter.batch) {
                    await adapter.batch(queries)
                } else {
                    for (const q of queries) await adapter.query(q)
                }
            }

            await adapter.disconnect()
            return c.json({ success: true, count: queries.length })
        } catch (e) {
            return c.json({ error: e.message }, 500)
        }
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

export { table as tableRoutes }
