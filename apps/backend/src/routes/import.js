import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { dataSpaces, spaceFiles, spaceNotes, connections } from "../db/schema.js"
import { eq, and } from "drizzle-orm"
import { classifyFiles } from "../../ai/classifier.js"
import { ConfigService } from "../services/ConfigService.js"
import { StorageManager } from "../services/storage/StorageManager.js"
import { RAGService } from "../services/ragService.js"
import AdmZip from "adm-zip"
import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import crypto from "node:crypto"

const importRouter = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

/**
 * POST /analyze
 * Takes a list of file names/types and suggests actions.
 */
importRouter.post("/analyze", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const body = await c.req.json()
        const { files, spaceId } = body

        // Get space name for context if provided
        let spaceName = "General Workspace"
        if (spaceId) {
            const space = await db.query.dataSpaces.findFirst({
                where: eq(dataSpaces.id, spaceId.includes(':') ? spaceId.split(':')[1] : spaceId)
            })
            if (space) spaceName = space.name
        }

        const suggestions = await classifyFiles(files, { spaceName })
        return c.json({ suggestions });
    } catch (e) {
        console.error("[Import Analyze] Error:", e)
        return c.json({ error: e.message }, 500);
    }
})

/**
 * POST /upload-zip
 * Processes a uploaded zip file, extracts it, and returns analysis.
 */
importRouter.post("/upload-zip", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        const body = await c.req.parseBody()
        const file = body['file']
        const spaceId = body['spaceId']

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No zip file uploaded" }, 400)
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const zip = new AdmZip(buffer)
        const zipEntries = zip.getEntries()

        const tempDir = path.join(os.tmpdir(), `pegasus-zip-${crypto.randomUUID()}`)
        await fs.mkdir(tempDir, { recursive: true })

        const filesToProcess = []
        const storage = await StorageManager.getProvider(userId)

        for (const entry of zipEntries) {
            if (entry.isDirectory) continue

            // Skip system files
            if (entry.entryName.includes('__MACOSX') || entry.entryName.includes('.DS_Store')) continue

            const fileName = path.basename(entry.entryName)
            const entryBuffer = entry.getData()

            // Upload to storage
            const storagePath = `uploads/${userId}/${crypto.randomUUID()}-${fileName}`
            await storage.write(storagePath, entryBuffer)

            filesToProcess.push({
                name: fileName,
                key: storagePath,
                size: entryBuffer.length,
                type: fileName.split('.').pop()
            })
        }

        // Clean up temp dir if we used any (though here we process buffers)
        await fs.rm(tempDir, { recursive: true, force: true })

        // 2. Classify
        let spaceName = "General Workspace"
        if (spaceId) {
            const space = await db.query.dataSpaces.findFirst({
                where: eq(dataSpaces.id, spaceId.includes(':') ? spaceId.split(':')[1] : spaceId)
            })
            if (space) spaceName = space.name
        }

        const suggestions = await classifyFiles(filesToProcess, { spaceName })

        // Match suggestions with storage keys
        const enrichedSuggestions = suggestions.map(s => {
            const fileInfo = filesToProcess.find(f => f.name === s.filename)
            return {
                ...s,
                key: fileInfo?.key,
                size: fileInfo?.size
            }
        })

        return c.json({ suggestions: enrichedSuggestions });

    } catch (e) {
        console.error("[Import ZIP] Error:", e)
        return c.json({ error: e.message }, 500)
    }
})

/**
 * POST /execute
 * Executes the confirmed actions in batch.
 */
importRouter.post("/execute", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const body = await c.req.json()
        const { actions, spaceId } = body
        const rawSpaceId = spaceId && spaceId.includes(':') ? spaceId.split(':')[1] : spaceId

        const results = []

        for (const action of actions) {
            const { type, filename, key, size, options } = action

            try {
                if (type === 'spreadsheet') {
                    // Create DuckDB connection
                    const [conn] = await db.insert(connections).values({
                        userId,
                        spaceId: rawSpaceId || null,
                        type: 'duckdb',
                        name: options.tableName || filename,
                        config: { path: key }, // Storage key is the path for DuckDB provider
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }).returning()
                    results.push({ filename, status: 'success', type: 'spreadsheet', id: conn.id })
                }
                else if (type === 'database') {
                    // Create SQLite/Database connection
                    // Determine provider from filename
                    const ext = filename.split('.').pop().toLowerCase()
                    const provider = ext === 'duckdb' ? 'duckdb' : 'sqlite'

                    const [conn] = await db.insert(connections).values({
                        userId,
                        spaceId: rawSpaceId || null,
                        type: provider,
                        name: options.nickname || filename,
                        config: { path: key },
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }).returning()
                    results.push({ filename, status: 'success', type: 'database', id: conn.id })
                }
                else if (type === 'note') {
                    // Import as Note
                    // Fetch content from storage
                    const provider = await StorageManager.getProvider(userId)
                    const content = await provider.read(key)
                    const text = content.toString('utf-8')

                    const [note] = await db.insert(spaceNotes).values({
                        userId,
                        spaceId: rawSpaceId,
                        title: options.title || filename,
                        content: text,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }).returning()
                    results.push({ filename, status: 'success', type: 'note', id: note.id })
                }
                else if (type === 'file') {
                    // Add as File
                    const [file] = await db.insert(spaceFiles).values({
                        id: crypto.randomUUID(),
                        userId,
                        spaceId: rawSpaceId,
                        filename: filename,
                        fileType: filename.split('.').pop(),
                        storagePath: key,
                        fileSizeBytes: size || 0,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }).returning()

                    // Trigger RAG indexing
                    try {
                        await RAGService.indexFileFromStorage(key, filename, userId);
                    } catch (idxErr) {
                        console.warn(`[Import] RAG Indexing failed for ${filename}:`, idxErr);
                    }

                    results.push({ filename, status: 'success', type: 'file', id: file.id })
                }
                else {
                    results.push({ filename, status: 'skipped', type: 'skip' })
                }
            } catch (err) {
                console.error(`[Import Execute] Failed for ${filename}:`, err)
                results.push({ filename, status: 'error', message: err.message })
            }
        }

        return c.json({ results });
    } catch (e) {
        console.error("[Import Execute] Error:", e)
        return c.json({ error: e.message }, 500);
    }
})

export default importRouter
