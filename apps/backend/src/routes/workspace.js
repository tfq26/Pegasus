import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { WorkspaceService } from "../services/WorkspaceService.js"

const workspace = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Helper to ensure user exists in DB (Copy from other routes to ensure self-containment)
// In a refactor, this should be a middleware or service.
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`

        // 1. Try to find by ID
        const [existingById] = await db.query(`SELECT id FROM ${userRecordId}`);

        if (existingById && existingById.length > 0) {
            // Found by ID -> Update
            await db.query(`
                UPDATE ${userRecordId} SET 
                    email = $email,
                    updated_at = time::now();
            `, { email: payload.email });
            return existingById[0].id.toString();
        } else {
            // 2. Not found by ID -> Check by Email
            const [existingByEmail] = await db.query(`SELECT id FROM user WHERE email = $email`, { email: payload.email });
            if (existingByEmail && existingByEmail.length > 0) {
                return existingByEmail[0].id.toString();
            } else {
                // 3. Create new
                const [created] = await db.query(`
                    CREATE ${userRecordId} CONTENT {
                        email: $email,
                        created_at: time::now(),
                        updated_at: time::now()
                    };
                `, { email: payload.email });
                return created && created[0] ? created[0].id.toString() : userRecordId;
            }
        }
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
