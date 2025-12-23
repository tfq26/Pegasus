<template>
  <div class="flex w-full h-full text-stone-100 overflow-hidden">
    <!-- Chat Sidebar -->
    <ChatSidebar 
      v-show="sidebarOpen" 
      :side="sidebarSide" 
      :connections="connections"
      :selected-connection-id="selectedConnectionId"
      :chats="chats"
      :selected-chat-id="selectedChatId"
      @update:selected-connection-id="selectConnection"
      @toggle="toggleSidebar" 
      @select-chat="handleSelectChat"
      @create-chat="handleCreateChat"
    />
    
    <button
      v-if="!sidebarOpen"
      class="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-r-lg bg-stone-900/80 text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-all"
      @click="toggleSidebar"
      aria-label="Open sidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </button>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Toolbar -->
      <ChatToolbar 
        mode="chat"
        :connections="connections"
        :selected-connection-id="selectedConnectionId"
        :is-executing="isExecuting"
        :ai-options="aiOptions"
        :available-models="availableModels"
        :ai-mode="aiMode"
        :auto-execute="autoExecute"
        :private-mode="privateMode"
        @update:mode="$router.push('/chat/query')"
        @update:selected-connection-id="selectConnection"
        @update:ai-options="aiOptions = $event"
        @update:auto-execute="autoExecute = $event"
        @run="handleSubmit"
        @stop="stopExecution"
        @ai-generate="handleAIGenerate"
        @clear="clear"
        @toggle-ai-mode="handleToggleAIMode"
        @update:private-mode="privateMode = $event"
      />

      <!-- Chat Workspace -->
      <Workspace
        ref="workspaceRef"
        class="flex-1 min-h-0"
        mode="chat"
        :input="currentInput || ''"
        :chat-history="chatHistory"
        :ai-mode="aiMode"
        :auto-execute="autoExecute"
        :private-mode="privateMode"
        :is-thinking="isExecuting"
        @update:input="currentInput = $event"
        @submit="handleSubmit"
        @create-chat="handleCreateChat"
      />
    </div>

    <!-- Chat History Modal -->
    <ChatHistoryModal
      v-model:open="previewVisible"
      :chat="previewChat"
      :messages="previewMessages"
      @continue="handleContinueChat"
    />
    
    <PresenceCounter v-if="aiMode" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import ChatSidebar from '@/components/Chat/ChatSidebar.vue'
import ChatToolbar from '@/components/Chat/ChatToolbar.vue'
import Workspace from '@/components/Workspace/Workspace.vue'
import ChatHistoryModal from '@/components/Chat/ChatHistoryModal.vue'
import PresenceCounter from '@/components/PresenceCounter.vue'
import { useChat } from '@/composables/useChat'
import { useConnections } from '@/composables/useConnections'
import { sendChatMessage } from '@/lib/api'
import { useProgress } from '@/lib/progress'

// Composables
const {
  chats,
  selectedChatId,
  chatHistory,
  previewChat,
  previewMessages,
  previewVisible,
  loadChats,
  createChat,
  selectChat,
  continueChat
} = useChat()

const {
  connections,
  selectedConnectionId,
  loadConnections,
  selectConnection
} = useConnections()

// Local state
const sidebarOpen = ref(true)
const sidebarSide = ref<'left' | 'right'>('left')
const currentInput = ref('')
const isExecuting = ref(false)
const workspaceRef = ref<any>(null)

// AI options
const aiMode = ref(false)
const autoExecute = ref(false)
const privateMode = ref(false)
const aiOptions = ref({
  model: 'gpt-4',
  temperature: 0.7
})
const availableModels = ref(['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus'])

// Sidebar
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function handleToggleAIMode() {
  aiMode.value = !aiMode.value
}

// Chat handlers
async function handleCreateChat() {
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = 'create-chat'
  startOperation(opId, 'Creating new chat...')
  
  try {
    await createChat('New Chat')
    currentInput.value = ''
    finishOperation(opId)
    toast.success('New chat created')
  } catch (e) {
    console.error('Failed to create chat', e)
    failOperation(opId, 'Failed to create chat')
    toast.error('Failed to create chat')
  }
}

async function handleSelectChat(id: string) {
  try {
    await selectChat(id)
  } catch (e) {
    console.error('Failed to load chat', e)
    toast.error('Failed to load chat')
  }
}

function handleContinueChat(id: string) {
  continueChat(id)
  currentInput.value = ''
  toast.success('Chat loaded')
}

async function handleSubmit() {
  if (!currentInput.value.trim() || !selectedChatId.value) {
    toast.error('Please enter a message and select a chat')
    return
  }

  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = 'send-message'
  startOperation(opId, 'Sending message...')

  isExecuting.value = true
  const userMessage = currentInput.value
  currentInput.value = ''

  try {
    // Add user message to history
    chatHistory.value.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    })

    // Send to API
    const response = await sendChatMessage(
      selectedChatId.value,
      userMessage,
      selectedConnectionId.value,
      aiOptions.value
    )

    // Add AI response to history
    chatHistory.value.push({
      role: 'assistant',
      content: response.message,
      timestamp: Date.now()
    })

    finishOperation(opId)
  } catch (e: any) {
    console.error('Failed to send message', e)
    failOperation(opId, e.message || 'Failed to send message')
    toast.error('Failed to send message')
  } finally {
    isExecuting.value = false
  }
}

async function handleAIGenerate() {
  // AI generation logic
  toast.info('AI generation not implemented yet')
}

function stopExecution() {
  isExecuting.value = false
  toast.info('Execution stopped')
}

function clear() {
  currentInput.value = ''
  chatHistory.value = []
  toast.success('Chat cleared')
}

// Lifecycle
onMounted(async () => {
  await Promise.all([
    loadConnections(),
    loadChats()
  ])
})
</script>
