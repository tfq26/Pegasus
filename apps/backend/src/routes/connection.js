import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"

const connections = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Helper
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
            return existingById[0].id.toString();
        } else {
            // 2. Not found by ID -> Check by Email to prevent duplicates
            const [existingByEmail] = await db.query(`SELECT id FROM user WHERE email = $email`, { email: payload.email });

            if (existingByEmail && existingByEmail.length > 0) {
                // Found by Email -> Update that record instead
                const targetId = existingByEmail[0].id.toString();
                await db.query(`
                    UPDATE ${targetId} SET 
                        first_name = $firstName,
                        last_name = $lastName,
                        profile_picture_url = $pic,
                        updated_at = time::now();
                `, {
                    firstName: payload.firstName || payload.first_name,
                    lastName: payload.lastName || payload.last_name,
                    pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
                });
                return targetId;
            } else {
                // 3. Not found by ID or Email -> Create new
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
                return userRecordId;
            }
        }
    } catch (e) {
        console.error("[Connection] Failed to upsert user:", e)
        return null;
    }
}

// Helper to get token from cookie or header
const getAuthToken = (c) => {
    // Try cookie first
    let token = getCookie(c, "session")
    // Fallback to Authorization header
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }
    return token
}

connections.get("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }

        const [results] = await db.query(`
        SELECT * FROM connection WHERE user = type::thing('user', $userId) ORDER BY created_at ASC;
    `, { userId });

        const connectionList = results.map(row => {
            const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
            return {
                id: row.id.toString().split(':')[1] || row.id,
                nickname: row.nickname,
                description: row.description,
                provider: row.provider,
                ...config
            }
        })

        return c.json({ connections: connectionList })
    } catch (error) {
        console.error("[Connection] GET error:", error)
        return c.json({ error: "Unauthorized" }, 401)
    }
})

connections.post("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }
        const connection = await c.req.json()

        let config = {}
        if (connection.provider === 'mysql') config = { mysql: connection.mysql }
        else if (connection.provider === 'mongodb') config = { mongodb: connection.mongodb }
        else if (connection.provider === 'kusto') config = { kusto: connection.kusto }
        else if (connection.provider === 'sqlite') config = { sqlite: connection.sqlite }
        else if (connection.provider === 'postgres') config = { postgres: connection.postgres }
        else if (connection.provider === 'surrealdb') config = { surrealdb: connection.surrealdb }

        // Generate ID without hyphens for SurrealDB compatibility
        const id = connection.id ? connection.id.replace(/-/g, '') : crypto.randomUUID().replace(/-/g, '')

        console.log('[Connection] Saving connection:', id, 'for user:', userId)

        await db.query(`
        CREATE connection:${id} CONTENT {
            user: type::thing('user', $userId),
            nickname: $nickname,
            description: $description,
            provider: $provider,
            config: $config,
            created_at: time::now()
        };
    `, {
            userId: userId,
            nickname: connection.nickname,
            description: connection.description ?? null,
            provider: connection.provider,
            config: config
        });

        console.log('[Connection] Connection saved successfully')

        return c.json({ ok: true })
    } catch (error) {
        console.error("Connection save error:", error)
        return c.json({ error: "Failed to save connection" }, 500)
    }
})

connections.put("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }
        let connectionId = c.req.param('id')
        if (!connectionId.includes(':')) connectionId = `connection:${connectionId}`
        const connection = await c.req.json()

        let config = {}
        if (connection.provider === 'mysql') config = { mysql: connection.mysql }
        else if (connection.provider === 'mongodb') config = { mongodb: connection.mongodb }
        else if (connection.provider === 'kusto') config = { kusto: connection.kusto }
        else if (connection.provider === 'sqlite') config = { sqlite: connection.sqlite }
        else if (connection.provider === 'postgres') config = { postgres: connection.postgres }
        else if (connection.provider === 'surrealdb') config = { surrealdb: connection.surrealdb }

        console.log('[Connection] Updating connection:', connectionId, 'for user:', userId)

        const [updated] = await db.query(`
        UPDATE ${connectionId} SET {
            nickname: $nickname,
            description: $description,
            provider: $provider,
            config: $config
        } WHERE user = type::thing('user', $userId);
    `, {
            userId: userId,
            nickname: connection.nickname,
            description: connection.description ?? null,
            provider: connection.provider,
            config: config
        });

        if (!updated || !updated.length) {
            return c.json({ error: "Connection not found or not authorized" }, 404)
        }

        console.log('[Connection] Connection updated successfully')
        return c.json({ ok: true })
    } catch (error) {
        console.error("Connection update error:", error)
        return c.json({ error: "Failed to update connection" }, 500)
    }
})

connections.delete("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }
        let connectionId = c.req.param('id')
        if (!connectionId.includes(':')) connectionId = `connection:${connectionId}`

        console.log('[Connection] Deleting connection:', connectionId, 'for user:', userId)

        await db.query(`DELETE ${connectionId} WHERE user = type::thing('user', $userId);`, { userId });

        console.log('[Connection] Connection deleted successfully')
        return c.json({ success: true })
    } catch (e) {
        console.error("Connection delete error:", e)
        return c.json({ error: "Failed to delete connection" }, 500)
    }
})

export { connections as connectionRoutes }
