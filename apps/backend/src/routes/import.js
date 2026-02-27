import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { dataSpaces, spaceFiles, spaceNotes, connections } from "../db/schema.js"
import { eq, and, isNull } from "drizzle-orm"
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

async function enrichWithExists(suggestions, userId, spaceId) {
    const rawSpaceId = spaceId && spaceId.includes(':') ? spaceId.split(':')[1] : (spaceId || null);

    return await Promise.all(suggestions.map(async (s) => {
        let exists = false;
        let existingId = null;

        const spaceCondition = rawSpaceId ? eq(dataSpaces.id, rawSpaceId) : isNull(dataSpaces.id);

        if (s.suggested_action === 'spreadsheet') {
            const existing = await db.query.connections.findFirst({
                where: and(eq(connections.userId, userId), rawSpaceId ? eq(connections.spaceId, rawSpaceId) : isNull(connections.spaceId), eq(connections.name, s.options.tableName || s.filename), eq(connections.type, 'duckdb'))
            });
            if (existing) { exists = true; existingId = existing.id; }
        } else if (s.suggested_action === 'database') {
            const existing = await db.query.connections.findFirst({
                where: and(eq(connections.userId, userId), rawSpaceId ? eq(connections.spaceId, rawSpaceId) : isNull(connections.spaceId), eq(connections.name, s.options.nickname || s.filename))
            });
            if (existing) { exists = true; existingId = existing.id; }
        } else if (s.suggested_action === 'note') {
            const existing = await db.query.spaceNotes.findFirst({
                where: and(rawSpaceId ? eq(spaceNotes.spaceId, rawSpaceId) : isNull(spaceNotes.spaceId), eq(spaceNotes.title, s.options.title || s.filename))
            });
            if (existing) { exists = true; existingId = existing.id; }
        } else if (s.suggested_action === 'file') {
            const existing = await db.query.spaceFiles.findFirst({
                where: and(rawSpaceId ? eq(spaceFiles.spaceId, rawSpaceId) : isNull(spaceFiles.spaceId), eq(spaceFiles.filename, s.filename))
            });
            if (existing) { exists = true; existingId = existing.id; }
        }

        return { ...s, exists, existingId, selected: true };
    }));
}

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

        let suggestions = await classifyFiles(files, { spaceName })
        suggestions = await enrichWithExists(suggestions, userId, spaceId)
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

        const storage = await StorageManager.getProvider(userId)

        // Process entries in parallel for better performance
        const uploadPromises = zipEntries.map(async (entry) => {
            if (entry.isDirectory) return null

            // Skip system files
            if (entry.entryName.includes('__MACOSX') || entry.entryName.includes('.DS_Store')) return null

            const fileName = path.basename(entry.entryName)
            const entryBuffer = entry.getData()

            // Upload to storage
            const storagePath = `uploads/${userId}/${crypto.randomUUID()}-${fileName}`
            await storage.write(storagePath, entryBuffer)

            return {
                name: fileName,
                key: storagePath,
                size: entryBuffer.length,
                type: fileName.split('.').pop()
            }
        })
        console.log(`[Import ZIP] Starting processing of ${zipEntries.length} entries`)
        const results = await Promise.all(uploadPromises)
        const filesToProcess = results.filter(r => r !== null)
        console.log(`[Import ZIP] Uploaded ${filesToProcess.length} files to storage`)

        // Clean up temp dir if we used any (though here we process buffers)
        await fs.rm(tempDir, { recursive: true, force: true })

        // 2. Classify
        console.log(`[Import ZIP] Classifying ${filesToProcess.length} files...`)
        let spaceName = "General Workspace"
        if (spaceId) {
            const space = await db.query.dataSpaces.findFirst({
                where: eq(dataSpaces.id, spaceId.includes(':') ? spaceId.split(':')[1] : spaceId)
            })
            if (space) spaceName = space.name
        }

        const suggestions = await classifyFiles(filesToProcess, { spaceName })

        // Match suggestions with storage keys
        let enrichedSuggestions = suggestions.map(s => {
            const fileInfo = filesToProcess.find(f => f.name === s.filename)
            return {
                ...s,
                key: fileInfo?.key,
                size: fileInfo?.size
            }
        })
        enrichedSuggestions = await enrichWithExists(enrichedSuggestions, userId, spaceId)

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
            const { type, filename, key, size, options, existingId } = action

            try {
                if (type === 'spreadsheet') {
                    // Create DuckDB connection
                    let conn;
                    if (existingId) {
                        [conn] = await db.update(connections).set({
                            name: options.tableName || filename,
                            config: { path: key },
                            updatedAt: new Date()
                        }).where(eq(connections.id, existingId)).returning()
                    } else {
                        [conn] = await db.insert(connections).values({
                            userId,
                            spaceId: rawSpaceId || null,
                            type: 'duckdb',
                            name: options.tableName || filename,
                            config: { path: key }, // Storage key is the path for DuckDB provider
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }).returning()
                    }
                    results.push({ filename, status: 'success', type: 'spreadsheet', id: conn.id })
                }
                else if (type === 'database') {
                    // Create SQLite/Database connection
                    // Determine provider from filename
                    const ext = filename.split('.').pop().toLowerCase()
                    const provider = ext === 'duckdb' ? 'duckdb' : 'sqlite'

                    let conn;
                    if (existingId) {
                        [conn] = await db.update(connections).set({
                            type: provider,
                            name: options.nickname || filename,
                            config: { path: key },
                            updatedAt: new Date()
                        }).where(eq(connections.id, existingId)).returning()
                    } else {
                        [conn] = await db.insert(connections).values({
                            userId,
                            spaceId: rawSpaceId || null,
                            type: provider,
                            name: options.nickname || filename,
                            config: { path: key },
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }).returning()
                    }
                    results.push({ filename, status: 'success', type: 'database', id: conn.id })
                }
                else if (type === 'note') {
                    // Import as Note
                    // Fetch content from storage
                    const provider = await StorageManager.getProvider(userId)
                    const content = await provider.read(key)
                    const text = content.toString('utf-8')

                    let note;
                    if (existingId) {
                        [note] = await db.update(spaceNotes).set({
                            title: options.title || filename,
                            content: text,
                            updatedAt: new Date()
                        }).where(eq(spaceNotes.id, existingId)).returning()
                    } else {
                        [note] = await db.insert(spaceNotes).values({
                            userId,
                            spaceId: rawSpaceId || null, // Allow null here for general space equivalent
                            title: options.title || filename,
                            content: text,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }).returning()
                    }
                    results.push({ filename, status: 'success', type: 'note', id: note.id })
                }
                else if (type === 'file') {
                    // Add as File
                    let file;
                    if (existingId) {
                        [file] = await db.update(spaceFiles).set({
                            filename: filename,
                            storagePath: key,
                            fileSizeBytes: size || 0,
                            updatedAt: new Date()
                        }).where(eq(spaceFiles.id, existingId)).returning()
                    } else {
                        [file] = await db.insert(spaceFiles).values({
                            id: crypto.randomUUID(),
                            userId,
                            spaceId: rawSpaceId || null,
                            filename: filename,
                            fileType: filename.split('.').pop(),
                            storagePath: key,
                            fileSizeBytes: size || 0,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }).returning()
                    }

                    // Trigger RAG indexing (background - don't await to avoid UI hang)
                    RAGService.indexFileFromStorage(key, filename, userId).catch(idxErr => {
                        console.warn(`[Import] Background RAG Indexing failed for ${filename}:`, idxErr);
                    });

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
