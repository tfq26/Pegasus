import { ref, watch, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useWorkspaceStore } from '@/stores/workspace'
import { fetchChats, fetchChatHistory } from '@/lib/api'

/**
 * Composable for managing chat operations
 * Handles chat list, selection, creation, and history management
 */
export function useChat() {
    const chatStore = useChatStore()
    const workspaceStore = useWorkspaceStore()

    // Local refs synced with store
    const chats = ref<any[]>([])
    const selectedChatId = ref('')
    const chatHistory = ref<any[]>([])

    // Preview modal state
    const previewChat = ref<any>(null)
    const previewMessages = ref<any[]>([])
    const previewVisible = ref(false)

    /**
     * Load all chats from API and sync to local ref
     */
    async function loadChats() {
        try {
            await chatStore.loadChats()
            // Sync store data to local ref for reactivity
            chats.value = [...chatStore.chats.value]
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
            console.log('[useChat] New chat created:', newChat)

            // Sync store data to local ref
            chats.value = [...chatStore.chats.value]

            // Switch to the new chat
            selectedChatId.value = newChat.id
            chatHistory.value = []

            // Store chatId in active tab's data
            workspaceStore.updateActiveTabData({ chatId: newChat.id, chatHistory: [] })

            // Clear preview state
            previewChat.value = null
            previewMessages.value = []
            previewVisible.value = false

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
            const chat = chats.value.find(c => c.id === id)
            if (!chat) return

            // Load chat history
            const messages = await chatStore.loadChatHistory(id)

            // Show preview modal
            previewChat.value = chat
            previewMessages.value = messages
            previewVisible.value = true
        } catch (e) {
            console.error('[useChat] Failed to load chat:', e)
            throw e
        }
    }

    /**
     * Continue with selected chat (from preview)
     */
    function continueChat(id: string) {
        previewVisible.value = false
        selectedChatId.value = id

        // Load into main editor
        chatHistory.value = previewMessages.value

        // Store in active tab's data
        workspaceStore.updateActiveTabData({
            chatId: id,
            chatHistory: [...previewMessages.value]
        })
    }

    /**
     * Delete a chat
     */
    async function deleteChat(id: string) {
        try {
            await chatStore.deleteChat(id)
            chats.value = [...chatStore.chats.value]

            if (selectedChatId.value === id) {
                selectedChatId.value = ''
                chatHistory.value = []
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
        const activeTab = workspaceStore.activeTab.value
        if (activeTab?.type === 'chat' && newVal) {
            workspaceStore.updateActiveTabChatHistory([...newVal])
        }
    }, { deep: true })

    // Load chatHistory FROM the active tab when switching tabs
    watch(() => workspaceStore.activeTabId.value, (newTabId, oldTabId) => {
        if (!newTabId || newTabId === oldTabId) return

        const tab = workspaceStore.tabs.value.find(t => t.id === newTabId)
        if (tab?.type === 'chat') {
            isSyncing = true
            chatHistory.value = tab.data?.chatHistory || []
            selectedChatId.value = tab.data?.chatId || ''
            nextTick(() => { isSyncing = false })
        }
    })

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
        deleteChat
    }
}
