import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { QUERY_API_URL, getAuthHeaders } from '../lib/api'

export interface Tab {
    id: string
    type: 'chat' | 'query' | 'table' | 'spreadsheet'
    label: string
    data?: {
        chatId?: string
        chatHistory?: any[]
        content?: string
        tableName?: string
        connection?: any
        provider?: string
        headers?: string[]
        schemaMode?: string
        versions?: Array<{ version: number; table: string; created_at: string; reason?: string }>
        currentVersion?: number
        originalTable?: string
        [key: string]: any
    }
}

export const useWorkspaceStore = defineStore('workspace', () => {
    // State
    const tabs = ref<Tab[]>([])
    const activeTabId = ref<string | null>(null)
    const currentConnectionId = ref<string>('temp')
    const isLoading = ref(false)
    const isSaving = ref(false)
    const lastSaved = ref<Date | null>(null)

    // Computed
    const activeTab = computed(() =>
        tabs.value.find(t => t.id === activeTabId.value) || null
    )

    const chatTabs = computed(() =>
        tabs.value.filter(t => t.type === 'chat')
    )

    const queryTabs = computed(() =>
        tabs.value.filter(t => t.type === 'query')
    )

    const tableTabs = computed(() =>
        tabs.value.filter(t => t.type === 'table')
    )

    const isTempWorkspace = computed(() =>
        !currentConnectionId.value || currentConnectionId.value === 'temp'
    )

    const hasUnsavedWork = computed(() =>
        isTempWorkspace.value && tabs.value.length > 0
    )

    // Debounce timer
    let saveTimeout: any = null

    // Actions
    async function loadWorkspace(connectionId: string = 'temp') {
        isLoading.value = true
        currentConnectionId.value = connectionId

        try {
            const res = await fetch(`${QUERY_API_URL}/workspace/${connectionId}`, {
                method: 'GET',
                headers: getAuthHeaders(),
                credentials: 'include'
            })

            if (res.ok) {
                const body = await res.json()
                if (body.workspace) {
                    tabs.value = body.workspace.tabs || []
                    activeTabId.value = body.workspace.activeTabId || null
                    console.log(`[WorkspaceStore] Loaded workspace for ${connectionId}`)
                } else {
                    // Empty workspace
                    tabs.value = []
                    activeTabId.value = null

                    // If loading temp and it's empty, try localStorage as lazy migration (one-off)
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
                tabs.value = parsed.tabs || []
                activeTabId.value = parsed.activeTabId || null
                // Trigger save to migrate it to DB 'temp' immediately
                saveWorkspace()
            }
        } catch (e) { console.error(e) }
    }

    async function saveWorkspace() {
        // Clear existing timeout
        if (saveTimeout) clearTimeout(saveTimeout)

        // Debounce 1s
        saveTimeout = setTimeout(async () => {
            isSaving.value = true
            try {
                const data = {
                    tabs: tabs.value,
                    activeTabId: activeTabId.value
                }

                await fetch(`${QUERY_API_URL}/workspace/${currentConnectionId.value}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders()
                    },
                    credentials: 'include',
                    body: JSON.stringify({ workspace: data })
                })

                lastSaved.value = new Date()
                console.log(`[WorkspaceStore] Saved workspace for ${currentConnectionId.value}`)
            } catch (e) {
                console.error('[WorkspaceStore] Save error:', e)
            } finally {
                isSaving.value = false
            }
        }, 1000)
    }

    async function migrateUnsavedTabs(targetConnectionId: string) {
        isLoading.value = true
        try {
            // First ensure current temp state is saved
            const data = {
                tabs: tabs.value,
                activeTabId: activeTabId.value
            }
            // Force save to temp immediate
            await fetch(`${QUERY_API_URL}/workspace/temp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ workspace: data })
            })

            // Call migrate endpoint
            const res = await fetch(`${QUERY_API_URL}/workspace/migrate/unsaved`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ targetConnectionId })
            })

            if (!res.ok) throw new Error('Migration failed')

            // Reload into the new connection
            await loadWorkspace(targetConnectionId)
            return true
        } catch (e) {
            console.error('[WorkspaceStore] Migration error:', e)
            return false
        } finally {
            isLoading.value = false
        }
    }

    function createTab(type: Tab['type'], data?: Tab['data']) {
        const newId = String(Date.now())
        const labelMap: Record<string, string> = {
            chat: 'Query Editor',
            query: 'SQL Query',
            table: 'Spreadsheet',
            spreadsheet: 'Spreadsheet'
        }

        const newTab: Tab = {
            id: newId,
            label: labelMap[type] || `New ${type}`,
            type,
            data: data || (type === 'chat' ? { chatHistory: [] } : {})
        }

        tabs.value.push(newTab)
        activeTabId.value = newId
        saveWorkspace()

        console.log('[WorkspaceStore] Created tab:', { id: newId, type })
        return newTab
    }

    function closeTab(tabId: string) {
        const index = tabs.value.findIndex(t => t.id === tabId)
        if (index === -1) return

        tabs.value.splice(index, 1)

        // If closing active tab, switch to another
        if (activeTabId.value === tabId) {
            if (tabs.value.length > 0) {
                // Switch to previous tab or first tab
                const nextTab = tabs.value[Math.max(0, index - 1)]
                if (nextTab) {
                    activeTabId.value = nextTab.id
                }
            } else {
                // Allow zero tabs - set active to null
                activeTabId.value = null
            }
        }

        saveWorkspace()
        console.log('[WorkspaceStore] Closed tab:', tabId)
    }

    function setActiveTab(tabId: string) {
        if (tabs.value.find(t => t.id === tabId)) {
            activeTabId.value = tabId
            saveWorkspace()
        }
    }

    function updateTabData(tabId: string, data: Partial<Tab['data']>) {
        const tab = tabs.value.find(t => t.id === tabId)
        if (tab) {
            tab.data = { ...tab.data, ...data }
            saveWorkspace()
        }
    }

    function updateActiveTabData(data: Partial<Tab['data']>) {
        if (activeTabId.value) {
            updateTabData(activeTabId.value, data)
        }
    }

    function updateActiveTabChatHistory(messages: any[]) {
        if (activeTabId.value) {
            updateTabData(activeTabId.value, { chatHistory: messages })
        }
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

    // Initialize with temp if not loaded
    // loadWorkspace('temp') 

    return {
        // State
        tabs,
        activeTabId,
        currentConnectionId,
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
        migrateUnsavedTabs,
        createTab,
        closeTab,
        setActiveTab,
        updateTabData,
        updateActiveTabData,
        updateActiveTabChatHistory,
        appendMessageToActiveTab,
        getActiveTabChatHistory
    }
})
