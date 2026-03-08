import { ref } from 'vue'
import { QUERY_API_URL, getAuthHeaders } from '@/lib/api'
import { buildConnectionPayload } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { useProgress } from '@/lib/progress'

/**
 * Composable for managing spreadsheet/table data
 * Handles loading, editing, and saving table data
 */
export function useSpreadsheet() {
    // Spreadsheet state
    const excelData = ref<any[]>([])
    const excelDataLoading = ref(false)
    const excelEditorRef = ref<any>(null)
    const saveStatus = ref<'saved' | 'saving' | 'error'>('saved')

    const originalDataSnapshot = ref<any[]>([])

    // Current table info
    const currentTable = ref<string>('')
    const currentConnection = ref<ConnectionEntry | null>(null)

    /**
     * Load table data for spreadsheet editing
     */
    async function loadTableData(tableName: string, connection: ConnectionEntry) {
        if (!connection) {
            throw new Error('No connection selected')
        }

        const { startOperation, finishOperation, failOperation } = useProgress()
        const opId = `load-table-${tableName}`
        startOperation(opId, `Loading table ${tableName}...`)

        excelDataLoading.value = true
        currentTable.value = tableName
        currentConnection.value = connection

        try {
            const query = `SELECT * FROM ${tableName}`
            const connectionPayload = buildConnectionPayload(connection)

            const res = await fetch(`${QUERY_API_URL}/query`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    provider: connection.provider,
                    connection: connectionPayload,
                    query: query
                })
            })

            const body = await res.json()

            if (!res.ok) {
                throw new Error(body.error || 'Failed to load table')
            }

            excelData.value = body.result || []
            // Deep copy for snapshot
            originalDataSnapshot.value = JSON.parse(JSON.stringify(body.result || []))

            finishOperation(opId)
            return body.result
        } catch (e: any) {
            failOperation(opId, e.message || 'Failed to load table')
            throw e
        } finally {
            excelDataLoading.value = false
        }
    }

    /**
     * Save spreadsheet data back to database
     */
    async function saveTableData(data: any[] = excelData.value) {
        if (!currentTable.value || !currentConnection.value) {
            throw new Error('No table loaded')
        }

        const { startOperation, finishOperation, failOperation } = useProgress()
        const opId = 'save-table-data'
        startOperation(opId, 'Saving changes...')

        saveStatus.value = 'saving'

        try {
            const operations: any[] = []

            // 1. Identify Updates and Creates
            data.forEach(row => {
                const idKey = Object.keys(row).find(k => k === 'id' || k === '_rowid_' || k === '__id')
                const id = idKey ? row[idKey] : null

                const originalRow = id ? originalDataSnapshot.value.find(r => r[idKey!] === id) : null

                if (!originalRow) {
                    // It's a new row
                    operations.push({ type: 'create', data: row })
                } else {
                    // Compare row with original to see if it changed
                    const changes: any = {}
                    let hasChanged = false
                    Object.keys(row).forEach(key => {
                        if (row[key] !== originalRow[key]) {
                            changes[key] = row[key]
                            hasChanged = true
                        }
                    })

                    if (hasChanged) {
                        operations.push({ type: 'update', id, changes })
                    }
                }
            })

            // 2. Identify Deletes
            originalDataSnapshot.value.forEach(originalRow => {
                const idKey = Object.keys(originalRow).find(k => k === 'id' || k === '_rowid_' || k === '__id')
                const id = idKey ? originalRow[idKey] : null

                if (id) {
                    const stillExists = data.find(r => r[idKey!] === id)
                    if (!stillExists) {
                        operations.push({ type: 'delete', id })
                    }
                }
            })

            if (operations.length === 0) {
                saveStatus.value = 'saved'
                finishOperation(opId)
                return
            }

            const res = await fetch(`${QUERY_API_URL}/api/table/${currentTable.value}/operations`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    connection: buildConnectionPayload(currentConnection.value),
                    provider: currentConnection.value.provider,
                    operations
                })
            })

            const body = await res.json()
            if (!res.ok) throw new Error(body.error || 'Failed to save table data')

            // Update snapshot after successful save
            originalDataSnapshot.value = JSON.parse(JSON.stringify(data))

            saveStatus.value = 'saved'
            finishOperation(opId)
        } catch (e: any) {
            saveStatus.value = 'error'
            failOperation(opId, e.message || 'Failed to save')
            throw e
        }
    }

    /**
     * Export spreadsheet data
     */
    async function exportData(format: 'csv' | 'xlsx') {
        if (!currentTable.value || !currentConnection.value) {
            throw new Error('No table loaded')
        }

        const { startOperation, finishOperation, failOperation } = useProgress()
        const opId = 'export-data'
        startOperation(opId, `Exporting ${currentTable.value} as ${format.toUpperCase()}...`)

        try {
            const connectionPayload = buildConnectionPayload(currentConnection.value)

            const res = await fetch(`${QUERY_API_URL}/api/export`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    tableName: currentTable.value,
                    connection: connectionPayload,
                    provider: currentConnection.value.provider,
                    format
                })
            })

            if (!res.ok) {
                const body = await res.json()
                throw new Error(body.error || 'Export failed')
            }

            // Download the blob
            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${currentTable.value}_${Date.now()}.${format}`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            finishOperation(opId)
            // Note: Toast might need to be imported or use a global one
            // Existing code doesn't have a toast import here, but let's assume it's available or not CRITICAL
        } catch (e: any) {
            failOperation(opId, e.message || 'Export failed')
            throw e
        }
    }

    /**
     * Refresh table data
     */
    async function refreshTableData() {
        if (!currentTable.value || !currentConnection.value) {
            throw new Error('No table loaded')
        }

        return loadTableData(currentTable.value, currentConnection.value)
    }

    /**
     * Clear spreadsheet data
     */
    function clearData() {
        excelData.value = []
        currentTable.value = ''
        currentConnection.value = null
        saveStatus.value = 'saved'
    }

    return {
        // State
        excelData,
        excelDataLoading,
        excelEditorRef,
        saveStatus,
        currentTable,
        currentConnection,

        // Actions
        loadTableData,
        saveTableData,
        exportData,
        refreshTableData,
        clearData
    }
}
