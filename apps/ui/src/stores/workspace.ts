import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Tab {
    id: string
    type: 'chat' | 'query' | 'table'
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

const WORKSPACE_STORAGE_KEY = 'pegasus-workspace-tabs'

export const useWorkspaceStore = defineStore('workspace', () => {
    // State
    const tabs = ref<Tab[]>([])
    const activeTabId = ref<string | null>(null)

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

    // Actions
    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY)
            if (stored) {
                const parsed = JSON.parse(stored)
                tabs.value = parsed.tabs || []
                activeTabId.value = parsed.activeTabId || null
            }
        } catch (e) {
            console.error('[WorkspaceStore] Failed to load from storage:', e)
        }

        // Ensure at least one tab exists
        if (tabs.value.length === 0) {
            createTab('chat')
        }
    }

    function saveToStorage() {
        try {
            localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
                tabs: tabs.value,
                activeTabId: activeTabId.value
            }))
        } catch (e) {
            console.error('[WorkspaceStore] Failed to save to storage:', e)
        }
    }

    function createTab(type: Tab['type'], data?: Tab['data']) {
        const newId = String(Date.now())
        const labelMap = {
            chat: 'Query Editor',
            query: 'SQL Query',
            table: 'Spreadsheet'
        }

        const newTab: Tab = {
            id: newId,
            label: labelMap[type] || `New ${type}`,
            type,
            data: data || (type === 'chat' ? { chatHistory: [] } : {})
        }

        tabs.value.push(newTab)
        activeTabId.value = newId
        saveToStorage()

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

        saveToStorage()
        console.log('[WorkspaceStore] Closed tab:', tabId)
    }

    function setActiveTab(tabId: string) {
        if (tabs.value.find(t => t.id === tabId)) {
            activeTabId.value = tabId
            saveToStorage()
            console.log('[WorkspaceStore] Switched to tab:', tabId)
        }
    }

    function updateTabData(tabId: string, data: Partial<Tab['data']>) {
        const tab = tabs.value.find(t => t.id === tabId)
        if (tab) {
            tab.data = { ...tab.data, ...data }
            saveToStorage()
            console.log('[WorkspaceStore] Updated tab data:', { tabId, data })
        }
    }

    function updateActiveTabData(data: Partial<Tab['data']>) {
        if (activeTabId.value) {
            updateTabData(activeTabId.value, data)
        }
    }

    // Specialized action for updating chat history
    function updateActiveTabChatHistory(messages: any[]) {
        if (activeTabId.value) {
            updateTabData(activeTabId.value, { chatHistory: messages })
        }
    }

    // Append a message to active tab's chat history
    function appendMessageToActiveTab(message: any) {
        const tab = activeTab.value
        if (tab) {
            const currentHistory = tab.data?.chatHistory || []
            updateTabData(tab.id, { chatHistory: [...currentHistory, message] })
        }
    }

    // Get active tab's chat history (helper)
    function getActiveTabChatHistory(): any[] {
        return activeTab.value?.data?.chatHistory || []
    }

    return {
        // State
        tabs,
        activeTabId,

        // Computed
        activeTab,
        chatTabs,
        queryTabs,
        tableTabs,

        // Actions
        loadFromStorage,
        saveToStorage,
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
