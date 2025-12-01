<template>
  <div class="flex w-full h-full text-stone-100 overflow-hidden">
    <!-- Explorer sidebar -->
    <ChatSidebar 
      v-show="sidebarOpen" 
      :side="sidebarSide" 
      :connections="connections"
      :selected-connection-id="selectedConnectionId"
      @update:selected-connection-id="selectedConnectionId = $event"
      @edit-table="handleEditTable"
      @toggle="toggleSidebar" 
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
          :input="input" 
          @update:input="input = $event" 
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
    </div>
  </div>
</template>

<script setup lang="ts">

import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { toast } from 'vue-sonner'
import ChatSidebar from '../components/Chat/ChatSidebar.vue'
import ChatToolbar from '../components/Chat/ChatToolbar.vue'
import ChatEditor from '../components/Chat/ChatEditor.vue'
import ResultsPanel from '../components/Chat/ResultsPanel.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CONNECTION_STORAGE_KEY, defaultConnections, buildConnectionPayload } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { QUERY_API_URL, generateAIQuery, analyzeResults, getAIModels, fetchSettings } from '@/lib/api'
import { db } from '@/lib/local-db'
import { generateKey, encryptData, decryptData } from '@/lib/crypto'

const queryApiUrl = QUERY_API_URL
const connections = ref<ConnectionEntry[]>([])
const selectedConnectionId = ref('')

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
  
  // Set default selection if current selection is invalid
  if (!connections.value.some((conn) => conn.id === selectedConnectionId.value)) {
    selectedConnectionId.value = connections.value[0]?.id ?? ''
  }
}


const queryResult = ref<unknown>(null)
const queryError = ref('')
const lastQuery = ref('')
const isExecuting = ref(false)
const mode = ref<'chat' | 'write'>('chat')
const input = ref('')
const chatHistory = ref([])
const encryptionKey = ref(null)
const sidebarOpen = ref(true)
const sidebarSide = ref<'left' | 'right'>('left')
const resultsPanelVisible = ref(false)
const resultsPanelPosition = ref<'bottom' | 'right'>('bottom')
const availableModels = ref<any[]>([])
const queryHistory = ref<any[]>([])
const ambiguity = ref<any>(null)

const aiOptions = ref({
  model: 'gpt-4',
  temperature: 0.7
})

onMounted(async () => {
  await loadConnections()
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
      chatHistory.value = decrypted
    } catch (e) {
      chatHistory.value = []
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
watch([queryResult, queryError, ambiguity], () => {
  if (queryResult.value || queryError.value || ambiguity.value) {
    resultsPanelVisible.value = true
  }
})

const handleResolveAmbiguity = (choice: string) => {
  input.value = `${input.value} (Clarification: ${choice})`
  ambiguity.value = null
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

const run = async () => {
  if (!input.value.trim()) return
  if (!selectedConnection.value) {
    queryError.value = 'Pick a saved database connection in Settings → Database Connections.'
    return
  }

  const payload = input.value.trim()
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
      
      // Add to query history
      queryHistory.value.unshift({
        id: crypto.randomUUID(),
        query: payload,
        timestamp,
        source: 'user',
        status: 'success'
      })

      if (encryptionKey.value) {
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
  input.value = ''
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
  if (!input.value.trim()) {
    toast.error('Please enter a prompt')
    return
  }

  const userPrompt = input.value.trim()
  isExecuting.value = true
  
  try {
    // Check if user is explicitly asking for the query itself
    const wantsQueryOnly = /show\s+(me\s+)?(the\s+)?query|what\s+(is\s+)?the\s+query|generate\s+query/i.test(userPrompt)
    
    // Pass chat history if available, otherwise empty array
    // @ts-ignore
    const history = typeof chatHistory !== 'undefined' ? chatHistory.value : []
    const query = await generateAIQuery(userPrompt, selectedConnectionId.value, history)
    
    // Check for ambiguity
    let isAmbiguous = false
    try {
      const parsed = JSON.parse(query)
      if (parsed.ambiguous) {
        isAmbiguous = true
        ambiguity.value = parsed
        resultsPanelVisible.value = true
        toast.info('Clarification needed')
        return
      }
    } catch (e) {
      // Not JSON or not ambiguous, proceed as query
    }

    if (wantsQueryOnly) {
      // User wants to see the query - switch to write mode
      input.value = query
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
      ambiguity.value = null // Clear ambiguity
      lastQuery.value = query

      const response = await fetch(`${queryApiUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedConnection.value.provider,
          connection: buildConnectionPayload(selectedConnection.value),
          query: query,
        }),
      })

      const body = await response.json()

      if (!response.ok || body.error) {
        throw new Error(body.error ?? 'Unable to execute query')
      }

      queryResult.value = body.result ?? null
      
      // Save to chat history
      const timestamp = Date.now()
      chatHistory.value.push({ role: 'user', content: userPrompt, timestamp })
      chatHistory.value.push({ 
        role: 'assistant', 
        content: `Executed query: ${query}\n\nResults: ${JSON.stringify(body.result)}`, 
        timestamp 
      })
      
      // Add to query history
      queryHistory.value.unshift({
        id: crypto.randomUUID(),
        query,
        timestamp,
        source: 'ai',
        status: 'success'
      })
      
      if (encryptionKey.value) {
        const encrypted = await encryptData(encryptionKey.value, chatHistory.value)
        await db.conversations.put({ id: 'current', messages: encrypted, updatedAt: Date.now() })
      }

      // Clear input and show results
      input.value = ''
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
    input.value = `.ingest inline into table ['${table}'] <|
// Add your data here (comma separated values)
// 1, "value", ...`
  } else if (conn.provider === 'mysql') {
    input.value = `INSERT INTO ${table} (col1, col2) VALUES (val1, val2);`
  } else if (conn.provider === 'mongodb') {
    input.value = `db.${table}.insertOne({ field: "value" })`
  }
}

const analysisResult = ref<string>('')
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
    analysisResult.value = analysis
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
```
