import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { users, connections } from "../db/schema.js"
import { eq, and, desc } from "drizzle-orm"
import { canCreateConnection } from "../../lib/tierLimits.js"

import { ConfigService } from "../services/ConfigService.js"
import { SyncService } from "../services/SyncService.js"

const router = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Helper
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id;
        const [user] = await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                profilePictureUrl: (payload.profilePictureUrl || payload.profile_picture_url) ?? null,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    email: payload.email,
                    firstName: payload.firstName || payload.first_name,
                    lastName: payload.lastName || payload.last_name,
                    profilePictureUrl: (payload.profilePictureUrl || payload.profile_picture_url) ?? null,
                    updatedAt: new Date()
                }
            })
            .returning();
        return user.id;
    } catch (e) {
        console.error("[Connection] Failed to upsert user:", e)
        return null;
    }
}

router.get("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        const results = await db.query.connections.findMany({
            where: eq(connections.userId, userId),
            orderBy: [desc(connections.createdAt)]
        });

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
                provider: row.type,
                nickname: row.name,
                isLocked: row.isVirtual, // Mapping is_locked to isVirtual or similar if conceptually close, or add isLocked to schema
                ...config
            }
        })

        return c.json({ connections: mapped });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

router.post("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = await upsertUser(payload)

        const userRow = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { subscriptionTier: true }
        });
        const tier = userRow?.subscriptionTier || 'free'

        const limitCheck = await canCreateConnection(db, userId, tier)
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
        const { type, provider, name, nickname, config, isLocked, spaceId, ...rest } = body

        const finalType = provider || type
        const finalName = nickname || name
        const finalConfig = config || rest

        const [created] = await db.insert(connections).values({
            userId,
            spaceId: spaceId || null,
            type: finalType,
            name: finalName,
            config: finalConfig,
            isVirtual: !!isLocked,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        const mappedSaved = {
            ...created,
            provider: created.type,
            nickname: created.name,
            isLocked: created.isVirtual,
            ...(typeof finalConfig === 'string' ? JSON.parse(finalConfig) : finalConfig)
        }

        // [Sync] Trigger Sync or Polling
        const isSql = ['sqlite', 'mysql', 'postgres'].includes(mappedSaved.provider);
        const isNoSql = ['mongodb', 'kusto'].includes(mappedSaved.provider);

        if (isSql && mappedSaved.enableSync) {
            SyncService.initialSync(mappedSaved, userId)
                .catch(e => console.error('[Connection] Initial sync failed:', e));
        }

        if (isNoSql) {
            if (mappedSaved.enableLiveCache) {
                SyncService.startPolling(mappedSaved);
            } else {
                SyncService.stopPolling(mappedSaved.id);
            }
        }

        return c.json(mappedSaved);
    } catch (e) {
        console.error('[Connection POST] Error:', e)
        return c.json({ error: e.message }, 500);
    }
});

router.put("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    const id = c.req.param("id")

    try {
        const payload = await verify(token, jwtSecret)
        const body = await c.req.json()
        const { type, provider, name, nickname, config, isLocked, spaceId, ...rest } = body

        const finalType = provider || type
        const finalName = nickname || name
        const finalConfig = config || rest

        const [updated] = await db.update(connections)
            .set({
                type: finalType,
                name: finalName,
                config: finalConfig,
                spaceId: spaceId || undefined,
                isVirtual: !!isLocked,
                updatedAt: new Date()
            })
            .where(and(eq(connections.id, id), eq(connections.userId, payload.sub)))
            .returning();

        if (!updated) return c.json({ error: "Connection not found" }, 404)

        const mappedUpdated = {
            ...updated,
            provider: updated.type,
            nickname: updated.name,
            isLocked: updated.isVirtual,
            ...(typeof finalConfig === 'string' ? JSON.parse(finalConfig) : finalConfig)
        }

        // [Sync] Trigger Sync or Polling
        const isSql = ['sqlite', 'mysql', 'postgres'].includes(mappedUpdated.provider);
        const isNoSql = ['mongodb', 'kusto'].includes(mappedUpdated.provider);

        if (isSql && mappedUpdated.enableSync) {
            SyncService.initialSync(mappedUpdated, payload.sub)
                .catch(e => console.error('[Connection] Initial sync failed:', e));
        }

        if (isNoSql) {
            if (mappedUpdated.enableLiveCache) {
                SyncService.startPolling(mappedUpdated);
            } else {
                SyncService.stopPolling(mappedUpdated.id);
            }
        }

        return c.json(mappedUpdated);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

router.delete("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    let id = c.req.param("id")
    const rawId = id.includes(':') ? id.split(':')[1] : id

    try {
        const payload = await verify(token, jwtSecret)
        await db.delete(connections).where(and(eq(connections.id, rawId), eq(connections.userId, payload.sub)));
        return c.json({ ok: true });
    } catch (e) {
        console.error("Delete connection error:", e)
        return c.json({ error: e.message }, 500);
    }
});

export { router as connectionRoutes }
