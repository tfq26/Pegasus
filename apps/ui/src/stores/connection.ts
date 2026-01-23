import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConnectionEntry } from '@/lib/db-connections'
import { api } from '@/lib/apiClient'

export const useConnectionStore = defineStore('connection', () => {
    // State
    const connections = ref<ConnectionEntry[]>([])
    const selectedConnectionId = ref<string>('')
    const isLoading = ref(false)

    // Computed
    const selectedConnection = computed(() =>
        connections.value.find(c => c.id === selectedConnectionId.value) || null
    )

    const hasConnections = computed(() =>
        connections.value.length > 0
    )

    // Track if connections have been loaded initially
    const isInitialized = ref(false)
    const lastFetchTime = ref<number>(0)
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache
    const STORAGE_KEY = 'pegasus-selected-connection'
    const ALIAS_STORAGE_KEY = 'pegasus-connection-aliases'
    const localAliases = ref<Record<string, string>>({})

    // Actions
    async function loadConnections(forceRefresh = false) {
        // Skip if already loading
        if (isLoading.value) {
            return
        }

        // Ensure aliases are loaded
        loadAliases()

        // Check cache - only fetch if:
        // 1. Force refresh requested
        // 2. Never initialized
        // 3. Cache expired (5 minutes)
        const now = Date.now()
        const cacheValid = isInitialized.value && (now - lastFetchTime.value) < CACHE_DURATION

        if (!forceRefresh && cacheValid && connections.value.length > 0) {
            console.log('[ConnectionStore] Using cached connections:', connections.value.length)
            return
        }

        isLoading.value = true
        try {
            const response = await api.get<{ connections: ConnectionEntry[] }>('/connections')

            // Merge with local aliases
            connections.value = (response.connections || []).map(c => ({
                ...c,
                alias: localAliases.value[c.id]
            }))

            isInitialized.value = true
            lastFetchTime.value = now
            console.log('[ConnectionStore] Loaded connections:', connections.value.length)

            // Restore selection
            // const savedId = localStorage.getItem(STORAGE_KEY)
            const savedId = null
            if (savedId && connections.value.some(c => c.id === savedId)) {
                selectedConnectionId.value = savedId
            } else if (connections.value.length > 0 && !selectedConnectionId.value) {
                selectedConnectionId.value = connections.value[0]!.id
            }
        } catch (e) {
            console.error('[ConnectionStore] Failed to load connections:', e)
            connections.value = []
        } finally {
            isLoading.value = false
        }
    }

    async function saveConnection(connection: ConnectionEntry) {
        try {
            const saved = await api.post<ConnectionEntry>('/connections', connection)
            // Apply alias if exists in the incoming connection object (from form)
            if (connection.alias) {
                setConnectionAlias(saved.id, connection.alias)
                saved.alias = connection.alias
            }
            connections.value.push(saved)
            console.log('[ConnectionStore] Saved connection:', saved.id)
            return saved
        } catch (e) {
            console.error('[ConnectionStore] Failed to save connection:', e)
            throw e
        }
    }

    async function updateConnection(connection: ConnectionEntry) {
        try {
            const updated = await api.put<ConnectionEntry>(`/connections/${connection.id}`, connection)

            const index = connections.value.findIndex(c => c.id === connection.id)
            if (index !== -1) {
                // Preserve alias
                if (connection.alias !== undefined) {
                    setConnectionAlias(connection.id, connection.alias)
                    updated.alias = connection.alias
                } else {
                    updated.alias = connections.value[index].alias
                }
                connections.value[index] = updated
            }

            console.log('[ConnectionStore] Updated connection:', connection.id)
            return updated
        } catch (e) {
            console.error('[ConnectionStore] Failed to update connection:', e)
            throw e
        }
    }

    async function deleteConnection(connectionId: string) {
        try {
            await api.delete(`/connections/${connectionId}`)

            const index = connections.value.findIndex(c => c.id === connectionId)
            if (index !== -1) {
                connections.value.splice(index, 1)
            }

            if (selectedConnectionId.value === connectionId) {
                selectedConnectionId.value = ''
            }

            console.log('[ConnectionStore] Deleted connection:', connectionId)
        } catch (e) {
            console.error('[ConnectionStore] Failed to delete connection:', e)
            throw e
        }
    }

    function addEphemeralConnection(connection: ConnectionEntry) {
        // Prevent duplicates
        const index = connections.value.findIndex(c => c.id === connection.id)
        if (index === -1) {
            connections.value.push(connection)
            console.log('[ConnectionStore] Added ephemeral connection:', connection.id)
        }
    }

    function selectConnection(connectionId: string) {
        selectedConnectionId.value = connectionId
        if (connectionId) {
            // localStorage.setItem(STORAGE_KEY, connectionId)
        } else {
            // localStorage.removeItem(STORAGE_KEY)
        }
        console.log('[ConnectionStore] Selected connection:', connectionId)
    }

    function loadAliases() {
        try {
            const stored = localStorage.getItem(ALIAS_STORAGE_KEY)
            if (stored) {
                localAliases.value = JSON.parse(stored)
            }
        } catch (e) {
            console.error('[ConnectionStore] Failed to load aliases:', e)
        }
    }

    function setConnectionAlias(connectionId: string, alias: string) {
        // Update local state
        if (alias) {
            localAliases.value[connectionId] = alias
        } else {
            delete localAliases.value[connectionId]
        }

        // Update connections list
        const conn = connections.value.find(c => c.id === connectionId)
        if (conn) {
            conn.alias = alias
        }

        // Persist
        try {
            localStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(localAliases.value))
        } catch (e) {
            console.error('[ConnectionStore] Failed to save aliases:', e)
        }
    }

    return {
        // State
        connections,
        selectedConnectionId,
        isLoading,

        // Computed
        selectedConnection,
        hasConnections,

        // Actions
        loadConnections,
        saveConnection,
        updateConnection,
        deleteConnection,
        addEphemeralConnection,
        selectConnection,
        setConnectionAlias
    }
})
