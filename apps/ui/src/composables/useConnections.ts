import { ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionEntry } from '@/lib/db-connections'

/**
 * Composable for managing database connections
 * Uses LOCAL refs that are manually synced with the store (same pattern as Chat.vue)
 * This avoids reactive loops from computed properties
 */
export function useConnections() {
    const connectionStore = useConnectionStore()

    // Use LOCAL refs - same pattern as original Chat.vue
    // These are NOT computed properties - they are manually synced
    const connections = ref<ConnectionEntry[]>([])
    const selectedConnectionId = ref('')

    const selectedConnection = computed(() =>
        connections.value.find(c => c.id === selectedConnectionId.value) || null
    )

    /**
     * Load connections from API and sync to local refs
     */
    async function loadConnections() {
        if (typeof window === 'undefined') {
            connections.value = []
            return
        }

        // Skip if store is already loading
        if (connectionStore.isLoading) {
            return
        }

        try {
            await connectionStore.loadConnections()

            // Sync store data to local ref (same as Chat.vue line 504)
            // Using storeToRefs-like access or ensuring unwrapping
            const storeConnections = (connectionStore.connections as any).value || connectionStore.connections
            connections.value = [...storeConnections]

            // Restore selection from localStorage
            const savedId = localStorage.getItem('pegasus-selected-connection')
            if (savedId && connections.value.some(c => c.id === savedId)) {
                selectedConnectionId.value = savedId
            } else if (!connections.value.some(c => c.id === selectedConnectionId.value)) {
                // Set default selection if current selection is invalid
                selectedConnectionId.value = connections.value[0]?.id ?? ''
            }
        } catch (e) {
            console.error('Failed to load connections:', e)
            connections.value = []
        }
    }

    /**
     * Select a connection and persist to localStorage
     */
    function selectConnection(id: string) {
        selectedConnectionId.value = id
        if (id) {
            localStorage.setItem('pegasus-selected-connection', id)
        }
    }

    return {
        connections,
        selectedConnection,
        selectedConnectionId,
        loadConnections,
        selectConnection
    }
}
