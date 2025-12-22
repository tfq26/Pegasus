<template>
  <div class="flex w-full h-full text-stone-100 overflow-hidden">
    <!-- Explorer sidebar -->
    <ChatSidebar 
      v-show="sidebarOpen" 
      :side="sidebarSide" 
      :connections="connections"
      :selected-connection-id="selectedConnectionId"
      :chats="chats"
      :selected-chat-id="selectedChatId"
      :query-history="queryHistory"
      @update:selected-connection-id="selectedConnectionId = $event"
      @edit-table="handleEditTable"
      @toggle="toggleSidebar" 
      @select-chat="handleSelectChat"
      @create-chat="handleCreateChat"
      @load-query="handleLoadQuery"
      @sanitize-table="handleSanitizeFixed"
    />
    <button
      v-if="!sidebarOpen"
      class="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-r-lg bg-stone-900/80 text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-all"
      @click="toggleSidebar"
      aria-label="Open sidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    </button>

    <!-- Main content area with results panel -->
    <!-- Main content area with results panel -->
    <div class="flex-1 flex overflow-hidden" :class="{ 'flex-col': resultsPanelPosition === 'bottom', 'flex-row': resultsPanelPosition === 'right' }">
      <!-- Editor workspace -->
      <section class="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
        <!-- Toolbar -->
        <ChatToolbar 
          :mode="mode"
          :connections="connections"
          :selected-connection-id="selectedConnectionId"
          :is-executing="isExecuting"
          :ai-options="aiOptions"
          :query-options="queryOptions"
          :available-models="availableModels"
          :save-status="saveStatus"
          :ai-mode="aiMode"
          :auto-execute="autoExecute"
          :private-mode="privateMode"
          @update:mode="mode = $event"
          @update:selected-connection-id="selectedConnectionId = $event"
          @update:ai-options="aiOptions = $event"
          @update:query-options="queryOptions = $event"
          @update:auto-execute="autoExecute = $event"
          @run="run"
          @stop="stopExecution"
          @ai-generate="handleAIGenerate"
          @clear="clear"
          @format="handleFormat"
          @toggle-ai-mode="handleToggleAIMode"
          @visualize="handleVisualize"
          @sanitize="handleSanitize"
          @load-table-to-sheet="handleLoadTableToSheet"
          @export="handleExport"
          @update:private-mode="privateMode = $event"
          @merge="handleMergeRequest"
          @refresh-table="handleRefreshTable"
        />

        <!-- Editor -->
        <Workspace
          ref="workspaceRef"
          class="flex-1 min-h-0"
          :mode="mode"
          :input="currentInput || ''"
          :chat-history="chatHistory"
          :ai-mode="aiMode"
          :auto-execute="autoExecute"
          :private-mode="privateMode"
          :is-thinking="isExecuting"
          @update:mode="mode = $event"
          @update:input="currentInput = $event"
          @submit="run"
          @save-query="handleSaveFormulaQuery"
          @save-status="saveStatus = $event"
          @create-chat="handleCreateChat"
        />
      </section>

      <!-- Results Panel -->
      <ResultsPanel
        v-if="mode !== 'spreadsheet'"
        :visible="resultsPanelVisible"
        :position="resultsPanelPosition"
        :result="queryResult"
        :error="queryError"
        :last-query="lastQuery"
        :history="queryHistory"
        :loading="isExecuting"

        :is-analyzing="isAnalyzing"
        :ambiguity="ambiguity"
        @update:position="resultsPanelPosition = $event"
        @close="resultsPanelVisible = false"
        @cancel="handleCancelQuery"
        @analyze="handleAnalyze"
        @resolve-ambiguity="handleResolveAmbiguity"
        @create-dashboard-element="handleCreateDashboardElement"
        @open-spreadsheet="handleOpenSpreadsheet"
        @sanitize="handleSanitize"
        :has-recommendation="hasRecommendation"
        :settings="settings"
      />

      <AmbiguityDialog
        v-model:open="ambiguityDialogVisible"
        :ambiguity="ambiguity"
        @resolve="handleResolveAmbiguity"
      />

      <ChatHistoryModal
        v-model:open="previewVisible"
        :chat="previewChat"
        :messages="previewMessages"
        @continue="handleContinueChat"
      />

      <DashboardElementPreview
        v-model:open="dashboardPreviewVisible"
        :initial-config="dashboardPreviewConfig"
        :query="lastQuery"
        :results="Array.isArray(queryResult) ? queryResult : []"
        @saved="toast.success('Added to dashboard')"
      />

      <SanitizePreviewDialog 
        v-model:open="sanitizeDialogVisible"
        :issues="sanitizeIssues"
        :table="sanitizeTable"
        :connection-id="selectedConnectionId"
        @execute-fix="handleExecuteSanitization"
      />

       <DiffView
        v-model:open="diffViewVisible"
        v-if="privateMode && workspaceRef?.getEngineForTab(workspaceRef?.activeTabId)"
        :private-engine="workspaceRef.getEngineForTab(workspaceRef.activeTabId)"
        @confirm-merge="handleConfirmMerge"
      />
      
      <PresenceCounter v-if="aiMode" />
    </div>
  </div>
</template>

<script setup lang="ts">

import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import ChatSidebar from '../components/Chat/ChatSidebar.vue'
import ChatToolbar from '../components/Chat/ChatToolbar.vue'
import Workspace from '../components/Workspace/Workspace.vue'
import ResultsPanel from '../components/Chat/ResultsPanel.vue'
import AmbiguityDialog from '../components/Chat/AmbiguityDialog.vue'
import SanitizePreviewDialog from '../components/Chat/SanitizePreviewDialog.vue'
import DashboardElementPreview from '../components/Dashboard/DashboardElementPreview.vue'
import ChatHistoryModal from '../components/Chat/ChatHistoryModal.vue'
import DiffView from '../components/TableView/DiffView.vue'
import PresenceCounter from '../components/PresenceCounter.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CONNECTION_STORAGE_KEY, defaultConnections, buildConnectionPayload } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { QUERY_API_URL, generateAIQuery, analyzeResults, getAIModels, fetchSettings, fetchChats,
  createChat,
  fetchChatHistory,
  saveMessage,
  fetchDashboardElements,
  recommendVisualization,
  fetchQueries,
  saveQuery,
  sanitizeTable as apiSanitizeTable,
  getAuthHeaders
} from '@/lib/api'
import { useProgress } from '@/lib/progress'
import { db } from '@/lib/local-db'
import { generateKey, encryptData, decryptData } from '@/lib/crypto'
import { sanitizeAIResponse } from '@/lib/ai-response-sanitizer'
import { useWorkspaceStore } from '@/stores/workspace'

const queryApiUrl = QUERY_API_URL
const connections = ref<ConnectionEntry[]>([])
const selectedConnectionId = ref('')

// Pinia store for per-tab chat history
const workspaceStore = useWorkspaceStore()

// Excel Editor State
const excelData = ref<any[]>([])
const excelDataLoading = ref(false)
const excelEditorRef = ref<any>(null)
const saveStatus = ref<'saved' | 'saving' | 'error'>('saved')
const aiMode = ref(false)
const autoExecute = ref(false)
const privateMode = ref(false)

const handleToggleAIMode = () => {
    aiMode.value = !aiMode.value 
}

const diffViewVisible = ref(false)

const handleMergeRequest = () => {
    diffViewVisible.value = true
}

const handleConfirmMerge = async () => {
    // Logic to merge private branch to main
    const engine = workspaceRef.value?.getEngineForTab(workspaceRef.value.activeTabId)
    if (engine && engine.parentBranch) {
        const parent = engine.parentBranch
        await parent.mergeBranch(engine)
        
        // Switch back to parent (Live)
        // In a real app we might reload or re-assign the engine in the tab
        // For now, simpler: we just turn off private mode for visual check
        privateMode.value = false
        diffViewVisible.value = false
        toast.success('Merged changes to live dashboard')
        
        // Force refresh of the grid to show merged data (since we are viewing parent now)
        // workspaceRef.value.refreshCurrentTable() // If needed
    } else {
        toast.error('Cannot merge: Not in a private branch')
    }
}

const handleSaveFormulaQuery = async (query: string, type: 'formula') => {
  if (!selectedConnection.value) return
  
  try {
    await saveQuery(
      query,
      'user',
      'success',
      selectedConnection.value.id
    )
  } catch (e) {
    console.error('Failed to save formula query:', e)
  }
}

const handleExport = (format: 'csv' | 'xlsx') => {
  if (workspaceRef.value?.exportCurrentTable) {
    workspaceRef.value.exportCurrentTable(format);
  } else {
    toast.error("Export not available");
  }
}

const handleRefreshTable = () => {
  if (workspaceRef.value?.refreshCurrentTable) {
    workspaceRef.value.refreshCurrentTable();
  } else {
    toast.error("Refresh not available");
  }
}


const handleVisualize = async () => {
  // TODO: Update to use workspaceRef instead of excelEditorRef
  if (!excelEditorRef.value) return
  
  const selectedData = excelEditorRef.value.getSelectedData()
  if (!selectedData || selectedData.length === 0) {
    toast.warning('Please select some data to visualize')
    return
  }
  
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `viz-gen-${Date.now()}`
  startOperation(opId, 'Generating Visualization')
  
  toast.info('Generating visualization...')
  try {
    const config = await recommendVisualization("Visualize the selected data", selectedData)
    finishOperation(opId)
    dashboardPreviewConfig.value = config
    dashboardPreviewVisible.value = true
  } catch (e: any) {
    console.error('Visualization failed:', e)
    failOperation(opId, e.message || 'Visualization failed')
    toast.error('Failed to generate visualization')
  }
}

const loadExcelData = async () => {
  // DEPRECATED: This function is no longer needed since we use Workspace tabs
  // Data is now loaded via handleLoadTableToSheet and cached in the Engine
  return;
}

const handleFormat = (type: string, value?: any) => {
  if (excelEditorRef.value) {
    excelEditorRef.value.handleFormat(type, value)
  }
}

const handleSaveExcel = async (data: any[]) => {
  if (!selectedConnection.value) return
  
  const conn = selectedConnection.value
  const tableName = conn.sqlite?.tables?.[0]
  if (!tableName) return

  saveStatus.value = 'saving'
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `excel-save-${Date.now()}`
  startOperation(opId, `Saving ${tableName}`)
  
  try {
    const response = await fetch(`${queryApiUrl}/update-table`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        connection: buildConnectionPayload(conn),
        tableName,
        data
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to save data')
    }

    finishOperation(opId)
    saveStatus.value = 'saved'
  } catch (e: any) {
    console.error('Failed to save Excel data', e)
    failOperation(opId, e.message || 'Failed to save')
    saveStatus.value = 'error'
    toast.error('Failed to save changes')
  }
}

// Chat State
const chats = ref<any[]>([])
const selectedChatId = ref('')

// Preview Modal State
const previewChat = ref<any>(null)
const previewMessages = ref<any[]>([])
const previewVisible = ref(false)

const loadChats = async () => {
  try {
    chats.value = await fetchChats()
  } catch (e) {
    console.error('Failed to load chats', e)
  }
}

const handleSelectChat = async (id: string) => {
  console.log('[Chat] Selecting chat:', id)
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `load-chat-${id}`
  startOperation(opId, 'Loading chat history...')

  try {
    const chat = chats.value.find(c => c.id === id)
    if (!chat) {
        console.log('[Chat] Chat not found:', id)
        finishOperation(opId)
        return
    }

    const data = await fetchChatHistory(id)
    finishOperation(opId)
    
    const messages = data.messages.map((m: any) => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: m.content,
      timestamp: m.created_at * 1000
    }))

    console.log('[Chat] Loaded chat history:', {
      chatId: id,
      messagesCount: messages.length,
      currentSelectedId: selectedChatId.value
    })

    previewChat.value = chat
    previewMessages.value = messages
    previewVisible.value = true
  } catch (e: any) {
    console.error('Failed to load chat history for preview', e)
    failOperation(opId, e.message || 'Failed to load chat')
    toast.error('Failed to load chat history')
  }
}

const handleContinueChat = async (id: string) => {
  console.log('[Chat] Continuing chat:', id)
  console.log('[Chat] Preview messages being loaded:', previewMessages.value.length)
  
  previewVisible.value = false
  selectedChatId.value = id
  
  // Load into main editor
  chatHistory.value = previewMessages.value
  
  // Store in active tab's data (creates association between tab and chat)
  workspaceStore.updateActiveTabData({ 
    chatId: id, 
    chatHistory: [...previewMessages.value] 
  })
  
  console.log('[Chat] Chat history after continue:', chatHistory.value.length)
  
  toast.success('Chat loaded')
}



const handleCreateChat = async () => {
  console.log('[Chat] Creating new chat...')
  console.log('[Chat] Current state before create:', {
    selectedChatId: selectedChatId.value,
    chatHistoryLength: chatHistory.value.length,
    previewChatId: previewChat.value?.id,
    previewMessagesLength: previewMessages.value.length,
    previewVisible: previewVisible.value
  })
  
  try {
    const newChat = await createChat('New Chat')
    console.log('[Chat] New chat created:', newChat)
    chats.value.unshift(newChat)
    
    // Directly switch to the new chat
    selectedChatId.value = newChat.id
    chatHistory.value = []
    
    // Store chatId in active tab's data
    workspaceStore.updateActiveTabData({ chatId: newChat.id, chatHistory: [] })
    
    // Clear preview state to prevent old chat from loading
    previewChat.value = null
    previewMessages.value = []
    previewVisible.value = false
    
    // Reset state
    mode.value = 'chat'
    chatInput.value = ''
    writeInput.value = ''
    queryResult.value = null
    queryError.value = ''
    lastQuery.value = ''
    resultsPanelVisible.value = false
    
    console.log('[Chat] State after create:', {
      selectedChatId: selectedChatId.value,
      chatHistoryLength: chatHistory.value.length,
      previewChatId: previewChat.value?.id,
      previewMessagesLength: previewMessages.value.length,
      previewVisible: previewVisible.value
    })
    
    toast.success('New chat created')
  } catch (e) {
    console.error('Failed to create chat', e)
    toast.error('Failed to create chat')
  }
}

const selectedConnection = computed(() =>
  connections.value.find((conn) => conn.id === selectedConnectionId.value) ?? null,
)

const loadConnections = async () => {
  if (typeof window === 'undefined') {
    connections.value = [...defaultConnections]
    selectedConnectionId.value = connections.value[0]?.id ?? ''
    return
  }

  try {
    const res = await fetch(`${QUERY_API_URL}/connections`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include'
    })
    
    if (res.ok) {
      const data = await res.json()
      connections.value = data.connections || []
    } else {
      connections.value = []
    }
  } catch (e) {
    console.error('Failed to load connections:', e)
    connections.value = []
  }
  
  // Try to restore selection from localStorage
  const savedId = localStorage.getItem('pegasus-selected-connection')
  if (savedId && connections.value.some(c => c.id === savedId)) {
    selectedConnectionId.value = savedId
  }

  // Set default selection if current selection is invalid
  if (!connections.value.some((conn) => conn.id === selectedConnectionId.value)) {
    selectedConnectionId.value = connections.value[0]?.id ?? ''
  }
}

watch(selectedConnectionId, (newId) => {
  if (newId) {
    localStorage.setItem('pegasus-selected-connection', newId)
    // DEPRECATED: No longer need to load Excel data on connection change
    // Data is loaded on-demand via the Sheet button
    // if (mode.value === 'spreadsheet') {
    //   loadExcelData()
    // }
  }
})

const queryResult = ref<unknown>(null)
const queryError = ref('')
const lastQuery = ref('')
const isExecuting = ref(false)
const mode = ref<'chat' | 'write' | 'spreadsheet'>('chat')

// DEPRECATED: No longer need to watch mode changes for Excel loading
// watch(mode, (newMode) => {
//   if (newMode === 'spreadsheet') {
//     loadExcelData()
//   }
// })
const chatInput = ref('')
const writeInput = ref('')

// Cancellation state
const abortController = ref<AbortController | null>(null)
const currentOpId = ref('')
const { operations, startOperation, finishOperation, failOperation, cancelOperation, withProgress, loadHistoryFromBackend } = useProgress()

const handleCancelQuery = () => {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  if (currentOpId.value) {
    cancelOperation(currentOpId.value)
    currentOpId.value = ''
  }
  isExecuting.value = false
  // loading.value = false // if loading ref exists? no, isExecuting covers it
  toast.info('Query cancelled')
}

// Computed property to get the current active input
const currentInput = computed({
  get: () => mode.value === 'chat' ? chatInput.value : writeInput.value,
  set: (val) => {
    if (mode.value === 'chat') chatInput.value = val
    else writeInput.value = val
  }
})

const chatHistory = ref<any[]>([])

// Bi-directional sync: Local chatHistory <-> Active tab's chatHistory in store
// Sync chatHistory changes TO the active tab in the store
let isSyncing = false // Prevent infinite loops
watch(chatHistory, (newVal) => {
  if (isSyncing) return
  const activeTab = workspaceStore.activeTab.value
  if (activeTab?.type === 'chat' && newVal) {
    workspaceStore.updateActiveTabChatHistory([...newVal])
    console.log('[Chat] Synced chatHistory to active tab:', {
      tabId: activeTab.id,
      messageCount: newVal.length
    })
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
    console.log('[Chat] Loaded chatHistory from tab:', {
      tabId: newTabId,
      messageCount: chatHistory.value.length,
      chatId: selectedChatId.value
    })
    nextTick(() => { isSyncing = false })
  }
})

const encryptionKey = ref<CryptoKey | null>(null)
const sidebarOpen = ref(true)
const sidebarSide = ref<'left' | 'right'>('left')
const resultsPanelVisible = ref(false)
const resultsPanelPosition = ref<'bottom' | 'right'>('bottom')
const availableModels = ref<any[]>([])
const queryHistory = ref<any[]>([])
const ambiguity = ref<any>(null)
const ambiguityDialogVisible = ref(false)

const aiOptions = ref({
  model: 'gpt-4',
  temperature: 0.7
})

const dashboardPreviewVisible = ref(false)
const dashboardPreviewConfig = ref<any>(null)
const hasRecommendation = ref(false)
const settings = ref<any>(null)

const handleCreateDashboardElement = async (groupId?: string) => {
  if (hasRecommendation.value && dashboardPreviewConfig.value) {
    dashboardPreviewVisible.value = true
    return
  }

  if (!queryResult.value || !lastQuery.value) return
  
  await withProgress('Generating Chart', async () => {
    toast.info('Generating chart recommendation...')
    
    // Check for visualizable result from multi-step query
    let dataForVisualization = queryResult.value
    let suggestedChartType = null
    
    if ((window as any).__visualizableResult) {
      dataForVisualization = (window as any).__visualizableResult
      suggestedChartType = (window as any).__suggestedChartType
      console.log('[Chart] Using visualizable result from multi-step query, chart type:', suggestedChartType)
      // Clear the stored values
      delete (window as any).__visualizableResult
      delete (window as any).__suggestedChartType
    }
    
    const config = await recommendVisualization(
      lastQuery.value, 
      Array.isArray(dataForVisualization) ? dataForVisualization : [dataForVisualization],
      suggestedChartType
    )
    dashboardPreviewConfig.value = config
    dashboardPreviewVisible.value = true
  }, { category: 'ai', groupId })
}

const loadQueries = async () => {
  try {
    queryHistory.value = await fetchQueries()
  } catch (e) {
    console.error('Failed to load queries', e)
  }
}

const route = useRoute()

// ... existing code ...

onMounted(async () => {
  await loadConnections()
  window.addEventListener('pegasus:connections-updated', loadConnections)
  await loadChats()
  await loadQueries()
  // Do not auto-select chat to avoid opening modal
  // if (chats.value.length > 0) {
  //   await handleSelectChat(chats.value[0].id)
  // } else {
  //   await handleCreateChat()
  // }

  // Handle query params for loading query from dashboard
  const queryParam = route.query.loadQuery as string
  const connectionParam = route.query.connectionId as string
  
  if (queryParam) {
    // Wait a bit for everything to settle
    setTimeout(async () => {
      if (connectionParam) {
        selectedConnectionId.value = connectionParam
      }
      await handleLoadQuery(queryParam)
    }, 100)
  }

  encryptionKey.value = await generateKey()

  // Load AI models and settings
  try {
    const [models, fetchedSettings] = await Promise.all([
      getAIModels(),
      fetchSettings()
    ])
    
    settings.value = fetchedSettings

    if (fetchedSettings.enabledModels && fetchedSettings.enabledModels.length > 0) {
      availableModels.value = models.filter((m: any) => fetchedSettings.enabledModels!.includes(m.id))
    } else {
      availableModels.value = models
    }

    // Set default model if available
    if (availableModels.value.length > 0) {
      // Try to keep existing selection or default to first
      if (!availableModels.value.find((m: any) => m.id === aiOptions.value.model)) {
        aiOptions.value.model = availableModels.value[0].id
      }
    }
  } catch (e) {
    console.warn('Failed to load AI models or settings', e)
  }

  // Load chat history from IndexedDB
  const encrypted = await db.conversations.get('current')
  if (encrypted && encryptionKey.value) {
    try {
      const decrypted = await decryptData(encryptionKey.value, encrypted.messages)
      // We don't overwrite chatHistory here if we loaded from backend, 
      // but we might want to merge or prioritize backend.
      // For now, let's assume backend is source of truth if available.
    } catch (e) {
      // ignore
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pegasus:connections-updated', loadConnections)
})

const queryOptions = ref({
  timeout: 30,
  limit: 1000,
  autoCommit: true
})

// Auto-show results panel when there's a result or error
watch([queryResult, queryError], () => {
  if (queryResult.value || queryError.value) {
    resultsPanelVisible.value = true
  }
})

const handleResolveAmbiguity = (choice: string) => {
  if (mode.value === 'chat') {
    chatInput.value = `${chatInput.value} (Clarification: ${choice})`
  } else {
    // In write mode, we might append to the query or handle differently
    // For now, let's assume ambiguity resolution is mostly a chat/AI feature
    // But if it happens in write mode (e.g. AI generated query), we might want to append to writeInput
    // However, the prompt implies this is for AI generation clarification
    chatInput.value = `${chatInput.value} (Clarification: ${choice})`
  }
  ambiguity.value = null
  ambiguityDialogVisible.value = false
  run()
}

const queryResultText = computed(() => {
  if (!queryResult.value) return ''
  return JSON.stringify(queryResult.value, null, 2)
})

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
  sidebarSide.value = sidebarOpen.value ? (sidebarSide.value === 'left' ? 'right' : 'left') : sidebarSide.value
}

const handleLoadQuery = async (query: string) => {
  // Check if this is a formula query
  // Formulas either:
  // 1. Start with "ColumnName: =" (our saved format)
  // 2. Start with "=" (direct formula)
  // 3. Don't start with SQL keywords
  const sqlKeywords = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)/i
  const isFormulaFormat = /^[^:]+:\s*=/.test(query) || query.trim().startsWith('=')
  const isFormula = isFormulaFormat || !sqlKeywords.test(query)
  
  if (isFormula) {
    // Handle formula query - switch to spreadsheet mode
    mode.value = 'spreadsheet'
    aiMode.value = true
    
    await nextTick()
    
    // Extract just the formula part if it's in "ColumnName: =FORMULA" format
    let formulaToLoad = query
    const match = query.match(/^[^:]+:\s*(.+)$/)
    if (match && match[1]) {
      formulaToLoad = match[1]
    }
    
    // Set the formula bar value through the workspace
    if (workspaceRef.value && typeof workspaceRef.value.setFormulaBarValue === 'function') {
      workspaceRef.value.setFormulaBarValue(formulaToLoad)
    }
    
    toast.success('Formula loaded')
  } else {
    // Handle SQL query - create a new query tab with the content
    if (workspaceRef.value && typeof workspaceRef.value.createQueryTab === 'function') {
      workspaceRef.value.createQueryTab(query)
    } else {
      mode.value = 'write'
    }
    
    // Small delay to let the tab render
    await nextTick()
    
    // Now set the query content
    writeInput.value = query
    
    toast.success('Query loaded in new tab')
  }
}


const run = async () => {
  let activeInput = ''
  
  if (mode.value === 'chat') {
    activeInput = chatInput.value
  } else if (mode.value === 'write') {
    // Get content from the active query tab in workspace
    if (workspaceRef.value && typeof workspaceRef.value.getActiveQueryContent === 'function') {
      activeInput = workspaceRef.value.getActiveQueryContent()
    } else {
      activeInput = writeInput.value
    }
  } else {
    // Spreadsheet mode - ignore for now as it handles its own execution
    return
  }
  
  if (!activeInput.trim()) return
  if (!selectedConnection.value) {
    queryError.value = 'Pick a saved database connection in Settings → Database Connections.'
    return
  }

  const payload = activeInput.trim()
  const timestamp = Date.now()

  if (mode.value === 'write') {
    // Show results panel immediately
    resultsPanelVisible.value = true
    
    isExecuting.value = true
    queryError.value = ''
    queryResult.value = null
    lastQuery.value = payload

    // Cancel previous execution if any
    if (abortController.value) abortController.value.abort()
    abortController.value = new AbortController()

    const opId = `query-exec-${Date.now()}`
    currentOpId.value = opId
    startOperation(opId, `Executing Query (User)`, { cancellable: true, onCancel: handleCancelQuery })

    try {
      const response = await fetch(`${queryApiUrl}/query`, {
        signal: abortController.value.signal,
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          provider: selectedConnection.value.provider,
          connection: buildConnectionPayload(selectedConnection.value),
          query: payload,
          source: 'user',
          model: null
        }),
      })

      const body = await response.json()

      if (!response.ok || body.error) {
        throw new Error(body.error ?? 'Unable to execute query')
      }

      queryResult.value = body.result ?? null
      finishOperation(opId)
      
      toast.success('Query executed', {
        description: selectedConnection.value
          ? `${selectedConnection.value.nickname}: ${Array.isArray(body.result)
              ? `${body.result.length} row${body.result.length === 1 ? '' : 's'} returned`
              : 'Query completed'}`
          : 'Query completed',
        position: 'top-right',
      })
      // Save query to chat history
      chatHistory.value.push({ role: 'user', content: payload, timestamp })
      chatHistory.value.push({ role: 'system', content: JSON.stringify(body.result), timestamp })
      
      // Add to history
    const queryEntry = {
      id: crypto.randomUUID(),
      query: payload,
      timestamp,
      source: 'user',
      status: 'success',
      connection_id: selectedConnection.value.id
    }
    queryHistory.value.unshift(queryEntry)
    
    // Persist query handled by backend
    // saveQuery(payload, 'user', 'success', selectedConnection.value.id).catch(console.error)

    // Show results panel and force layout update
    resultsPanelVisible.value = true
    await nextTick()

    // AI Analysis if enabled
    if (aiOptions.value.model) {
        // Save to local DB
        const encrypted = await encryptData(encryptionKey.value, chatHistory.value)
        await db.conversations.put({ id: 'current', messages: encrypted, updatedAt: Date.now() })
        
        // Trigger post-query actions (Analysis & Dashboard)
        // We skip explicit analysis for manual runs to avoid spamming chat with insights "again"
        // unless the user specifically asks for it via a separate action.
        handlePostQueryActions(payload, body.result, false, '', true)
      }
    } catch (error: any) {
      // Handle cancellation
      if (error.name === 'AbortError') {
        // Query was cancelled - handleCancelQuery already handled UI updates
        return
      }
      
      const message = error instanceof Error ? error.message : String(error)
      queryError.value = message
      failOperation(opId, message)
      toast.error('Query failed', { description: message, position: 'top-right' })
    } finally {
      isExecuting.value = false
      abortController.value = null
      currentOpId.value = ''
    }
  } else {
    // Chat mode -> AI Generation
    await handleAIGenerate()
  }
}

const clear = () => {
  if (mode.value === 'chat') {
    chatInput.value = ''
  } else {
    writeInput.value = ''
  }
  queryError.value = ''
  queryResult.value = null
  lastQuery.value = ''
}

const stopExecution = () => {
  handleCancelQuery()
}

const handleAIGenerate = async () => {
  if (!selectedConnectionId.value) {
    toast.error('Please select a connection first')
    return
  }
  if (!chatInput.value.trim()) {
    toast.error('Please enter a prompt')
    return
  }

  // Auto-create chat if none selected
  if (!selectedChatId.value) {
    console.log('[Chat] Auto-creating chat (no chat selected)')
    try {
      const newChat = await createChat('New Chat')
      chats.value.unshift(newChat)
      selectedChatId.value = newChat.id
      chatHistory.value = []
      
      // Clear preview state to prevent old chat from loading
      previewChat.value = null
      previewMessages.value = []
      previewVisible.value = false
      
      console.log('[Chat] Auto-created chat:', newChat.id)
    } catch (e) {
      console.error('Failed to auto-create chat', e)
    }
  }

  const userPrompt = chatInput.value.trim()
  chatInput.value = '' // Clear input immediately
  
  // Show results panel immediately
  resultsPanelVisible.value = true
  
  isExecuting.value = true
  
  const gid = `chat-${Date.now()}`
  
  await withProgress('AI Query', async (update: any) => {
    // Check if user is explicitly asking for the query itself
    const wantsQueryOnly = /show\s+(me\s+)?(the\s+)?query|what\s+(is\s+)?the\s+query|generate\s+query/i.test(userPrompt)
    // Check if user explicitly wants a visualization
    const wantsVisualization = /visualize|chart|graph|plot|dashboard|histogram|pie/i.test(userPrompt)
    
    const isReferenceToContext = /\b(this|it|results?|data)\b/i.test(userPrompt)
    
    // CASE 1: Visualize existing data
    if (wantsVisualization && isReferenceToContext && queryResult.value && lastQuery.value) {
      // Add to chat history
      chatHistory.value.push({ role: 'user', content: userPrompt, timestamp: Date.now() })
      chatHistory.value.push({ role: 'assistant', content: 'Generating visualization based on the results...', timestamp: Date.now() })
      
      // Trigger visualization
      await handleCreateDashboardElement(gid)
      return
    }
    
    update(10, 'Thinking...')
    
    // Pass chat history if available, otherwise empty array
    // @ts-ignore
    const history = typeof chatHistory !== 'undefined' ? chatHistory.value : []
    // Get active table from workspace if available
    let activeTable = undefined;
    if (workspaceRef.value && typeof workspaceRef.value.getActiveTable === 'function') {
        const table = workspaceRef.value.getActiveTable();
        if (table) activeTable = table;
    }

    const aiResponse = await generateAIQuery(userPrompt, selectedConnectionId.value, history, activeTable)
    
    update(40, 'Executing...')

    // Check if this is a multi-step response
    if (aiResponse.multi_step && Array.isArray(aiResponse.steps)) {
      // Multi-step response - aggregate results
      const combinedResults: any[] = []
      const combinedQuery = aiResponse.steps.map((step: any) => step.query).join(';\n')
      
      // Track visualizable step for chart creation
      let visualizableResults: any[] = []
      let suggestedChartType: string | null = null
      
      for (const step of aiResponse.steps) {
        if (step.result) {
          combinedResults.push({
            explanation: step.explanation,
            result: step.result,
            visualizable: step.visualizable,
            chart_type: step.chart_type
          })
          
          // Collect ALL visualizable step results
          if (step.visualizable && step.result) {
            // If result is an array, spread it; otherwise push as single item
            if (Array.isArray(step.result)) {
              visualizableResults.push(...step.result)
            } else {
              visualizableResults.push(step.result)
            }
            suggestedChartType = step.chart_type || suggestedChartType
            console.log('[Chat] Found visualizable step:', step.explanation, 'Chart type:', suggestedChartType)
          }
        } else if (step.error) {
          combinedResults.push({
            explanation: step.explanation,
            error: step.error
          })
        }
      }
      
      // Display combined results
      queryResult.value = combinedResults
      lastQuery.value = combinedQuery
      
      // Store visualization hints for chart creation
      if (visualizableResults.length > 0) {
        (window as any).__visualizableResult = visualizableResults;
        (window as any).__suggestedChartType = suggestedChartType;
        console.log('[Chat] Stored visualizable results for chart:', visualizableResults.length, 'items')
      }
      
      // Generate AI summary of results
      update(80, 'Summarizing...')
      let aiSummary = ''
      try {
        console.log('[Chat] Generating AI summary for multi-step query...')
        toast.loading('Generating summary...', { id: 'ai-summary' })
        const { analyzeResults } = await import('@/lib/api')
        const flatResults = combinedResults.map(step => step.result).filter(r => r)
        const summaryPrompt = wantsVisualization ? "Summarize these results" : userPrompt
        const analysisResponse = await analyzeResults(summaryPrompt, flatResults, combinedQuery)
        // Extract the answer field from the response object
        aiSummary = typeof analysisResponse === 'object' && analysisResponse.answer 
          ? analysisResponse.answer 
          : (typeof analysisResponse === 'string' ? analysisResponse : JSON.stringify(analysisResponse))
        
        // Sanitize the summary to prevent raw JSON dumps
        aiSummary = sanitizeAIResponse(aiSummary)
        toast.dismiss('ai-summary')
      } catch (e) {
        toast.dismiss('ai-summary')
        console.error('[Chat] Failed to generate AI summary:', e)
        aiSummary = `I executed ${aiResponse.steps.length} step${aiResponse.steps.length > 1 ? 's' : ''} to answer your question.`
      }

      if (aiSummary.trim().toLowerCase() === userPrompt.trim().toLowerCase()) {
        aiSummary = "Protocol executed successfully. Refer to the Output panel for detailed insights."
      }
      
      const timestamp = Date.now()
      chatHistory.value.push({ role: 'user', content: userPrompt, timestamp })
      chatHistory.value.push({ role: 'assistant', content: aiSummary, timestamp })
      
      if (selectedChatId.value) {
        await saveMessage(selectedChatId.value, 'user', userPrompt)
        await saveMessage(selectedChatId.value, 'ai', aiSummary)
      }
      
      // Add to query history
      queryHistory.value.unshift({ query: combinedQuery, timestamp, source: 'ai', status: 'success' })
      
      // CASE 2: New query + Visualization requested (Multi-step)
      if (wantsVisualization) {
        await handleCreateDashboardElement(gid)
      }
      return
    }
    
    // Single-step response
    const { query, usage } = aiResponse
    let reasoning = ''
    try {
      const parsed = JSON.parse(query)
      if (parsed.reasoning) reasoning = parsed.reasoning
      if (parsed.ambiguous) {
        ambiguity.value = parsed
        ambiguityDialogVisible.value = true
        return
      }
    } catch (e) {}

    if (wantsQueryOnly) {
      writeInput.value = query
      mode.value = 'write'
    } else {
      if (!selectedConnection.value) throw new Error('Connection not found')
      
      lastQuery.value = query
      
      const response = await fetch(`${queryApiUrl}/query`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          provider: selectedConnection.value.provider,
          connection: buildConnectionPayload(selectedConnection.value),
          query: query,
          source: 'ai',
          model: aiOptions.value.model
        }),
      })

      const body = await response.json()
      if (!response.ok || body.error) throw new Error(body.error ?? 'Query failed')

      queryResult.value = body.result ?? null
      
      update(80, 'Summarizing...')
      const { analyzeResults } = await import('@/lib/api')
      const summaryPrompt = wantsVisualization ? "Summarize these results" : userPrompt
      const aiSummary = await analyzeResults(summaryPrompt, Array.isArray(body.result) ? body.result : [body.result], query)
      
      const finalSummary = (aiSummary && (typeof aiSummary === 'string' ? aiSummary.trim().toLowerCase() : '') === userPrompt.trim().toLowerCase())
        ? "Protocol executed successfully. Refer to the Output panel for detailed insights."
        : sanitizeAIResponse(aiSummary);

      const timestamp = Date.now()
      chatHistory.value.push({ role: 'user', content: userPrompt, timestamp })
      chatHistory.value.push({ role: 'assistant', content: finalSummary, timestamp })
      
      if (selectedChatId.value) {
        await saveMessage(selectedChatId.value, 'user', userPrompt)
        await saveMessage(selectedChatId.value, 'ai', finalSummary)
      }
      
      if (wantsVisualization) {
        await handleCreateDashboardElement(gid)
      }
      
      queryHistory.value.unshift({ query, timestamp, source: 'ai', status: 'success' })
      handlePostQueryActions(query, body.result, wantsVisualization, userPrompt, true)
    }
  }, { category: 'ai', groupId: gid })

  isExecuting.value = false
}

// Update the function signature
const handlePostQueryActions = async (query: string, results: any, autoPreview = false, userPrompt = '', skipAnalysis = false) => {
  // 1. Auto-analyze (if not skipped)
  // If skipped (because it came from AI generation), we rely on the main AI response.
  // If NOT skipped (manual run), we generate an analysis message.
  if (!skipAnalysis) {
    handleAnalyze()
  }
  
  // 2. Dashboard Recommendation
  hasRecommendation.value = false
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.log('[Dashboard] Results not suitable for visualization')
    return
  }

  // CLIENT-SIDE AGGREGATION: Detect if we need to group and sum
  // Pattern: Multiple rows with a category column and a numeric column
  if (results.length > 1) {
    const firstRow = results[0]
    const keys = Object.keys(firstRow).filter(k => !k.startsWith('_') && k !== 'id')
    
    // Check if we have exactly 2 relevant columns (category + value)
    if (keys.length === 2) {
      const col1 = keys[0]!
      const col2 = keys[1]!
      const col1Values = results.map(r => r[col1])
      const col2Values = results.map(r => r[col2])
      
      // Check which column is the category (has repeats) and which is numeric
      const col1Unique = new Set(col1Values).size
      const col2Unique = new Set(col2Values).size
      const col1IsNumeric = col1Values.every(v => !isNaN(parseFloat(v)))
      const col2IsNumeric = col2Values.every(v => !isNaN(parseFloat(v)))
      
      let categoryCol: string | null = null
      let valueCol: string | null = null
      
      // Determine which is category and which is value
      if (col1Unique < results.length && col2IsNumeric) {
        // col1 is category, col2 is value
        categoryCol = col1
        valueCol = col2
      } else if (col2Unique < results.length && col1IsNumeric) {
        // col2 is category, col1 is value
        categoryCol = col2
        valueCol = col1
      }
      
      if (categoryCol && valueCol) {
        console.log('[Dashboard] Detected aggregatable data:', categoryCol, 'x', valueCol)
        
        // Aggregate: Group by category, sum value
        const aggregated = new Map<string, number>()
        results.forEach(row => {
          const category = String(row[categoryCol!])
          const value = parseFloat(row[valueCol!])
          aggregated.set(category, (aggregated.get(category) || 0) + value)
        })
        
        // Convert to array format for charts
        const aggregatedResults = Array.from(aggregated.entries()).map(([category, total]) => ({
          [categoryCol!]: category,
          [`Total_${valueCol}`]: total
        }))
        
        console.log('[Dashboard] Aggregated results:', aggregatedResults)
        
        // Replace results with aggregated data for visualization AND update table display
        results = aggregatedResults
        queryResult.value = aggregatedResults
        
        toast.info('Data aggregated', {
          description: `Grouped by ${col1}, summed ${col2}`,
          position: 'top-right'
        })
      }
    }
  }

  // HEURISTIC: Check for single-value result (Stat Card)
  if (results.length === 1) {
    const row = results[0]
    const keys = Object.keys(row)
    if (keys.length === 1) {
      const val = row[keys[0]!]
      // If it's a number or a string that looks like a number
      if (typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))) {
        console.log('[Dashboard] Auto-detected Stat Card')
        const config = {
          type: 'stat',
          title: keys[0], // Use column name as title
          config: {
            value: val,
            label: keys[0]
          }
        }
        
        dashboardPreviewConfig.value = config
        hasRecommendation.value = true
        
        if (autoPreview) {
             dashboardPreviewVisible.value = true
        } else {
            toast.success("Visualization available!", {
              description: `Auto-detected Stat Card for ${keys[0]}`,
              action: {
                label: "Preview",
                onClick: () => dashboardPreviewVisible.value = true
              }
            })
        }
        return // Skip AI
      }
    }
  }

  // HEURISTIC: Detect aggregated data pattern (category + Total_X)
  // This works even when user requests specific chart type
  if (results.length > 1 && results.length < 20) {
    const firstRow = results[0]
    const keys = Object.keys(firstRow).filter(k => !k.startsWith('_') && k !== 'id')
    
    if (keys.length === 2) {
      // Check if one column starts with "Total_" (our aggregation marker)
      const totalCol = keys.find(k => k.startsWith('Total_'))
      const categoryCol = keys.find(k => !k.startsWith('Total_'))
      
      if (totalCol && categoryCol) {
        console.log('[Dashboard] Detected aggregated data pattern for visualization')
        
        const chartType = (userPrompt && userPrompt.toLowerCase().includes('pie')) ? 'pie' : 'bar'
        
        // Extract actual data values
        const labels = results.map((r: any) => String(r[categoryCol]))
        const dataValues = results.map((r: any) => typeof r[totalCol] === 'number' ? r[totalCol] : parseFloat(r[totalCol]))
        
        const config = {
          type: chartType,
          title: `${totalCol.replace('Total_', '')} by ${categoryCol}`,
          config: {
            data: {
              labels,
              datasets: [{
                label: totalCol.replace('Total_', ''),
                data: dataValues,
                backgroundColor: [
                  'hsl(0, 70%, 50%)',
                  'hsl(120, 70%, 50%)',
                  'hsl(240, 70%, 50%)',
                  'hsl(60, 70%, 50%)',
                  'hsl(300, 70%, 50%)',
                ],
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: chartType === 'pie' },
                title: { display: false }
              }
            }
          }
        }
        
        dashboardPreviewConfig.value = config
        hasRecommendation.value = true
        
        if (autoPreview) {
          dashboardPreviewVisible.value = true
        } else {
          toast.success("Visualization available!", {
            description: `Created ${chartType} chart`,
            action: {
              label: "Preview",
              onClick: () => dashboardPreviewVisible.value = true
            }
          })
        }
        return
      }
    }
  }

  // If not a simple stat, try heuristic detection first
  let heuristicConfig = null
  
  // If user requested specific type not supported by heuristics well (e.g. Pie), skip heuristic
  const skipHeuristics = userPrompt && (
      userPrompt.toLowerCase().includes('pie') || 
      userPrompt.toLowerCase().includes('doughnut') || 
      userPrompt.toLowerCase().includes('scatter') ||
      userPrompt.toLowerCase().includes('area')
  )
  
  if (!skipHeuristics) {
      heuristicConfig = detectVisualizationType(results)
  }
  
  if (heuristicConfig) {
    console.log('[Dashboard] Heuristic detected:', heuristicConfig.type)
    dashboardPreviewConfig.value = heuristicConfig
    hasRecommendation.value = true
    
    if (autoPreview) {
        dashboardPreviewVisible.value = true
    } else {
        toast.success("Visualization available!", {
          description: `Detected ${heuristicConfig.type} chart`,
          action: {
            label: "Preview",
            onClick: () => dashboardPreviewVisible.value = true
          }
        })
    }
    return
  }

  // If heuristics fail, ask AI
  try {
      const { startOperation, finishOperation, failOperation } = useProgress()
      const opId = `viz-recommend-${Date.now()}`
      startOperation(opId, 'Generating Visualization')
      
      console.log('[Dashboard] Requesting AI recommendation for:', query)
      const config = await recommendVisualization(query, results)
      console.log('[Dashboard] Recommendation received:', config)
      
      finishOperation(opId)
      
      if (config) {
          dashboardPreviewConfig.value = config
          hasRecommendation.value = true
          
          if (autoPreview) {
               dashboardPreviewVisible.value = true
          } else {
              toast.success("Visualization available!", {
                description: `AI suggested a ${config.type} chart`,
                action: {
                  label: "Preview",
                  onClick: () => dashboardPreviewVisible.value = true
                }
              })
          }
      } else {
        console.log('[Dashboard] No visualization recommended by AI')
        // Don't show toast - heuristics should have already handled common cases
      }
  } catch (e) {
      console.error("[Dashboard] AI recommendation failed:", e)
      // Don't fail the operation visibly since this is a background enhancement
      // failOperation(opId, "Visualization failed") 
  }
}

// Heuristic visualization detection
const detectVisualizationType = (results: any[]) => {
  if (!results || results.length === 0) return null
  
  const firstRow = results[0]
  const keys = Object.keys(firstRow)
  
  if (keys.length < 2) return null
  
  // Check for time-series data (date/month/time column + numeric columns)
  const timeKeywords = ['date', 'month', 'year', 'time', 'day', 'week', 'quarter', 'timestamp']
  const timeColumn = keys.find(k => 
    timeKeywords.some(keyword => k.toLowerCase().includes(keyword))
  )
  
  if (timeColumn) {
    // Found a time column, check for numeric columns
    const numericColumns = keys.filter(k => {
      if (k === timeColumn) return false
      const val = firstRow[k]
      return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
    })
    
    if (numericColumns.length > 0) {
      // Build line chart config
      const labels = results.map(r => r[timeColumn])
      const datasets = numericColumns.map((col, idx) => ({
        label: col,
        data: results.map(r => typeof r[col] === 'number' ? r[col] : parseFloat(r[col])),
        borderColor: `hsl(${idx * 60}, 70%, 50%)`,
        backgroundColor: `hsl(${idx * 60}, 70%, 50%, 0.1)`,
        tension: 0.4
      }))
      
      return {
        type: 'line',
        title: `${numericColumns.join(', ')} over ${timeColumn}`,
        config: {
          data: {
            labels,
            datasets
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: numericColumns.length > 1 },
              title: { display: false }
            },
            scales: {
              y: { beginAtZero: false }
            }
          }
        }
      }
    }
  }
  
  // Check for categorical data (string column + numeric columns) - Bar Chart
  const stringColumns = keys.filter(k => typeof firstRow[k] === 'string')
  const numericColumns = keys.filter(k => {
    const val = firstRow[k]
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
  })
  
  // If we have 1 string column (category) and 1+ numeric columns (values), suggest bar chart
  if (stringColumns.length >= 1 && numericColumns.length >= 1) {
    const categoryColumn = stringColumns[0]!
    const labels = results.map(r => r[categoryColumn])
    
    const datasets = numericColumns.map((col, idx) => ({
      label: col,
      data: results.map(r => typeof r[col] === 'number' ? r[col] : parseFloat(r[col])),
      backgroundColor: `hsl(${idx * 60}, 70%, 50%)`,
      borderColor: `hsl(${idx * 60}, 70%, 60%)`,
      borderWidth: 1
    }))
    
    return {
      type: 'bar',
      title: `${numericColumns.join(', ')} by ${categoryColumn}`,
      config: {
        data: {
          labels,
          datasets
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: numericColumns.length > 1 },
            title: { display: false }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      }
    }
  }
  
  return null
}

// Clear analysis when running new query

const sanitizeDialogVisible = ref(false)

const isAnalyzing = ref(false)

const handleAnalyze = async () => {
  if (!queryResult.value || !lastQuery.value) {
    // If we're manually triggering this, we might want to warn.
    // But if called automatically, maybe silent fail is ok?
    // Maintaining existing behavior:
    console.log('No results to analyze')
    return
  }

  isAnalyzing.value = true
  // analysisResult.value = null // Removed

  try {
    const { analyzeResults } = await import('@/lib/api')
    
    // Get the user's original question from chat input or use a generic prompt
    // For manual queries, chatInput might be empty or irrelevant
    const userQuestion = chatInput.value || 'Analyze these query results'
    
    // Call the AI analysis API
    const analysis = await analyzeResults(
      userQuestion,
      Array.isArray(queryResult.value) ? queryResult.value : [queryResult.value],
      lastQuery.value
    )
    
    // analysisResult.value = analysis // Removed
    
    // Process the analysis result similar to how handleAIGenerate does it
    let aiSummary = typeof analysis === 'object' && analysis.answer 
          ? analysis.answer 
          : (typeof analysis === 'string' ? analysis : JSON.stringify(analysis))
        
    aiSummary = sanitizeAIResponse(aiSummary)

    // Push to Chat History
    const timestamp = Date.now()
    chatHistory.value.push({ role: 'assistant', content: aiSummary, timestamp })
    
    if (selectedChatId.value) {
        await saveMessage(selectedChatId.value, 'ai', aiSummary)
    }

    toast.success('Analysis added to chat')
  } catch (error) {
    console.error('Failed to analyze results:', error)
    toast.error('Failed to analyze results', {
      description: error instanceof Error ? error.message : 'Please try again'
    })
  } finally {
    isAnalyzing.value = false
  }
}

const handleEditTable = async (conn: ConnectionEntry, table: string) => {
  // Set the connection
  selectedConnectionId.value = conn.id
  
  // Check if a sheet tab for this table already exists
  await nextTick()
  if (workspaceRef.value && typeof workspaceRef.value.findOrCreateSheetTab === 'function') {
    const existed = workspaceRef.value.findOrCreateSheetTab(table)
    if (existed) {
      // Tab already exists, just switched to it
      return
    }
  }
  
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `load-sheet-${Date.now()}`
  startOperation(opId, `Loading ${table}`)
  
  try {
    await nextTick()
    if (workspaceRef.value && (workspaceRef.value.openTable || typeof workspaceRef.value.openTable === 'function')) {
      const connectionPayload = buildConnectionPayload(conn)
      await workspaceRef.value.openTable(table, connectionPayload, conn.provider)
      finishOperation(opId)
    } else if (workspaceRef.value && typeof workspaceRef.value.loadTableData === 'function') {
       // Legacy Fallback just in case
       console.warn('Using legacy loadTableData')
       // ... existing manual fetch logic would be needed here but simpler to just error out if openTable missing
       throw new Error('New table loading (openTable) not available on Workspace')
    } else {
       throw new Error('Workspace not ready')
    }
  } catch (e: any) {
    console.error('Failed to open table', e)
    failOperation(opId, e.message || 'Failed to load')
    toast.error(e.message || 'Failed to open table')
  }
}

const sanitizeIssues = ref<any[]>([])
const sanitizeTable = ref<string>('')



const handleSanitizeFixed = async (conn: ConnectionEntry, table: string) => {
  if (!conn || !table) return

  // Update selected connection to match the context menu source
  selectedConnectionId.value = conn.id

  sanitizeTable.value = table
  
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `sanitize-analyze-${Date.now()}`
  startOperation(opId, `Sanitizing ${table}...`)
  
  toast.info(`Sanitizing table '${table}'...`)

  try {
    const result = await apiSanitizeTable(table)
    finishOperation(opId)

    if (result.success) {
         toast.success(`Sanitization successful!`, {
             description: `Fixed ${result.issuesFixed} issues. Created version ${result.version}.`,
             duration: 5000
         })
    } else {
         toast.info("Sanitization completed without changes.")
    }
  } catch (e: any) {
    failOperation(opId, e.message)
    toast.error('Failed to analyze table for sanitization', {
      description: e.message
    })
  }
}

const handleOpenSpreadsheet = async () => {
  if (!queryResult.value || !Array.isArray(queryResult.value) || queryResult.value.length === 0) {
    toast.warning('No data available to open in spreadsheet');
    return;
  }
  
  if (workspaceRef.value && typeof workspaceRef.value.loadTableData === 'function') {
     const connection = selectedConnection.value
     const provider = connection?.provider || 'sqlite'
     const tableName = `Analysis ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
     
     workspaceRef.value.loadTableData(tableName, queryResult.value, connection, provider)
     toast.success('Opened results in spreadsheet')
  } else {
     toast.error('Workspace not ready')
  }
}

const handleSanitize = async () => {
    if (!selectedConnection.value) return
    
    // 1. Identify Table
    // Try to find table in the last query
    let table = ''
    if (lastQuery.value) {
        // Simple regex to find FROM table
        const match = lastQuery.value.match(/FROM\s+["`]?([a-zA-Z0-9_]+)["`]?/i)
        if (match && match[1]) {
            table = match[1]
        }
    }

    // Fallback: Check active table in Workspace
    if (!table && workspaceRef.value && typeof workspaceRef.value.getActiveTable === 'function') {
         const active = workspaceRef.value.getActiveTable()
         if (active) table = active
    }

    if (!table && mode.value === 'spreadsheet' && selectedConnection.value?.sqlite?.tables?.length) {
        // Fallback for spreadsheet mode
        const tables = selectedConnection.value.sqlite.tables;
        if (tables && tables.length > 0) {
             table = tables[0] || '';
        }
    }
    
    if (!table) {
        toast.error("Could not identify source table from query.")
        return
    }
    
    sanitizeTable.value = table
    
    const { startOperation, finishOperation, failOperation } = useProgress()
    const opId = `sanitize-analyze-${Date.now()}`
    startOperation(opId, `Sanitizing ${table}...`)
    
    toast.info(`Sanitizing table '${table}'...`)
    
    try {
        const result = await apiSanitizeTable(table)
        finishOperation(opId)
        
        if (result.success) {
             toast.success(`Sanitization successful!`, {
                 description: `Fixed ${result.issuesFixed} issues. Created version ${result.version}.`,
                 duration: 5000
             })
             
             // Emit event to refresh workspace/grid if possible
             // For now, we trust the user will see the toast.
             // Ideally we might want to switch to the new table version automatically?
             // But Chat.vue doesn't control the workspace tabs directly.
        } else {
             toast.info("No issues found or sanitization completed without changes.")
        }

        
    } catch (e: any) {
        console.error('[Sanitize] Frontend error:', e)
        console.error('[Sanitize] Error details:', {
            message: e.message,
            response: e.response,
            stack: e.stack
        })
        failOperation(opId, e.message || 'Unknown error')
        toast.error(`Failed to analyze table: ${e.message || 'Unknown error'}`)
    }
}

const workspaceRef = ref<any>(null)

const handleLoadTableToSheet = async () => {
  if (!selectedConnection.value) {
    toast.error('No connection selected')
    return
  }
  
  const conn = selectedConnection.value
  if (conn.provider !== 'sqlite' || !conn.sqlite?.tables?.length) {
    toast.error('Only SQLite tables can be loaded into spreadsheet')
    return
  }
  
  const tableName = conn.sqlite.tables[0] || 'Untitled'
  
  // Check if a sheet tab for this table already exists
  await nextTick()
  if (workspaceRef.value && typeof workspaceRef.value.findOrCreateSheetTab === 'function') {
    const existed = workspaceRef.value.findOrCreateSheetTab(tableName)
    if (existed) {
      // Tab already exists, just switched to it
      return
    }
  }
  
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `load-sheet-${Date.now()}`
  startOperation(opId, `Loading ${tableName}`)
  
  try {
    toast.info('Loading table data...')
    
    const response = await fetch(`${queryApiUrl}/query`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        provider: conn.provider,
        connection: buildConnectionPayload(conn),
        query: `SELECT rowid as _rowid_, * FROM "${tableName}" LIMIT 10000`,
        source: 'user',
        model: null
      }),
    })

    const body = await response.json()

    if (!response.ok || body.error) {
      throw new Error(body.error ?? 'Unable to fetch data')
    }

    if (Array.isArray(body.result) && body.result.length > 0) {
      // Wait for workspace to be ready
      await nextTick()
      
      // Call workspace to create a new spreadsheet tab with this data
      if (workspaceRef.value && typeof workspaceRef.value.loadTableData === 'function') {
        const connection = selectedConnection.value
        const provider = connection?.provider || 'sqlite'
        workspaceRef.value.loadTableData(tableName, body.result, connection, provider)
      } else {
        console.error('Workspace ref not ready or loadTableData not available')
        throw new Error('Workspace not ready')
      }
      
      finishOperation(opId)
      toast.success(`Loaded ${body.result.length} rows into spreadsheet`)
    } else {
      finishOperation(opId)
      toast.warning('No data found in table')
    }
  } catch (e: any) {
    console.error('Failed to load table data', e)
    failOperation(opId, e.message || 'Failed to load')
    toast.error('Failed to load table data')
  }
}

const handleExecuteSanitization = async (sqls: string[]) => {
    if (!selectedConnection.value) return
    
    // Execute all SQLs
    // Reuse existing fetch logic or extract it.
    // Since we are in Chat.vue, we can call the fetch directly or reuse `run` if adapted, 
    // but `run` relies on `chatInput`.
    // We will copy the execution logic here for safety and simplicity.
    
    const { startOperation, updateOperation, finishOperation } = useProgress()
    const opId = `sanitize-exec-${Date.now()}`
    startOperation(opId, `Applying ${sqls.length} Fixes`)
    
    toast.loading("Applying fixes...")
    let successCount = 0
    let errors = 0
    
    for (let i = 0; i < sqls.length; i++) {
        const query = sqls[i]
        // Update progress
        const percent = Math.round(((i) / sqls.length) * 100)
        updateOperation(opId, percent, `Running fix ${i+1}/${sqls.length}`)
        
        try {
             const response = await fetch(`${queryApiUrl}/query`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                  provider: selectedConnection.value.provider,
                  connection: buildConnectionPayload(selectedConnection.value),
                  query: query,
                  source: 'sanitize_fix',
                  model: aiOptions.value.model,
                }),
              })
              if (!response.ok) throw new Error('Failed')
              successCount++
        } catch (e) {
            errors++
        }
    }
    
    finishOperation(opId)
    toast.success(`Applied ${successCount} fixes. ${errors > 0 ? `${errors} failed.` : ''}`)
    
    // Re-run the original query to show updated data
    if (lastQuery.value) {
        // Trigger a re-run
        // We can just set input and call run? Or manually refetch.
        // Let's manually refetch to avoid messing with chat history.
         const response = await fetch(`${queryApiUrl}/query`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({
              provider: selectedConnection.value.provider,
              connection: buildConnectionPayload(selectedConnection.value),
              query: lastQuery.value,
              source: 'user', // Treat as user re-run
              model: aiOptions.value.model,
            }),
          })
          const body = await response.json()
          if (response.ok) {
              queryResult.value = body.result
          }
    }
}
</script>

