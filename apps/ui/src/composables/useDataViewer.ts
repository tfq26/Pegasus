import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import { fetchTableEntries } from '@/lib/api'
import type { ConnectionEntry } from '@/lib/db-connections'

export interface ViewerState {
    open: boolean
    loading: boolean
    connection: ConnectionEntry | null
    table: string
    entries: any[]
    page: number
    total: number | null
    hasMore: boolean
    error: string | null
}

export function useDataViewer() {
    const viewer = ref<ViewerState>({
        open: false,
        loading: false,
        connection: null,
        table: '',
        entries: [],
        page: 1,
        total: null,
        hasMore: false,
        error: null
    })

    const zoomLevel = ref(1)
    const zoomClasses = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl']
    const zoomClass = computed(() => zoomClasses[zoomLevel.value])

    const searchQuery = ref('')
    const sortColumn = ref<string | null>(null)
    const sortDirection = ref<'asc' | 'desc'>('asc')

    // Track current limit for reload operations
    const currentLimit = ref(50)

    const openViewer = async (connection: ConnectionEntry, table: string, limit: number = 50) => {
        currentLimit.value = limit
        viewer.value = {
            ...viewer.value,
            open: true,
            loading: true,
            connection,
            table,
            entries: [],
            page: 1,
            error: null
        }
        searchQuery.value = ''
        sortColumn.value = null

        try {
            const response = await fetchTableEntries({ entry: connection, table, page: 1, limit })
            viewer.value.entries = response.rows
            viewer.value.total = (response as any).total || 0
            viewer.value.hasMore = response.hasNext
        } catch (err: any) {
            viewer.value.error = err instanceof Error ? err.message : String(err)
            toast.error('Failed to load table data')
        } finally {
            viewer.value.loading = false
        }
    }

    const loadPage = async (page: number, limit?: number) => {
        if (!viewer.value.connection || !viewer.value.table) return

        const effectiveLimit = limit ?? currentLimit.value
        if (limit) currentLimit.value = limit

        viewer.value.loading = true
        viewer.value.page = page
        try {
            const response = await fetchTableEntries({
                entry: viewer.value.connection,
                table: viewer.value.table,
                page,
                limit: effectiveLimit
            })
            viewer.value.entries = response.rows
            viewer.value.hasMore = response.hasNext
        } catch (err: any) {
            viewer.value.error = err instanceof Error ? err.message : String(err)
            toast.error('Failed to load page')
        } finally {
            viewer.value.loading = false
        }
    }

    const closeViewer = () => {
        viewer.value.open = false
    }

    const toggleSort = (column: string) => {
        if (sortColumn.value === column) {
            sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
        } else {
            sortColumn.value = column
            sortDirection.value = 'asc'
        }
    }

    return {
        viewer,
        zoomLevel,
        zoomClass,
        searchQuery,
        sortColumn,
        sortDirection,
        openViewer,
        loadPage,
        closeViewer,
        toggleSort
    }
}
