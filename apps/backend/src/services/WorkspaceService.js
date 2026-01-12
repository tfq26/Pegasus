import { db } from "../../db/surreal.js";

export class WorkspaceService {
    /**
     * Get workspace for a user and connection
     * @param {string} userId 
     * @param {string} connectionId 
     */
    static async getWorkspace(userId, connectionId) {
        try {
            console.log(`[WorkspaceService] Fetching workspace for user: ${userId}, connection: ${connectionId}`);

            const [result] = await db.query(`
                SELECT * FROM connection_workspace 
                WHERE user = type::thing('user', $userId) 
                AND connection_id = $connectionId
                LIMIT 1;
            `, { userId, connectionId });

            if (result && result.length > 0) {
                const workspace = result[0];
                console.log(`[WorkspaceService] Found workspace for user ${userId}`);
                return workspace.workspace_data || {};
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
            // Check for existing record
            const [existing] = await db.query(`
                SELECT id FROM connection_workspace 
                WHERE user = type::thing('user', $userId) 
                AND connection_id = $connectionId
            `, { userId, connectionId });

            const saveData = {
                workspace_data: workspaceData,
                updated_at: new Date()
            };

            if (existing && existing.length > 0) {
                const id = existing[0].id;
                try {
                    await db.merge(id, saveData);
                } catch (mergeErr) {
                    // Auto-migrate bad records (legacy expires_at issue)
                    if (mergeErr.message && mergeErr.message.includes('expires_at')) {
                        console.log('[WorkspaceService] Auto-migrating bad record:', id);
                        await db.delete(id);
                        // Use query with type::thing for proper record reference
                        await db.query(`
                            CREATE connection_workspace CONTENT {
                                user: type::thing('user', $userId),
                                connection_id: $connectionId,
                                workspace_data: $data,
                                updated_at: time::now()
                            };
                        `, { userId, connectionId, data: workspaceData });
                        console.log('[WorkspaceService] Migration successful');
                    } else {
                        throw mergeErr;
                    }
                }
            } else {
                // Use query with type::thing for proper record reference
                await db.query(`
                    CREATE connection_workspace CONTENT {
                        user: type::thing('user', $userId),
                        connection_id: $connectionId,
                        workspace_data: $data,
                        updated_at: time::now()
                    };
                `, { userId, connectionId, data: workspaceData });
            }

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
            await db.query(`
                DELETE connection_workspace 
                WHERE user = type::thing('user', $userId) 
                AND connection_id = $connectionId;
            `, { userId, connectionId });
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
