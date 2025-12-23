<template>
  <div class="flex w-full h-full text-stone-100 overflow-hidden">
    <!-- Spreadsheet Sidebar -->
    <ChatSidebar 
      v-show="sidebarOpen" 
      :side="sidebarSide" 
      :connections="connections"
      :selected-connection-id="selectedConnectionId"
      @update:selected-connection-id="selectConnection"
      @toggle="toggleSidebar" 
      @edit-table="handleEditTable"
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
        mode="spreadsheet"
        :connections="connections"
        :selected-connection-id="selectedConnectionId"
        :save-status="saveStatus"
        @update:mode="handleModeChange"
        @update:selected-connection-id="selectConnection"
        @load-table-to-sheet="handleLoadTable"
        @export="handleExport"
        @refresh-table="handleRefreshTable"
      />

      <!-- Spreadsheet Workspace -->
      <Workspace
        ref="workspaceRef"
        class="flex-1 min-h-0"
        mode="spreadsheet"
        @save-status="saveStatus = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import ChatSidebar from '@/components/Chat/ChatSidebar.vue'
import ChatToolbar from '@/components/Chat/ChatToolbar.vue'
import Workspace from '@/components/Workspace/Workspace.vue'
import { useSpreadsheet } from '@/composables/useSpreadsheet'
import { useConnections } from '@/composables/useConnections'
import { useProgress } from '@/lib/progress'

const route = useRoute()
const router = useRouter()

// Composables
const {
  excelData,
  excelDataLoading,
  excelEditorRef,
  saveStatus,
  currentTable,
  currentConnection,
  loadTableData,
  saveTableData,
  exportData,
  refreshTableData,
  clearData
} = useSpreadsheet()

const {
  connections,
  selectedConnectionId,
  loadConnections,
  selectConnection
} = useConnections()

// Local state
const sidebarOpen = ref(true)
const sidebarSide = ref<'left' | 'right'>('left')
const workspaceRef = ref<any>(null)

// Sidebar
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function handleModeChange(mode: string) {
  if (mode === 'chat') {
    router.push('/chat/conversation')
  } else if (mode === 'write') {
    router.push('/chat/query')
  }
}

// Table operations
async function handleLoadTable(tableName?: string) {
  const table = tableName || route.query.table as string
  if (!table) {
    toast.error('Please select a table')
    return
  }

  const connection = connections.value.find(c => c.id === selectedConnectionId.value)
  if (!connection) {
    toast.error('Please select a connection')
    return
  }

  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = `load-table-${table}`
  startOperation(opId, `Loading table ${table}...`)

  try {
    await loadTableData(table, connection)
    finishOperation(opId)
    toast.success(`Table ${table} loaded`)
  } catch (e: any) {
    failOperation(opId, e.message || 'Failed to load table')
    toast.error(e.message || 'Failed to load table')
  }
}

async function handleEditTable(conn: any, table: string) {
  // Update connection if different
  if (conn.id !== selectedConnectionId.value) {
    selectConnection(conn.id)
  }
  
  // Load the table
  await handleLoadTable(table)
}

async function handleRefreshTable() {
  if (!currentTable.value) {
    toast.error('No table loaded')
    return
  }

  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = 'refresh-table'
  startOperation(opId, 'Refreshing table...')

  try {
    await refreshTableData()
    finishOperation(opId)
    toast.success('Table refreshed')
  } catch (e: any) {
    failOperation(opId, e.message || 'Failed to refresh')
    toast.error(e.message || 'Failed to refresh table')
  }
}

async function handleExport(format: 'csv' | 'xlsx') {
  if (!currentTable.value) {
    toast.error('No table loaded')
    return
  }

  const { startOperation, finishOperation, failOperation } = useProgress()
  const opId = 'export-table'
  startOperation(opId, `Exporting as ${format.toUpperCase()}...`)

  try {
    await exportData(format)
    finishOperation(opId)
    toast.success(`Exported as ${format.toUpperCase()}`)
  } catch (e: any) {
    failOperation(opId, e.message || 'Export failed')
    toast.error(e.message || 'Failed to export')
  }
}

// Lifecycle
onMounted(async () => {
  await loadConnections()
  
  // Check if we should load a table from query params
  const table = route.query.table as string
  const connectionId = route.query.connection as string
  
  if (table && connectionId) {
    selectConnection(connectionId)
    await handleLoadTable(table)
  }
})
</script>
