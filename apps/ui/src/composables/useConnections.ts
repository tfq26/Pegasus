import { ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionEntry } from '@/lib/db-connections'
import { defaultConnections } from '@/lib/db-connections'
import { QUERY_API_URL, getAuthHeaders } from '@/lib/api'

/**
 * Composable for managing database connections
 * Handles loading, selecting, and syncing connections with the store
 */
export function useConnections() {
    const connectionStore = useConnectionStore()

    // Use computed to always reflect store state
    const connections = computed(() => connectionStore.connections.value)
    const selectedConnectionId = ref('')

    /**
     * Load connections from API and sync to local ref
     */
    async function loadConnections() {
        if (typeof window === 'undefined') {
            // For SSR, we can't load from API, use defaults
            return
        }

        try {
            await connectionStore.loadConnections()
        } catch (e) {
            console.error('Failed to load connections:', e)
        }

        // Try to restore selection from localStorage
        const savedId = localStorage.getItem('pegasus-selected-connection')
        if (savedId && connections.value.some(c => c.id === savedId)) {
            selectedConnectionId.value = savedId
            connectionStore.selectConnection(savedId)
        }

        // Set default selection if current selection is invalid
        if (!connections.value.some((conn) => conn.id === selectedConnectionId.value)) {
            selectedConnectionId.value = connections.value[0]?.id ?? ''
            if (selectedConnectionId.value) {
                connectionStore.selectConnection(selectedConnectionId.value)
            }
        }
    }

    /**
     * Select a connection and persist to localStorage
     */
    function selectConnection(id: string) {
        selectedConnectionId.value = id
        connectionStore.selectConnection(id)
        if (id) {
            localStorage.setItem('pegasus-selected-connection', id)
        }
    }

    return {
        connections,
        selectedConnectionId,
        loadConnections,
        selectConnection
    }
}
