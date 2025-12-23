import { ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionEntry } from '@/lib/db-connections'

// Shared flag to prevent recursive loading across all instances
let isLoadingConnections = false

/**
 * Composable for managing database connections
 * Handles loading, selecting, and syncing connections with the store
 */
export function useConnections() {
    const connectionStore = useConnectionStore()

    // Use computed to always reflect store state
    const connections = computed<ConnectionEntry[]>(() => {
        return connectionStore.connections || []
    })

    const selectedConnectionId = ref('')

    /**
     * Load connections from API and sync to local ref
     */
    async function loadConnections() {
        if (typeof window === 'undefined') {
            // For SSR, we can't load from API
            return
        }

        // Prevent recursive calls
        if (isLoadingConnections) {
            console.log('[useConnections] Skipping - already loading')
            return
        }

        isLoadingConnections = true

        try {
            await connectionStore.loadConnections()

            // Get the actual array value for operations
            const conns = connectionStore.connections || []

            // Try to restore selection from localStorage
            const savedId = localStorage.getItem('pegasus-selected-connection')
            if (savedId && conns.some((c) => c.id === savedId)) {
                selectedConnectionId.value = savedId
                connectionStore.selectConnection(savedId)
                return
            }

            // Set default selection if current selection is invalid
            if (!conns.some((conn) => conn.id === selectedConnectionId.value)) {
                selectedConnectionId.value = conns[0]?.id ?? ''
                if (selectedConnectionId.value) {
                    connectionStore.selectConnection(selectedConnectionId.value)
                }
            }
        } catch (e) {
            console.error('Failed to load connections:', e)
        } finally {
            isLoadingConnections = false
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
