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
          @update:mode="mode = $event"
          @update:selected-connection-id="selectedConnectionId = $event"
          @update:ai-options="aiOptions = $event"
          @update:query-options="queryOptions = $event"
          @run="run"
          @stop="stopExecution"
          @clear="clear"
          @ai-generate="handleAIGenerate"
        />

        <!-- Editor -->
        <ChatEditor 
          :mode="mode" 
          :input="currentInput" 
          @update:input="currentInput = $event" 
          @submit="run"
        />
      </section>

      <!-- Results Panel -->
      <ResultsPanel
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
      />

      <AmbiguityDialog
        v-model:open="ambiguityDialogVisible"
        :ambiguity="ambiguity"
        @resolve="handleResolveAmbiguity"
      />

      <DashboardElementPreview
        v-model:open="dashboardPreviewVisible"
        :initial-config="dashboardPreviewConfig"
        :query="lastQuery"
        :results="Array.isArray(queryResult) ? queryResult : []"
        @saved="toast.success('Added to dashboard')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">

import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { toast } from 'vue-sonner'
import ChatSidebar from '../components/Chat/ChatSidebar.vue'
import ChatToolbar from '../components/Chat/ChatToolbar.vue'
import ChatEditor from '../components/Chat/ChatEditor.vue'
import ResultsPanel from '../components/Chat/ResultsPanel.vue'
import AmbiguityDialog from '../components/Chat/AmbiguityDialog.vue'
import DashboardElementPreview from '../components/Dashboard/DashboardElementPreview.vue'
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
  saveQuery
} from '@/lib/api'
import { db } from '@/lib/local-db'
import { generateKey, encryptData, decryptData } from '@/lib/crypto'

const queryApiUrl = QUERY_API_URL
const connections = ref<ConnectionEntry[]>([])
const selectedConnectionId = ref('')

// Chat State
const chats = ref<any[]>([])
const selectedChatId = ref('')

const loadChats = async () => {
  try {
    chats.value = await fetchChats()
  } catch (e) {
    console.error('Failed to load chats', e)
  }
}

const handleSelectChat = async (id: string) => {
  selectedChatId.value = id
  try {
    const data = await fetchChatHistory(id)
    chatHistory.value = data.messages.map((m: any) => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: m.content,
      timestamp: m.created_at * 1000
    }))
  } catch (e) {
    console.error('Failed to load chat history', e)
  }
}

const handleCreateChat = async () => {
  try {
    const newChat = await createChat('New Chat')
    chats.value.unshift(newChat)
    await handleSelectChat(newChat.id)
  } catch (e) {
    console.error('Failed to create chat', e)
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
    const res = await fetch('http://localhost:3000/connections', {
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
  }
})

const queryResult = ref<unknown>(null)
const queryError = ref('')
const lastQuery = ref('')
const isExecuting = ref(false)
const mode = ref<'chat' | 'write'>('chat')
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

const chatHistory = ref([])
const encryptionKey = ref(null)
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
const dashboardPreviewConfig = ref(null)

const handleCreateDashboardElement = async () => {
  if (!queryResult.value || !lastQuery.value) return
  
  toast.info('Generating chart recommendation...')
  try {
    const config = await recommendVisualization(lastQuery.value, Array.isArray(queryResult.value) ? queryResult.value : [queryResult.value])
    dashboardPreviewConfig.value = config
    dashboardPreviewVisible.value = true
  } catch (e) {
    toast.error('Failed to generate recommendation')
  }
}

const loadQueries = async () => {
  try {
    queryHistory.value = await fetchQueries()
  } catch (e) {
    console.error('Failed to load queries', e)
  }
}

onMounted(async () => {
  await loadConnections()
  await loadChats()
  await loadQueries()
  if (chats.value.length > 0) {
    await handleSelectChat(chats.value[0].id)
  } else {
    await handleCreateChat()
  }

  window.addEventListener('pegasus:connections-updated', loadConnections)
  encryptionKey.value = await generateKey()
  
  // Load AI models and settings
  try {
    const [models, settings] = await Promise.all([
      getAIModels(),
      fetchSettings()
    ])
    
    if (settings.enabledModels && settings.enabledModels.length > 0) {
      availableModels.value = models.filter((m: any) => settings.enabledModels.includes(m.id))
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
    isExecuting.value = true
    queryError.value = ''
    queryResult.value = null
    lastQuery.value = payload

    try {
      const response = await fetch(`${queryApiUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedConnection.value.provider,
          connection: buildConnectionPayload(selectedConnection.value),
          query: payload,
        }),
      })

      const body = await response.json()

      if (!response.ok || body.error) {
        throw new Error(body.error ?? 'Unable to execute query')
      }

      queryResult.value = body.result ?? null
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
    
    // Persist query
    saveQuery(payload, 'user', 'success', selectedConnection.value.id).catch(console.error)

    // AI Analysis if enabled
    if (aiOptions.value.model) {
        const encrypted = await encryptData(encryptionKey.value, chatHistory.value)
        await db.conversations.put({ id: 'current', messages: encrypted, updatedAt: Date.now() })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      queryError.value = message
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

  const userPrompt = chatInput.value.trim()
  isExecuting.value = true
  
  try {
    // Check if user is explicitly asking for the query itself
    const wantsQueryOnly = /show\s+(me\s+)?(the\s+)?query|what\s+(is\s+)?the\s+query|generate\s+query/i.test(userPrompt)
    
    // Pass chat history if available, otherwise empty array
    // @ts-ignore
    const history = typeof chatHistory !== 'undefined' ? chatHistory.value : []
    const query = await generateAIQuery(userPrompt, selectedConnectionId.value, history)
    
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
        body: JSON.stringify({
          provider: selectedConnection.value.provider,
          connection: buildConnectionPayload(selectedConnection.value),
          query: queryPayload,
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
      toast.success('Query executed', {
        description: `${Array.isArray(body.result) ? body.result.length : 1} result${Array.isArray(body.result) && body.result.length !== 1 ? 's' : ''} returned`,
        position: 'top-right',
      })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    queryError.value = message
    toast.error('Failed to execute', { description: message })
  } finally {
    isExecuting.value = false
  }
}

const handleEditTable = (conn: ConnectionEntry, table: string) => {
  mode.value = 'write'
  selectedConnectionId.value = conn.id
  
  if (conn.provider === 'kusto') {
    writeInput.value = `.ingest inline into table ['${table}'] <|
// Add your data here (comma separated values)
// 1, "value", ...`
  } else if (conn.provider === 'mysql') {
    writeInput.value = `INSERT INTO ${table} (col1, col2) VALUES (val1, val2);`
  } else if (conn.provider === 'mongodb') {
    writeInput.value = `db.${table}.insertOne({ field: "value" })`
  }
}

const analysisResult = ref<any>(null)
const isAnalyzing = ref(false)

const handleAnalyze = async () => {
  if (!queryResult.value || !lastQuery.value) return
  
  isAnalyzing.value = true
  try {
    const analysis = await analyzeResults(
      'Analyze these results', 
      Array.isArray(queryResult.value) ? queryResult.value : [queryResult.value], 
      lastQuery.value
    )
    
    try {
      analysisResult.value = JSON.parse(analysis)
    } catch {
      // Fallback for non-JSON response
      analysisResult.value = { summary: analysis }
    }
  } catch (e) {
    toast.error('Analysis failed', { description: e instanceof Error ? e.message : String(e) })
  } finally {
    isAnalyzing.value = false
  }
}

// Clear analysis when running new query
watch(lastQuery, () => {
  analysisResult.value = ''
})
</script>

