import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { canCreateConnection } from "../../lib/tierLimits.js"

import { ConfigService } from "../services/ConfigService.js"

const connections = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

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
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        const [results] = await db.query("SELECT * FROM connection WHERE user = $user ORDER BY created_at DESC", {
            user: `user:${userId}`
        });

        // Map results to format frontend expects (using provider/nickname)
        const mapped = (results || []).map(row => {
            let config = {}
            if (row.config) {
                try {
                    config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
                } catch (e) {
                    console.error('[Connection] Failed to parse config JSON:', e.message)
                }
            }

            return {
                ...row,
                provider: row.type || row.provider,
                nickname: row.name || row.nickname,
                isLocked: row.is_locked ?? false,
                ...config
            }
        })

        return c.json({ connections: mapped });
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

        // Check tier limits before creating connection
        const [userData] = await db.query(`SELECT subscription_tier FROM type::thing('user', $userId)`, { userId: payload.sub })
        const tier = userData?.[0]?.subscription_tier || 'free'

        const limitCheck = await canCreateConnection(db, payload.sub, tier)
        if (!limitCheck.allowed) {
            return c.json({
                error: limitCheck.message,
                limit: limitCheck.limit,
                current: limitCheck.current,
                tier,
                upgradeRequired: true
            }, 403)
        }

        const body = await c.req.json()
        const { type, provider, name, nickname, config, isLocked, ...rest } = body

        // Support both formats
        const finalType = provider || type
        const finalName = nickname || name

        // If config is missing but we have provider-specific keys in the root (flat format), use those
        const finalConfig = config || rest

        const [result] = await db.query(`
            CREATE connection CONTENT {
                user: $user,
                type: $type,
                name: $name,
                config: $config,
                is_locked: $isLocked,
                created_at: time::now(),
                updated_at: time::now()
            }
        `, {
            user: resolvedId || `user:${payload.sub}`,
            type: finalType,
            name: finalName,
            config: typeof finalConfig === 'string' ? finalConfig : JSON.stringify(finalConfig),
            isLocked: !!isLocked
        });

        const saved = result[0];
        // Return mapped version for immediate UI use
        const mappedSaved = {
            ...saved,
            provider: saved.type,
            nickname: saved.name,
            isLocked: saved.is_locked,
            ...(typeof finalConfig === 'string' ? JSON.parse(finalConfig) : finalConfig)
        }

        return c.json(mappedSaved);
    } catch (e) {
        console.error('[Connection POST] Error:', e)
        return c.json({ error: e.message }, 500);
    }
});

connections.put("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    const id = c.req.param("id")

    try {
        const payload = await verify(token, jwtSecret)
        const body = await c.req.json()
        const { type, provider, name, nickname, config, isLocked, ...rest } = body

        const finalType = provider || type
        const finalName = nickname || name
        const finalConfig = config || rest

        const [result] = await db.query(`
            UPDATE connection SET 
                type = $type,
                name = $name,
                config = $config,
                is_locked = $isLocked,
                updated_at = time::now()
            WHERE id = type::thing('connection', $id)
        `, {
            id: id.includes(':') ? id.split(':')[1] : id,
            type: finalType,
            name: finalName,
            config: typeof finalConfig === 'string' ? finalConfig : JSON.stringify(finalConfig),
            isLocked: !!isLocked
        });

        const updated = result[0];
        const mappedUpdated = {
            ...updated,
            provider: updated.type,
            nickname: updated.name,
            isLocked: updated.is_locked,
            ...(typeof finalConfig === 'string' ? JSON.parse(finalConfig) : finalConfig)
        }

        return c.json(mappedUpdated);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

connections.delete("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    // We expect the ID to be the UUID part, but if it comes as 'connection:uuid', we handle it.
    let id = c.req.param("id")
    if (id.includes(':')) {
        id = id.split(':')[1]
    }

    try {
        // Use type::thing to ensure it's treated as a Record ID
        await db.query(`DELETE type::thing('connection', $id)`, { id });
        return c.json({ ok: true });
    } catch (e) {
        console.error("Delete connection error:", e)
        return c.json({ error: e.message }, 500);
    }
});

export { connections as connectionRoutes }
