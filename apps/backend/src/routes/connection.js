import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { users, connections } from "../db/schema.js"
import { eq, and, desc } from "drizzle-orm"
import { canCreateConnection } from "../../lib/tierLimits.js"

import { ConfigService } from "../services/ConfigService.js"
import { SyncService } from "../services/SyncService.js"
import { RAGService } from "../services/ragService.js"

import { authMiddleware, requireUser } from "../middleware/auth.js"

const router = new Hono()
router.use("*", authMiddleware)
router.use("*", requireUser)

const jwtSecret = ConfigService.getJwtSecret()

router.get("/", async (c) => {
    const userId = c.get('userId')
    const userResult = c.get('user')
    console.log(`[Connection GET] Fetching for userId: ${userId}, hasUser: ${!!userResult}`);

    try {
        const results = await db.query.connections.findMany({
            where: eq(connections.userId, userId),
            orderBy: [desc(connections.createdAt)]
        });
        console.log(`[Connection GET] Found ${results?.length || 0} connections`);

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
                space: row.spaceId,
                spaceId: row.spaceId,
                isLocked: row.isVirtual,
                ...config
            }
        })

        // Fetch user config for hidden system connections
        const userResult = c.get('user')
        const hiddenSystemConnections = userResult?.config?.hiddenSystemConnections || [];

        // Inject System Metrics (Cosmos DB)
        if (process.env.COSMOS_ENDPOINT && !hiddenSystemConnections.includes('system:orion_metrics')) {
            mapped.unshift({
                id: 'system:orion_metrics',
                name: 'System Metrics (Live)',
                provider: 'cosmosdb',
                type: 'cosmosdb',
                isVirtual: true,
                is_virtual: true,
                isLocked: false,
                config: {
                    database: 'PegasusLive',
                    container: 'OrionMetrics'
                }
            });
        }

        return c.json({ connections: mapped });
    } catch (e) {
        console.error('[Connection GET] Error:', e)
        return c.json({ error: e.message }, 500);
    }
});

router.post("/", async (c) => {
    const userId = c.get('userId')
    const userRow = c.get('user')

    try {
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
        const { type, provider, name, nickname, config, isLocked, ...rest } = body
        const spaceId = body.spaceId || body.space

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

        // [RAG] Index Connection Metadata
        RAGService.indexConnectionMetadata(mappedSaved, userId)
            .catch(e => console.error('[Connection] RAG Indexing failed:', e));

        return c.json(mappedSaved);
    } catch (e) {
        console.error('[Connection POST] Error:', e)
        return c.json({ error: e.message }, 500);
    }
});

router.put("/:id", async (c) => {
    const userId = c.get('userId')
    const id = c.req.param("id")

    try {
        const body = await c.req.json()
        const { type, provider, name, nickname, config, isLocked, ...rest } = body
        const spaceId = body.spaceId || body.space

        const finalType = provider || type
        const finalName = nickname || name
        const finalConfig = config || rest

        // Validate UUID format to prevent DB cast errors (Postgres)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            if (id.startsWith('system:')) return c.json({ error: "System connections cannot be modified" }, 403);
            return c.json({ error: "Invalid connection ID format" }, 400);
        }

        const [updated] = await db.update(connections)
            .set({
                type: finalType,
                name: finalName,
                config: finalConfig,
                spaceId: spaceId !== undefined ? spaceId : undefined,
                isVirtual: !!isLocked,
                updatedAt: new Date()
            })
            .where(and(eq(connections.id, id), eq(connections.userId, userId)))
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
            SyncService.initialSync(mappedUpdated, userId)
                .catch(e => console.error('[Connection] Initial sync failed:', e));
        }

        if (isNoSql) {
            if (mappedUpdated.enableLiveCache) {
                SyncService.startPolling(mappedUpdated);
            } else {
                SyncService.stopPolling(mappedUpdated.id);
            }
        }

        // [RAG] Index Connection Metadata
        RAGService.indexConnectionMetadata(mappedUpdated, userId)
            .catch(e => console.error('[Connection] RAG Indexing failed:', e));

        return c.json(mappedUpdated);
    } catch (e) {
        console.error('[Connection PUT] Error:', e)
        return c.json({ error: e.message }, 500);
    }
});

router.delete("/:id", async (c) => {
    const userId = c.get('userId')
    const userRow = c.get('user')
    let id = c.req.param("id")

    // Handle system/virtual connections
    if (id.startsWith('system:')) {
        console.log(`[Connection] Targeted system connection for removal: ${id}`);
        try {
            if (userRow) {
                const updatedConfig = {
                    ...(userRow.config || {}),
                    hiddenSystemConnections: [...(userRow.config?.hiddenSystemConnections || [])]
                }

                if (!updatedConfig.hiddenSystemConnections.includes(id)) {
                    updatedConfig.hiddenSystemConnections.push(id)
                    await db.update(users)
                        .set({ config: updatedConfig })
                        .where(eq(users.id, userId))
                }
            }
            return c.json({ ok: true });
        } catch (e) {
            console.error("[Connection] Failed to hide system connection:", e.message)
            return c.json({ error: e.message }, 500)
        }
    }

    const rawId = id.includes(':') ? id.split(':')[1] : id

    // Validate UUID format to prevent DB cast errors (Postgres)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawId)) {
        return c.json({ error: "Invalid connection ID format" }, 400);
    }

    try {
        await db.delete(connections).where(and(eq(connections.id, rawId), eq(connections.userId, userId)));
        return c.json({ ok: true });
    } catch (e) {
        console.error("Delete connection error:", e)
        return c.json({ error: e.message }, 500);
    }
});

export { router as connectionRoutes }
