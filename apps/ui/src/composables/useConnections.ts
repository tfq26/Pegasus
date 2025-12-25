import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionEntry } from '@/lib/db-connections'

const connections = ref<ConnectionEntry[]>([])
const selectedConnectionId = ref('')
const selectedConnection = computed(() =>
    connections.value.find(c => c.id === selectedConnectionId.value) || null
)

export function useConnections() {
    const connectionStore = useConnectionStore()

    /**
     * Load connections from API and sync to local refs
     */
    async function loadConnections() {
        if (typeof window === 'undefined') return

        // Sync immediately if store has data
        const storeConnections = (connectionStore.connections as any).value || connectionStore.connections
        if (storeConnections && Array.isArray(storeConnections) && connections.value.length === 0) {
            connections.value = [...storeConnections]
        }

        await connectionStore.loadConnections()

        // Sync fresh data
        const freshConnections = (connectionStore.connections as any).value || connectionStore.connections
        if (Array.isArray(freshConnections)) {
            connections.value = [...freshConnections]
        }

        // Restore selection from localStorage
        const savedId = localStorage.getItem('pegasus-selected-connection')
        if (savedId && connections.value.some(c => c.id === savedId)) {
            selectedConnectionId.value = savedId
        } else if (connections.value.length > 0 && !selectedConnectionId.value) {
            const first = connections.value[0]
            if (first) {
                selectedConnectionId.value = first.id
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
        selectedConnection,
        selectedConnectionId,
        loadConnections,
        selectConnection
    }
}
