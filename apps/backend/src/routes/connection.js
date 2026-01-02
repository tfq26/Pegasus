import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
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

connections.get("/", async (c) => {
    const token = getAuthToken(c)
    console.log('[Connection GET] Token present:', !!token)

    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        const [results] = await db.query("SELECT * FROM connection WHERE user = $user ORDER BY created_at DESC", {
            user: `user:${userId}`
        });

        return c.json({ connections: results });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

connections.post("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const resolvedId = await upsertUser(payload)

        const body = await c.req.json()
        const { type, name, config } = body

        const result = await db.query(`
            CREATE connection CONTENT {
                user: $user,
                type: $type,
                name: $name,
                config: $config,
                created_at: time::now(),
                updated_at: time::now()
            }
        `, {
            user: resolvedId || `user:${payload.sub}`,
            type,
            name,
            config: JSON.stringify(config)
        });

        return c.json({ connection: result[0][0] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

connections.delete("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    const id = c.req.param("id")
    try {
        await db.query("DELETE $id", { id });
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export { connections as connectionRoutes }
