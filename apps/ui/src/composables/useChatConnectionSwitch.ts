import { ref, computed, type Ref } from 'vue'
import { toast } from '@/composables/useNotifications'

export function useChatConnectionSwitch(
    connections: Ref<any[]>,
    workspaceStore: any,
    selectConnection: (id: string) => Promise<void>
) {
    const unsavedDialogVisible = ref(false)
    const pendingConnectionId = ref<string | null>(null)

    const pendingConnectionName = computed(() => {
        const conn = connections.value.find(c => c.id === pendingConnectionId.value)
        return conn ? (conn.alias || conn.nickname) : undefined
    })

    const handleSelectConnection = async (id: string | null) => {
        if (!id) {
            await selectConnection('')
            return
        }
        await workspaceStore.switchConnection(id)
        await selectConnection(id)
    }

    // Debounce map to prevent duplicate table open requests
    const tableOpenDebounce = ref(new Map<string, number>())

    const handleEditTableWrapper = async (
        conn: any,
        table: string,
        selectedConnection: Ref<any>,
        selectedConnectionId: Ref<string>,
        workspaceRef: Ref<any>
    ) => {
        const connection = conn || selectedConnection.value
        if (!connection) return

        if (connection.id !== selectedConnectionId.value) {
            await handleSelectConnection(connection.id)
        }

        const key = `${connection.id}:${table}`
        const now = Date.now()
        const last = tableOpenDebounce.value.get(key) || 0

        if (now - last < 500) return
        tableOpenDebounce.value.set(key, now)

        workspaceRef.value?.openTable?.(table, connection, connection.provider || 'sqlite')
    }

    // Deprecated — connection-scoped tabs made these unnecessary
    const handleMigrate = async () => console.warn('[Chat] handleMigrate is deprecated')
    const handleDiscard = async () => console.warn('[Chat] handleDiscard is deprecated')

    const handleBannerMigrate = (sidebarOpen: Ref<boolean>) => {
        if (!sidebarOpen.value) sidebarOpen.value = true
        toast.info('Select a connection from the sidebar to migrate your work.')
    }

    return {
        unsavedDialogVisible,
        pendingConnectionId,
        pendingConnectionName,
        tableOpenDebounce,
        handleSelectConnection,
        handleEditTableWrapper,
        handleMigrate,
        handleDiscard,
        handleBannerMigrate,
    }
}
