import { ref, type Ref } from 'vue'
import { Engine } from '../../components/TableView/Engine/Engine'
import { toast } from '@/composables/useNotifications'

export interface AIAction {
    type: 'query' | 'modification' | 'add_column' | 'delete_column' | 'format' | 'calculation' | 'generate_table_request'
    description?: string
    cellChanges?: { row: number, col: number, value: any }[]
    newColumns?: { header: string, values?: any[] }[]
    deletedColumns?: number[]
    formatting?: { range: string, style: any }[]
    // For calculation/query results
    query?: string
    rows?: any[]
    headers?: string[]
}

export function useFormulaBarAI(engine: Engine, connection: Ref<any>) {
    const isAIMode = ref(false)
    const isProcessing = ref(false)
    const pendingAction = ref<AIAction | null>(null)
    const showPreview = ref(false)

    const lastResponse = ref<string | null>(null)

    const toggleMode = () => {
        isAIMode.value = !isAIMode.value
    }

    const executeAIQuery = async (query: string, model: string) => {
        if (!query.trim()) return

        isProcessing.value = true
        lastResponse.value = null // Clear previous response

        try {
            // 1. Prepare context - collect sample data for AI context
            const headers = engine.columnNames;
            const rows: any[][] = [];
            const rowCount = engine.config.rowCount || 100;
            const colCount = headers.length;

            // Collect sample data (first 50 rows)
            for (let r = 0; r < Math.min(50, rowCount); r++) {
                const rowData: any[] = [];
                for (let c = 0; c < colCount; c++) {
                    rowData.push(engine.getDisplayValue({ row: r, col: c }));
                }
                rows.push(rowData);
            }

            const spreadsheetData = {
                headers,
                sampleData: rows,
                rowCount
            }

            // 2. Call AI endpoint
            const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/ai/spreadsheet-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request: query,
                    spreadsheetData,
                    model,
                    connectionId: connection.value?.id
                })
            })

            if (!response.ok) throw new Error('AI request failed')

            const data = await response.json()

            // 3. Handle Tool Calls or Direct Response
            if (data.toolCalls && data.toolCalls.length > 0) {
                const primaryTool = data.toolCalls[0].result
                handleAIAction(primaryTool)
                // Also set text if available as explanation
                if (data.text) lastResponse.value = data.text
            } else if (data.text) {
                lastResponse.value = data.text
                // toast.info(data.text) // Removing toast in favor of response bar
            }
        } catch (err: any) {
            console.error('[AI Mode] Error:', err)
            toast.error(err.message || 'Failed to process AI query')
        } finally {
            isProcessing.value = false
        }
    }

    const handleAIAction = (action: AIAction) => {
        pendingAction.value = action

        // For read-only actions (queries), apply immediately or show results
        if (action.type === 'query' || action.type === 'calculation') {
            applyAction()
        } else {
            // For destructive or data-changing actions, show preview first
            showPreview.value = true
        }
    }

    const applyAction = async () => {
        if (!pendingAction.value) return

        const action = pendingAction.value
        engine.beginBatch()

        try {
            switch (action.type) {
                case 'modification':
                    if (action.cellChanges) {
                        for (const change of action.cellChanges) {
                            await engine.setValue({ row: change.row, col: change.col }, change.value)
                        }
                    }
                    break

                case 'add_column':
                    if (action.newColumns) {
                        for (const col of action.newColumns) {
                            const newColIdx = engine.columnNames.length
                            await engine.insertColumn(newColIdx, col.header)
                            if (col.values) {
                                for (let i = 0; i < col.values.length; i++) {
                                    await engine.setValue({ row: i, col: newColIdx }, col.values[i])
                                }
                            }
                        }
                    }
                    break

                case 'delete_column':
                    if (action.deletedColumns) {
                        // Sort descending to avoid index shifts
                        const sorted = [...action.deletedColumns].sort((a, b) => b - a)
                        for (const idx of sorted) {
                            await engine.deleteColumn(idx)
                        }
                    }
                    break

                case 'format':
                    if (action.formatting) {
                        for (const format of action.formatting) {
                            engine.applyFormat(format.range, format.style)
                        }
                    }
                    toast.success('Formatting applied')
                    break

                case 'calculation':
                    // Calculation results handled in Grid.vue usually, but could be here
                    break
            }

            toast.success(action.description || 'Action applied successfully')
        } catch (err: any) {
            toast.error(`Failed to apply action: ${err.message}`)
        } finally {
            engine.endBatch()
            pendingAction.value = null
            showPreview.value = false
        }
    }

    const discardAction = () => {
        pendingAction.value = null
        showPreview.value = false
    }

    return {
        isAIMode,
        isProcessing,
        pendingAction,
        showPreview,
        toggleMode,
        executeAIQuery,
        applyAction,
        discardAction,
        lastResponse
    }
}
