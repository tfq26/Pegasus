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
      @update:selected-connection-id="handleSelectConnection"
      @edit-table="handleEditTableWrapper"
      @toggle="toggleSidebar" 
      @select-chat="selectChat"
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
          :live-mode="liveMode"
          :collaborator-count="collaboratorCount"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :query-history="queryHistory"
          @update:mode="mode = $event"
          @update:selected-connection-id="handleSelectConnection"
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
          @load-table-to-sheet="() => handleLoadTableToSheet(Array.isArray(queryResult) ? queryResult : [])"
          @export="handleExport"
          @update:private-mode="privateMode = $event"
          @update:live-mode="handleUpdateLiveMode"
          @share="shareDialogOpen = true"
          @merge="handleMergeRequest"
          @refresh-table="handleRefreshTable"
          @undo="handleUndo"
          @redo="handleRedo"
          @format-sql="handleFormatSqlAction"
          @translate="handleTranslate"
          @explain-query="handleExplainQuery"
          @load-query="handleLoadQuery"
          @export-chat="handleExportChat"
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
          @update:input="handleUpdateInput"
          @submit="run"
          @save-query="handleSaveFormulaQuery"
          @save-status="saveStatus = $event"
          @create-chat="handleCreateChat"
          @add-to-dashboard="handleAddChartToDashboard"
        />
      </section>

      <!-- Results Panel -->
      <ResultsPanel
        :visible="resultsPanelVisible"
        :position="resultsPanelPosition"
        :locked-position="mode === 'spreadsheet'"
        :result="queryResult"
        :error="queryError"
        :last-query="lastQuery"
        :history="queryHistory"
        :loading="isExecuting"
        :is-analyzing="isAnalyzing"
        :ambiguity="ambiguity || undefined"
        @update:position="resultsPanelPosition = $event"
        @close="resultsPanelVisible = false"
        @cancel="stopExecution"
        @analyze="handleAnalyze"
        @resolve-ambiguity="handleResolveAmbiguity"
        @create-dashboard-element="handleCreateDashboardElement"
        @open-spreadsheet="() => handleOpenSpreadsheet(queryResult)"
        @sanitize="handleSanitize"
        :has-recommendation="hasRecommendation"
        :settings="settings"
        :analysis="lastAssistantMessage?.meta"
      />

      <DialogManager
        :connection-id="selectedConnectionId"
        :last-query="lastQuery"
        :results="Array.isArray(queryResult) ? queryResult : []"
        @resolve-ambiguity="handleResolveAmbiguity"
        @continue-chat="handleContinueChat"
        @save-dashboard="toast.success('Added to dashboard')"
        @execute-sanitize="executeSanitization"
        @apply-mutation="handleApplyMutation"
      />

       <DiffView
        v-model:open="diffViewVisible"
        v-if="privateMode && workspaceRef?.getEngineForTab(workspaceRef?.activeTabId)"
        :private-engine="workspaceRef.getEngineForTab(workspaceRef.activeTabId)"
        @confirm-merge="handleConfirmMerge"
      />
      
      <PresenceCounter v-if="aiMode" />
      
      <!-- Preview Modals -->
      <!-- Preview Modals -->
      <DashboardElementPreview
        v-model:open="dashboardPreviewVisible"
        :initial-config="dashboardPreviewConfig"
        :query="lastQuery"
        :connection-id="selectedConnectionId"
        :results="Array.isArray(queryResult) ? queryResult : []"
        @saved="toast.success('Element saved')"
      />
       <AmbiguityDialog
        v-model:open="ambiguityDialogVisible"
        :ambiguity="ambiguity"
        @resolve="handleResolveAmbiguity"
      />
      <SanitizePreviewDialog
        v-model:open="sanitizeDialogVisible"
        :table="sanitizeTable"
        :connection-id="selectedConnectionId"
        :issues="[]"
        @execute-fix="executeSanitization"
      />
      
      <UnsavedTabsDialog
        v-model:open="unsavedDialogVisible"
        :target-connection-name="pendingConnectionName"
        @move="handleMigrate"
        @discard="handleDiscard"
      />

      <!-- Share Dialog -->
      <ShareDialog
        v-model:open="shareDialogOpen"
        :spreadsheet-id="activeTableName"
        resource-type="spreadsheet"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from '@/composables/useNotifications'
import { storeToRefs } from 'pinia'
import { toRef } from 'vue'
import ChatSidebar from '@/components/Chat/ChatSidebar.vue'
import ChatToolbar from '@/components/Chat/ChatToolbar.vue'
import Workspace from '@/components/Workspace/Workspace.vue'
import ResultsPanel from '@/components/Chat/ResultsPanel.vue'
import AmbiguityDialog from '@/components/Chat/AmbiguityDialog.vue'
import SanitizePreviewDialog from '@/components/Chat/SanitizePreviewDialog.vue'
import DashboardElementPreview from '@/components/Dashboard/DashboardElementPreview.vue'
import DialogManager from '@/components/Chat/DialogManager.vue'
import DiffView from '@/components/TableView/DiffView.vue'
import PresenceCounter from '@/components/PresenceCounter.vue'
import UnsavedTabWarning from '@/components/Workspace/UnsavedTabWarning.vue'
import UnsavedTabsDialog from '@/components/Workspace/UnsavedTabsDialog.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatStore } from '@/stores/chat'
import { useConnectionStore } from '@/stores/connection'
import { useChatDialogs } from '@/composables/useChatDialogs'
import { useChat } from '@/composables/useChat'
import { useChatExecution } from '@/composables/useChatExecution'
import { useChatToolbar } from '@/composables/useChatToolbar'
import { useTableActions } from '@/composables/useTableActions'
import { useProgress } from '@/lib/progress'
import { getAuthHeaders } from '@/lib/apiClient'
import { buildConnectionPayload } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { QUERY_API_URL, fetchQueries, fetchSettings, getAIModels, analyzeResults, saveQuery, saveMessage } from '@/lib/api'
import { generateKey, decryptData } from '@/lib/crypto'
import { db } from '@/lib/local-db'
import { sanitizeAIResponse } from '@/lib/ai-response-sanitizer'
import { useSpreadsheetCollaboration } from '@/composables/useSpreadsheetCollaboration'
import ShareDialog from '@/components/Dashboard/ShareDialog.vue'

// Stores
const workspaceStore = useWorkspaceStore()
const { tabs: workspaceTabs } = storeToRefs(workspaceStore)
const chatStore = useChatStore()
// Connection state from store (synced manually to avoid type issues with template)
const connectionStore = useConnectionStore()
const connections = ref<ConnectionEntry[]>([])
const selectedConnection = ref<ConnectionEntry | null>(null)
const selectedConnectionId = ref<string>('')

watch(() => connectionStore.connections, (val) => { connections.value = val as any }, { immediate: true })
watch(() => connectionStore.selectedConnection, (val) => { selectedConnection.value = val as any }, { immediate: true })
watch(() => connectionStore.selectedConnectionId, (val) => { selectedConnectionId.value = val as any }, { immediate: true })

const loadConnections = () => connectionStore.loadConnections()
const _selectConnection = (id: string) => connectionStore.selectConnection(id)

// Wrapper to handle workspace persistence
const unsavedDialogVisible = ref(false)
const pendingConnectionId = ref<string | null>(null)
const pendingConnectionName = computed(() => 
    connections.value.find(c => c.id === pendingConnectionId.value)?.nickname
)

const handleSelectConnection = async (id: string | null) => {
    // If we're deselecting/collapsing (id is null or empty)
    if (!id) {
        await _selectConnection('')
        return
    }
    
    // Seamless switch: auto-save current workspace and load the new one
    await workspaceStore.switchConnection(id)
    await _selectConnection(id)
}

// Deprecated: No longer needed with connection-scoped tabs
const handleMigrate = async () => {
    console.warn('[Chat] handleMigrate is deprecated')
}

const handleDiscard = async () => {
    console.warn('[Chat] handleDiscard is deprecated')
}



const handleBannerMigrate = () => {
    if (!sidebarOpen.value) sidebarOpen.value = true
    toast.info('Select a connection from the sidebar to migrate your work.')
}

const {
  chats,
  selectedChatId,
  chatHistory,
  loadChats,
  createChat,
  selectChat,
  continueChat,
} = useChat()

const {
  previewVisible,
  previewChat,
  previewMessages,
  dashboardPreviewVisible,
  dashboardPreviewConfig,
  sanitizeDialogVisible,
  sanitizeTable,
  openDashboardPreview,
} = useChatDialogs()

// Local State
const mode = ref<'chat' | 'write' | 'spreadsheet'>('chat')
const chatInput = ref('')
const writeInput = ref('')
const workspaceRef = ref<any>(null)
const resultsPanelVisible = ref(false)
const resultsPanelPosition = ref<'bottom' | 'right'>('bottom')
// Flags
const aiMode = ref(false)
const autoExecute = ref(false)
const privateMode = ref(false)
const saveStatus = ref<'saved' | 'saving' | 'error'>('saved')
// Options
const aiOptions = ref({ model: null as string | null, temperature: 0.7 })
const queryOptions = ref({ limit: 1000, timeout: 30000, autoCommit: true })
const encryptionKey = ref<any>('') 
const availableModels = ref<any[]>([])
const settings = ref<any>(null)

// Collaboration state
const liveMode = ref(false)
const shareDialogOpen = ref(false)
const activeTableName = computed(() => {
    const tab = (workspaceStore.activeTab as any)?.value ?? workspaceStore.activeTab
    return tab?.type === 'table' ? tab.tableName : null
})

const {
    collaborators,
    collaboratorCount,
    broadcastCellFocus,
    broadcastCellEdit,
    incomingCellEdit
} = useSpreadsheetCollaboration(activeTableName, liveMode)

const handleUpdateLiveMode = (val: boolean) => {
    liveMode.value = val
    if (val) {
        toast.info('Live mode enabled. Other collaborators can now join.')
    } else {
        toast.info('Live mode disabled.')
    }
}
const queryHistory = ref<any[]>([])

// --- Composable Logic Integration ---

// Toolbar
// Toolbar
const {
    handleExport,
    handleFormat,
    handleUndo,
    handleRedo,
    handleFormatSql,
    handleTranslate: translateAction,
    handleExplain: explainAction
} = useChatToolbar(workspaceRef, selectedConnection)

// Override handleVisualize to properly open the visualization dialog
const handleVisualize = async () => {
    // Get data from the current spreadsheet
    const engine = workspaceRef.value?.getEngineForTab?.(workspaceRef.value?.activeTabId)
    if (!engine) {
        toast.error('No spreadsheet data available', { description: 'Open a spreadsheet tab first' })
        return
    }
    
    const data = engine.getDataAsObjects?.() as Record<string, any>[] | undefined
    if (!data || data.length === 0) {
        toast.error('Spreadsheet is empty', { description: 'Add some data first' })
        return
    }
    
    // Generate a simple default visualization config
    const firstRow = data[0]!
    const columns = Object.keys(firstRow)
    const numericColumns = columns.filter((col: string) => 
        data.some((row: Record<string, any>) => typeof row[col] === 'number' || !isNaN(parseFloat(row[col])))
    )
    const categoryColumn = columns.find((col: string) => 
        data.some((row: Record<string, any>) => typeof row[col] === 'string' && isNaN(parseFloat(row[col])))
    ) || columns[0] || 'Category'
    
    const valueColumn = numericColumns[0] || columns[1] || columns[0] || 'Value'
    
    const config = {
        type: 'bar',
        title: `${valueColumn} by ${categoryColumn}`,
        config: {
            data: {
                labels: data.slice(0, 50).map((r: Record<string, any>) => String(r[categoryColumn] || '')),
                datasets: [{
                    label: valueColumn,
                    data: data.slice(0, 50).map((r: Record<string, any>) => {
                        const val = r[valueColumn]
                        return typeof val === 'number' ? val : parseFloat(val) || 0
                    }),
                    backgroundColor: [
                        'hsl(258, 45%, 65%)',
                        'hsl(195, 40%, 60%)',
                        'hsl(155, 30%, 55%)',
                        'hsl(30, 30%, 60%)',
                        'hsl(350, 30%, 65%)',
                        'hsl(180, 25%, 50%)',
                        'hsl(280, 25%, 60%)',
                        'hsl(215, 15%, 50%)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'bottom' }
                }
            }
        }
    }
    
    openDashboardPreview(config)
}

const canUndo = computed(() => workspaceRef.value?.canUndo ?? false)
const canRedo = computed(() => workspaceRef.value?.canRedo ?? false)

const handleFormatSqlAction = () => {
    if (mode.value === 'write') {
        writeInput.value = handleFormatSql(writeInput.value)
    }
}

const handleTranslate = async () => {
    const query = mode.value === 'write' ? writeInput.value : chatInput.value
    const translated = await translateAction(query)
    if (translated) {
        if (mode.value === 'write') writeInput.value = translated
        else chatInput.value = translated
    }
}

const handleExplainQuery = async () => {
    const query = mode.value === 'write' ? writeInput.value : lastQuery.value
    await explainAction(query)
}

const handleExportChat = () => {
    const content = chatHistory.value.map(m => `${m.role.toUpperCase()}:\n${m.content}\n`).join('\n---\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-export-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
}

// Execution
const {
    isExecuting,
    queryResult,
    queryError,
    lastQuery, 
    run,
    stopExecution,
    handleAIGenerate,
    handleCreateDashboardElement
} = useChatExecution(
    mode,
    chatInput,
    writeInput,
    selectedChatId,
    selectedConnection,
    chatHistory,
    resultsPanelVisible,
    dashboardPreviewConfig,
    dashboardPreviewVisible,
    { aiOptions, encryptionKey, createChat }
)

// Table Actions
const {
    handleRefreshTable,
    handleEditTable,
    handleSanitizeFixed,
    handleSanitize,
    handleOpenSpreadsheet,
    handleLoadTableToSheet,
    executeSanitization
} = useTableActions(
   workspaceRef,
   selectedConnection,
   mode as unknown as Ref<"chat" | "write" | "spreadsheet">,
   lastQuery, 
   sanitizeTable,
   sanitizeDialogVisible
)

// --- Local Adapters & Missing Logic ---

const sidebarOpen = ref(true)
const sidebarSide = ref<'left' | 'right'>('left')
const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value
    sidebarSide.value = sidebarOpen.value ? (sidebarSide.value === 'left' ? 'right' : 'left') : sidebarSide.value
}

const handleEditTableWrapper = (conn: any, table: string) => {
    // If conn is provided, we use it, otherwise fallback to selectedConnection
    const connection = conn || selectedConnection.value
    if (!connection) return
    if (workspaceRef.value?.openTable) {
        workspaceRef.value.openTable(table, connection, connection.provider || 'sqlite')
    }
}

const clear = () => {
    if (mode.value === 'chat') chatInput.value = ''
    else writeInput.value = ''
    queryError.value = ''
    queryResult.value = null
    lastQuery.value = ''
}

const handleToggleAIMode = () => { aiMode.value = !aiMode.value }
const handleMergeRequest = () => { diffViewVisible.value = true }
const diffViewVisible = ref(false)
const handleConfirmMerge = async () => {
    // Logic to merge private branch to main
    const engine = workspaceRef.value?.getEngineForTab(workspaceRef.value.activeTabId)
    if (engine && engine.parentBranch) {
        const parent = engine.parentBranch
        await parent.mergeBranch(engine)
        privateMode.value = false
        diffViewVisible.value = false
        toast.success('Merged changes to live dashboard')
        workspaceRef.value?.refreshCurrentTable?.()
    } else {
        toast.error('Cannot merge: Not in a private branch')
    }
}

// Input Binding Adapter
const currentInput = computed({
    get: () => mode.value === 'chat' ? chatInput.value : writeInput.value,
    set: (val) => {
        if (mode.value === 'chat') chatInput.value = val
        else writeInput.value = val
    }
})

const lastAssistantMessage = computed(() => {
    const aiMessages = chatHistory.value.filter(m => m.role === 'assistant')
    return aiMessages.length > 0 ? aiMessages[aiMessages.length - 1] : null
})

const handleApplyMutation = async (mutation: any) => {
    if (!selectedConnection.value) {
        toast.error('No connection selected')
        return
    }
    isExecuting.value = true
    const timestamp = Date.now()
    try {
        const payload = buildConnectionPayload(selectedConnection.value as ConnectionEntry)
        const res = await fetch(`${import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'}/query`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                provider: selectedConnection.value.provider,
                connection: payload,
                query: mutation.query,
                source: 'ai_mutation'
            })
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error)

        queryResult.value = body.result
        lastQuery.value = typeof mutation.query === 'string' ? mutation.query : JSON.stringify(mutation.query)
        
        chatHistory.value.push({ 
            role: 'assistant', 
            content: `Mutation executed successfully: ${mutation.confirmation}`, 
            timestamp: Date.now() 
        })
        
        toast.success('Mutation successful')
        workspaceRef.value?.refreshCurrentTable?.()
    } catch (e: any) {
        toast.error('Mutation failed', { description: e.message })
    } finally {
        isExecuting.value = false
    }
}
const handleUpdateInput = (val: string) => {
    if (mode.value === 'chat') chatInput.value = val
    else writeInput.value = val
}

const loadQueries = async () => {
    try {
        queryHistory.value = await fetchQueries() as any[]
    } catch (e) {
        console.error('Failed to load queries', e)
    }
}

// Handle adding chart from ChatEditor to dashboard
const handleAddChartToDashboard = (chartConfig: any) => {
    console.log('[Chat] Adding chart to dashboard:', chartConfig)
    
    // Convert chat chart config to dashboard preview format
    dashboardPreviewConfig.value = {
        type: chartConfig.type || 'bar',
        title: chartConfig.title || 'Chart from Chat',
        config: {
            data: chartConfig.data,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true }
                }
            }
        }
    }
    dashboardPreviewVisible.value = true
}

const handleCreateChat = async () => {
    // Reuse empty chat tab if possible
    const activeTab = (workspaceStore as any).activeTab
    const isReusable = activeTab && activeTab.type === 'chat' && !activeTab.data?.chatId && (!activeTab.data?.chatHistory || activeTab.data.chatHistory.length === 0)

    if (isReusable) {
        // Reset
        selectedChatId.value = ''
        chatHistory.value = []
        chatInput.value = ''
        mode.value = 'chat'
        return
    }
    // Create new
    workspaceStore.createTab('chat', { chatHistory: [] })
}

const handleContinueChat = async (id: string) => {
    try {
        await continueChat(id)
        toast.success('Chat history loaded into new tab')
    } catch (e) {
        toast.error('Failed to load chat history')
    }
}

const handleLoadQuery = async (query: string) => {
    // Check if formula
    const isFormulaFormat = /^[^:]+:\s*=/.test(query) || query.trim().startsWith('=')
    // Formula logic
    if (isFormulaFormat) {
        mode.value = 'spreadsheet'
        aiMode.value = true
        await nextTick()
        let formula = query
        const match = query.match(/^[^:]+:\s*(.+)$/)
        if (match && match[1]) formula = match[1]
        
        if (workspaceRef.value?.setFormulaBarValue) {
            workspaceRef.value.setFormulaBarValue(formula)
        }
        toast.success('Formula loaded')
    } else {
        // SQL
        workspaceStore.createTab('query', { content: query, label: 'Query' })
        await nextTick()
        writeInput.value = query
        toast.success('Query loaded')
    }
}

const handleSaveFormulaQuery = async (query: string) => {
    if (!selectedConnection.value) return
    try {
        await saveQuery(query, 'user', 'success', selectedConnection.value.id)
        toast.success('Query saved')
    } catch (e) { console.error(e) }
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
    const response = await fetch(`${QUERY_API_URL}/update-table`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Should use getAuthHeaders if available
      credentials: 'include',
      body: JSON.stringify({
        connection: buildConnectionPayload(conn),
        tableName,
        data
      }),
    })

    if (!response.ok) throw new Error('Failed to save data')
    finishOperation(opId)
    saveStatus.value = 'saved'
    toast.success('Changes saved')
  } catch (e: any) {
    failOperation(opId, e.message || 'Failed to save')
    saveStatus.value = 'error'
    toast.error('Failed to save changes')
  }
}

// AI Analysis Wrapper (if strict compatibility needed for ResultsPanel events)
const isAnalyzing = ref(false)
const ambiguity = ref<{ message: string; choices: string[]; reasoning?: string } | null>(null)
const ambiguityDialogVisible = ref(false)
const hasRecommendation = ref(false) 
// Note: hasRecommendation logic is split between useChatExecution (dashboardPreview) and here?
// useChatExecution manages dashboardPreviewConfig. 
// ResultsPanel uses :has-recommendation prop. 
// We should expose dashboardPreviewConfig status.
watch(dashboardPreviewConfig, (cfg) => { hasRecommendation.value = !!cfg })

const handleAnalyze = async () => {
    if (!queryResult.value || !lastQuery.value) return
    isAnalyzing.value = true
    try {
        const userQuestion = chatInput.value || 'Analyze these query results'
        const analysis = await analyzeResults(userQuestion, Array.isArray(queryResult.value) ? queryResult.value : [queryResult.value], lastQuery.value)
        let aiSummary = typeof analysis === 'object' && analysis.answer ? analysis.answer : (typeof analysis === 'string' ? analysis : JSON.stringify(analysis))
        aiSummary = sanitizeAIResponse(aiSummary)
        
        chatHistory.value.push({ role: 'assistant', content: aiSummary, timestamp: Date.now() })
        if (selectedChatId.value) await saveMessage(selectedChatId.value, 'ai', aiSummary)
        toast.success('Analysis added to chat')
    } catch(e) {
        toast.error('Analysis failed')
    } finally {
        isAnalyzing.value = false
    }
}

const handleResolveAmbiguity = (choice: string) => {
    chatInput.value = `${chatInput.value} (Clarification: ${choice})`
    ambiguity.value = null
    ambiguityDialogVisible.value = false
    run()
}

// Watchers
watch([queryResult, queryError], () => {
    if (queryResult.value || queryError.value) resultsPanelVisible.value = true
})

// Force results panel to the right when in spreadsheet mode
watch(mode, (newMode) => {
    if (newMode === 'spreadsheet') {
        resultsPanelPosition.value = 'right'
    }
}, { immediate: true })

// Sync mode with active tab type for reactive toolbar updates
watch(
    () => {
        // Access the underlying value from the computed ref
        const tab = (workspaceStore.activeTab as any)?.value ?? workspaceStore.activeTab
        return tab ? { type: tab.type, id: tab.id } : null
    },
    (activeTabInfo) => {
        if (!activeTabInfo) return
        
        // Map tab type to mode
        if (activeTabInfo.type === 'table' || activeTabInfo.type === 'spreadsheet') {
            if (mode.value !== 'spreadsheet') {
                mode.value = 'spreadsheet'
            }
        } else if (activeTabInfo.type === 'query') {
            if (mode.value !== 'write') {
                mode.value = 'write'
            }
        } else if (activeTabInfo.type === 'chat') {
            if (mode.value !== 'chat') {
                mode.value = 'chat'
            }
        }
    },
    { immediate: true }
)

onMounted(async () => {
    setTimeout(async () => { await connectionStore.loadConnections() }, 0)
    window.addEventListener('pegasus:connections-updated', loadConnections)
    await loadChats()
    await loadQueries()
    const key = await generateKey()
    encryptionKey.value = key
    
    // Load Settings & Models
    try {
        settings.value = await fetchSettings()
        const models = await getAIModels()
        if (settings.value.enabledModels?.length) {
            availableModels.value = models.filter((m: any) => settings.value.enabledModels.includes(m.id))
        } else {
            availableModels.value = models
        }
        if (availableModels.value.length && !aiOptions.value.model) aiOptions.value.model = availableModels.value[0].id
    } catch (e) { console.warn(e) }
    
    // Initialize temporary workspace
    await workspaceStore.loadWorkspace('temp')
})

onBeforeUnmount(() => {
    window.removeEventListener('pegasus:connections-updated', loadConnections)
})

</script>
