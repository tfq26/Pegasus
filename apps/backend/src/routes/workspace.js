import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { WorkspaceService } from "../services/WorkspaceService.js"
import { ConfigService } from "../services/ConfigService.js"

const workspace = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Helper to ensure user exists in DB (Copy from other routes to ensure self-containment)
// In a refactor, this should be a middleware or service.
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id;
        const [user] = await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    email: payload.email,
                    updatedAt: new Date()
                }
            })
            .returning();
        return user.id;
    } catch (e) {
        console.error("[Workspace] Failed to upsert user:", e)
        return null;
    }
}

// Middleware for Auth
const authMiddleware = async (c, next) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)

        // Use resolved ID logic from other routes (strip prefix if needed)
        if (resolvedId) {
            const resolvedStr = resolvedId.toString();
            const parts = resolvedStr.split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedStr
        }

        c.set('userId', userId)
        await next()
    } catch (e) {
        return c.json({ error: "Unauthorized" }, 401)
    }
}

// Routes
workspace.use('*', authMiddleware)

workspace.get('/:connectionId', async (c) => {
    const userId = c.get('userId')
    const connectionId = c.req.param('connectionId')

    try {
        const data = await WorkspaceService.getWorkspace(userId, connectionId)
        return c.json({ workspace: data })
    } catch (e) {
        console.error("[Workspace] Get error:", e)
        return c.json({ error: "Failed to fetch workspace" }, 500)
    }
})

workspace.post('/:connectionId', async (c) => {
    const userId = c.get('userId')
    const connectionId = c.req.param('connectionId')

    try {
        const { workspace: data } = await c.req.json()
        await WorkspaceService.saveWorkspace(userId, connectionId, data)
        return c.json({ success: true })
    } catch (e) {
        console.error("[Workspace] Save error:", e)
        return c.json({ error: "Failed to save workspace" }, 500)
    }
})

workspace.post('/migrate/unsaved', async (c) => {
    const userId = c.get('userId')

    try {
        const { targetConnectionId } = await c.req.json()
        if (!targetConnectionId) return c.json({ error: "Target connection ID required" }, 400)

        const result = await WorkspaceService.migrateUnsaved(userId, targetConnectionId)
        return c.json(result)
    } catch (e) {
        console.error("[Workspace] Migrate error:", e)
        return c.json({ error: "Failed to migrate workspace" }, 500)
    }
})

export { workspace as workspaceRoutes }
