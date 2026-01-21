
import { db } from "../db/index.js";
import { dashboards, dashboardElements, dataSpaces, spaceFiles } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { StorageManager } from "./storage/StorageManager.js";
import { canUploadFile } from "../../lib/tierLimits.js";

export class SnapshotService {

    /**
     * Creates a full snapshot of a dashboard and stores it in S3/Object Storage.
     * @param {string} dashboardId - The UUID of the dashboard.
     * @param {string} triggeredBy - 'save', 'schedule', 'manual'
     */
    static async createDashboardSnapshot(dashboardId, triggeredBy = 'manual') {
        try {
            console.log(`[SnapshotService] Creating snapshot for dashboard ${dashboardId} (${triggeredBy})`);

            // 1. Fetch Full Dashboard State
            const dashboard = await db.query.dashboards.findFirst({
                where: eq(dashboards.id, dashboardId),
                with: {
                    elements: true
                }
            });

            if (!dashboard) throw new Error("Dashboard not found");

            // 2. Prepare Snapshot Data
            // We strip sensitive fields if necessary, but generally we want the full config state.
            // We might want to execute queries and cache results here? 
            // For now, let's just snapshot the CONFIG and MESSAGES.
            const snapshotData = {
                id: dashboard.id,
                title: dashboard.title,
                config: dashboard.config,
                messages: dashboard.messages,
                elements: dashboard.elements, // Array of elements
                generatedAt: new Date().toISOString(),
                triggeredBy
            };

            // 3. Serialize
            const content = JSON.stringify(snapshotData);
            const contentBuffer = Buffer.from(content);

            // 4. Upload to Storage
            // Path: dashboards/{userId}/{dashboardId}_snapshot.json
            const userId = dashboard.ownerId;
            const sizeBytes = contentBuffer.length;

            // Quota Check
            const quotaCheck = await canUploadFile(db, userId, sizeBytes);
            if (!quotaCheck.allowed) {
                // We don't throw here for snapshots as it might disrupt save, but we should log and maybe return error?
                // For now, let's return error.
                console.warn(`[SnapshotService] Quota exceeded for user ${userId}, snapshot skipped.`);
                return { success: false, error: quotaCheck.message };
            }

            const key = `dashboards/${userId}/${dashboardId}_snapshot.json`;


            const provider = await StorageManager.getProvider(userId);
            await provider.upload(key, contentBuffer, "application/json");

            // 5. Update DB Record
            await db.update(dashboards)
                .set({
                    snapshotStorageId: key,
                    lastSnapshotAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(dashboards.id, dashboardId));

            console.log(`[SnapshotService] Snapshot saved to ${key}`);

            // Update Usage
            await db.execute(sql`UPDATE pegasus_user SET storage_used = storage_used + ${sizeBytes} WHERE id = ${userId}`);

            return { success: true, key };

        } catch (error) {
            console.error("[SnapshotService] Error:", error);
            // Don't throw, just return error so we don't block the main save flow if this is async
            return { success: false, error: error.message };
        }
    }

    /**
     * Retrieves the snapshot URL or Content.
     */
    static async getSnapshot(dashboardId, userId) {
        // Logic to get Signed URL
        const dashboard = await db.query.dashboards.findFirst({
            where: eq(dashboards.id, dashboardId)
        });

        if (!dashboard || !dashboard.snapshotStorageId) return null;

        const provider = await StorageManager.getProvider(userId); // Or ownerId?
        // If viewer, we need OWNER's provider.
        // Assuming caller passes correct userId (Owner).
        // Actually, we should look up owner.

        const ownerId = dashboard.ownerId;
        const ownerProvider = await StorageManager.getProvider(ownerId);

        return await ownerProvider.getPresignedUrl(dashboard.snapshotStorageId);
    }

    /**
     * Uploads a new version of a file and updates history.
     */
    static async uploadFileVersion(fileId, userId, buffer, mimeType, filename) {
        try {
            // 1. Fetch File Record
            const [fileRecord] = await db.select().from(spaceFiles).where(eq(spaceFiles.id, fileId));
            if (!fileRecord) throw new Error("File record not found");

            const currentVersion = fileRecord.version || 1;
            const nextVersion = currentVersion + 1;

            // 2. Archive Current Version if it exists in storage
            let history = fileRecord.versions || [];
            if (fileRecord.storageId) {
                history.push({
                    version: currentVersion,
                    storageId: fileRecord.storageId,
                    createdAt: new Date().toISOString()
                });
            }

            // 3. Upload New Version
            // Path: files/{userId}/{fileId}_v{nextVersion}_{filename}
            const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const key = `files/${userId}/${fileId}_v${nextVersion}_${safeFilename}`;

            const fileBytes = buffer.length;
            const quotaCheck = await canUploadFile(db, userId, fileBytes);
            if (!quotaCheck.allowed) throw new Error(quotaCheck.message);

            const provider = await StorageManager.getProvider(userId);
            await provider.upload(key, buffer, mimeType);

            // Update Usage
            await db.execute(sql`UPDATE pegasus_user SET storage_used = storage_used + ${fileBytes} WHERE id = ${userId}`);

            // 4. Update DB
            await db.update(spaceFiles)
                .set({
                    storageId: key,
                    version: nextVersion,
                    versions: history,
                    isRagIndexed: false, // Reset indexing status for new content
                    updatedAt: new Date() // Assuming updatedAt exists or we rely on logs
                })
                .where(eq(spaceFiles.id, fileId));

            return { success: true, key, version: nextVersion };

        } catch (e) {
            console.error("[SnapshotService] File Version Upload Error:", e);
            throw e;
        }
    }
}
