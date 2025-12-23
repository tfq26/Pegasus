<template>
  <div class="flex w-full h-full text-stone-100 overflow-hidden">
    <!-- Query Sidebar -->
    <ChatSidebar 
      v-show="sidebarOpen" 
      :side="sidebarSide" 
      :connections="connections"
      :selected-connection-id="selectedConnectionId"
      :query-history="queryHistory"
      @update:selected-connection-id="selectConnection"
      @toggle="toggleSidebar" 
      @load-query="handleLoadQuery"
      @edit-table="handleEditTable"
      @sanitize-table="handleSanitizeTable"
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

    <!-- Main content area with results panel -->
    <div class="flex-1 flex overflow-hidden" :class="{ 'flex-col': resultsPanelPosition === 'bottom', 'flex-row': resultsPanelPosition === 'right' }">
      <!-- Editor workspace -->
      <section class="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
        <!-- Toolbar -->
        <ChatToolbar 
          mode="write"
          :connections="connections"
          :selected-connection-id="selectedConnectionId"
          :is-executing="isExecuting"
          :ai-options="aiOptions"
          :query-options="queryOptions"
          :available-models="availableModels"
          :ai-mode="aiMode"
          :auto-execute="autoExecute"
          @update:mode="handleModeChange"
          @update:selected-connection-id="selectConnection"
          @update:ai-options="aiOptions = $event"
          @update:query-options="queryOptions = $event"
          @update:auto-execute="autoExecute = $event"
          @run="handleExecuteQuery"
          @stop="stopExecution"
          @ai-generate="handleAIGenerate"
          @clear="clear"
          @format="handleFormat"
          @toggle-ai-mode="handleToggleAIMode"
          @visualize="handleVisualize"
          @sanitize="handleSanitize"
        />

        <!-- Query Editor -->
        <Workspace
          ref="workspaceRef"
          class="flex-1 min-h-0"
          mode="write"
          :input="currentInput || ''"
          :ai-mode="aiMode"
          :auto-execute="autoExecute"
          :is-thinking="isExecuting"
          @update:input="currentInput = $event"
          @submit="handleExecuteQuery"
          @save-query="handleSaveQuery"
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
        :is-analyzing="isAnalyzing"
        :ambiguity="ambiguity"
        :has-recommendation="hasRecommendation"
        :settings="settings"
        @update:position="resultsPanelPosition = $event"
        @close="resultsPanelVisible = false"
        @cancel="stopExecution"
        @analyze="handleAnalyze"
        @resolve-ambiguity="handleResolveAmbiguity"
        @create-dashboard-element="handleCreateDashboardElement"
        @open-spreadsheet="handleOpenSpreadsheet"
        @sanitize="handleSanitize"
      />
    </div>

    <!-- Ambiguity Dialog -->
    <AmbiguityDialog
      v-model:open="ambiguityDialogVisible"
      :ambiguity="ambiguity"
      @resolve="handleResolveAmbiguity"
    />

    <!-- Dashboard Preview -->
    <DashboardElementPreview
      v-model:open="dashboardPreviewVisible"
      :initial-config="dashboardPreviewConfig"
      :query="lastQuery"
      :results="Array.isArray(queryResult) ? queryResult : []"
      @saved="toast.success('Added to dashboard')"
    />

    <!-- Sanitize Preview -->
    <SanitizePreviewDialog 
      v-model:open="sanitizeDialogVisible"
      :issues="sanitizeIssues"
      :table="sanitizeTable"
      :connection-id="selectedConnectionId"
      @execute-fix="handleExecuteSanitization"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import ChatSidebar from '@/components/Chat/ChatSidebar.vue'
import ChatToolbar from '@/components/Chat/ChatToolbar.vue'
import Workspace from '@/components/Workspace/Workspace.vue'
import ResultsPanel from '@/components/Chat/ResultsPanel.vue'
import AmbiguityDialog from '@/components/Chat/AmbiguityDialog.vue'
import DashboardElementPreview from '@/components/Dashboard/DashboardElementPreview.vue'
import SanitizePreviewDialog from '@/components/Chat/SanitizePreviewDialog.vue'
import { useQuery } from '@/composables/useQuery'
import { useConnections } from '@/composables/useConnections'
import { useProgress } from '@/lib/progress'
import { saveQuery, sanitizeTable as apiSanitizeTable, recommendVisualization } from '@/lib/api'

const router = useRouter()

// Composables
const {
  queryResult,
  queryError,
  lastQuery,
  queryHistory,
  isExecuting,
  isAnalyzing,
  ambiguity,
  ambiguityDialogVisible,
  aiOptions,
  queryOptions,
  executeQuery,
  generateQuery,
  analyzeQueryResults,
  clearResults
} = useQuery()

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
const workspaceRef = ref<any>(null)
const resultsPanelVisible = ref(false)
const resultsPanelPosition = ref<'right' | 'bottom'>('right')

// AI options
const aiMode = ref(false)
const autoExecute = ref(false)
const availableModels = ref(['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus'])

// Dashboard & Sanitize
const dashboardPreviewVisible = ref(false)
const dashboardPreviewConfig = ref<any>(null)
const sanitizeDialogVisible = ref(false)
const sanitizeIssues = ref<any[]>([])
const sanitizeTable = ref('')

// Settings
const settings = ref({
  autoVisualize: true,
  showRecommendations: true
})

const hasRecommendation = computed(() => {
  return Array.isArray(queryResult.value) && queryResult.value.length > 0
})

// Sidebar
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function handleToggleAIMode() {
  aiMode.value = !aiMode.value
}

function handleModeChange(mode: string) {
  if (mode === 'chat') {
    router.push('/chat/conversation')
  } else if (mode === 'spreadsheet') {
    router.push('/chat/spreadsheet')
  }
}

// Query execution
async function handleExecuteQuery() {
  if (!currentInput.value.trim()) {
    toast.error('Please enter a query')
    return
  }

  const connection = connections.value.find(c => c.id === selectedConnectionId.value)
  if (!connection) {
    toast.error('Please select a connection')
    return
  }

  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = 'execute-query'
  startOperation(opId, 'Executing query...')

  try {
    await executeQuery(currentInput.value, connection, { aiMode: aiMode.value, autoExecute: autoExecute.value })
    resultsPanelVisible.value = true
    finishOperation(opId)
    toast.success('Query executed successfully')
  } catch (e: any) {
    failOperation(opId, e.message || 'Query failed')
    toast.error(e.message || 'Query execution failed')
  }
}

async function handleAIGenerate() {
  if (!currentInput.value.trim()) {
    toast.error('Please enter a prompt')
    return
  }

  const connection = connections.value.find(c => c.id === selectedConnectionId.value)
  if (!connection) {
    toast.error('Please select a connection')
    return
  }

  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = 'ai-generate'
  startOperation(opId, 'Generating query...')

  try {
    const query = await generateQuery(currentInput.value, connection)
    currentInput.value = query
    finishOperation(opId)
    toast.success('Query generated')
  } catch (e: any) {
    failOperation(opId, e.message || 'Generation failed')
    toast.error(e.message || 'Failed to generate query')
  }
}

function stopExecution() {
  isExecuting.value = false
  toast.info('Execution stopped')
}

function clear() {
  currentInput.value = ''
  clearResults()
  resultsPanelVisible.value = false
  toast.success('Cleared')
}

function handleFormat(type: string, value?: any) {
  // Format query logic
  toast.info('Format not implemented yet')
}

async function handleAnalyze() {
  try {
    await analyzeQueryResults()
    toast.success('Analysis complete')
  } catch (e: any) {
    toast.error(e.message || 'Analysis failed')
  }
}

function handleResolveAmbiguity(resolution: any) {
  ambiguityDialogVisible.value = false
  // Apply resolution
  toast.success('Ambiguity resolved')
}

async function handleVisualize() {
  if (!Array.isArray(queryResult.value) || queryResult.value.length === 0) {
    toast.error('No results to visualize')
    return
  }

  try {
    const recommendation = await recommendVisualization(lastQuery.value, queryResult.value)
    dashboardPreviewConfig.value = recommendation
    dashboardPreviewVisible.value = true
  } catch (e: any) {
    toast.error('Failed to generate visualization')
  }
}

function handleCreateDashboardElement(config: any) {
  dashboardPreviewConfig.value = config
  dashboardPreviewVisible.value = true
}

function handleOpenSpreadsheet() {
  router.push('/chat/spreadsheet')
}

async function handleSanitize() {
  toast.info('Sanitize not implemented yet')
}

function handleSanitizeTable(table: string) {
  sanitizeTable.value = table
  sanitizeDialogVisible.value = true
}

async function handleExecuteSanitization() {
  toast.info('Sanitization not implemented yet')
}

function handleLoadQuery(query: string) {
  currentInput.value = query
  toast.success('Query loaded')
}

function handleEditTable(conn: any, table: string) {
  // Navigate to spreadsheet with table
  router.push({
    path: '/chat/spreadsheet',
    query: { table, connection: conn.id }
  })
}

async function handleSaveQuery(query: string, type: 'formula') {
  try {
    await saveQuery(query, type)
    toast.success('Query saved')
  } catch (e) {
    toast.error('Failed to save query')
  }
}

// Lifecycle
onMounted(async () => {
  await loadConnections()
})
</script>
