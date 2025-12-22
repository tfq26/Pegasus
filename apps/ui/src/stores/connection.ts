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

    // Actions
    async function loadConnections() {
        isLoading.value = true
        try {
            const response = await api.get<{ connections: ConnectionEntry[] }>('/connections')
            connections.value = response.connections || []
            console.log('[ConnectionStore] Loaded connections:', connections.value.length)
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

    function selectConnection(connectionId: string) {
        selectedConnectionId.value = connectionId
        console.log('[ConnectionStore] Selected connection:', connectionId)
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
        selectConnection
    }
})
