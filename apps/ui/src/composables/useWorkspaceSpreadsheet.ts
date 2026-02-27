import { ref, computed, type Ref } from 'vue'
import type { Engine } from '@/components/TableView/Engine/Engine'
import { CSVExporter, ExcelExporter, PDFExporter } from '@/components/TableView/Engine/Exporters'
import { toast } from '@/composables/useNotifications'
import { getExportUrl } from '@/lib/api'

export function useWorkspaceSpreadsheet(
    tabs: Ref<any>,
    activeTabId: Ref<any>,
    engineCache: Map<string, Engine>,
    privateEngines: Map<string, Engine>,
    props: { privateMode?: boolean }
) {
    const gridRefs = ref(new Map<string, any>())
    const zoomLevel = ref(12)
    const canUndo = ref(false)
    const canRedo = ref(false)

    // ----- Grid Ref Management ------------------------------------------

    const setGridRef = (el: any, id: string) => {
        if (el) gridRefs.value.set(id, el)
        else gridRefs.value.delete(id)
    }

    // ----- Active Engine ------------------------------------------------

    const activeEngine = computed(() => {
        const currentId = activeTabId.value as unknown as string
        if (!currentId) return null
        if (props.privateMode && privateEngines.has(currentId)) return privateEngines.get(currentId)
        return engineCache.get(currentId) ?? null
    })

    // ----- Undo/Redo ----------------------------------------------------

    const updateUndoRedoState = () => {
        if (!activeEngine.value) {
            canUndo.value = false
            canRedo.value = false
            return
        }
        canUndo.value = activeEngine.value.undoManager.canUndo()
        canRedo.value = activeEngine.value.undoManager.canRedo()
    }

    const handleUndo = () => {
        if (activeEngine.value?.undoManager.undo()) {
            activeEngine.value.notifyChange()
            updateUndoRedoState()
        }
    }

    const handleRedo = () => {
        if (activeEngine.value?.undoManager.redo()) {
            activeEngine.value.notifyChange()
            updateUndoRedoState()
        }
    }

    // ----- Formula Bar --------------------------------------------------

    const setFormulaBarValue = (value: string | null) => {
        const tabId = activeTabId.value as unknown as string
        if (!tabId) return
        const activeGrid = gridRefs.value.get(tabId)
        if (activeGrid?.formulaBarValue) {
            activeGrid.formulaBarValue.value = value || ''
        }
    }

    // ----- Format -------------------------------------------------------

    const handleFormat = (type: string, value?: any) => {
        const grid = gridRefs.value.get((activeTabId as any).value)
        if (!grid) return
        if (type === 'auto-fit') { grid.autoFitAllColumns?.(); return }
        grid.handleFormat?.(type, value)
    }

    const toggleTextWrap = (val: boolean) => {
        const grid = gridRefs.value.get((activeTabId as any).value)
        if (grid) grid.textWrap = val
    }

    const toggleGridlines = (val: boolean) => {
        const grid = gridRefs.value.get((activeTabId as any).value)
        if (grid) grid.showGridlines = val
    }

    // ----- Computed Spreadsheet State -----------------------------------

    const activeTabVersions = computed(() => (tabs.value as any[]).find((t: any) => t.id === (activeTabId.value as unknown as string))?.data?.versions || [])
    const activeTabVersion = computed(() => (tabs.value as any[]).find((t: any) => t.id === (activeTabId.value as unknown as string))?.data?.currentVersion)
    const activeTabTextWrap = computed(() => gridRefs.value.get((activeTabId as any).value)?.textWrap ?? false)
    const activeTabShowGridlines = computed(() => gridRefs.value.get((activeTabId as any).value)?.showGridlines ?? true)

    const hasUncommittedChanges = computed(() => {
        const tabId = activeTabId.value as unknown as string
        if (!tabId) return false
        return gridRefs.value.get(tabId)?.hasUncommittedChanges || false
    })

    const isAIMode = computed(() => {
        const tabId = activeTabId.value as unknown as string
        if (!tabId) return false
        return gridRefs.value.get(tabId)?.isAIMode || false
    })

    const gridStyle = computed(() => ({
        height: `calc(100vh - ${zoomLevel.value * 10}px)`,
        transform: `scale(${zoomLevel.value / 10})`,
        transformOrigin: 'top left'
    }))

    const handleZoomChange = (val: number) => {
        zoomLevel.value = val
    }

    // ----- Export -------------------------------------------------------

    const exportCurrentTable = async (format: 'csv' | 'xlsx' | 'pdf') => {
        const currentTabIdValue = activeTabId.value as unknown as string
        if (!currentTabIdValue) return

        const activeTabObj = (tabs.value as any[]).find((t: any) => t.id === currentTabIdValue)
        if (!activeTabObj || (activeTabObj.type !== 'table' && activeTabObj.type !== 'spreadsheet')) {
            toast.error('No table active')
            return
        }

        const engine = engineCache.get(currentTabIdValue)
        if (!engine) { toast.error('No table active'); return }

        const filename = activeTabObj.label || 'export'

        if (format === 'csv') {
            if (activeTabObj.data?.tableName && activeTabObj.data?.connection) {
                try {
                    const exportUrl = getExportUrl(activeTabObj.data.tableName, activeTabObj.data.connection)
                    const link = document.createElement('a')
                    link.href = exportUrl
                    link.download = `${filename}.csv`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    toast.success('Export started')
                    return
                } catch (e: any) {
                    console.error('Server export failed, falling back to client-side', e)
                }
            }
            await CSVExporter.export(engine, `${filename}.csv`)
            toast.success('Exported to CSV')
        } else if (format === 'xlsx') {
            await ExcelExporter.export(engine, `${filename}.xlsx`)
            toast.success('Exported to XLSX')
        } else if (format === 'pdf') {
            await PDFExporter.export(engine, `${filename}.pdf`)
        }
    }

    return {
        gridRefs,
        zoomLevel,
        canUndo,
        canRedo,
        activeEngine,
        setGridRef,
        updateUndoRedoState,
        handleUndo,
        handleRedo,
        setFormulaBarValue,
        handleFormat,
        toggleTextWrap,
        toggleGridlines,
        activeTabVersions,
        activeTabVersion,
        activeTabTextWrap,
        activeTabShowGridlines,
        hasUncommittedChanges,
        isAIMode,
        gridStyle,
        handleZoomChange,
        exportCurrentTable,
    }
}
