import { ref, type Ref } from 'vue'
import type { Tab } from '@/stores/workspace'
import type { Engine } from '@/components/TableView/Engine/Engine'
import type { CellPosition } from '@/components/TableView/Engine/types'
import { fetchTableSchema, fetchTableQuery, getAuthHeaders } from '@/lib/api'
import { showProgressToast } from '@/lib/toastProgress'
import { toast } from '@/composables/useNotifications'
import { CSVExporter } from '@/components/TableView/Engine/Exporters'

export function useWorkspaceTabActions(
    tabs: Ref<any>,
    activeTabId: Ref<any>,
    activeTab: Ref<any>,
    workspaceStore: any,
    loadingTables: Ref<Set<string>>,
    loadingTabIds: Ref<Set<string>>,
    dataLoadedTabs: Set<string>,
    emit: (e: string, ...args: any[]) => void,
    getEngineForTab: (tabId: string) => Engine,
    refreshTableData: (engine: Engine) => Promise<void>,
    formatTableName: (name: string) => string
) {
    // ----- Helpers -------------------------------------------------------

    const labelToColIndex = (label: string): number => {
        let index = 0
        for (let i = 0; i < label.length; i++) {
            index = index * 26 + (label.charCodeAt(i) - 64)
        }
        return index - 1
    }

    // ----- Find / Deduplicate -------------------------------------------

    const findOrCreateDataViewTab = (tableName: string): boolean => {
        const existingTab = (tabs.value as Tab[]).find(
            (t: Tab) => (t.type === 'table' || t.type === 'dataview' || t.type === 'mockup') && t.data?.tableName === tableName
        )

        if (existingTab) {
            workspaceStore.setActiveTab(existingTab.id)
            emit('update:mode', 'spreadsheet')

            const engine = getEngineForTab(existingTab.id)
            if (engine && engine.sourceTable) {
                const tableKey = `${existingTab.data?.connection?.id || 'unknown'}:${existingTab.data?.tableName}`
                if (!loadingTables.value.has(tableKey)) {
                    refreshTableData(engine).catch(e => console.error('[Workspace] Refresh failed:', e))
                }
            }
            return true
        }

        return false
    }

    // ----- Open Table ---------------------------------------------------

    const openTable = async (tableName: string, connection: any, provider: string) => {
        const tableKey = `${connection?.id || 'unknown'}:${tableName}`

        if (loadingTables.value.has(tableKey)) return
        if (findOrCreateDataViewTab(tableName)) return

        loadingTables.value.add(tableKey)
        let newId: string | undefined
        const progress = showProgressToast(`Loading ${formatTableName(tableName)}...`, 10)

        try {
            const baseUrl = import.meta.env.VITE_QUERY_API_URL

            const [schemaBody, queryBody] = await Promise.all([
                (fetchTableSchema(connection, tableName) as Promise<any>).then(res => {
                    progress.update(40, undefined, 'Schema loaded')
                    return res
                }),
                (fetchTableQuery(connection, tableName, 500) as Promise<any>).then(res => {
                    progress.update(80, undefined, 'Data loaded')
                    return res
                }),
            ])

            if (schemaBody.error) { progress.error('Failed to load schema', schemaBody.error); throw new Error(schemaBody.error) }
            if (queryBody.error) { progress.error('Failed to load data', queryBody.error); throw new Error(queryBody.error) }

            const rows = queryBody.rows || []
            progress.update(90, undefined, `Processing ${rows.length} rows...`)

            let headers: string[] = []
            if (schemaBody.columns?.length) {
                headers = schemaBody.columns
                    .map((c: any) => c.name)
                    .filter((n: string) => n && n !== '__id' && n !== '_rowid_' && n !== '_row_order')
            }
            if (headers.length === 0 && rows.length > 0) {
                headers = Object.keys(rows[0]).filter(n => n && n !== '__id' && n !== '_rowid_' && n !== '_row_order')
            }

            const isColumnLetters = headers.every((h: string) => /^[A-Z]+$/.test(h))
            const schemaMode = isColumnLetters ? 'column-letters' : 'named-headers'

            // Fetch version history in background (non-blocking)
            fetch(`${baseUrl}/api/table/${tableName}/versions`, {
                headers: getAuthHeaders(),
                credentials: 'include',
            })
                .then(vRes => vRes.ok ? vRes.json() : null)
                .then(history => {
                    if (!history) return
                    const versions: any[] = []
                    if (history.original_table) {
                        versions.push({ version: 0, table: history.original_table, created_at: new Date().toISOString(), reason: 'Original Upload' })
                    }
                    if (Array.isArray(history.versions)) versions.push(...history.versions)

                    const tab = (tabs.value as Tab[]).find((t: Tab) => t.id === newId)
                    if (tab) tab.data = { ...tab.data, versions, currentVersion: 0 }
                })
                .catch(e => console.warn('[Workspace] Version history fetch failed:', e))

            const createdTab = workspaceStore.createTab('dataview', {
                tableName,
                label: formatTableName(tableName),
                connection,
                provider,
                headers,
                schemaMode,
                isSavedView: true // If it's a DB table, it's essentially a saved view/source
            })

            newId = createdTab.id as string
            loadingTabIds.value.add(newId)

            const engine = getEngineForTab(newId)
            engine.clear({ silent: true })
            engine.beginBatch()

            const stringifyValue = (v: any) => (v === null || v === undefined) ? '' : String(v)
            let dataStartsAtRow = schemaMode === 'column-letters' ? 0 : 1
            let injectHeaders = schemaMode === 'named-headers'

            if (schemaMode === 'named-headers' && rows.length > 0) {
                const firstRow = rows[0]
                const isMatch = headers.every((h: string) => { const val = firstRow[h]; return val === h || val === String(h) })
                if (isMatch) { dataStartsAtRow = 0; injectHeaders = false }
            }

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
                    progress.update(90 + Math.floor((processedRows / totalRows) * 8), undefined, `Loaded ${processedRows}/${totalRows} rows`)
                }
            }

            engine.endBatch()

            const actualRowCount = schemaMode === 'column-letters' ? rows.length : rows.length + 1
            engine.config.rowCount = Math.max(actualRowCount, 1000)
            engine.config.colCount = Math.max(headers.length, 26)

            engine.setSource(tableName, connection, headers, provider, schemaMode)
            engine.setOriginalData(rows)

            progress.success(`Loaded ${formatTableName(tableName)}!`)
            emit('update:mode', 'spreadsheet')

            if (newId) dataLoadedTabs.add(newId)
        } catch (e: any) {
            console.error('[Workspace] Failed to open table:', e)
            if (newId) workspaceStore.closeTab(newId)
            progress.error('Failed to open table', e.message || 'Unknown error')
        } finally {
            loadingTables.value.delete(tableKey)
            if (typeof newId !== 'undefined') loadingTabIds.value.delete(newId)
        }
    }

    // ----- Fork Table ---------------------------------------------------

    const handleForkTable = async (tabId: string) => {
        const engine = getEngineForTab(tabId)
        if (!engine || !engine.sourceTable) return

        const currentLabel = (tabs.value as any[]).find((t: any) => t.id === tabId)?.label || engine.sourceTable || 'Table'
        const newName = prompt('Save a Copy As:', `${currentLabel}_copy`)
        if (!newName) return

        const cleanName = newName.replace(/[^a-zA-Z0-9_\-\s]/g, '')
        const newSystemName = `data_${crypto.randomUUID().replace(/-/g, '')}_${cleanName.replace(/\s+/g, '_')}`

        const progress = showProgressToast(`Saving copy as ${cleanName}...`, 20)
        try {
            const baseUrl = import.meta.env.VITE_QUERY_API_URL
            const res = await fetch(`${baseUrl}/api/copy-table`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    sourceTableName: engine.sourceTable,
                    newTableName: newSystemName,
                    connection: engine.sourceConnection,
                    provider: engine.sourceProvider,
                }),
            })

            const result = await res.json()
            if (!res.ok) { progress.error('Failed to copy', result.error); throw new Error(result.error || 'Failed to copy table') }

            progress.success(`Saved copy "${cleanName}"`)
            await openTable(result.tableName, engine.sourceConnection || {}, engine.sourceProvider || 'local')
        } catch (e: any) {
            console.error('[Workspace] Copy failed:', e)
        }
    }

    // ----- Persist Table ------------------------------------------------

    const handlePersistTable = async (tabId: string) => {
        const engine = getEngineForTab(tabId)
        if (!engine) return

        if (engine.hasSource()) {
            await handleForkTable(tabId)
            return
        }

        const tableName = prompt('Enter a name for your new table:', (tabs.value as any[]).find((t: any) => t.id === tabId)?.label || 'MyDataView1')
        if (!tableName) return

        const progress = showProgressToast(`Persisting ${tableName}...`, 10)
        try {
            const csvContent = CSVExporter.getContent(engine)
            progress.update(30, undefined, 'Data serialized')

            const baseUrl = import.meta.env.VITE_QUERY_API_URL
            const res = await fetch(`${baseUrl}/api/table/upload`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: tableName, data: csvContent, provider: 'local' }),
            })

            const body = await res.json()
            if (!res.ok) { progress.error('Failed to persist', body.error); throw new Error(body.error || 'Failed to persist table') }

            progress.update(80, undefined, 'Finalizing sync...')
            progress.success(`Table "${tableName}" persisted!`)

            engine.setSource(body.tableName, body.connection, engine.columnNames, body.provider)
            const tab = (tabs.value as any[]).find((t: any) => t.id === tabId)
            if (tab) {
                tab.label = formatTableName(body.tableName)
                tab.data = { ...tab.data, tableName: body.tableName, connection: body.connection, provider: body.provider, headers: engine.columnNames }
                workspaceStore.saveWorkspace()
            }

            await engine.commit()
        } catch (e: any) {
            console.error('[Workspace] Persist failed:', e)
        }
    }

    // ----- Version Change -----------------------------------------------

    const handleVersionChange = async (tabId: string, version: number) => {
        const tab = (tabs.value as Tab[])?.find((t: Tab) => t.id === tabId)
        if (!tab?.data?.versions) return

        const targetVersion = tab.data.versions.find((v: any) => v.version === version)
        if (!targetVersion) { toast.error('Version not found'); return }

        const newTableName = targetVersion.table
        if (newTableName === tab.data.tableName) return

        tab.data.currentVersion = version
        tab.data.tableName = newTableName
        tab.label = formatTableName(newTableName)

        const engine = getEngineForTab(tabId)
        engine.setSource(newTableName, tab.data.connection, [], tab.data.provider, tab.data.schemaMode as any)
        await refreshTableData(engine)
        tab.data.headers = engine.columnNames

        toast.success(`Switched to version ${version === 0 ? 'Original' : 'v' + version}`)
    }

    // ----- Tab Lifecycle ------------------------------------------------

    const onTabClose = (id: string, engineCache: Map<string, Engine>) => {
        engineCache.delete(id)
        workspaceStore.closeTab(id)
    }

    const onAddTab = (type: Tab['type']) => {
        if (type === 'chat') {
            emit('create-chat')
            return
        }

        const labels: Record<string, string> = {
            table: 'Data View',
            dataview: 'Data View',
            query: 'SQL Query',
            note: 'New Note',
            file: 'New File',
            default: 'New Tab',
        }

        const label = labels[type as string] || 'New Tab'
        workspaceStore.createTab(type as any, { label })

        if (type === 'table' || type === 'dataview') emit('update:mode', 'spreadsheet')
        else if (type !== 'default') emit('update:mode', type === 'query' ? 'write' : 'chat')
    }

    const createQueryTab = (queryContent?: string) => {
        const createdTab = workspaceStore.createTab('query', { content: queryContent || '' })
        emit('update:mode', 'write')
        return createdTab.id
    }

    const openNote = (item: any, type: 'note' | 'file' = 'note') => {
        const tabType = type
        const itemId = item.id

        const existingTab = (tabs.value as Tab[]).find(t => t.type === tabType && t.data?.itemId === itemId)
        if (existingTab) { workspaceStore.setActiveTab(existingTab.id); return }

        if (type === 'file') {
            workspaceStore.createTab('file', {
                itemId: item.id, label: item.filename, filename: item.filename,
                file_type: item.file_type, storage_path: item.storage_path, content: item.content,
            })
        } else {
            workspaceStore.createTab('note', {
                itemId: item.id, label: item.title, title: item.title,
                content: item.content, file_type: item.file_type || 'md', updated_at: item.updated_at,
            })
        }
    }

    // ----- Legacy -------------------------------------------------------

    const loadTableData = (tableName: string, data: any[], connection: any = null, provider = 'sqlite') => {
        const createdTab = workspaceStore.createTab('dataview', {
            isExcelSource: true // Transient data usually treated as local/excel style
        })
        const newId = createdTab.id

        const tab = (tabs.value as Tab[])?.find((t: Tab) => t.id === newId)
        if (tab) { tab.label = formatTableName(tableName); workspaceStore.saveWorkspace() }

        const engine = getEngineForTab(newId)
        const hasData = engine.getCell({ row: 0, col: 0 }) !== null

        if (!hasData && data.length > 0) {
            const headers = Object.keys(data[0]).filter(h => h !== '_rowid_' && h !== '__id')

            engine.beginBatch()
            headers.forEach((header, colIndex) => engine.setValue({ row: 0, col: colIndex }, header))
            data.forEach((row, rowIndex) => {
                headers.forEach((header, colIndex) => {
                    engine.setValue({ row: rowIndex + 1, col: colIndex }, String(row[header] ?? ''))
                })
            })
            engine.endBatch()

            engine.setSource(tableName, connection, headers, provider)
            engine.setOriginalData(data)

            if (tab) {
                tab.data = { ...tab.data, tableName, connection, provider, headers }
                workspaceStore.saveWorkspace()
            }
        }

        emit('update:mode', 'spreadsheet')
    }

    return {
        findOrCreateDataViewTab,
        openTable,
        handleForkTable,
        handlePersistTable,
        handleVersionChange,
        onTabClose,
        onAddTab,
        createQueryTab,
        openNote,
        loadTableData,
        labelToColIndex,
    }
}
