import { Hono } from "hono"
import { db } from "../../db/surreal.js"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { ConfigService } from "../services/ConfigService.js"

export const dataSourceRoutes = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Middleware
dataSourceRoutes.use('*', async (c, next) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        c.set('user', payload)
        await next()
    } catch (e) {
        return c.json({ error: "Unauthorized" }, 401)
    }
})

/**
 * GET /data-sources
 * List all data sources for the current user
 */
dataSourceRoutes.get('/', async (c) => {
    const user = c.get('user')
    const userId = user.sub || user.id
    try {
        const [sources] = await db.query(`SELECT * FROM data_source WHERE user = type::thing('user', $userId) ORDER BY created_at DESC`, { userId })
        return c.json(sources || [])
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

/**
 * POST /data-sources
 * Create a new data source
 */
dataSourceRoutes.post('/', async (c) => {
    const user = c.get('user')
    const userId = user.sub || user.id
    const body = await c.req.json()

    try {
        const [source] = await db.query(`
            CREATE data_source CONTENT {
                user: type::thing('user', $userId),
                name: $name,
                type: $type,
                config: $config,
                polling_interval: $interval,
                is_active: true,
                created_at: time::now()
            }
        `, {
            userId,
            name: body.name,
            type: body.type,
            config: body.config || {},
            interval: body.polling_interval || 300
        })
        return c.json(source[0])
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

/**
 * DELETE /data-sources/:id
 * Delete a data source and its associated bindings
 */
dataSourceRoutes.delete('/:id', async (c) => {
    const id = c.req.param('id')
    try {
        const recordId = id.includes(':') ? id : `data_source:${id}`

        // Delete bindings first to maintain integrity
        await db.query(`DELETE cell_binding WHERE data_source = type::thing('data_source', $id)`, { id: recordId.split(':')[1] || recordId })

        await db.query(`DELETE ${recordId}`)
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

// --- Cell Bindings ---

/**
 * GET /data-sources/bindings
 * List cell bindings, optionally filtered by spreadsheet
 */
dataSourceRoutes.get('/bindings', async (c) => {
    const user = c.get('user')
    const userId = user.sub || user.id
    const spreadsheetId = c.req.query('spreadsheetId')

    try {
        let query = `SELECT * FROM cell_binding WHERE user = type::thing('user', $userId)`
        const params = { userId }

        if (spreadsheetId) {
            query += ` AND spreadsheet_id = $spreadsheetId`
            params.spreadsheetId = spreadsheetId
        }

        const [bindings] = await db.query(query, params)
        return c.json(bindings || [])
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

/**
 * POST /data-sources/bindings
 * Create or update a cell binding
 */
dataSourceRoutes.post('/bindings', async (c) => {
    const user = c.get('user')
    const userId = user.sub || user.id
    const body = await c.req.json()

    try {
        // Use UPSERT pattern
        const [binding] = await db.query(`
            BEGIN TRANSACTION;
            LET $existing = (SELECT id FROM cell_binding WHERE spreadsheet_id = $spreadsheetId AND cell_id = $cellId LIMIT 1);
            IF $existing[0].id {
                UPDATE $existing[0].id SET
                    data_source = type::thing('data_source', $dataSourceId),
                    field_path = $fieldPath,
                    updated_at = time::now();
            } ELSE {
                CREATE cell_binding CONTENT {
                    user: type::thing('user', $userId),
                    spreadsheet_id: $spreadsheetId,
                    cell_id: $cellId,
                    data_source: type::thing('data_source', $dataSourceId),
                    field_path: $fieldPath,
                    updated_at: time::now()
                };
            };
            COMMIT TRANSACTION;
        `, {
            userId,
            spreadsheetId: body.spreadsheetId,
            cellId: body.cellId,
            dataSourceId: body.dataSourceId,
            fieldPath: body.fieldPath
        })

        // Return the updated/created binding
        const [result] = await db.query(`SELECT * FROM cell_binding WHERE spreadsheet_id = $spreadsheetId AND cell_id = $cellId`, {
            spreadsheetId: body.spreadsheetId,
            cellId: body.cellId
        })

        return c.json(result[0])
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

/**
 * DELETE /data-sources/bindings/:id
 * Delete a cell binding
 */
dataSourceRoutes.delete('/bindings/:id', async (c) => {
    const id = c.req.param('id')
    try {
        const recordId = id.includes(':') ? id : `cell_binding:${id}`
        await db.query(`DELETE ${recordId}`)
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})
