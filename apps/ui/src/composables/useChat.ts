import { ref, watch, nextTick, computed, unref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useWorkspaceStore } from '@/stores/workspace'
import { fetchChats, fetchChatHistory } from '@/lib/api'
import { useChatDialogs } from './useChatDialogs'
import type { Chat } from '@/stores/chat'

/**
 * Composable for managing chat operations
 * Handles chat list, selection, creation, and history management
 */
export function useChat() {
    const chatStore = useChatStore()
    const workspaceStore = useWorkspaceStore()

    // Reactive bridge to store
    const chats = computed(() => unref(chatStore.chats))
    const selectedChatId = computed({
        get: () => unref(chatStore.selectedChatId) || '',
        set: (val: string) => { (chatStore as any).selectedChatId = val || null }
    })
    const chatHistory = ref<any[]>([])

    const {
        previewChat,
        previewMessages,
        previewVisible,
        openChatPreview,
        closeChatPreview
    } = useChatDialogs()

    /**
     * Load all chats from API and sync to local ref
     */
    async function loadChats() {
        try {
            await chatStore.loadChats()
        } catch (e) {
            console.error('Failed to load chats', e)
        }
    }

    /**
     * Create a new chat and update active tab
     */
    async function createChat(title: string = 'New Chat') {
        try {
            const newChat = await chatStore.createChat(title)
            console.log('[useChat] New chat created:', newChat.id)

            // Switch to the new chat
            selectedChatId.value = newChat.id
            chatHistory.value = []

            // Store chatId in active tab's data
            workspaceStore.updateActiveTabData({ chatId: newChat.id, chatHistory: [] })

            // Clear preview state
            closeChatPreview()

            return newChat
        } catch (e) {
            console.error('[useChat] Failed to create chat:', e)
            throw e
        }
    }

    /**
     * Select a chat and show preview
     */
    async function selectChat(id: string) {
        try {
            const chat = (unref(chats) as any)?.find((c: Chat) => c.id === id)
            if (!chat) return

            // Load chat history
            const messages = await chatStore.loadChatHistory(id)

            // Show preview modal
            openChatPreview(chat, messages)
        } catch (e) {
            console.error('[useChat] Failed to load chat:', e)
            throw e
        }
    }

    /**
     * Continue with selected chat (from preview)
     */
    function continueChat(id: string) {
        const chat = (unref(chats) as any)?.find((c: Chat) => c.id === id)
        const messagesToLoad = [...previewMessages.value]

        closeChatPreview()

        // Create a new tab instead of updating the active one
        const newTab = workspaceStore.createTab('chat', {
            chatId: id,
            chatHistory: messagesToLoad
        })

        // Update tab label to chat title if available
        if (chat?.title) {
            newTab.label = chat.title
            workspaceStore.saveWorkspace()
        }

        selectedChatId.value = id
        chatHistory.value = [...previewMessages.value]
    }

    /**
     * Delete a chat
     */
    async function deleteChat(id: string) {
        try {
            await chatStore.deleteChat(id)

            const tabs = (workspaceStore as any).tabs || []
            for (const tab of tabs.filter((entry: any) => entry?.data?.chatId === id)) {
                workspaceStore.closeTab(tab.id)
            }

            if (unref(selectedChatId) === id) {
                selectedChatId.value = ''
                chatHistory.value = []
            }

            const activeTab = (workspaceStore as any).activeTab
            if (activeTab?.type === 'chat' && activeTab?.data?.chatId === id) {
                workspaceStore.updateActiveTabData({ chatId: undefined, chatHistory: [] })
            }
        } catch (e) {
            console.error('[useChat] Failed to delete chat:', e)
            throw e
        }
    }

    // Bi-directional sync: Local chatHistory <-> Active tab's chatHistory in store
    let isSyncing = false
    watch(chatHistory, (newVal) => {
        if (isSyncing) return
        const activeTab = (workspaceStore as any).activeTab
        if (activeTab?.type === 'chat' && newVal) {
            workspaceStore.updateActiveTabChatHistory([...newVal])
        }
    }, { deep: true })

    // Load chatHistory FROM the active tab when switching tabs
    watch(() => (workspaceStore as any).activeTabId, (newTabId, oldTabId) => {
        if (!newTabId || newTabId === oldTabId) return

        const tab = (workspaceStore as any).tabs.find((t: any) => t.id === newTabId)
        if (tab?.type === 'chat') {
            isSyncing = true
            const targetChatId = tab.data?.chatId || ''
            const chatStillExists = targetChatId
                ? (unref(chats) as any)?.some((chat: Chat) => chat.id === targetChatId)
                : false

            if (targetChatId && !chatStillExists) {
                workspaceStore.updateTabData(tab.id, { chatId: undefined, chatHistory: [] })
                tab.label = 'New Chat'
                chatHistory.value = []
                selectedChatId.value = ''
            } else {
                chatHistory.value = tab.data?.chatHistory || []
                selectedChatId.value = targetChatId
            }
            nextTick(() => { isSyncing = false })
        }
    })

    /**
     * Execute natural language query with AI
     * Converts prompt to SQL, executes it, and updates chat history
     */
    async function executeWithAI(
        prompt: string,
        connectionId: string,
        onProgress?: (percent: number, message: string) => void
    ) {
        try {
            // Import API functions
            const { generateAIQuery, QUERY_API_URL, getAuthHeaders } = await import('@/lib/api')
            const { buildConnectionPayload } = await import('@/lib/db-connections')
            const { useConnectionStore } = await import('@/stores/connection')
            const { useSettingsStore } = await import('@/stores/settings')

            onProgress?.(10, 'Thinking...')

            // Get connection
            const connectionStore = useConnectionStore()
            const connection = (unref(connectionStore.connections) as any).find((c: any) => c.id === connectionId)
            if (!connection) {
                throw new Error('Connection not found')
            }

            // Get Settings
            const settingsStore = useSettingsStore()

            // Ensure settings are loaded or use current value
            if (!(unref(settingsStore.settings) as any).activeModel) {
                await settingsStore.loadSettings()
            }
            const { temperature, maxTokens } = unref(settingsStore.settings) as any

            // Generate SQL from natural language
            const aiResponse = await generateAIQuery(prompt, connectionId, chatHistory.value, undefined, {
                temperature,
                maxTokens
            })

            onProgress?.(40, 'Executing...')

            // Execute the generated SQL
            const payload = buildConnectionPayload(connection)
            const res = await fetch(`${QUERY_API_URL}/query`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    provider: connection.provider,
                    connection: payload,
                    query: (aiResponse as any).query,
                    source: 'ai',
                    model: (aiResponse as any).model
                })
            })

            const body = await res.json()

            if (!res.ok) {
                throw new Error(body.error || 'Query execution failed')
            }

            onProgress?.(80, 'Formatting results...')

            // Update chat history
            const timestamp = Date.now()
            chatHistory.value.push({
                role: 'user',
                content: prompt,
                timestamp
            })

            chatHistory.value.push({
                role: 'assistant',
                content: aiResponse.explanation || 'Query executed successfully',
                timestamp
            })

            onProgress?.(100, 'Complete')

            return {
                query: aiResponse.query,
                result: body.result,
                explanation: aiResponse.explanation
            }
        } catch (error: any) {
            console.error('[useChat] AI execution failed:', error)
            throw error
        }
    }

    return {
        // State
        chats,
        selectedChatId,
        chatHistory,
        previewChat,
        previewMessages,
        previewVisible,

        // Actions
        loadChats,
        createChat,
        selectChat,
        continueChat,
        deleteChat,
        executeWithAI
    }
}
