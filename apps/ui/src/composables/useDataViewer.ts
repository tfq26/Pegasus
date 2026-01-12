import { ref, computed } from 'vue'
import { toast } from '@/composables/useNotifications'
import { fetchTableEntries, runQuery } from '@/lib/api'
import type { ConnectionEntry } from '@/lib/db-connections'
import { useSettingsStore } from '@/stores/settings'
import { readTextFile } from '@tauri-apps/plugin-fs'

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

    const settingsStore = useSettingsStore()

    // Track current limit for reload operations
    const currentLimit = ref((settingsStore.settings as any).defaultPageSize || 50)

    const openViewer = async (connection: ConnectionEntry, table: string, limit: number = (settingsStore.settings as any).defaultPageSize || 50) => {
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

        searchQuery.value = ''
        sortColumn.value = null

        try {
            // Local File Mode
            if (connection.provider === 'file') {
                const filePath = (connection as any).file?.path
                if (!filePath) throw new Error('No file path provided')

                const content = await readTextFile(filePath)
                const ext = filePath.split('.').pop()?.toLowerCase()

                let rows: any[] = []
                if (ext === 'json') {
                    rows = JSON.parse(content)
                    if (!Array.isArray(rows)) rows = [rows]
                } else {
                    // Basic CSV
                    const lines = content.split('\n').filter((l: string) => l.trim())
                    if (lines.length > 0) {
                        const headers = lines[0].split(',')
                        rows = lines.slice(1).map((line: string) => {
                            const values = line.split(',')
                            return headers.reduce((acc: any, header: string, i: number) => {
                                if (header) acc[header.trim()] = values[i]?.trim()
                                return acc
                            }, {})
                        })
                    }
                }

                viewer.value.entries = rows
                viewer.value.total = rows.length
                viewer.value.hasMore = false
            } else {
                const response = await fetchTableEntries({ entry: connection, table, page: 1, limit })
                viewer.value.entries = response.rows
                viewer.value.total = (response as any).total || 0
                viewer.value.hasMore = response.hasNext
            }
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

    const reload = async () => {
        if (!viewer.value.connection || !viewer.value.table) return
        await loadPage(viewer.value.page)
    }

    const deleteRow = async (row: any) => {
        if (!row || !viewer.value.connection || !viewer.value.table) return

        const provider = viewer.value.connection.provider
        const table = viewer.value.table

        // Try to find a primary key
        const pkCandidate = Object.keys(row).find(k => k.toLowerCase() === 'id' || k.toLowerCase() === 'uuid') || Object.keys(row)[0]
        if (!pkCandidate) throw new Error('Could not identify primary key for deletion')

        const pkValue = row[pkCandidate]
        let query = ''

        if (provider === 'mysql') {
            query = `DELETE FROM \`${table}\` WHERE \`${pkCandidate}\` = ${typeof pkValue === 'number' ? pkValue : `'${pkValue}'`}`
        } else if (provider === 'sqlite' || provider === 'postgres') {
            query = `DELETE FROM "${table}" WHERE "${pkCandidate}" = ${typeof pkValue === 'number' ? pkValue : `'${pkValue}'`}`
        } else if (provider === 'surrealdb') {
            query = `DELETE ${pkValue}`
        }

        if (!query) throw new Error('Deletion not supported for this provider yet')

        try {
            await runQuery(viewer.value.connection, query)
            toast.success('Row deleted successfully')
            await reload()
        } catch (err: any) {
            toast.error('Failed to delete row: ' + err.message)
            throw err
        }
    }

    const updateCell = async (row: any, column: string, newValue: any) => {
        if (!row || !viewer.value.connection || !viewer.value.table) return

        const provider = viewer.value.connection.provider
        const table = viewer.value.table

        const pkCandidate = Object.keys(row).find(k => k.toLowerCase() === 'id' || k.toLowerCase() === 'uuid') || Object.keys(row)[0]
        if (!pkCandidate) throw new Error('Could not identify primary key for update')

        const pkValue = row[pkCandidate]
        let query = ''

        const formattedValue = typeof newValue === 'number' ? newValue : `'${String(newValue).replace(/'/g, "''")}'`

        if (provider === 'mysql') {
            query = `UPDATE \`${table}\` SET \`${column}\` = ${formattedValue} WHERE \`${pkCandidate}\` = ${typeof pkValue === 'number' ? pkValue : `'${pkValue}'`}`
        } else if (provider === 'sqlite' || provider === 'postgres') {
            query = `UPDATE "${table}" SET "${column}" = ${formattedValue} WHERE "${pkCandidate}" = ${typeof pkValue === 'number' ? pkValue : `'${pkValue}'`}`
        } else if (provider === 'surrealdb') {
            query = `UPDATE ${pkValue} SET ${column} = ${formattedValue}`
        }

        if (!query) throw new Error('Update not supported for this provider yet')

        try {
            await runQuery(viewer.value.connection, query)
            toast.success('Cell updated successfully')
            await reload()
        } catch (err: any) {
            toast.error('Failed to update cell: ' + err.message)
            throw err
        }
    }

    return {
        viewer,
        zoomLevel,
        zoomClasses,
        zoomClass,
        searchQuery,
        sortColumn,
        sortDirection,
        openViewer,
        loadPage,
        closeViewer,
        toggleSort,
        deleteRow,
        updateCell,
        reload
    }
}
