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
            const payload = buildConnectionPayload(connection, query)

            const res = await fetch(`${QUERY_API_URL}/query`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify(payload)
            })

            const body = await res.json()

            if (!res.ok) {
                throw new Error(body.error || 'Failed to load table')
            }

            excelData.value = body.result || []
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
    async function saveTableData(data: any[]) {
        if (!currentTable.value || !currentConnection.value) {
            throw new Error('No table loaded')
        }

        const { startOperation, finishOperation, failOperation } = useProgress()
        const opId = 'save-table-data'
        startOperation(opId, 'Saving changes...')

        saveStatus.value = 'saving'

        try {
            // TODO: Implement actual save logic
            // This would involve generating UPDATE/INSERT/DELETE statements
            // based on the changes made to the data

            await new Promise(resolve => setTimeout(resolve, 500)) // Simulate save

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
        if (!excelData.value || excelData.value.length === 0) {
            throw new Error('No data to export')
        }

        // TODO: Implement export logic
        console.log(`Exporting data as ${format}`)
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
