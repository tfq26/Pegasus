import { ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import type { ConnectionEntry } from '@/lib/db-connections'
import { fetchConnectionSchema, fetchDatabaseTables, fetchTableDetails } from '@/lib/api'

export interface ConnectionSchemaState {
    status: 'loading' | 'success' | 'error' | 'idle'
    tables: string[]
    tableMetadata?: Record<string, { displayName: string; actualName: string }>
    error?: string
}

const connectionSchemas = ref<Record<string, ConnectionSchemaState>>({})
const dbTablesCache = ref<Record<string, Record<string, string[]>>>({})
const tableDetails = ref<Record<string, Record<string, any>>>({}) // connectionId -> tableName -> details

export function useExplorerSchema(connections: { value: ConnectionEntry[] }) {
    const schemaFor = (id: string) => connectionSchemas.value[id] || { status: 'idle', tables: [] }

    const refreshConnectionSchema = async (connection: ConnectionEntry) => {
        if (!connectionSchemas.value[connection.id]) {
            connectionSchemas.value[connection.id] = { status: 'idle', tables: [] }
        }

        const entry = connectionSchemas.value[connection.id]
        if (entry) entry.status = 'loading'

        try {
            const schema = await fetchConnectionSchema(connection)
            connectionSchemas.value[connection.id] = {
                status: 'success',
                tables: (schema as any).tables || [],
                tableMetadata: (schema as any).tableMetadata || {}
            }
        } catch (err: any) {
            console.error(`[ExplorerSchema] Failed for ${connection.id}:`, err)
            connectionSchemas.value[connection.id] = {
                status: 'error',
                tables: [],
                error: err instanceof Error ? err.message : String(err)
            }
        }
    }

    const refreshSchemas = async (force = false) => {
        if (!connections.value || connections.value.length === 0) return

        for (const conn of connections.value) {
            // Already have it? Skip unless it's error or idle, OR we're forcing
            const current = connectionSchemas.value[conn.id]
            if (!force && current && (current.status === 'success' || current.status === 'loading')) {
                continue
            }

            await refreshConnectionSchema(conn)
        }
    }

    const debouncedRefresh = useDebounceFn((force = false) => refreshSchemas(force), 2000)

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

    const getTableDetails = async (conn: ConnectionEntry, tableName: string) => {
        const connCache = tableDetails.value[conn.id]
        if (connCache?.[tableName]) {
            return connCache[tableName]
        }

        try {
            const details = await fetchTableDetails(conn, tableName)

            if (!tableDetails.value[conn.id]) tableDetails.value[conn.id] = {}
            const targetCache = tableDetails.value[conn.id]
            if (targetCache) {
                targetCache[tableName] = details
            }

            return details
        } catch (err) {
            console.error(`[ExplorerSchema] Failed to fetch details for ${tableName}:`, err)
            return null
        }
    }

    watch(() => connections.value, () => debouncedRefresh(false), { deep: true, immediate: true })

    return {
        connectionSchemas,
        dbTablesCache,
        schemaFor,
        refreshSchemas,
        refreshConnectionSchema,
        getTablesForDb,
        getTableDetails
    }
}
