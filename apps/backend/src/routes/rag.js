import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { db } from "../db/index.js"
import { connections } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { RAGService } from "../services/ragService.js"
import { adapters } from "../../adapters/index.js"

const rag = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"


/**
 * POST /index
 * Body: { sourceId, type, tableName }
 */
rag.post("/index", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const { sourceId, type, tableName, modelId } = await c.req.json()

        if (type === 'database') {
            // 1. Fetch connection
            const rawConnId = sourceId.includes(':') ? sourceId.split(':')[1] : sourceId;

            const connRow = await db.query.connections.findFirst({
                where: eq(connections.id, rawConnId)
            });

            if (!connRow) return c.json({ error: "Connection not found" }, 404)

            const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
            const provider = connRow.type
            const adapterConfig = config[provider] || config

            // 2. Connect and fetch data
            const Adapter = adapters[provider]
            if (!Adapter) return c.json({ error: "Provider not supported" }, 400)
            const adapter = new Adapter(adapterConfig)

            try {
                await adapter.connect()
                const rows = await adapter.query(`SELECT * FROM ${tableName} LIMIT 1000`) // Limit for now

                // 3. Chunk and Index
                const chunks = RAGService.chunkTable(rows, tableName)

                // Clear existing first
                await RAGService.clearSource(`${rawConnId}_${tableName}`, userId)

                // Index in background
                RAGService.indexChunks(chunks, {
                    source: connRow.name,
                    source_id: `${rawConnId}_${tableName}`,
                    table_name: tableName,
                    type: 'database'
                }, userId, modelId || 'openai')

                return c.json({ success: true, message: "Indexing started in background", chunkCount: chunks.length })
            } finally {
                try { await adapter.disconnect() } catch (e) { }
            }
        }

        return c.json({ error: "Unsupported index type" }, 400)
    } catch (e) {
        console.error("[RAG] Indexing failed:", e)
        return c.json({ error: e.message }, 500)
    }
})

/**
 * POST /search
 * Testing endpoint for RAG retrieval
 */
rag.post("/search", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const { query, limit, modelId } = await c.req.json()

        const results = await RAGService.hybridSearch(query, userId, limit || 5, modelId || 'openai')
        return c.json({ results })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

export { rag as ragRoutes }
