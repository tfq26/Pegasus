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
          @update:mode="mode = $event"
          @update:selected-connection-id="selectedConnectionId = $event"
          @update:ai-options="aiOptions = $event"
          @update:query-options="queryOptions = $event"
          @run="run"
          @stop="stopExecution"
          @ai-generate="handleAIGenerate"
          @clear="clear"
          @format="handleFormat"
          @toggle-ai-mode="handleToggleAIMode"
          @visualize="handleVisualize"
          @sanitize="handleSanitize"
        />

        <!-- Editor -->
        <ChatEditor 
          v-if="mode !== 'spreadsheet'"
          :mode="mode" 
          :input="currentInput" 
          @update:input="currentInput = $event" 
          @submit="run"
        />

        <!-- Excel Editor -->
        <div v-if="mode === 'spreadsheet'" class="flex-1 overflow-hidden bg-muted/10">
          <div v-if="excelDataLoading" class="flex items-center justify-center h-full text-muted-foreground">
            <div class="text-center">
              <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading Excel data...</p>
            </div>
          </div>
          <ExcelEditor 
            v-else-if="excelData.length > 0"
            ref="excelEditorRef"
            :data="excelData" 
            class="h-full bg-background"
            @save="handleSaveExcel"
          />
          <div v-else class="flex items-center justify-center h-full text-muted-foreground">
            <div class="text-center">
              <p>No data loaded.</p>
              <p class="text-xs mt-1">Select an Excel connection and try again.</p>
            </div>
          </div>
        </div>
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
        :analysis="analysisResult"
        :is-analyzing="isAnalyzing"
        :ambiguity="ambiguity"
        @update:position="resultsPanelPosition = $event"
        @close="resultsPanelVisible = false"
        @analyze="handleAnalyze"
        @resolve-ambiguity="handleResolveAmbiguity"
        @create-dashboard-element="handleCreateDashboardElement"
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
    </div>
  </div>
</template>

<script setup lang="ts">

import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import ChatSidebar from '../components/Chat/ChatSidebar.vue'
import ChatToolbar from '../components/Chat/ChatToolbar.vue'
import ChatEditor from '../components/Chat/ChatEditor.vue'
import ResultsPanel from '../components/Chat/ResultsPanel.vue'
import AmbiguityDialog from '../components/Chat/AmbiguityDialog.vue'
import SanitizePreviewDialog from '../components/Chat/SanitizePreviewDialog.vue'
import DashboardElementPreview from '../components/Dashboard/DashboardElementPreview.vue'
import ChatHistoryModal from '../components/Chat/ChatHistoryModal.vue'
import ExcelEditor from '../components/Excel/ExcelEditor.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CONNECTION_STORAGE_KEY, defaultConnections, buildConnectionPayload } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { QUERY_API_URL, generateAIQuery, analyzeResults, getAIModels, fetchSettings,  fetchChats,
  createChat,
  fetchChatHistory,
  saveMessage,
  fetchDashboardElements,
  recommendVisualization,
  fetchQueries,
  saveQuery,
  analyzeTableSanitization
} from '@/lib/api'
import { useProgress } from '@/lib/progress'
import { db } from '@/lib/local-db'
import { generateKey, encryptData, decryptData } from '@/lib/crypto'

const queryApiUrl = QUERY_API_URL
const connections = ref<ConnectionEntry[]>([])
const selectedConnectionId = ref('')

// Excel Editor State
const excelData = ref<any[]>([])
const excelDataLoading = ref(false)
const excelEditorRef = ref<any>(null)
const saveStatus = ref<'saved' | 'saving' | 'error'>('saved')
const aiMode = ref(false)

const handleToggleAIMode = () => {
  if (excelEditorRef.value) {
    excelEditorRef.value.toggleAIMode()
    aiMode.value = excelEditorRef.value.aiMode
  }
}

const handleVisualize = async () => {
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
  console.log('[loadExcelData] Starting...')
  console.log('[loadExcelData] selectedConnection:', selectedConnection.value)
  
  if (!selectedConnection.value) {
    console.warn('[loadExcelData] No connection selected')
    return
  }
  
  const conn = selectedConnection.value
  console.log('[loadExcelData] Connection provider:', conn.provider)
  console.log('[loadExcelData] SQLite tables:', conn.sqlite?.tables)
  
  if (conn.provider !== 'sqlite' || !conn.sqlite?.tables?.length) {
    console.warn('[loadExcelData] Not a SQLite connection or no tables')
    return
  }

  const tableName = conn.sqlite.tables[0] // Default to first table
  console.log('[loadExcelData] Loading table:', tableName)
  
  excelDataLoading.value = true
  
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `excel-load-${Date.now()}`
  startOperation(opId, `Loading ${tableName}`)
  
  try {
    toast.info('Loading Excel data...')
    
    const response = await fetch(`${queryApiUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        provider: conn.provider,
        connection: buildConnectionPayload(conn),
        query: `SELECT * FROM "${tableName}" LIMIT 50000`, // Load more data for editor
        source: 'user',
        model: null
      }),
    })

    const body = await response.json()
    console.log('[loadExcelData] Response body:', body)
    console.log('[loadExcelData] Result is array?', Array.isArray(body.result))
    console.log('[loadExcelData] Result length:', body.result?.length)

    if (!response.ok || body.error) {
      throw new Error(body.error ?? 'Unable to fetch data')
    }

    if (Array.isArray(body.result)) {
      excelData.value = body.result
      console.log('[loadExcelData] Set excelData.value, length:', excelData.value.length)
      finishOperation(opId)
      toast.success(`Loaded ${body.result.length} rows`)
    } else {
      finishOperation(opId)
      toast.warning('No data found in table')
    }
  } catch (e: any) {
    console.error('Failed to load Excel data', e)
    failOperation(opId, e.message || 'Failed to load')
    toast.error('Failed to load Excel data')
  } finally {
    excelDataLoading.value = false
  }
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
      headers: { 'Content-Type': 'application/json' },
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
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `load-chat-${id}`
  startOperation(opId, 'Loading chat history...')

  try {
    const chat = chats.value.find(c => c.id === id)
    if (!chat) {
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
  previewVisible.value = false
  selectedChatId.value = id
  
  // Load into main editor
  chatHistory.value = previewMessages.value
  
  // If we have a selected connection, good. If not, maybe we should try to restore it?
  // For now, we assume user manages connection.
  
  toast.success('Chat loaded')
}



const handleCreateChat = async () => {
  try {
    const newChat = await createChat('New Chat')
    chats.value.unshift(newChat)
    
    // Directly switch to the new chat
    selectedChatId.value = newChat.id
    chatHistory.value = []
    
    // Reset state
    mode.value = 'chat'
    chatInput.value = ''
    writeInput.value = ''
    queryResult.value = null
    queryError.value = ''
    lastQuery.value = ''
    resultsPanelVisible.value = false
    
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
    if (mode.value === 'spreadsheet') {
      loadExcelData()
    }
  }
})

const queryResult = ref<unknown>(null)
const queryError = ref('')
const lastQuery = ref('')
const isExecuting = ref(false)
const mode = ref<'chat' | 'write' | 'spreadsheet'>('chat')

watch(mode, (newMode) => {
  if (newMode === 'spreadsheet') {
    loadExcelData()
  }
})
const chatInput = ref('')
const writeInput = ref('')

// Computed property to get the current active input
const currentInput = computed({
  get: () => mode.value === 'chat' ? chatInput.value : writeInput.value,
  set: (val) => {
    if (mode.value === 'chat') chatInput.value = val
    else writeInput.value = val
  }
})

const chatHistory = ref<any[]>([])
const encryptionKey = ref<CryptoKey | null>(null)
const sidebarOpen = ref(true)
const sidebarSide = ref<'left' | 'right'>('left')
const resultsPanelVisible = ref(true)
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

const handleCreateDashboardElement = async () => {
  if (hasRecommendation.value && dashboardPreviewConfig.value) {
    dashboardPreviewVisible.value = true
    return
  }

  if (!queryResult.value || !lastQuery.value) return
  
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `chart-gen-${Date.now()}`
  startOperation(opId, 'Generating Chart')
  
  toast.info('Generating chart recommendation...')
  try {
    const config = await recommendVisualization(lastQuery.value, Array.isArray(queryResult.value) ? queryResult.value : [queryResult.value])
    finishOperation(opId)
    dashboardPreviewConfig.value = config
    dashboardPreviewVisible.value = true
  } catch (e: any) {
    console.error('Visualization recommendation failed:', e)
    failOperation(opId, e.message || 'Failed to generate')
    toast.error('Failed to generate recommendation', {
      description: e instanceof Error ? e.message : String(e)
    })
  }
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
  // Switch to write mode first
  mode.value = 'write'
  
  // Wait for mode switch to complete and CodeEditor to mount
  await nextTick()
  
  // Now set the write input
  writeInput.value = query
  
  toast.success('Query loaded into editor')
}


const run = async () => {
  const activeInput = mode.value === 'chat' ? chatInput.value : writeInput.value
  
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

    const { startOperation, finishOperation, failOperation } = useProgress()
    const opId = `query-exec-${Date.now()}`
    startOperation(opId, `Executing Query (User)`)

    try {
      const response = await fetch(`${queryApiUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        handlePostQueryActions(payload, body.result)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      queryError.value = message
      failOperation(opId, message)
      toast.error('Query failed', { description: message, position: 'top-right' })
    } finally {
      isExecuting.value = false
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
  // TODO: Implement query cancellation logic
  isExecuting.value = false
  toast.info('Query execution stopped')
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
    try {
      const newChat = await createChat('New Chat')
      chats.value.unshift(newChat)
      selectedChatId.value = newChat.id
      chatHistory.value = []
    } catch (e) {
      console.error('Failed to auto-create chat', e)
    }
  }

  const userPrompt = chatInput.value.trim()
  
  // Show results panel immediately
  resultsPanelVisible.value = true
  
  isExecuting.value = true
  
  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `ai-gen-${Date.now()}`
  startOperation(opId, `Asking AI...`)
  
  try {
    // Check if user is explicitly asking for the query itself
    const wantsQueryOnly = /show\s+(me\s+)?(the\s+)?query|what\s+(is\s+)?the\s+query|generate\s+query/i.test(userPrompt)
    // Check if user explicitly wants a visualization
    const wantsVisualization = /visualize|chart|graph|plot|dashboard|histogram|pie/i.test(userPrompt)
    
    // Pass chat history if available, otherwise empty array
    // @ts-ignore
    const history = typeof chatHistory !== 'undefined' ? chatHistory.value : []
    const { query, usage } = await generateAIQuery(userPrompt, selectedConnectionId.value, history)
    
    // Check for ambiguity or parse errors
    let isAmbiguous = false
    let reasoning = ''
    try {
      const parsed = JSON.parse(query)
      
      // Check if this is a parse error response from the AI
      if (parsed._parseError) {
        reasoning = parsed.reasoning || ''
        ambiguity.value = { reasoning }
        throw new Error(parsed.error || 'AI generated invalid JSON')
      }
      
      if (parsed.reasoning) {
        reasoning = parsed.reasoning
      }
      
      if (parsed.ambiguous) {
        isAmbiguous = true
        ambiguity.value = parsed
        ambiguityDialogVisible.value = true
        return
      }
    } catch (e) {
      // If it's our custom error, re-throw it
      if (e instanceof Error && e.message.includes('AI generated invalid JSON')) {
        throw e
      }
      // Not JSON or not ambiguous, proceed as query
    }

    if (wantsQueryOnly) {
      // User wants to see the query - switch to write mode
      writeInput.value = query
      mode.value = 'write'
      toast.success('Query generated!')
    } else {
      // Auto-execute the query and return results
      if (!selectedConnection.value) {
        toast.error('Connection not found')
        return
      }

      queryError.value = ''
      queryResult.value = null
      ambiguity.value = null 
      lastQuery.value = query

      if (!query || !query.trim()) {
        throw new Error('AI generated an empty query')
      }

      // Check for SQL-style ambiguity comment
      if (query.trim().startsWith('-- AMBIGUOUS:')) {
        const message = query.replace('-- AMBIGUOUS:', '').trim()
        ambiguity.value = {
          ambiguity: message,
          options: [], // SQL ambiguity usually doesn't provide structured options yet
          reasoning: reasoning
        }
        return // Stop execution
      }

      // Prepare payload - strip reasoning if present to avoid DB errors
      let queryPayload = query
      if (reasoning) {
        try {
          const parsed = JSON.parse(query)
          console.log('[Frontend] Original query with reasoning:', parsed)
          delete parsed.reasoning
          queryPayload = JSON.stringify(parsed)
          console.log('[Frontend] Cleaned query payload:', queryPayload)
        } catch (e) {
          console.error('[Frontend] Failed to parse query:', e)
        }
      }

      const response = await fetch(`${queryApiUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider: selectedConnection.value.provider,
          connection: buildConnectionPayload(selectedConnection.value),
          query: queryPayload,
          source: 'ai',
          model: aiOptions.value.model,
          tokens_used: usage ? (usage.promptTokens + usage.candidatesTokens) : 0
        }),
      })

      const body = await response.json()

      if (!response.ok || body.error) {
        // If error, set the reasoning in ambiguity object so it shows up in the error panel
        if (reasoning) {
          ambiguity.value = { reasoning }
        }
        throw new Error(body.error ?? 'Unable to execute query')
      }

      queryResult.value = body.result ?? null
      
      // Save to chat history (Backend)
      const timestamp = Date.now()
      const aiContent = `Executed query: ${query}\n\nResults: ${JSON.stringify(body.result)}`
      
      chatHistory.value.push({ role: 'user', content: userPrompt, timestamp })
      chatHistory.value.push({ role: 'assistant', content: aiContent, timestamp })
      
      if (selectedChatId.value) {
        await saveMessage(selectedChatId.value, 'user', userPrompt)
        await saveMessage(selectedChatId.value, 'ai', aiContent)
      }
      
      // Add to query history
      queryHistory.value.unshift({
        id: crypto.randomUUID(),
        query,
        timestamp,
        source: 'ai',
        status: 'success'
      })
      
      // Clear input and show results
      chatInput.value = ''
      resultsPanelVisible.value = true
      
      finishOperation(opId)
      
      toast.success('Query executed', {
        description: `${Array.isArray(body.result) ? body.result.length : 1} result${Array.isArray(body.result) && body.result.length !== 1 ? 's' : ''} returned`,
        position: 'top-right',
      })
      
      // Trigger post-query actions
      handlePostQueryActions(query, body.result, wantsVisualization)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    queryError.value = message
    failOperation(opId, message)
    toast.error('Failed to execute', { description: message })
  } finally {
    isExecuting.value = false
  }
}

// Update the function signature
const handlePostQueryActions = async (query: string, results: any, autoPreview = false) => {
  // 1. Auto-analyze
  handleAnalyze()
  
  // 2. Dashboard Recommendation
  hasRecommendation.value = false
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.log('[Dashboard] Results not suitable for visualization')
    return
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

  // If not a simple stat, try heuristic detection first
  const heuristicConfig = detectVisualizationType(results)
  
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
watch(lastQuery, () => {
  analysisResult.value = ''
})
const sanitizeDialogVisible = ref(false)
const analysisResult = ref<any>(null)
const isAnalyzing = ref(false)

const handleAnalyze = () => {
    // Placeholder for future implementation
    console.log('Analyze triggered')
}

const handleEditTable = (conn: ConnectionEntry, table: string) => {
    console.log('Edit table', conn, table)
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
  startOperation(opId, `Analyzing ${table}`)
  
  toast.info(`Analyzing table '${table}'...`)

  try {
    const issues = await analyzeTableSanitization(conn.id, table)
    finishOperation(opId)

    if (!issues || issues.length === 0) {
      toast.success('No issues found by AI.')
      return
    }
    sanitizeIssues.value = issues
    sanitizeDialogVisible.value = true
  } catch (e: any) {
    failOperation(opId, e.message)
    toast.error('Failed to analyze table for sanitization', {
      description: e.message
    })
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
    } else if (mode.value === 'spreadsheet' && selectedConnection.value?.sqlite?.tables?.length) {
        // Fallback for spreadsheet mode
        table = selectedConnection.value.sqlite.tables[0]
    }
    
    if (!table) {
        toast.error("Could not identify source table from query.")
        return
    }
    
    sanitizeTable.value = table
    
    const { startOperation, finishOperation, failOperation } = useProgress()
    const opId = `sanitize-analyze-${Date.now()}`
    startOperation(opId, `Analyzing ${table}`)
    
    toast.info(`Analyzing table '${table}'...`)
    
    try {
        const result = await analyzeTableSanitization(selectedConnectionId.value || '', table)
        finishOperation(opId)
        
        // Handle both raw array or object wrapper
        const issues = Array.isArray(result) ? result : (result?.issues || [])
        
        if (!issues || issues.length === 0) {
             toast.success("No issues found! Data looks clean.")
             return
        }
        
        sanitizeIssues.value = issues
        sanitizeDialogVisible.value = true
        
    } catch (e: any) {
        console.error(e)
        failOperation(opId, e.message)
        toast.error("Failed to analyze table")
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
                headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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

