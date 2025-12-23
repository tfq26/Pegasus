import { ref, watch } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionEntry } from '@/lib/db-connections'

// Global state to track initialization
let initialized = false

/**
 * Composable for managing database connections
 * Handles loading, selecting, and syncing connections with the store
 */
export function useConnections() {
    const connectionStore = useConnectionStore()

    // Use local ref instead of computed to avoid reactive loops
    const connections = ref<ConnectionEntry[]>([])
    const selectedConnectionId = ref('')

    // Sync from store when it changes (one-way sync)
    watch(
        () => connectionStore.connections,
        (newConnections) => {
            if (newConnections && Array.isArray(newConnections)) {
                connections.value = newConnections
            }
        },
        { immediate: true }
    )

    /**
     * Load connections from API
     */
    async function loadConnections() {
        if (typeof window === 'undefined') return

        // Only load once per session
        if (initialized && connectionStore.connections.length > 0) {
            connections.value = connectionStore.connections
            restoreSelection()
            return
        }

        try {
            await connectionStore.loadConnections()
            connections.value = connectionStore.connections || []
            initialized = true
            restoreSelection()
        } catch (e) {
            console.error('Failed to load connections:', e)
        }
    }

    function restoreSelection() {
        const conns = connections.value
        if (!conns.length) return

        // Try to restore selection from localStorage
        const savedId = localStorage.getItem('pegasus-selected-connection')
        if (savedId && conns.some((c) => c.id === savedId)) {
            selectedConnectionId.value = savedId
            return
        }

        // Set default selection
        if (!selectedConnectionId.value || !conns.some((c) => c.id === selectedConnectionId.value)) {
            selectedConnectionId.value = conns[0]?.id ?? ''
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
