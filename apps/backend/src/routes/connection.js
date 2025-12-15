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

connections.get("/", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        const [results] = await db.query(`
        SELECT * FROM connection WHERE user = $user ORDER BY created_at ASC;
    `, { user: `user:${userId}` });

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
        return c.json({ error: "Unauthorized" }, 401)
    }
})

connections.post("/", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const connection = await c.req.json()

        await upsertUser(payload)

        let config = {}
        if (connection.provider === 'mysql') config = { mysql: connection.mysql }
        else if (connection.provider === 'mongodb') config = { mongodb: connection.mongodb }
        else if (connection.provider === 'kusto') config = { kusto: connection.kusto }
        else if (connection.provider === 'sqlite') config = { sqlite: connection.sqlite }
        else if (connection.provider === 'postgres') config = { postgres: connection.postgres }

        const id = connection.id || crypto.randomUUID()

        await db.query(`
        CREATE connection:${id} CONTENT {
            user: $user,
            nickname: $nickname,
            description: $description,
            provider: $provider,
            config: $config,
            created_at: time::now()
        };
    `, {
            user: `user:${userId}`,
            nickname: connection.nickname,
            description: connection.description ?? null,
            provider: connection.provider,
            config: config
        });

        return c.json({ ok: true })
    } catch (error) {
        console.error("Connection save error:", error)
        return c.json({ error: "Failed to save connection" }, 500)
    }
})

connections.put("/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let connectionId = c.req.param('id')
        if (!connectionId.includes(':')) connectionId = `connection:${connectionId}`
        const connection = await c.req.json()

        await upsertUser(payload)

        let config = {}
        if (connection.provider === 'mysql') config = { mysql: connection.mysql }
        else if (connection.provider === 'mongodb') config = { mongodb: connection.mongodb }
        else if (connection.provider === 'kusto') config = { kusto: connection.kusto }
        else if (connection.provider === 'sqlite') config = { sqlite: connection.sqlite }
        else if (connection.provider === 'postgres') config = { postgres: connection.postgres }

        const [updated] = await db.query(`
        UPDATE ${connectionId} MERGE {
            nickname: $nickname,
            description: $description,
            provider: $provider,
            config: $config
        } WHERE user = $user;
    `, {
            nickname: connection.nickname,
            description: connection.description ?? null,
            provider: connection.provider,
            config: config,
            user: `user:${userId}`
        });

        if (!updated || !updated.length) {
            return c.json({ error: "Connection not found or not authorized" }, 404)
        }

        return c.json({ ok: true })
    } catch (error) {
        console.error("Connection update error:", error)
        return c.json({ error: "Failed to update connection" }, 500)
    }
})

connections.delete("/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let connectionId = c.req.param('id')
        if (!connectionId.includes(':')) connectionId = `connection:${connectionId}`

        await db.query(`DELETE ${connectionId} WHERE user = $user;`, { user: `user:${userId}` });

        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: "Failed to delete connection" }, 500)
    }
})

export { connections as connectionRoutes }
