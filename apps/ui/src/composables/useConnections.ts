import { ref, computed, nextTick } from 'vue'
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

            // Use nextTick to defer state updates and prevent recursive triggers
            await nextTick()

            // Get the actual array value for operations
            const conns = connectionStore.connections || []

            // Try to restore selection from localStorage
            const savedId = localStorage.getItem('pegasus-selected-connection')
            if (savedId && conns.some((c) => c.id === savedId)) {
                // Defer the update to next tick
                await nextTick()
                selectedConnectionId.value = savedId
                connectionStore.selectConnection(savedId)
                return
            }

            // Set default selection if current selection is invalid
            if (!conns.some((conn) => conn.id === selectedConnectionId.value)) {
                const defaultId = conns[0]?.id ?? ''
                if (defaultId) {
                    // Defer the update to next tick
                    await nextTick()
                    selectedConnectionId.value = defaultId
                    connectionStore.selectConnection(defaultId)
                }
            }
        } catch (e) {
            console.error('Failed to load connections:', e)
        } finally {
            // Reset flag after a delay to ensure all updates are processed
            setTimeout(() => {
                isLoadingConnections = false
            }, 100)
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
