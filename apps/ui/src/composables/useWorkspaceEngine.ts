import { ref, computed, onMounted, onUnmounted, watch, type Ref } from 'vue'
import { Engine } from '@/components/TableView/Engine/Engine'
import type { CellPosition } from '@/components/TableView/Engine/types'
import { getAuthHeaders } from '@/lib/api'
import { buildConnectionPayload } from '@/lib/db-connections'
import { showProgressToast } from '@/lib/toastProgress'
import type { Tab } from '@/stores/workspace'

export function useWorkspaceEngine(
    tabs: Ref<any>,
    activeTabId: Ref<any>,
    workspaceStore: any,
    props: { privateMode?: boolean },
    emit: (e: string, ...args: any[]) => void,
    onUndoRedoChange: () => void
) {
    // Engine caches
    const engineCache = new Map<string, Engine>()
    const privateEngines = new Map<string, Engine>()

    // Loading state
    const loadingTabIds = ref(new Set<string>())
    const loadingTables = ref(new Set<string>())
    const isRefreshing = ref(false)
    const isDataLoading = computed(() => loadingTabIds.value.size > 0)

    // Preload queue
    const preloadQueue = ref<string[]>([])
    let isPreloadingBackground = false

    // Tracks which tabs have had their data fully loaded (prevents redundant fetches)
    const dataLoadedTabs = new Set<string>()

    // ----- Helpers -------------------------------------------------------

    const formatTableName = (tableName: string): string => {
        const pattern1 = /^data_[a-f0-9]{32}_(.+)$/
        const match1 = tableName.match(pattern1)
        if (match1 && match1[1]) return match1[1]

        const match2 = tableName.match(/^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/i)
        return match2 && match2[1] ? match2[1] : tableName
    }

    const fetchTableData = async (tableName: string, connection: any, provider: string, limit = 2000, offset = 0, sortBy?: string, sortDir?: string) => {
        const baseUrl = import.meta.env.VITE_QUERY_API_URL
        const res = await fetch(`${baseUrl}/api/table/${tableName}/load`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                connection: buildConnectionPayload(connection),
                provider,
                limit,
                offset,
                sortBy: sortBy || undefined,
                sortDir: sortDir || undefined
            }),
        })

        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Failed to load table')

        const rows = body.rows || []
        const headers = (body.columns || [])
            .map((c: any) => c.name)
            .filter((n: string) => n !== '__id' && n !== '_rowid_')

        return { headers, rows }
    }

    // ----- Engine Creation -----------------------------------------------

    const getEngineForTab = (tabId: string): Engine => {
        const isCreation = !engineCache.has(tabId)
        if (!isCreation) return engineCache.get(tabId)!

        const engine = new Engine({ rowCount: 1000, colCount: 26 }, `spreadsheet-tab-${tabId}`)
        engineCache.set(tabId, engine)

        const tab = (tabs.value as Tab[])?.find((t: Tab) => t.id === tabId)

        // Restore lightweight sheet state from Pinia (not for DB-backed tabs)
        if (tab?.data?.engineState && !tab?.data?.tableName) {
            engine.loadState(tab.data.engineState)
        }

        // Set source metadata (data fetched lazily)
        if (tab?.data?.tableName) {
            engine.setSource(tab.data.tableName, tab.data.connection, tab.data.headers || [], tab.data.provider)
        }

        // Rate-limited auto-save listener
        const syncTimeouts: Record<string, ReturnType<typeof setTimeout>> = {}
        engine.onChange(() => {
            if (engine.saveStatus !== 'saving') {
                engine.saveStatus = 'saving'
                emit('save-status', 'saving')
            }

            workspaceStore.setTabDirty(tabId, engine.hasPendingModifications())

            // Only sync state to Pinia for lightweight local sheets (not DB-backed)
            if (!engine.hasSource()) {
                const debounceMs = 3000
                if (syncTimeouts[tabId]) clearTimeout(syncTimeouts[tabId])
                syncTimeouts[tabId] = setTimeout(() => {
                    workspaceStore.updateTabData(tabId, { engineState: engine.getState() })
                }, debounceMs)
            }
        })

        // Undo/redo state listener
        engine.onChange(() => {
            onUndoRedoChange()
        })

        onUndoRedoChange()

        // Provide standard pagination callback for Data Studio
        engine.fetchPageCallback = async (offset: number, limit: number, sortBy?: string, sortDir?: string) => {
            const currentTab = (tabs.value as Tab[])?.find((t: Tab) => t.id === tabId)
            const tableName = currentTab?.data?.tableName as string
            if (!tableName || !currentTab?.data) return { rows: [] }
            try {
                const { rows } = await fetchTableData(tableName, currentTab.data.connection, currentTab.data.provider as string, limit, offset, sortBy, sortDir)
                return { rows }
            } catch (e: any) {
                console.error('[Page Fetch] Failed', e)
                throw e
            }
        }

        // Return private branch if in private mode
        if (props.privateMode && privateEngines.has(tabId)) {
            return privateEngines.get(tabId)!
        }

        return engineCache.get(tabId)!
    }

    // ----- Data Refresh --------------------------------------------------

    const refreshTableData = async (engine: Engine) => {
        if (!engine.sourceTable || !engine.sourceConnection || !engine.sourceProvider) return

        const connectionId = engine.sourceConnection.id || 'unknown'
        const tableKey = `${connectionId}:${engine.sourceTable}`

        if (loadingTables.value.has(tableKey)) return
        loadingTables.value.add(tableKey)

        const progress = showProgressToast(`Refreshing ${formatTableName(engine.sourceTable)}...`, 20)
        try {
            isRefreshing.value = true
            const { headers, rows } = await fetchTableData(engine.sourceTable, engine.sourceConnection, engine.sourceProvider, 1000)
            progress.update(60, undefined, `Processing ${rows.length} rows...`)

            engine.clear({ keepStyles: true, silent: true })

            let dataStartsAtRow = 1
            let injectHeaders = true

            if (rows.length > 0) {
                const firstRow = rows[0]
                const isMatch = headers.every((h: string) => {
                    const val = firstRow[h]
                    return val === h || val === String(h)
                })
                if (isMatch) {
                    dataStartsAtRow = 0
                    injectHeaders = false
                }
            }

            const stringifyValue = (v: any) => (v === null || v === undefined) ? '' : String(v)
            const CHUNK_SIZE = 50
            const totalRows = rows.length
            let processedRows = 0

            while (processedRows < totalRows) {
                await new Promise(resolve => setTimeout(resolve, 0))

                const chunkEnd = Math.min(processedRows + CHUNK_SIZE, totalRows)
                const updates: { pos: CellPosition; value: string }[] = []

                for (let i = processedRows; i < chunkEnd; i++) {
                    const row = rows[i]
                    const gridRow = i + dataStartsAtRow

                    if (injectHeaders && i === 0) {
                        headers.forEach((h: string, colIndex: number) => {
                            updates.push({ pos: { row: 0, col: colIndex }, value: h })
                        })
                    }

                    headers.forEach((h: string, colIndex: number) => {
                        updates.push({ pos: { row: gridRow, col: colIndex }, value: stringifyValue(row[h]) })
                    })
                }

                engine.bulkSetValues(updates, true)
                processedRows = chunkEnd

                if (processedRows % 500 === 0 || processedRows === totalRows) {
                    progress.update(70 + Math.floor((processedRows / totalRows) * 20), undefined, `Refreshing ${processedRows}/${totalRows} rows`)
                }
            }

            engine.endBatch()

            const actualRowCount = engine.schemaMode === 'column-letters' ? rows.length : rows.length + 1
            engine.config.rowCount = Math.max(actualRowCount, 1000)
            engine.config.colCount = Math.max(headers.length, 26)

            engine.setSource(engine.sourceTable, engine.sourceConnection, headers, engine.sourceProvider, engine.schemaMode)
            engine.setOriginalData(rows)

            progress.success('Table refreshed')
        } catch (e: any) {
            console.error('[Refresh] Failed:', e)
            progress.error('Refresh failed', e.message)
        } finally {
            isRefreshing.value = false
            loadingTables.value.delete(tableKey)
        }
    }

    // ----- Save ----------------------------------------------------------

    const saveChanges = async (engine: Engine) => {
        if (isRefreshing.value) return
        try {
            if (!engine.hasPendingModifications()) {
                engine.saveStatus = 'saved'
                emit('save-status', 'saved')
                return
            }

            engine.saveStatus = 'saving'
            emit('save-status', 'saving')
            await engine.commit()
            engine.saveStatus = 'saved'
            emit('save-status', 'saved')

            if (engine.sourceTable) {
                await refreshTableData(engine)
            }
        } catch (e: any) {
            console.error('[Save] Failed:', e)
            engine.saveStatus = 'error'
            emit('save-status', 'error')
        }
    }

    // ----- Lazy Loading --------------------------------------------------

    const loadTabDataLazy = async (tabId: string) => {
        const engine = engineCache.get(tabId)
        if (!engine) return
        if (dataLoadedTabs.has(tabId)) return
        if (loadingTabIds.value.has(tabId)) return

        const tab = (tabs.value as Tab[])?.find((t: Tab) => t.id === tabId)
        if (!tab?.data) return

        // Handle Saved Data Views
        if (tab.data.viewId) {
            loadingTabIds.value.add(tabId)
            const progress = showProgressToast(`Loading data view...`, 20)
            try {
                const { fetchDataView } = await import('@/lib/api')
                const view = await fetchDataView(tab.data.viewId)
                if (view && view.data) {
                    engine.loadState(view.data)
                    dataLoadedTabs.add(tabId)
                    progress.success('Data view loaded')
                } else {
                    progress.dismiss()
                }
            } catch (e: any) {
                console.error('[Workspace] Failed to load data view:', e)
                progress.error('Failed to load', e.message)
            } finally {
                loadingTabIds.value.delete(tabId)
            }
            return
        }

        // Handle Database Tables
        if (!tab.data.tableName) return

        if (engine.getCells().size > 0) {
            dataLoadedTabs.add(tabId)
            return
        }

        const tableKey = `${tab.data.connection?.id || 'unknown'}:${tab.data.tableName}`
        if (loadingTables.value.has(tableKey)) return

        loadingTabIds.value.add(tabId)

        const tableName = tab.data.tableName as string
        const progress = showProgressToast(`Loading ${formatTableName(tableName)}...`, 20)

        try {
            const { headers: fetchedHeaders, rows } = await fetchTableData(tableName, tab.data.connection, tab.data.provider as string)
            if (!rows) {
                progress.dismiss()
                return
            }

            progress.update(60, undefined, `Processing ${rows.length} rows...`)

            const headers = tab.data.headers?.length ? tab.data.headers : fetchedHeaders

            engine.beginBatch()
            engine.clear({ keepStyles: true, silent: true })

            let dataStartsAtRow = 1
            let injectHeaders = true

            if (rows.length > 0) {
                const firstRow = rows[0]
                const isMatch = headers.every((h: string) => {
                    const val = firstRow[h]
                    return val === h || val === String(h)
                })
                if (isMatch) {
                    dataStartsAtRow = 0
                    injectHeaders = false
                }
            }

            const stringifyValue = (v: any) => (v === null || v === undefined) ? '' : String(v)
            const CHUNK_SIZE = 250
            const totalRows = rows.length
            let processedRows = 0

            while (processedRows < totalRows) {
                const chunkEnd = Math.min(processedRows + CHUNK_SIZE, totalRows)
                const updates: { pos: CellPosition; value: string }[] = []

                for (let i = processedRows; i < chunkEnd; i++) {
                    const row = rows[i]
                    const gridRow = i + dataStartsAtRow

                    if (injectHeaders && i === 0) {
                        headers.forEach((h: string, colIndex: number) => {
                            updates.push({ pos: { row: 0, col: colIndex }, value: h })
                        })
                    }

                    headers.forEach((h: string, colIndex: number) => {
                        updates.push({ pos: { row: gridRow, col: colIndex }, value: stringifyValue(row[h]) })
                    })
                }

                engine.bulkSetValues(updates, true)
                processedRows = chunkEnd
                progress.update(60 + Math.floor((processedRows / totalRows) * 30), undefined, `Loaded ${processedRows}/${totalRows} rows`)
                await new Promise(resolve => requestAnimationFrame(resolve))
            }

            engine.endBatch()
            engine.setOriginalData(rows)

            if (fetchedHeaders.length > 0) {
                engine.setSource(tableName, tab.data.connection, fetchedHeaders, tab.data.provider as string)
            }

            dataLoadedTabs.add(tabId)
            progress.success(`${formatTableName(tableName)} ready`)
        } catch (e: any) {
            console.error('[Workspace] Failed to lazy load data:', e)
            progress.error('Load failed', e.message)
        } finally {
            loadingTabIds.value.delete(tabId)
        }
    }

    // ----- Preload Queue -------------------------------------------------

    const processPreloadQueue = async () => {
        if (isPreloadingBackground || preloadQueue.value.length === 0) return
        isPreloadingBackground = true

        while (preloadQueue.value.length > 0) {
            const nextTabId = preloadQueue.value.shift()
            if (nextTabId && !engineCache.has(nextTabId)) {
                getEngineForTab(nextTabId)
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        }

        isPreloadingBackground = false
    }

    const preloadAllTabs = async () => {
        const tableTabs = (tabs.value as Tab[]).filter(t => t.type === 'table' || t.type === 'spreadsheet')
        if (tableTabs.length === 0) return

        preloadQueue.value = []
        const activeId = activeTabId.value as unknown as string

        if (activeId) {
            const isActiveTable = tableTabs.some(t => t.id === activeId)
            if (isActiveTable) {
                if (!engineCache.has(activeId)) getEngineForTab(activeId)
                loadTabDataLazy(activeId)
            }
        }

        const otherTabs = tableTabs.filter(t => t.id !== activeId && !engineCache.has(t.id))
        if (otherTabs.length > 0) {
            preloadQueue.value.push(...otherTabs.map(t => t.id))
            processPreloadQueue()
        }
    }

    // ----- Private Mode Watcher -----------------------------------------

    watch(() => props.privateMode, (isPrivate) => {
        const tabId = activeTabId.value as unknown as string
        if (!tabId) return

        const currentTab = (tabs.value as Tab[]).find((t: Tab) => t.id === tabId)
        if (currentTab && currentTab.type === 'table') {
            if (isPrivate) {
                const baseEngine = engineCache.get(tabId)
                if (baseEngine && !privateEngines.has(tabId)) {
                    const branch = baseEngine.createBranch('private')
                    privateEngines.set(tabId, branch)
                }
            } else {
                privateEngines.delete(tabId)
            }
        }
    })

    return {
        engineCache,
        privateEngines,
        loadingTabIds,
        loadingTables,
        isRefreshing,
        isDataLoading,
        dataLoadedTabs,
        preloadQueue,
        formatTableName,
        fetchTableData,
        getEngineForTab,
        refreshTableData,
        saveChanges,
        loadTabDataLazy,
        preloadAllTabs,
    }
}
