import { db } from "../db/index.js"
import { dataSources, cellBindings } from "../db/schema.js"
import { eq, and, desc } from "drizzle-orm"
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
        const results = await db.query.dataSources.findMany({
            where: eq(dataSources.userId, userId),
            orderBy: [desc(dataSources.createdAt)]
        });
        return c.json(results || [])
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
        const [source] = await db.insert(dataSources).values({
            userId,
            name: body.name,
            type: body.type,
            config: body.config || {},
            pollingInterval: body.polling_interval || 300,
            isActive: true,
            createdAt: new Date()
        }).returning();
        return c.json(source)
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
    const rawId = id.includes(':') ? id.split(':')[1] : id
    try {
        await db.delete(dataSources).where(eq(dataSources.id, rawId));
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
        let whereClause = eq(cellBindings.userId, userId);
        if (spreadsheetId) {
            whereClause = and(whereClause, eq(cellBindings.spreadsheetId, spreadsheetId));
        }

        const results = await db.query.cellBindings.findMany({
            where: whereClause
        });
        return c.json(results || [])
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
        const [binding] = await db.insert(cellBindings)
            .values({
                userId,
                spreadsheetId: body.spreadsheetId,
                cellId: body.cellId,
                dataSourceId: body.dataSourceId,
                fieldPath: body.fieldPath,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: [cellBindings.spreadsheetId, cellBindings.cellId],
                set: {
                    dataSourceId: body.dataSourceId,
                    fieldPath: body.fieldPath,
                    updatedAt: new Date()
                }
            })
            .returning();

        return c.json(binding)
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
    const rawId = id.includes(':') ? id.split(':')[1] : id
    try {
        await db.delete(cellBindings).where(eq(cellBindings.id, rawId));
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})
