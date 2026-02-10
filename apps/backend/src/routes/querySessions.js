import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { querySessions, queryHistory } from "../db/schema.js"
import { eq, and, sql } from "drizzle-orm"
import { ConfigService } from "../services/ConfigService.js"

const sessions = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Middleware for Auth
const authMiddleware = async (c, next) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        c.set('userId', payload.sub)
        await next()
    } catch (e) {
        return c.json({ error: "Unauthorized" }, 401)
    }
}

sessions.use('*', authMiddleware)

// Get all sessions for a space
sessions.get("/space/:spaceId", async (c) => {
    const userId = c.get('userId')
    const spaceId = c.req.param('spaceId')
    const rawSpaceId = spaceId.includes(':') ? spaceId.split(':')[1] : spaceId

    try {
        const results = await db.select()
            .from(querySessions)
            .where(and(
                eq(querySessions.spaceId, rawSpaceId),
                eq(querySessions.userId, userId)
            ))
            .orderBy(sql`${querySessions.updatedAt} DESC`)

        return c.json({ sessions: results })
    } catch (e) {
        console.error("[QuerySessions] Fetch error:", e)
        return c.json({ error: "Failed to fetch sessions" }, 500)
    }
})

// Create a new session
sessions.post("/", async (c) => {
    const userId = c.get('userId')
    const { spaceId, name, queries } = await c.req.json()
    const rawSpaceId = spaceId && spaceId.includes(':') ? spaceId.split(':')[1] : spaceId

    try {
        const [session] = await db.insert(querySessions)
            .values({
                userId,
                spaceId: rawSpaceId,
                name: name || "Untitled Session",
                queries: queries || []
            })
            .returning()

        return c.json(session)
    } catch (e) {
        console.error("[QuerySessions] Create error:", e)
        return c.json({ error: "Failed to create session" }, 500)
    }
})

// Update a session (e.g., append a query)
sessions.put("/:id", async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = await c.req.json()

    try {
        const [session] = await db.update(querySessions)
            .set({
                ...body,
                updatedAt: new Date()
            })
            .where(and(
                eq(querySessions.id, id),
                eq(querySessions.userId, userId)
            ))
            .returning()

        if (!session) return c.json({ error: "Session not found" }, 404)

        return c.json(session)
    } catch (e) {
        console.error("[QuerySessions] Update error:", e)
        return c.json({ error: "Failed to update session" }, 500)
    }
})

// Delete a session
sessions.delete("/:id", async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    try {
        await db.delete(querySessions)
            .where(and(
                eq(querySessions.id, id),
                eq(querySessions.userId, userId)
            ))

        return c.json({ success: true })
    } catch (e) {
        console.error("[QuerySessions] Delete error:", e)
        return c.json({ error: "Failed to delete session" }, 500)
    }
})

export { sessions as querySessionRoutes }
