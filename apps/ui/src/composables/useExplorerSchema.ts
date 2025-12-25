import { ref, watch } from 'vue'
import type { ConnectionEntry } from '@/lib/db-connections'
import { fetchConnectionSchema, fetchDatabaseTables } from '@/lib/api'

export interface ConnectionSchemaState {
    status: 'loading' | 'success' | 'error' | 'idle'
    tables: string[]
    error?: string
}

const connectionSchemas = ref<Record<string, ConnectionSchemaState>>({})
const dbTablesCache = ref<Record<string, Record<string, string[]>>>({})

export function useExplorerSchema(connections: { value: ConnectionEntry[] }) {
    const schemaFor = (id: string) => connectionSchemas.value[id] || { status: 'idle', tables: [] }

    const refreshSchemas = async () => {
        if (!connections.value || connections.value.length === 0) return

        for (const conn of connections.value) {
            // Already have it? Skip unless it's error or idle
            const current = connectionSchemas.value[conn.id]
            if (current && (current.status === 'success' || current.status === 'loading')) {
                continue
            }

            if (!connectionSchemas.value[conn.id]) {
                connectionSchemas.value[conn.id] = { status: 'idle', tables: [] }
            }

            const entry = connectionSchemas.value[conn.id]
            if (entry) entry.status = 'loading'

            try {
                const schema = await fetchConnectionSchema(conn)
                connectionSchemas.value[conn.id] = {
                    status: 'success',
                    tables: (schema as any).tables || []
                }
            } catch (err: any) {
                console.error(`[ExplorerSchema] Failed for ${conn.id}:`, err)
                connectionSchemas.value[conn.id] = {
                    status: 'error',
                    tables: [],
                    error: err instanceof Error ? err.message : String(err)
                }
            }
        }
    }

    // Helper to fetch tables for a specific database (SurrealDB/Postgres etc)
    const getTablesForDb = async (conn: ConnectionEntry, dbName: string) => {
        // Check cache first
        const connCache = dbTablesCache.value[conn.id]
        if (connCache?.[dbName]) {
            return connCache[dbName]
        }

        try {
            const tables = await fetchDatabaseTables(conn, dbName)

            if (!dbTablesCache.value[conn.id]) dbTablesCache.value[conn.id] = {}
            const targetCache = dbTablesCache.value[conn.id]
            if (targetCache) {
                targetCache[dbName] = tables as any
            }

            return tables as string[]
        } catch (err) {
            console.error(`[ExplorerSchema] Failed to fetch tables for ${dbName}:`, err)
            return []
        }
    }

    watch(() => connections.value, refreshSchemas, { deep: true, immediate: true })

    return {
        connectionSchemas,
        dbTablesCache,
        schemaFor,
        refreshSchemas,
        getTablesForDb
    }
}
