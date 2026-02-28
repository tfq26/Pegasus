import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { QUERY_API_URL, getAuthHeaders } from '../lib/api'

export interface Tab {
    id: string
    type: 'chat' | 'query' | 'table' | 'spreadsheet' | 'note' | 'file' | 'default' | 'mockup' | 'dataview'
    label: string
    isDirty?: boolean  // Track unsaved changes
    closedAt?: string // ISO string for history cleanup
    data?: {
        chatId?: string
        chatHistory?: any[]
        content?: string
        tableName?: string
        connection?: any
        provider?: string
        headers?: string[]
        schemaMode?: string
        sessionId?: string // UUID for the query session document
        localQueries?: any[] // Cached queries for this session
        versions?: Array<{ version: number; table: string; created_at: string; reason?: string }>
        currentVersion?: number
        originalTable?: string
        engineState?: any
        [key: string]: any
    }
}

interface ConnectionWorkspace {
    tabs: Tab[]
    inactiveTabs: Tab[] // Archived tabs
    activeTabId: string | null
}

export const useWorkspaceStore = defineStore('workspace', () => {
    // State: Map of workspaces keyed by connection ID
    const workspacesByConnection = ref<Record<string, ConnectionWorkspace>>({})
    const activeConnectionId = ref<string>('temp')
    const isLoading = ref(false)
    const isSaving = ref(false)
    const lastSaved = ref<Date | null>(null)

    // Computed: Current workspace based on active connection
    const currentWorkspace = computed(() =>
        workspacesByConnection.value[activeConnectionId.value] || { tabs: [], inactiveTabs: [], activeTabId: null }
    )

    const tabs = computed(() => currentWorkspace.value.tabs)
    const activeTabId = computed(() => currentWorkspace.value.activeTabId)

    const activeTab = computed(() =>
        currentWorkspace.value.tabs.find(t => t.id === activeTabId.value) || null
    )

    const chatTabs = computed(() =>
        currentWorkspace.value.tabs.filter(t => t.type === 'chat')
    )

    const queryTabs = computed(() =>
        currentWorkspace.value.tabs.filter(t => t.type === 'query')
    )

    const tableTabs = computed(() =>
        currentWorkspace.value.tabs.filter(t => t.type === 'table')
    )

    // Backward compatibility: deprecated, always false now
    const isTempWorkspace = computed(() => false)
    const hasUnsavedWork = computed(() => false)

    // Debounce timer
    let saveTimeout: any = null

    // Ensure a workspace exists for a connection
    function ensureWorkspace(connectionId: string) {
        if (!workspacesByConnection.value[connectionId]) {
            workspacesByConnection.value[connectionId] = { tabs: [], inactiveTabs: [], activeTabId: null }
        }
    }

    // Actions
    async function loadWorkspace(connectionId: string = 'temp') {
        isLoading.value = true
        activeConnectionId.value = connectionId
        ensureWorkspace(connectionId)

        try {
            const res = await fetch(`${QUERY_API_URL}/workspace/${connectionId}`, {
                method: 'GET',
                headers: getAuthHeaders(),
                credentials: 'include'
            })

            if (res.ok) {
                const body = await res.json()
                if (body.workspace) {
                    // Strip engineState from database-backed tabs to prevent massive reactive objects
                    // Database tabs reload from the DB, so their engineState is wasteful and causes UI freezes
                    const cleanTabs = (tabs: any[]) => tabs.map(tab => {
                        if (tab.data?.tableName && tab.data?.engineState) {
                            const { engineState, ...cleanData } = tab.data
                            console.log(`[WorkspaceStore] Stripped engineState from DB tab: ${tab.data.tableName}`)
                            return { ...tab, data: cleanData }
                        }
                        return tab
                    })

                    workspacesByConnection.value[connectionId] = {
                        tabs: cleanTabs(body.workspace.tabs || []),
                        inactiveTabs: cleanTabs(body.workspace.inactiveTabs || []),
                        activeTabId: body.workspace.activeTabId || null
                    }
                    cleanupOldTabs(connectionId)
                    console.log(`[WorkspaceStore] Loaded workspace for ${connectionId}`)
                } else {
                    // Empty workspace, keep the initialized one
                    if (connectionId === 'temp') {
                        tryLoadFromLocalStorage()
                    }
                }
            } else {
                console.warn(`[WorkspaceStore] Failed to load workspace: ${res.status}`)
                if (connectionId === 'temp') tryLoadFromLocalStorage()
            }
        } catch (e) {
            console.error('[WorkspaceStore] Load error:', e)
            if (connectionId === 'temp') tryLoadFromLocalStorage()
        } finally {
            isLoading.value = false
        }
    }

    function tryLoadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('pegasus-workspace-tabs')
            if (stored) {
                const parsed = JSON.parse(stored)
                workspacesByConnection.value['temp'] = {
                    tabs: parsed.tabs || [],
                    inactiveTabs: parsed.inactiveTabs || [],
                    activeTabId: parsed.activeTabId || null
                }
                saveWorkspace()
            }
        } catch (e) { console.error(e) }
    }

    async function saveWorkspace(connectionId?: string) {
        const targetId = connectionId || activeConnectionId.value
        if (saveTimeout) clearTimeout(saveTimeout)

        saveTimeout = setTimeout(async () => {
            isSaving.value = true
            try {
                const workspace = workspacesByConnection.value[targetId]
                if (!workspace) return // Should not happen

                // Strip engineState from database-backed tabs before saving.
                // This prevents the workspace JSON from growing to megabytes.
                const stripEngineState = (tabs: Tab[]) => tabs.map(tab => {
                    if (tab.data?.tableName && tab.data?.engineState) {
                        const { engineState, ...cleanData } = tab.data
                        return { ...tab, data: cleanData }
                    }
                    return tab
                })

                const data = {
                    tabs: stripEngineState(workspace.tabs),
                    inactiveTabs: stripEngineState(workspace.inactiveTabs || []),
                    activeTabId: workspace.activeTabId
                }

                await fetch(`${QUERY_API_URL}/workspace/${targetId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders()
                    },
                    credentials: 'include',
                    body: JSON.stringify({ workspace: data })
                })

                if (targetId === activeConnectionId.value) {
                    lastSaved.value = new Date()
                }
                console.log(`[WorkspaceStore] Saved workspace for ${targetId}`)
            } catch (e) {
                console.error('[WorkspaceStore] Save error:', e)
            } finally {
                isSaving.value = false
            }
        }, 1000)
    }

    // Switch to a different connection's workspace
    async function switchConnection(connectionId: string) {
        if (activeConnectionId.value === connectionId) return

        // Save current workspace before switching
        await saveWorkspace(activeConnectionId.value)

        // Load the new connection's workspace
        await loadWorkspace(connectionId)
    }

    function createTab(type: Tab['type'], data?: Tab['data']) {
        ensureWorkspace(activeConnectionId.value)
        const workspace = workspacesByConnection.value[activeConnectionId.value]!

        const newId = String(Date.now())
        const labelMap: Record<string, string> = {
            chat: 'Query Editor',
            query: 'SQL Query',
            table: 'Spreadsheet',
            spreadsheet: 'Spreadsheet',
            note: 'Note',
            file: 'File',
            dataview: 'Data View',
            mockup: 'Data View',
            launcher: 'New Tab'
        }

        const newTab: Tab = {
            id: newId,
            label: data?.label || labelMap[type] || `New ${type}`,
            type,
            isDirty: false,
            data: {
                ...(data || {}),
                ...(type === 'chat' && !data?.chatHistory ? { chatHistory: [] } : {}),
                ...(type === 'query' && !data?.sessionId ? { localQueries: [] } : {})
            }
        }

        workspace.tabs.push(newTab)
        workspace.activeTabId = newId
        saveWorkspace(activeConnectionId.value)

        console.log('[WorkspaceStore] Created tab:', { id: newId, type })
        return newTab
    }

    function closeTab(tabId: string, connectionId?: string) {
        const targetId = connectionId || activeConnectionId.value
        const workspace = workspacesByConnection.value[targetId]
        if (!workspace) return

        const index = workspace.tabs.findIndex(t => t.id === tabId)
        if (index === -1) return

        const [tab] = workspace.tabs.splice(index, 1)

        // Move to inactive list instead of deleting
        if (tab) {
            tab.closedAt = new Date().toISOString()
            workspace.inactiveTabs = [tab, ...(workspace.inactiveTabs || [])]
        }

        if (workspace.activeTabId === tabId) {
            if (workspace.tabs.length > 0) {
                const nextTab = workspace.tabs[Math.max(0, index - 1)]
                workspace.activeTabId = nextTab?.id || null
            } else {
                workspace.activeTabId = null
            }
        }

        saveWorkspace(targetId)
        console.log('[WorkspaceStore] Archived tab to history:', tabId)
    }

    function restoreTab(tabId: string, connectionId?: string) {
        const targetId = connectionId || activeConnectionId.value
        const workspace = workspacesByConnection.value[targetId]
        if (!workspace) return

        const index = workspace.inactiveTabs?.findIndex(t => t.id === tabId)
        if (index === -1 || index === undefined) return

        const [tab] = workspace.inactiveTabs.splice(index, 1)
        if (tab) {
            delete tab.closedAt
            workspace.tabs.push(tab)
            workspace.activeTabId = tab.id
            saveWorkspace(targetId)
            console.log('[WorkspaceStore] Restored tab:', tabId)
        }
    }

    function deleteInactiveTab(tabId: string, connectionId?: string) {
        const targetId = connectionId || activeConnectionId.value
        const workspace = workspacesByConnection.value[targetId]
        if (!workspace) return

        const index = workspace.inactiveTabs?.findIndex(t => t.id === tabId)
        if (index === -1 || index === undefined) return

        workspace.inactiveTabs.splice(index, 1)
        saveWorkspace(targetId)
        console.log('[WorkspaceStore] Permanently deleted tab from history:', tabId)
    }

    function cleanupOldTabs(connectionId?: string) {
        const connId = connectionId || activeConnectionId.value
        const workspace = workspacesByConnection.value[connId]
        if (!workspace || !workspace.inactiveTabs) return

        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
        const now = Date.now()

        const initialCount = workspace.inactiveTabs.length
        workspace.inactiveTabs = workspace.inactiveTabs.filter(tab => {
            if (!tab.closedAt) return true
            const closedDate = new Date(tab.closedAt).getTime()
            return (now - closedDate) < THIRTY_DAYS
        })

        if (workspace.inactiveTabs.length !== initialCount) {
            console.log(`[WorkspaceStore] Cleaned up ${initialCount - workspace.inactiveTabs.length} old tabs for ${connId}`)
            saveWorkspace()
        }
    }

    function setActiveTab(tabId: string) {
        const workspace = workspacesByConnection.value[activeConnectionId.value]
        if (!workspace) return

        if (workspace.tabs.find(t => t.id === tabId)) {
            workspace.activeTabId = tabId
            saveWorkspace()
        }
    }

    function updateTabData(tabId: string, data: Partial<Tab['data']>) {
        const workspace = workspacesByConnection.value[activeConnectionId.value]
        if (!workspace) return

        const tab = workspace.tabs.find(t => t.id === tabId)
        if (tab) {
            tab.data = { ...tab.data, ...data }
            saveWorkspace()
        }
    }

    function updateTab(tabId: string, updates: Partial<Tab>) {
        const workspace = workspacesByConnection.value[activeConnectionId.value]
        if (!workspace) return

        const tab = workspace.tabs.find(t => t.id === tabId)
        if (tab) {
            Object.assign(tab, updates)
            saveWorkspace()
        }
    }

    function setTabDirty(tabId: string, isDirty: boolean) {
        const workspace = workspacesByConnection.value[activeConnectionId.value]
        if (!workspace) return

        const tab = workspace.tabs.find(t => t.id === tabId)
        if (tab) {
            tab.isDirty = isDirty
        }
    }

    function updateActiveTabData(data: Partial<Tab['data']>) {
        const workspace = workspacesByConnection.value[activeConnectionId.value]
        if (workspace?.activeTabId) {
            updateTabData(workspace.activeTabId, data)
        }
    }

    function updateActiveTabChatHistory(messages: any[]) {
        updateActiveTabData({ chatHistory: messages })
    }

    function appendMessageToActiveTab(message: any) {
        const tab = activeTab.value
        if (tab) {
            const currentHistory = tab.data?.chatHistory || []
            updateTabData(tab.id, { chatHistory: [...currentHistory, message] })
        }
    }

    function getActiveTabChatHistory(): any[] {
        return activeTab.value?.data?.chatHistory || []
    }

    // Deprecated: kept for backward compatibility, does nothing
    async function migrateUnsavedTabs(_targetConnectionId: string) {
        console.warn('[WorkspaceStore] migrateUnsavedTabs is deprecated')
        return true
    }

    return {
        // State
        tabs,
        activeTabId,
        activeConnectionId,
        currentConnectionId: activeConnectionId, // Alias for backward compatibility
        isLoading,
        isSaving,
        lastSaved,

        // Computed
        activeTab,
        chatTabs,
        queryTabs,
        tableTabs,
        isTempWorkspace,
        hasUnsavedWork,

        // Actions
        loadWorkspace,
        saveWorkspace,
        switchConnection,
        migrateUnsavedTabs,
        createTab,
        closeTab,
        restoreTab,
        deleteInactiveTab,
        cleanupOldTabs,
        setActiveTab,
        updateTab,
        updateTabData,
        setTabDirty,
        updateActiveTabData,
        updateActiveTabChatHistory,
        appendMessageToActiveTab,
        getActiveTabChatHistory,
        workspacesByConnection
    }
})
