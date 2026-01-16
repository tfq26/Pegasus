import { db } from "../../db/surreal.js"
import { adapters } from "../../adapters/index.js"

const activePollers = new Map(); // connectionId -> NodeJS.Timeout

export const SyncService = {
    /**
     * Helper to generate a unique cloud table name for a synced connection
     */
    getCloudTableName(connectionId, localTableName) {
        // Strip connection: prefix if present
        const cleanId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId;
        // Sanitize table name slightly to avoid weird chars
        // Replace . with _ for safer consumption in SurrealDB
        const safeTableName = localTableName.replace(/\./g, '_');
        return `sync_${cleanId}_${safeTableName}`;
    },

    /**
     * Performs a full initial sync (or re-sync) from Source -> Cloud
     */
    async initialSync(connection, userId) {
        console.log(`[SyncService] Starting sync for connection ${connection.id} (${connection.provider})`);

        const Adapter = adapters[connection.provider];
        if (!Adapter) {
            console.error(`[SyncService] No adapter found for provider ${connection.provider}`);
            return;
        }

        const adapter = new Adapter(connection);

        try {
            await adapter.connect();
            // List tables/collections
            // Note: MongoDB returns "db.collection". SQL returns "table".
            const tables = await adapter.listCollections();

            for (const table of tables) {
                // Skip system tables if any leak through
                if (table.startsWith('system.')) continue;

                console.log(`[SyncService] Syncing table/collection: ${table}`);

                let rows = [];
                try {
                    // Fetch data based on provider type
                    if (connection.provider === 'mongodb') {
                        // MongoAdapter query expects object or JSON string
                        rows = await adapter.query({ collection: table, limit: 10000 });
                    } else if (connection.provider === 'kusto') {
                        // Kusto KQL
                        rows = await adapter.query(`['${table}'] | take 10000`);
                    } else {
                        // Standard SQL (SQLite, MySQL, Postgres)
                        rows = await adapter.query(`SELECT * FROM "${table}" LIMIT 10000`);
                    }
                } catch (err) {
                    console.warn(`[SyncService] Failed to fetch data for ${table}:`, err.message);
                    continue;
                }

                // 2. Define cloud table name
                const cloudTable = this.getCloudTableName(connection.id, table);

                // 3. Destructive Replace (Full Sync Strategy)
                try {
                    await db.query(`DELETE ${cloudTable}`);
                } catch (e) { /* Ignore if not exists */ }

                // 4. Batch Insert
                if (rows && rows.length > 0) {
                    const chunkSize = 1000;
                    for (let i = 0; i < rows.length; i += chunkSize) {
                        const chunk = rows.slice(i, i + chunkSize);
                        try {
                            await db.insert(cloudTable, chunk);
                        } catch (err) {
                            console.error(`[SyncService] Failed to insert chunk for ${cloudTable}:`, err.message);
                        }
                    }
                }

                console.log(`[SyncService] Synced ${rows.length} rows for ${table} -> ${cloudTable}`);
            }

            console.log(`[SyncService] Sync complete for ${connection.id}`);

        } catch (err) {
            console.error('[SyncService] Sync failed:', err);
            throw err;
        } finally {
            await adapter.disconnect();
        }
    },

    /**
     * Start periodic polling for "Live Cache" (MongoDB/Kusto)
     */
    startPolling(connection) {
        // Stop existing
        this.stopPolling(connection.id);

        if (!connection.enableLiveCache) return;

        console.log(`[SyncService] Starting polling for ${connection.id}`);
        // Default 5 minutes (300s). Minimum 10s.
        const intervalSeconds = Math.max(10, Number(connection.pollingInterval) || 300);
        const intervalMs = intervalSeconds * 1000;

        const timer = setInterval(() => {
            this.pollAndSync(connection)
        }, intervalMs);

        activePollers.set(connection.id, timer);

        // Immediate first run
        this.pollAndSync(connection);
    },

    stopPolling(connectionId) {
        if (activePollers.has(connectionId)) {
            console.log(`[SyncService] Stopping polling for ${connectionId}`);
            clearInterval(activePollers.get(connectionId));
            activePollers.delete(connectionId);
        }
    },

    async pollAndSync(connection) {
        try {
            await this.initialSync(connection, 'system');
        } catch (e) {
            console.error(`[SyncService] Poll execution failed for ${connection.id}:`, e);
        }
    },

    /**
     * Replicates incremental updates (SQL only hook)
     */
    async syncUpdates(connection, tableName, updates, deletedRowIds, userId) {
        // For now, we still trigger full table replication for consistency
        // as we lack reliable shared Primary Keys across all providers.
        return this.replicateTable(connection, tableName);
    },

    async replicateTable(connection, tableName) {
        console.log(`[SyncService] Replicating single table ${tableName}`);
        const Adapter = adapters[connection.provider];
        if (!Adapter) return;

        const adapter = new Adapter(connection);

        try {
            await adapter.connect();

            let rows = [];
            if (connection.provider === 'mongodb') {
                rows = await adapter.query({ collection: tableName, limit: 10000 });
            } else if (connection.provider === 'kusto') {
                rows = await adapter.query(`['${tableName}'] | take 10000`);
            } else {
                rows = await adapter.query(`SELECT * FROM "${tableName}" LIMIT 10000`);
            }

            const cloudTable = this.getCloudTableName(connection.id, tableName);

            await db.query(`DELETE ${cloudTable}`);

            if (rows && rows.length > 0) {
                const chunkSize = 1000;
                for (let i = 0; i < rows.length; i += chunkSize) {
                    const chunk = rows.slice(i, i + chunkSize);
                    await db.insert(cloudTable, chunk);
                }
            }
            console.log(`[SyncService] Replicated ${tableName}`);
        } catch (e) {
            console.error('[SyncService] Table replication failed:', e);
        } finally {
            await adapter.disconnect();
        }
    }
}
