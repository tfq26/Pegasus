import { db } from "../../db/surreal.js";

export class WorkspaceService {
    /**
     * Get workspace for a user and connection
     * @param {string} userId 
     * @param {string} connectionId 
     */
    static async getWorkspace(userId, connectionId) {
        try {
            // Check for existing workspace
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

                // Check expiration for temp workspaces
                if (connectionId === 'temp' && workspace.expires_at) {
                    const now = new Date();
                    const expires = new Date(workspace.expires_at);
                    if (now > expires) {
                        console.log(`[WorkspaceService] Temp workspace expired for user ${userId}`);
                        await this.deleteWorkspace(userId, 'temp');
                        return null;
                    }
                }

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
            const isTemp = connectionId === 'temp';
            let expiresAt = null;

            // Set 48h expiration for temp workspace
            if (isTemp) {
                const date = new Date();
                date.setHours(date.getHours() + 48);
                expiresAt = date.toISOString();
            }

            // Upsert logic using SurrealDB
            const [existing] = await db.query(`
                SELECT id FROM connection_workspace 
                WHERE user = type::thing('user', $userId) 
                AND connection_id = $connectionId
            `, { userId, connectionId });

            if (existing && existing.length > 0) {
                const id = existing[0].id;
                await db.query(`
                    UPDATE ${id} SET 
                        workspace_data = $data, 
                        updated_at = time::now(),
                        expires_at = $expiresAt;
                `, {
                    data: workspaceData,
                    expiresAt: expiresAt ? new Date(expiresAt) : null
                });
            } else {
                await db.query(`
                    CREATE connection_workspace CONTENT {
                        user: type::thing('user', $userId),
                        connection_id: $connectionId,
                        workspace_data: $data,
                        updated_at: time::now(),
                        expires_at: $expiresAt
                    };
                `, {
                    userId,
                    connectionId,
                    data: workspaceData,
                    expiresAt: expiresAt ? new Date(expiresAt) : null
                });
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
            // 1. Get temp workspace
            const tempData = await this.getWorkspace(userId, 'temp');
            if (!tempData) {
                return { success: false, message: "No unsaved data to migrate" };
            }

            // 2. Save it to target connection
            // We overwrite target connection workspace or merge? 
            // Implementation: Overwrite for now as 'migration' usually implies moving state.
            await this.saveWorkspace(userId, targetConnectionId, tempData);

            // 3. Delete temp
            await this.deleteWorkspace(userId, 'temp');

            return { success: true };
        } catch (error) {
            console.error("[WorkspaceService] Error migrating workspace:", error);
            throw error;
        }
    }
}
