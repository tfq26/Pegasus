import { db } from "../db/index.js";
import { connectionWorkspaces } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export class WorkspaceService {
    /**
     * Get workspace for a user and connection
     * @param {string} userId 
     * @param {string} connectionId 
     */
    static async getWorkspace(userId, connectionId) {
        try {
            console.log(`[WorkspaceService] Fetching workspace for user: ${userId}, connection: ${connectionId}`);

            const result = await db.query.connectionWorkspaces.findFirst({
                where: and(
                    eq(connectionWorkspaces.userId, userId),
                    eq(connectionWorkspaces.connectionId, connectionId)
                )
            });

            if (result) {
                console.log(`[WorkspaceService] Found workspace for user ${userId}`);
                return result.workspaceData || {};
            }

            console.log(`[WorkspaceService] No workspace found for user: ${userId}, connection: ${connectionId}`);
            return null;
        } catch (error) {
            console.error("[WorkspaceService] Error getting workspace:", error);
            throw error;
        }
    }

    /**
     * Save workspace data
     * @param {string} userId 
     * @param {string} connectionId 
     * @param {object} workspaceData 
     */
    static async saveWorkspace(userId, connectionId, workspaceData) {
        try {
            await db.insert(connectionWorkspaces)
                .values({
                    userId,
                    connectionId,
                    workspaceData,
                    updatedAt: new Date()
                })
                .onConflictDoUpdate({
                    target: [connectionWorkspaces.userId, connectionWorkspaces.connectionId],
                    set: {
                        workspaceData,
                        updatedAt: new Date()
                    }
                });

            return { success: true };
        } catch (error) {
            console.error("[WorkspaceService] Error saving workspace:", error);
            throw error;
        }
    }

    /**
     * Delete workspace
     * @param {string} userId 
     * @param {string} connectionId 
     */
    static async deleteWorkspace(userId, connectionId) {
        try {
            await db.delete(connectionWorkspaces)
                .where(and(
                    eq(connectionWorkspaces.userId, userId),
                    eq(connectionWorkspaces.connectionId, connectionId)
                ));
            return { success: true };
        } catch (error) {
            console.error("[WorkspaceService] Error deleting workspace:", error);
            throw error;
        }
    }

    /**
     * Migrate 'temp' workspace to a real connection
     * @param {string} userId 
     * @param {string} targetConnectionId 
     */
    static async migrateUnsaved(userId, targetConnectionId) {
        try {
            const tempData = await this.getWorkspace(userId, 'temp');
            if (!tempData) {
                return { success: false, message: "No unsaved data to migrate" };
            }

            await this.saveWorkspace(userId, targetConnectionId, tempData);
            await this.deleteWorkspace(userId, 'temp');

            return { success: true };
        } catch (error) {
            console.error("[WorkspaceService] Error migrating workspace:", error);
            throw error;
        }
    }
}
