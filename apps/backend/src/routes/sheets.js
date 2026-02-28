
import { Hono } from "hono"
import { db } from "../db/index.js"
import { sheets } from "../db/schema.js"
import { eq, and } from "drizzle-orm"
import { StorageManager } from "../services/storage/StorageManager.js"
import { authMiddleware, requireUser } from '../middleware/auth.js'
import zlib from "node:zlib"

const sheetsRouter = new Hono()

sheetsRouter.use('*', authMiddleware)

// 1. List Sheets
sheetsRouter.get("/", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        const spaceId = c.req.query('spaceId')

        let query = db.select().from(sheets).where(eq(sheets.userId, userId))

        if (spaceId) {
            query = db.select().from(sheets).where(
                and(
                    eq(sheets.userId, userId),
                    eq(sheets.spaceId, spaceId)
                )
            )
        }

        const result = await query.orderBy(sheets.updatedAt)
        return c.json(result)
    } catch (error) {
        console.error('[Sheets] List error:', error)
        return c.json({ error: error.message }, 500)
    }
})

// 2. Get Sheet Detail (including data from B2)
sheetsRouter.get("/:id", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')

        const [sheet] = await db.select().from(sheets).where(
            and(
                eq(sheets.id, id),
                eq(sheets.userId, userId)
            )
        ).limit(1)

        if (!sheet) return c.json({ error: 'Sheet not found' }, 404)

        let data = {}
        if (sheet.storageId) {
            try {
                const provider = await StorageManager.getProvider(userId)
                const url = await provider.getPresignedUrl(sheet.storageId, 60)
                const response = await fetch(url)

                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer()
                    const buffer = Buffer.from(arrayBuffer)

                    // Check if gzipped (magic number 0x1f 0x8b)
                    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
                        const decompressed = zlib.gunzipSync(buffer)
                        data = JSON.parse(decompressed.toString())
                    } else {
                        data = JSON.parse(buffer.toString())
                    }
                } else {
                    console.error(`[Sheets] Failed to fetch data: ${response.statusText}`)
                }
            } catch (err) {
                console.error(`[Sheets] Storage fetch error:`, err)
            }
        }

        return c.json({ ...sheet, data })
    } catch (error) {
        console.error('[Sheets] Get error:', error)
        return c.json({ error: error.message }, 500)
    }
})

// 3. Create or Update Sheet
sheetsRouter.post("/", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        const { id, name, spaceId, data, config } = await c.req.json()

        let storageId = null
        if (data) {
            const provider = await StorageManager.getProvider(userId)
            const fileName = `sheets/${userId}/${id || crypto.randomUUID()}.json.gz`

            // Compress data for storage efficiency
            const jsonStr = JSON.stringify(data)
            const compressedContent = zlib.gzipSync(Buffer.from(jsonStr))

            const uploadRes = await provider.upload(fileName, compressedContent, 'application/x-gzip')
            storageId = uploadRes.key
        }

        const now = new Date()

        if (id) {
            // Update
            const [updated] = await db.update(sheets)
                .set({
                    name,
                    spaceId,
                    config: config || {},
                    storageId: storageId || undefined,
                    updatedAt: now
                })
                .where(and(eq(sheets.id, id), eq(sheets.userId, userId)))
                .returning()

            return c.json(updated)
        } else {
            // Create
            const [created] = await db.insert(sheets)
                .values({
                    userId,
                    spaceId,
                    name: name || 'Untitled Sheet',
                    config: config || {},
                    storageId,
                    createdAt: now,
                    updatedAt: now
                })
                .returning()

            return c.json(created)
        }
    } catch (error) {
        console.error('[Sheets] Save error:', error)
        return c.json({ error: error.message }, 500)
    }
})

// 4. Delete Sheet
sheetsRouter.delete("/:id", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')

        const [sheet] = await db.select().from(sheets).where(
            and(eq(sheets.id, id), eq(sheets.userId, userId))
        ).limit(1)

        if (!sheet) return c.json({ error: 'Sheet not found' }, 404)

        // Delete from storage if exists
        if (sheet.storageId) {
            try {
                const provider = await StorageManager.getProvider(userId)
                await provider.delete(sheet.storageId)
            } catch (err) {
                console.error('[Sheets] Storage delete error:', err)
            }
        }

        // Delete from DB
        await db.delete(sheets).where(eq(sheets.id, id))

        return c.json({ success: true })
    } catch (error) {
        console.error('[Sheets] Delete error:', error)
        return c.json({ error: error.message }, 500)
    }
})

export default sheetsRouter
