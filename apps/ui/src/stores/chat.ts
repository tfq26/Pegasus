import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/apiClient'

export interface ChatMessage {
    role: 'user' | 'assistant' | 'ai'
    content: string
    timestamp: number
}

export interface Chat {
    id: string
    title: string
    messages: ChatMessage[]
    createdAt: number
    updatedAt: number
}

export const useChatStore = defineStore('chat', () => {
    // State
    const chats = ref<Chat[]>([])
    const selectedChatId = ref<string | null>(null)
    const isLoading = ref(false)

    // Computed
    const selectedChat = computed(() =>
        chats.value.find(c => c.id === selectedChatId.value) || null
    )

    const selectedChatMessages = computed(() =>
        selectedChat.value?.messages || []
    )

    // Actions
    async function loadChats() {
        isLoading.value = true
        try {
            const response = await api.get<{ chats: Chat[] }>('/chats')
            chats.value = response.chats || []
            console.log('[ChatStore] Loaded chats:', chats.value.length)
        } catch (e) {
            console.error('[ChatStore] Failed to load chats:', e)
            chats.value = []
        } finally {
            isLoading.value = false
        }
    }

    async function createChat(title: string = 'New Chat') {
        try {
            const newChat = await api.post<Chat>('/chats', { title })
            chats.value.unshift(newChat)
            selectedChatId.value = newChat.id
            console.log('[ChatStore] Created chat:', newChat.id)
            return newChat
        } catch (e) {
            console.error('[ChatStore] Failed to create chat:', e)
            throw e
        }
    }

    async function loadChatHistory(chatId: string) {
        isLoading.value = true
        try {
            const data = await api.get<{ messages: any[] }>(`/chats/${chatId}`)

            const messages: ChatMessage[] = data.messages.map((m: any) => ({
                role: m.role === 'ai' ? 'assistant' : m.role,
                content: m.content,
                timestamp: m.created_at * 1000
            }))

            // Update chat in store
            const chat = chats.value.find(c => c.id === chatId)
            if (chat) {
                chat.messages = messages
                chat.updatedAt = Date.now()
            }

            console.log('[ChatStore] Loaded chat history:', { chatId, messagesCount: messages.length })
            return messages
        } catch (e) {
            console.error('[ChatStore] Failed to load chat history:', e)
            throw e
        } finally {
            isLoading.value = false
        }
    }

    async function saveMessage(chatId: string, role: 'user' | 'ai', content: string) {
        try {
            await api.post(`/chats/${chatId}/messages`, { role, content })

            // Update local state
            const chat = chats.value.find(c => c.id === chatId)
            if (chat) {
                chat.messages.push({
                    role: role === 'ai' ? 'assistant' : role,
                    content,
                    timestamp: Date.now()
                })
                chat.updatedAt = Date.now()
            }

            console.log('[ChatStore] Saved message:', { chatId, role })
        } catch (e) {
            console.error('[ChatStore] Failed to save message:', e)
            throw e
        }
    }

    async function deleteChat(chatId: string) {
        try {
            await api.delete(`/chats/${chatId}`)

            const index = chats.value.findIndex(c => c.id === chatId)
            if (index !== -1) {
                chats.value.splice(index, 1)
            }

            if (selectedChatId.value === chatId) {
                selectedChatId.value = null
            }

            console.log('[ChatStore] Deleted chat:', chatId)
        } catch (e) {
            console.error('[ChatStore] Failed to delete chat:', e)
            throw e
        }
    }

    function selectChat(chatId: string | null) {
        selectedChatId.value = chatId
        console.log('[ChatStore] Selected chat:', chatId)
    }

    return {
        // State
        chats,
        selectedChatId,
        isLoading,

        // Computed
        selectedChat,
        selectedChatMessages,

        // Actions
        loadChats,
        createChat,
        loadChatHistory,
        saveMessage,
        deleteChat,
        selectChat
    }
})
