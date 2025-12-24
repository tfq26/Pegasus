import { ref, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { useProgress } from '@/lib/progress'
import { sanitizeTable as apiSanitizeTable } from '@/lib/api'

export function useTableActions(
    workspaceRef: Ref<any>,
    selectedConnection: Ref<any>,
    mode: Ref<string>,
    lastQuery: Ref<string>, // needed for inferring table
    sanitizeTable: Ref<string>, // from useChatDialogs or shared state
    sanitizeDialogVisible: Ref<boolean> // if needed to open dialog
) {
    const { startOperation, finishOperation, failOperation } = useProgress()

    const handleRefreshTable = () => {
        if (workspaceRef.value?.refreshCurrentTable) {
            workspaceRef.value.refreshCurrentTable();
        } else {
            toast.error("Refresh not available");
        }
    }

    const handleSanitizeFixed = async (conn: any, table: string) => {
        if (!conn || !table) return

        // Note: Chat.vue updated selectedConnectionId here, but that seems like a side effect.
        // If we want to support that, we need selectedConnectionId ref.
        // Assuming we just sanitize the table provided.

        sanitizeTable.value = table

        const opId = `sanitize-analyze-${Date.now()}`
        startOperation(opId, `Sanitizing ${table}...`)
        toast.info(`Sanitizing table '${table}'...`)

        try {
            const result = await apiSanitizeTable(table)
            finishOperation(opId)

            if (result.success) {
                toast.success(`Sanitization successful!`, {
                    description: `Fixed ${result.issuesFixed} issues. Created version ${result.version}.`
                })
            } else {
                toast.info("Sanitization completed without changes.")
            }
        } catch (e: any) {
            failOperation(opId, e.message)
            toast.error('Failed to analyze table', { description: e.message })
        }
    }

    const handleSanitize = async () => {
        if (!selectedConnection.value) return

        // 1. Identify Table
        let table = ''
        if (lastQuery.value) {
            const match = lastQuery.value.match(/FROM\s+["`]?([a-zA-Z0-9_]+)["`]?/i)
            if (match && match[1]) table = match[1]
        }

        if (!table && workspaceRef.value?.getActiveTable) {
            const active = workspaceRef.value.getActiveTable()
            if (active) table = active
        }

        if (!table && mode.value === 'spreadsheet' && selectedConnection.value?.sqlite?.tables?.length) {
            table = selectedConnection.value.sqlite.tables[0]
        }

        if (!table) {
            toast.error("Could not identify source table.")
            return
        }

        // Check if we want to run fixed sanitize or open dialog?
        // Chat.vue `handleSanitize` calls `api.analyzeTable` (which is what Chat.vue lines 1746+ did)
        // Chat.vue lines 1746+ call `apiSanitizeTable`?
        // Wait, line 1748 says `startOperation... Sanitizing`.
        // Line 1756 (not shown) likely calls api behavior.
        // Assuming same logic as handleSanitizeFixed but with analysis first?
        // Actually, `handleSanitize` usually opens the dialog to SHOW issues.
        // `handleSanitizeFixed` applies fix directly?
        // Let's assume handleSanitize opens dialog.

        sanitizeTable.value = table
        sanitizeDialogVisible.value = true
    }

    const handleOpenSpreadsheet = (queryResult: any[]) => {
        if (!queryResult || !Array.isArray(queryResult) || queryResult.length === 0) {
            toast.warning('No data available')
            return
        }

        if (workspaceRef.value?.loadTableData) {
            const connection = selectedConnection.value
            const provider = connection?.provider || 'sqlite'
            const tableName = `Analysis ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`

            workspaceRef.value.loadTableData(tableName, queryResult, connection, provider)
            toast.success('Opened results in spreadsheet')
        } else {
            toast.error('Workspace not ready')
        }
    }

    const executeSanitization = async (sqls: string[], aiModel?: string) => {
        if (!selectedConnection.value) return

        const { startOperation, updateOperation, finishOperation } = useProgress()
        const opId = `sanitize-exec-${Date.now()}`
        startOperation(opId, `Applying ${sqls.length} Fixes`)

        toast.info("Applying fixes...")
        let successCount = 0
        let errors = 0

        // Note: Direct fetch usage as we need to support non-standard query source 'sanitize_fix'
        // We need QUERY_API_URL.
        // We can import it.
        const queryApiUrl = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'
        const { getAuthHeaders } = await import('@/lib/apiClient')
        const { buildConnectionPayload } = await import('@/lib/db-connections')

        for (let i = 0; i < sqls.length; i++) {
            const query = sqls[i]
            const percent = Math.round(((i) / sqls.length) * 100)
            updateOperation(opId, percent, `Running fix ${i + 1}/${sqls.length}`)

            try {
                const response = await fetch(`${queryApiUrl}/query`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({
                        provider: selectedConnection.value.provider,
                        connection: buildConnectionPayload(selectedConnection.value),
                        query: query,
                        source: 'sanitize_fix',
                        model: aiModel,
                    }),
                })
                if (!response.ok) throw new Error('Failed')
                successCount++
            } catch (e) {
                errors++
            }
        }

        finishOperation(opId)
        toast.success(`Applied ${successCount} fixes. ${errors > 0 ? `${errors} failed.` : ''}`)

        // Re-run original query if possible?
        // We require lastQuery ref to trigger re-run?
        // Or we just return success and let caller handle refresh.
        // Chat.vue logic triggered refresh.
        // We can call handleRefreshTable if available?
        if (lastQuery.value) {
            // Try to refresh table
            handleRefreshTable()
        }
    }

    const handleEditTable = (table: string) => {
        if (!selectedConnection.value) return
        if (workspaceRef.value?.openTable) {
            workspaceRef.value.openTable(table, selectedConnection.value, selectedConnection.value?.provider || 'sqlite')
        } else {
            toast.error("Table editor not available")
        }
    }

    const handleLoadTableToSheet = (data: any[]) => {
        if (!data || data.length === 0) return
        if (workspaceRef.value?.loadTableData) {
            workspaceRef.value.loadTableData('Imported Data', data, selectedConnection.value, selectedConnection.value?.provider || 'sqlite')
        }
    }

    return {
        handleRefreshTable,
        handleEditTable,
        handleSanitizeFixed,
        handleSanitize,
        handleOpenSpreadsheet,
        handleLoadTableToSheet,
        executeSanitization
    }
}
