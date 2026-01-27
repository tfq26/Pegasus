
import { Hono } from "hono";
import { db } from "../db/index.js";
import { files, storageCredentials } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { StorageManager } from "../services/storage/StorageManager.js";
import { getAuthToken } from "../../lib/auth.js";
import { verify } from "hono/jwt";
import ExcelJS from "exceljs";
import { aiClient } from "../../ai/AIClient.js";

const storage = new Hono();
// Assuming JWT Secret is available in env or passed via config. 
// Using process.env.JWT_SECRET as per index.js convention.
const jwtSecret = process.env.JWT_SECRET || 'secret';

async function generateFileDescription(buffer, filename, mimeType, userId) {
    try {
        let snippet = '';

        if (mimeType === 'text/csv' || mimeType === 'application/json' || mimeType.startsWith('text/')) {
            snippet = buffer.toString('utf-8').slice(0, 1500); // First 1.5KB
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.worksheets[0];
            if (worksheet) {
                // Get first 5 rows to provide context (header + data)
                // Note: ExcelJS rows are 1-based
                const rows = [];
                worksheet.eachRow((row, rowNumber) => {
                    if (rowNumber <= 5) {
                        // Filter out empty cells and join
                        const rowText = (row.values || []).filter(v => v !== null && v !== undefined).join(', ');
                        if (rowText) rows.push(rowText);
                    }
                });
                snippet = rows.join('\n');
            }
        }

        if (!snippet) return null;

        const prompt = `Provide a concise, single-sentence description of this dataset based on the filename "${filename}" and the sample below:\n\n${snippet}\n\nDescription:`;

        // Use a fast model for latency
        const description = await aiClient.generateText(prompt, 'gemini', { userId });
        return description ? description.trim() : null;
    } catch (e) {
        console.warn("Failed to generate file description:", e);
        return null;
    }
}

// Middleware to get user
const authMiddleware = async (c, next) => {
    const token = getAuthToken(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);
    try {
        const payload = await verify(token, jwtSecret);
        c.set('user', payload);
        await next();
    } catch (e) {
        return c.json({ error: "Unauthorized" }, 401);
    }
};

storage.use("*", authMiddleware);

// Upload File
storage.post("/upload", async (c) => {
    try {
        const user = c.get('user');
        const formData = await c.req.formData();
        const file = formData.get('file');

        if (!file) return c.json({ error: "No file provided" }, 400);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileId = crypto.randomUUID();

        // Construct clean key: users/{userId}/{uuid}-{filename}
        // Sanitize filename
        const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `users/${user.sub}/${fileId}-${safeFilename}`;

        // Use StorageManager to get provider (Active)
        const provider = await StorageManager.getProvider(user.sub);
        const result = await provider.upload(key, buffer, file.type);

        // Generate AI Description (Non-blocking usually preferred, but for now blocking)
        const description = await generateFileDescription(buffer, file.name, file.type, user.sub);

        // Record in DB
        const providerType = provider.providerType || (result.bucket === process.env.S3_BUCKET_NAME ? 'default' : 'custom');

        const [record] = await db.insert(files).values({
            userId: user.sub,
            storageId: result.key, // stored key
            filename: file.name,
            description: description,
            size: file.size,
            mimeType: file.type,
            provider: providerType
        }).returning();

        return c.json({ success: true, file: record });
    } catch (e) {
        console.error("Upload failed", e);
        return c.json({ error: e.message }, 500);
    }
});

// Get File Download URL
storage.get("/file/:id", async (c) => {
    try {
        const user = c.get('user');
        const fileId = c.req.param("id");

        // 1. Fetch File Record
        const [file] = await db.select().from(files)
            .where(eq(files.id, fileId))
            .limit(1);

        if (!file) return c.json({ error: "File not found" }, 404);

        // Security check: Ensure owner (or shared permission in future)
        // For now, strict ownership
        if (file.userId !== user.sub) {
            return c.json({ error: "Unauthorized" }, 403);
        }

        // 2. Get Provider based on file.provider ('default' or 'custom')
        const provider = await StorageManager.getProvider(user.sub, file.provider);

        // 3. Generate Presigned URL
        const url = await provider.getPresignedUrl(file.storageId, 3600); // 1 hour expiry

        // 4. Redirect or Return URL
        // Redirect is easiest for browser downloads
        return c.redirect(url);
    } catch (e) {
        console.error("Download failed", e);
        return c.json({ error: e.message }, 500);
    }
});

// Configure Storage (BYOS)
storage.post("/config", async (c) => {
    try {
        const user = c.get('user');
        const { providerType, name, config, isEnabled } = await c.req.json();

        // Validate config structure briefly
        if (!config || !config.bucket) {
            return c.json({ error: "Invalid configuration" }, 400);
        }

        // Upsert credential
        await db.insert(storageCredentials).values({
            userId: user.sub,
            providerType: providerType || 's3',
            name: name || 'Custom Storage',
            config,
            isEnabled: isEnabled !== undefined ? isEnabled : true
        }).onConflictDoUpdate({
            target: [storageCredentials.userId, storageCredentials.name],
            set: { config, isEnabled: isEnabled !== undefined ? isEnabled : true, updatedAt: new Date() }
        });

        // Ensure only ONE is enabled? Logic could be added here to disable others.
        // For simplicity, we trust the latest enabled one or logic in Manager.

        return c.json({ success: true });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export { storage as storageRoutes };
