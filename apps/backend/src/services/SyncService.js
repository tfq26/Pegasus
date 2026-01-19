import { db } from "../db/index.js"
import { adapters } from "../../adapters/index.js"
import { sql } from "drizzle-orm"

const activePollers = new Map(); // connectionId -> NodeJS.Timeout

export const SyncService = {
    /**
     * Helper to generate a unique cloud table name for a synced connection
     */
    getCloudTableName(connectionId, localTableName) {
        const cleanId = connectionId.toString().includes(':') ? connectionId.toString().split(':')[1] : connectionId;
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
            const tables = await adapter.listCollections();

            for (const table of tables) {
                if (table.startsWith('system.')) continue;

                console.log(`[SyncService] Syncing table/collection: ${table}`);

                let rows = [];
                try {
                    if (connection.provider === 'mongodb') {
                        rows = await adapter.query({ collection: table, limit: 10000 });
                    } else if (connection.provider === 'kusto') {
                        rows = await adapter.query(`['${table}'] | take 10000`);
                    } else {
                        rows = await adapter.query(`SELECT * FROM "${table}" LIMIT 10000`);
                    }
                } catch (err) {
                    console.warn(`[SyncService] Failed to fetch data for ${table}:`, err.message);
                    continue;
                }

                const cloudTable = this.getCloudTableName(connection.id, table);

                // Destructive Replace (Full Sync Strategy)
                try {
                    await db.execute(sql.raw(`DROP TABLE IF EXISTS "${cloudTable}"`));
                } catch (e) { }

                // Batch Insert (creating table dynamically)
                if (rows && rows.length > 0) {
                    const columnNames = Object.keys(rows[0]);
                    const columnsSql = columnNames.map(col => `"${col}" TEXT`).join(', ');

                    await db.execute(sql.raw(`CREATE TABLE "${cloudTable}" (${columnsSql})`));

                    const chunkSize = 100;
                    for (let i = 0; i < rows.length; i += chunkSize) {
                        const chunk = rows.slice(i, i + chunkSize);
                        for (const row of chunk) {
                            const keys = Object.keys(row);
                            const values = keys.map(k => row[k]);
                            const keysStr = keys.map(k => `"${k}"`).join(', ');
                            const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');

                            try {
                                await db.execute(sql.raw(`INSERT INTO "${cloudTable}" (${keysStr}) VALUES (${placeholders})`), values);
                            } catch (err) {
                                console.error(`[SyncService] Insert failed for row in ${cloudTable}:`, err.message);
                            }
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
        this.stopPolling(connection.id);

        if (!connection.enableLiveCache) return;

        console.log(`[SyncService] Starting polling for ${connection.id}`);
        const intervalSeconds = Math.max(10, Number(connection.pollingInterval) || 300);
        const intervalMs = intervalSeconds * 1000;

        const timer = setInterval(() => {
            this.pollAndSync(connection)
        }, intervalMs);

        activePollers.set(connection.id, timer);
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

            await db.execute(sql.raw(`DROP TABLE IF EXISTS "${cloudTable}"`));

            if (rows && rows.length > 0) {
                const columnNames = Object.keys(rows[0]);
                const columnsSql = columnNames.map(col => `"${col}" TEXT`).join(', ');
                await db.execute(sql.raw(`CREATE TABLE "${cloudTable}" (${columnsSql})`));

                const chunkSize = 100;
                for (let i = 0; i < rows.length; i += chunkSize) {
                    const chunk = rows.slice(i, i + chunkSize);
                    for (const row of chunk) {
                        const keys = Object.keys(row);
                        const values = keys.map(k => row[k]);
                        const keysStr = keys.map(k => `"${k}"`).join(', ');
                        const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
                        await db.execute(sql.raw(`INSERT INTO "${cloudTable}" (${keysStr}) VALUES (${placeholders})`), values);
                    }
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
