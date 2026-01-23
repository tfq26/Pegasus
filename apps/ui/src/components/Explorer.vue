<script setup lang="ts">
import { ref, toRefs, computed, onMounted, watch } from 'vue'
import { toast } from '@/composables/useNotifications'
import { 
  Database, Plus, Trash, Search, Sparkles, FolderOpen, Lock, Unlock,
  FileText, Notebook, FileUp, StickyNote
} from 'lucide-vue-next'
import { useStorage } from '@vueuse/core'
import { isTauri } from '@/composables/usePlatform'

// UI Components
import AddConnectionModal from '@/components/AddConnectionModal.vue'
import AddTableToConnectionModal from './Explorer/AddTableToConnectionModal.vue'
import ExplorerTree from './Explorer/ExplorerTree.vue'
import ChatHistoryList from './Explorer/ChatHistoryList.vue'
import QueryLogList from './Explorer/QueryLogList.vue'
import SpaceSelector from './Explorer/SpaceSelector.vue'
import { useSpaceStore } from '@/stores/space'
import { useConnectionStore } from '@/stores/connection'

const connectionStore = useConnectionStore()

// Add state for selected table
const selectedTable = ref<{ connectionId: string; tableName: string } | null>(null)
const selectedItems = ref<{ type: string, id: string, connectionId?: string, tableName?: string }[]>([])

const handleHealthCheck = async (conn: ConnectionEntry) => {
   try {
     const { refreshConnectionSchema } = useExplorerSchema(ref([conn]))
     await refreshConnectionSchema(conn)
     toast.success('Connection healthy', { description: `${conn.nickname} is active` })
   } catch (err: any) {
     toast.error('Connection failed', { description: err.message || String(err) })
   }
}
import DataViewerModal from './Explorer/DataViewerModal.vue'
import RenameTableDialog from './Explorer/RenameTableDialog.vue'
import AIReportDialog from './Explorer/AIReportDialog.vue'
import GenerateTestDataDialog from '@/components/GenerateTestDataDialog.vue' // Import Dialog
import { useLocalFile } from '@/composables/useLocalFile'

// UI Parts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Composables & Libs
import { useExplorerSchema } from '@/composables/useExplorerSchema'
import { useDataViewer } from '@/composables/useDataViewer'
import type { ConnectionEntry } from '@/lib/db-connections'
import { 
  deleteChat, clearAllChats, 
  deleteConnection as apiDeleteConnection,
  renameTable as apiRenameTable,
  deleteTable as apiDeleteTable,
  deleteQuery as apiDeleteQuery,
  clearAllQueries as apiClearAllQueries,
  explainTable,
  createSpaceNote,
  createSpaceFile,
  uploadFile,
  deleteSpaceFile,
  deleteSpaceNote,
  updateConnection,
  api
} from '@/lib/api'

const props = defineProps<{
  connections: ConnectionEntry[]
  selectedConnectionId: string
  chats?: any[]
  selectedChatId?: string
  queryHistory?: any[]
  isPinned?: boolean
}>()

const emit = defineEmits<{
  'update:selectedConnectionId': [value: string]
  'edit-table': [connection: ConnectionEntry, table: string]
  'create-chat': []
  'select-chat': [id: string]
  'load-query': [query: string]
  'sanitize-table': [connection: ConnectionEntry, table: string]
  'toggle-pin': []
  'select-note': [note: any]
  'select-file': [file: any]
}>()

// --- Data Spaces ---
const spaceStore = useSpaceStore()

onMounted(() => {
  spaceStore.loadSpaces()
  
  // Force refresh connections to ensure we have latest space assignments
  connectionStore.loadConnections(true)

  console.log('[Explorer] Mounted. Current Space:', spaceStore.currentSpaceId)
  watch(() => connections.value, (val) => {
     console.log('[Explorer] Connections:', val.map(c => ({ id: c.id, provider: c.provider, space: c.space })))
  }, { immediate: true })
})

// --- State & Composables ---
const { connections } = toRefs(props)
const { 
  connectionSchemas, 
  schemaFor, 
  refreshSchemas,
  refreshConnectionSchema
} = useExplorerSchema(connections)

const filteredConnections = computed(() => {
  // If no specific space context is loaded yet, show everything (safe fallback)
  if (!spaceStore.currentSpaceId) return connections.value

  const activeSpaceId = (spaceStore.currentSpaceId as any)?.split(':').pop()
  
  return connections.value.filter(conn => {
    // Show connections with no space assigned (legacy/global)
    if (!conn.space) return true
    
    const connSpaceId = (conn.space as any).split(':').pop()
    
    // 1. Strict Match: Connection belongs to currently selected space
    if (connSpaceId === activeSpaceId) return true

    // 2. Orphan Check: Connection belongs to a space that the user usually doesn't have access to
    // (e.g. a deleted space, or a ghost space from migration errors). 
    // If the space ID is NOT found in the user's space list, we treat it as Global/Unassigned so it's not lost.
    const allSpaces = spaceStore.allSpaces as unknown as any[];
    const spaceExists = allSpaces.some((s: any) => s.id.includes(connSpaceId))
    if (!spaceExists) return true

    return false
  })
})

const currentFiles = computed(() => spaceStore.currentSpaceFiles || [])
const currentNotes = computed(() => spaceStore.currentSpaceNotes || [])

const {
  viewer,
  zoomLevel,
  zoomClass,
  searchQuery,
  sortColumn,
  sortDirection,
  openViewer,
  loadPage,
  closeViewer,
  toggleSort,
  deleteRow,
  updateCell,
  reload
} = useDataViewer()

// Persistent Zoom State for the Modal
const persistentZoom = useStorage('pegasus-viewer-zoom', 1)
zoomLevel.value = persistentZoom.value

const sidebarTabs = ['data', 'chats', 'queries'] as const
const activeTab = ref<typeof sidebarTabs[number]>('data')
const addConnectionModalOpen = ref(false)
const addTableModalOpen = ref(false)
const connectionForAddTable = ref<ConnectionEntry | null>(null)

// --- Add Table to Connection Logic ---
const handleAddTable = (conn: ConnectionEntry) => {
  connectionForAddTable.value = conn
  addTableModalOpen.value = true
}

const onTableAdded = () => {
  // Specifically refresh the connection we just added to
  if (connectionForAddTable.value) {
    console.log('[Explorer] Refreshing schema for connection:', connectionForAddTable.value.id)
    refreshConnectionSchema(connectionForAddTable.value)
  }
  // Also do a general refresh to be safe
  refreshSchemas(true)
}

const renamingTable = ref<{ conn: ConnectionEntry; oldName: string; newName: string } | null>(null)

// --- Dynamic Add Logic ---
const currentContext = ref('db')
const handleDynamicAdd = () => {
    if (currentContext.value === 'files') handleUploadFile()
    else if (currentContext.value === 'notes') handleAddNote()
    else addConnectionModalOpen.value = true
}

const handleMoveConnection = async (conn: any, spaceId: string) => {
  try {
    await updateConnection({ ...conn, space: spaceId })
    // Update local connection object
    conn.space = spaceId
    // Access store array safely
    const spaces = (spaceStore.allSpaces as any)
    const spaceName = spaces.find ? spaces.find((s: any) => s.id === spaceId)?.name : 'Space' 
    toast.success(`Connection moved to ${spaceName || 'Space'}`)
  } catch (err: any) {
    toast.error('Failed to move connection', { description: err.message })
  }
}

const startRenameTable = (conn: ConnectionEntry, table: string) => {
  const schema = connectionSchemas.value[conn.id]
  const displayName = schema?.tableMetadata?.[table]?.displayName || table
  renamingTable.value = { conn, oldName: table, newName: displayName }
}

const confirmRename = async (newName: string) => {
  if (!renamingTable.value) return
  const affectedConn = renamingTable.value.conn
  try {
    await apiRenameTable(affectedConn, renamingTable.value.oldName, newName)
    toast.success('Table renamed successfully')
    renamingTable.value = null
    // Specifically refresh this connection to reflect changes instantly
    refreshSchemas(true) 
  } catch (err: any) {
    toast.error('Failed to rename table', { description: err.message })
  }
}

// --- Explain Table Logic ---
const aiReportOpen = ref(false)
const aiReportLoading = ref(false)
const aiReportTitle = ref('')
const aiReportContent = ref('')

const handleExplainTable = async (conn: ConnectionEntry, table: string) => {
  aiReportOpen.value = true
  aiReportLoading.value = true
  aiReportTitle.value = `Analysis: ${table}`
  aiReportContent.value = ''
  
  try {
    const res = await explainTable(conn.id, table)
    if (res.error) throw new Error(res.error)
    
    aiReportContent.value = res.explanation
  } catch (err: any) {
    toast.error('Failed to analyze table', { description: err.message })
    aiReportContent.value = `Error generating report: ${err.message}`
  } finally {
    aiReportLoading.value = false
  }
}

// --- Space Context Logic (Files & Notes) ---
const newNoteTitle = ref('')
const handleAddNote = async () => {
    if (!spaceStore.currentSpaceId) return
    try {
        const spaceId = spaceStore.currentSpaceId as any
        const note = await createSpaceNote(spaceId, {
            title: "New Note",
            content: "",
            note_type: "general"
        })
        await spaceStore.fetchSpaceContext()
        toast.success('Note created')
    } catch (e: any) {
        toast.error('Failed to create note', { description: e.message })
    }
}

const fileInput = ref<HTMLInputElement | null>(null)
const zipInput = ref<HTMLInputElement | null>(null)

const handleUploadFile = () => {
    fileInput.value?.click()
}

const onFileSelected = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file || !spaceStore.currentSpaceId) return

    try {
        toast.info(`Ingesting ${file.name}...`)
        
        const spaceId = (spaceStore.currentSpaceId as unknown) as string
        const result = await uploadFile(file, spaceId, true)
        
        if (result.success) {
            toast.success('File ingested and connection created')
            // Refresh both contexts
            await Promise.all([
                spaceStore.fetchSpaceContext(),
                connectionStore.loadConnections(true)
            ])
        } else {
            toast.error('Ingestion failed', { description: result.error })
        }

    } catch (e: any) {
        toast.error('Upload error', { description: e.message })
    } finally {
        target.value = '' // Reset
    }
}

const handleSelectNote = (note: any) => {
    emit('select-note', note)
}

const handleBulkDelete = async () => {
    if (!selectedItems.value.length) return
    
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.value.length} items?`)) return

    try {
        toast.info(`Deleting ${selectedItems.value.length} items...`)
        const res = await api.post<any>('/spaces/bulk-delete', { items: selectedItems.value })
        
        if (res.success && res.success.length > 0) {
            toast.success(`Deleted ${res.success.length} items`)
        }
        
        if (res.failed && res.failed.length > 0) {
            toast.error(`Failed to delete ${res.failed.length} items`)
        }

        // Refresh everything
        await Promise.all([
            spaceStore.fetchSpaceContext(),
            connectionStore.loadConnections(true)
        ])
        
        selectedItems.value = []
    } catch (e: any) {
        toast.error('Bulk delete failed', { description: e.message })
    }
}

const handleSelectFile = (file: any) => {
    emit('select-file', file)
}

// --- Delete File/Note Logic ---
const deleteFileConfirmationOpen = ref(false)
const fileToDelete = ref<any>(null)
const deleteNoteConfirmationOpen = ref(false)
const noteToDelete = ref<any>(null)

const handleDeleteFile = (file: any) => {
    fileToDelete.value = file
    deleteFileConfirmationOpen.value = true
}

const confirmDeleteFile = async () => {
    if (!fileToDelete.value) return
    try {
        await deleteSpaceFile(fileToDelete.value.id)
        toast.success('File deleted')
        await spaceStore.fetchSpaceContext()
        deleteFileConfirmationOpen.value = false
    } catch (err: any) {
        toast.error('Failed to delete file', { description: err.message })
    }
}

const handleDeleteNote = (note: any) => {
    noteToDelete.value = note
    deleteNoteConfirmationOpen.value = true
}

const confirmDeleteNote = async () => {
    if (!noteToDelete.value) return
    try {
        await deleteSpaceNote(noteToDelete.value.id)
        toast.success('Note deleted')
        await spaceStore.fetchSpaceContext()
        deleteNoteConfirmationOpen.value = false
    } catch (err: any) {
        toast.error('Failed to delete note', { description: err.message })
    }
}

// --- Delete Table Logic ---
const deleteDialogOpen = ref(false)
const tableToDelete = ref<{ conn: ConnectionEntry; table: string } | null>(null)

const handleDeleteTable = (conn: ConnectionEntry, table: string) => {
  tableToDelete.value = { conn, table }
  deleteDialogOpen.value = true
}

const confirmDeleteTable = async () => {
  if (!tableToDelete.value) return
  try {
    await apiDeleteTable(tableToDelete.value.conn, tableToDelete.value.table)
    toast.success('Table deleted')
    deleteDialogOpen.value = false
    refreshSchemas(true)
  } catch (err: any) {
    toast.error('Failed to delete table', { description: err.message })
  }
}

// --- Delete Connection Logic ---
const deleteConnectionDialogOpen = ref(false)
const connectionToDelete = ref<ConnectionEntry | null>(null)
const deleteConfirmationText = ref('')

const handleDeleteConnection = (conn: ConnectionEntry) => {
  connectionToDelete.value = conn
  deleteConfirmationText.value = ''
  deleteConnectionDialogOpen.value = true
}

const { openLocalFile, processing: openingFile } = useLocalFile()

const confirmDeleteConnection = async () => {
  if (!connectionToDelete.value) return
  
  // Only require confirmation text if the connection is locked
  if (connectionToDelete.value.isLocked && deleteConfirmationText.value !== connectionToDelete.value.nickname) {
    toast.error('Confirmation text does not match')
    return
  }

  try {
    await apiDeleteConnection(connectionToDelete.value.id)
    toast.success('Connection removed')
    deleteConnectionDialogOpen.value = false
    
    // Reactively update the connection store instead of full page reload
    const connStore = useConnectionStore()
    await connStore.loadConnections(true) // Force refresh from backend
  } catch (err: any) {
    toast.error('Failed to remove connection', { description: err.message })
  }
}

// --- Chat Logic ---
const deleteChatDialogOpen = ref(false)
const chatToDelete = ref<any>(null)
const clearAllChatsDialogOpen = ref(false)

const startDeleteChat = (chat: any) => {
  chatToDelete.value = chat
  deleteChatDialogOpen.value = true
}

const confirmDeleteChat = async () => {
  if (!chatToDelete.value) return
  try {
    await deleteChat(chatToDelete.value.id)
    toast.success('Deleted session')
    deleteChatDialogOpen.value = false
    // Emit event to parent to refresh chat list
    window.dispatchEvent(new CustomEvent('pegasus:chats-updated'))
  } catch (err: any) {
    toast.error('Failed to delete session', { description: err.message })
  }
}

const confirmClearAllChats = async () => {
  try {
    await clearAllChats()
    toast.success('History cleared')
    clearAllChatsDialogOpen.value = false
    // Emit event to parent to refresh chat list
    window.dispatchEvent(new CustomEvent('pegasus:chats-updated'))
  } catch (err: any) {
    toast.error('Failed to clear history', { description: err.message })
  }
}

// --- Query History Logic ---
const deleteQueryDialogOpen = ref(false)
const queryToDelete = ref<string | null>(null)
const clearQueriesDialogOpen = ref(false)

const handleShareQuery = (query: any) => {
  // For now, just copy to clipboard with a special message
  navigator.clipboard.writeText(query.query)
  toast.success('Query copied to clipboard', {
    description: 'Paste this to share with your team'
  })
}

const handleDeleteQuery = (id: string) => {
  queryToDelete.value = id
  deleteQueryDialogOpen.value = true
}

const confirmDeleteQuery = async () => {
  if (!queryToDelete.value) return
  try {
    await apiDeleteQuery(queryToDelete.value)
    toast.success('Query deleted')
    deleteQueryDialogOpen.value = false
    // Emit event to parent to refresh query list
    window.dispatchEvent(new CustomEvent('pegasus:queries-updated'))
  } catch (err: any) {
    toast.error('Failed to delete query', { description: err.message })
  }
}

const handleClearHistory = () => {
  clearQueriesDialogOpen.value = true
}

const confirmClearQueries = async () => {
  try {
    await apiClearAllQueries()
    toast.success('Query history cleared')
    clearQueriesDialogOpen.value = false
    // Emit event to parent to refresh query list
    window.dispatchEvent(new CustomEvent('pegasus:queries-updated'))
  } catch (err: any) {
    toast.error('Failed to clear queries', { description: err.message })
  }
}
// --- Generate Test Data ---
const generateDataDialogOpen = ref(false)
const generateDataConnectionId = ref('')
const generateDataTableName = ref('')

const handleGenerateData = (conn: ConnectionEntry, table: string) => {
    generateDataConnectionId.value = conn.id
    generateDataTableName.value = table
    generateDataDialogOpen.value = true
}

const onTestDataGenerated = (sql: string) => {
    // Open new query with SQL
    emit('load-query', sql)
    toast.success('SQL generated in Query Editor')
}

// ... rest of script ...
</script>

<template>
  <aside 
    class="flex flex-col h-full bg-background border-r border-border w-full"
  >
    <!-- Space Selector -->
    <SpaceSelector />

    <!-- Header -->
    <header class="p-4 border-b border-border">
      <div class="flex items-center justify-end">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border">
            <button
              v-for="tab in sidebarTabs"
              :key="tab"
              @click="activeTab = tab"
              class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
              :class="[
                activeTab === tab 
                  ? 'bg-purple-100/50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 shadow-sm ring-1 ring-purple-500/20' 
                  : 'text-muted-foreground hover:text-foreground'
              ]"
            >
              {{ tab }}
            </button>
          </div>
          
          <button 
            @click="emit('toggle-pin')"
            class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95"
            :title="isPinned ? 'Unlock Sidebar (Auto-hide)' : 'Lock Sidebar (Always show)'"
          >
            <Unlock v-if="!isPinned" class="w-3.5 h-3.5" />
            <Lock v-else class="w-3.5 h-3.5 text-purple-500" />
          </button>

          <button
              v-if="selectedItems.length > 0"
              @click="handleBulkDelete"
              class="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all active:scale-95 flex items-center gap-1.5"
              title="Delete Selected Items"
          >
              <Trash class="w-3.5 h-3.5" />
              <span class="text-[10px] font-bold">{{ selectedItems.length }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden relative flex flex-col">
      <!-- DATA TAB -->
      <section v-if="activeTab === 'data'" class="flex-1 h-full flex flex-col overflow-hidden">
         <div class="flex-1 overflow-hidden p-2">
             <ExplorerTree 
                :connections="filteredConnections"
                :files="(currentFiles as any)"
                :notes="(currentNotes as any)"
                :spaces="(spaceStore.allSpaces as any)"
                :selected-table="selectedTable"
                @select-connection="(conn: any) => emit('update:selectedConnectionId', conn.id)"
                @select-table="(conn: any, table: string) => { selectedTable = { connectionId: conn.id, tableName: table }; emit('edit-table', conn, table) }"
                @preview-table="openViewer"
                @rename-table="startRenameTable"
                @delete-table="handleDeleteTable"
                @explain-table="handleExplainTable"
                @generate-data="handleGenerateData"
                @delete-connection="handleDeleteConnection"
                @add-table="handleAddTable"
                @health-check="handleHealthCheck"
                
                @select-file="handleSelectFile"
                @select-note="handleSelectNote"
                @add-connection="addConnectionModalOpen = true"
                @upload-file="handleUploadFile"
                @add-file="handleUploadFile"
                @add-note="handleAddNote"
                @update:context="(c) => currentContext = c"
                @move-connection="handleMoveConnection"
                @delete-file="handleDeleteFile"
                @delete-note="handleDeleteNote"
                @selection-change="(items) => selectedItems = items"
                @delete-files="handleBulkDelete"
                @delete-notes="handleBulkDelete"
              />
         </div>
      </section>

      <!-- CHATS TAB -->
      <section v-if="activeTab === 'chats'" class="flex-1 overflow-y-auto p-3 scrollbar-hide">
        <ChatHistoryList 
          :chats="chats"
          :selected-chat-id="selectedChatId"
          @select-chat="(id) => emit('select-chat', id)"
          @create-chat="emit('create-chat')"
          @clear-all="clearAllChatsDialogOpen = true"
          @delete-chat="startDeleteChat"
        />
      </section>

      <!-- QUERIES TAB -->
      <section v-if="activeTab === 'queries'" class="flex-1 overflow-y-auto p-3 scrollbar-hide">
        <QueryLogList 
          :query-history="queryHistory"
          @load-query="(q) => emit('load-query', q)"
          @delete-query="handleDeleteQuery"
          @share-query="handleShareQuery"
          @clear-history="handleClearHistory"
        />
      </section>
    </div>

    <!-- Viewer & Dialogs -->
    <Teleport to="body">
      <DataViewerModal 
        :viewer="viewer"
        :zoom-level="zoomLevel"
        :zoom-classes="['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl']"
        :search-query="searchQuery"
        :sort-column="sortColumn"
        :sort-direction="sortDirection"
        @update:search-query="(v) => searchQuery = v"
        @close="closeViewer"
        @increase-zoom="() => zoomLevel < 4 && zoomLevel++"
        @decrease-zoom="() => zoomLevel > 0 && zoomLevel--"
        @toggle-sort="toggleSort"
        @page-change="loadPage"
        @limit-change="(limit) => loadPage(1, limit)"
        @delete-row="deleteRow"
        @update-cell="updateCell"
        @reload="reload"
      />

      <RenameTableDialog 
        :renaming-table="renamingTable"
        @cancel="renamingTable = null"
        @confirm="confirmRename"
      />

      <AIReportDialog 
        :open="aiReportOpen"
        :title="aiReportTitle"
        :content="aiReportContent"
        :loading="aiReportLoading"
        @update:open="(v) => aiReportOpen = v"
      />

      <AddTableToConnectionModal
        :open="addTableModalOpen"
        :connection="connectionForAddTable"
        @update:open="(v) => addTableModalOpen = v"
        @table-added="onTableAdded"
      />

      <GenerateTestDataDialog
        :open="generateDataDialogOpen"
        :connection-id="generateDataConnectionId"
        :table-name="generateDataTableName"
        @update:open="(v) => generateDataDialogOpen = v"
        @generated="onTestDataGenerated"
      />

      <!-- Delete Table Confirmation -->
      <Dialog :open="deleteDialogOpen" @update:open="(v) => !v && (deleteDialogOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-md rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Delete Table</DialogTitle>
                <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                  This action is permanent and cannot be undone.
                </DialogDescription>
              </div>
            </div>
            
            <p class="text-sm text-muted-foreground leading-relaxed pt-2">
              Are you sure you want to delete <span class="text-foreground font-code font-bold underline decoration-rose-500/30 underline-offset-4">{{ tableToDelete?.table }}</span>? All data associated with this table will be purged.
            </p>
          </div>

          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button 
              @click="deleteDialogOpen = false" 
              class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button 
              @click="confirmDeleteTable" 
              class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-950/20 transition-all active:scale-95"
            >
              Delete Table
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Delete Connection Confirmation -->
      <Dialog :open="deleteConnectionDialogOpen" @update:open="(v) => !v && (deleteConnectionDialogOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-md rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-5">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <Database class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Remove Connection</DialogTitle>
                <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                  Disconnecting from the database.
                </DialogDescription>
              </div>
            </div>
            
            <div class="space-y-4">
              <p class="text-sm text-muted-foreground leading-relaxed">
                You are about to remove <span class="text-foreground font-bold underline underline-offset-4 decoration-amber-500/30">{{ connectionToDelete?.nickname }}</span>. This will remove access in Pegasus but won't delete actual data.
              </p>
              
              <div v-if="connectionToDelete?.isLocked" class="space-y-2">
                <label class="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">Type nickname to confirm</label>
                <input 
                  v-model="deleteConfirmationText"
                  type="text"
                  :placeholder="connectionToDelete?.nickname"
                  class="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-medium"
                />
              </div>
            </div>
          </div>

          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button 
              @click="deleteConnectionDialogOpen = false" 
              class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button 
              @click="confirmDeleteConnection" 
              :disabled="connectionToDelete?.isLocked && deleteConfirmationText !== connectionToDelete?.nickname"
              class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg shadow-rose-950/20 transition-all active:scale-95"
            >
              Remove Connection
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Deleting Session Confirmation -->
      <Dialog :open="deleteChatDialogOpen" @update:open="(v) => !v && (deleteChatDialogOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Delete Session</DialogTitle>
                <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                  This cannot be undone.
                </DialogDescription>
              </div>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to delete this chat session?
            </p>
          </div>
          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button @click="deleteChatDialogOpen = false" class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmDeleteChat" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Clear All History Confirmation -->
      <Dialog :open="clearAllChatsDialogOpen" @update:open="(v) => !v && (clearAllChatsDialogOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Clear History</DialogTitle>
                <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                  All sessions will be lost.
                </DialogDescription>
              </div>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to clear your entire chat history?
            </p>
          </div>
          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button @click="clearAllChatsDialogOpen = false" class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmClearAllChats" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Clear All</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Delete Query Confirmation -->
      <Dialog :open="deleteQueryDialogOpen" @update:open="(v) => !v && (deleteQueryDialogOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-4">
             <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                  <Trash class="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle class="text-lg font-semibold leading-none">Delete Query</DialogTitle>
                  <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                     Remove this query from your history.
                  </DialogDescription>
                </div>
              </div>
              <p class="text-sm text-muted-foreground leading-relaxed">
                This action cannot be undone.
              </p>
          </div>
          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button @click="deleteQueryDialogOpen = false" class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmDeleteQuery" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Clear Queries Confirmation -->
      <Dialog :open="clearQueriesDialogOpen" @update:open="(v) => !v && (clearQueriesDialogOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
           <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Clear Query Log</DialogTitle>
                <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                  All saved queries will be deleted.
                </DialogDescription>
              </div>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to delete your entire query history?
            </p>
          </div>
          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button @click="clearQueriesDialogOpen = false" class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmClearQueries" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Clear All</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


        <AddConnectionModal 
        :open="addConnectionModalOpen"
        @update:open="(v) => addConnectionModalOpen = v"
        @connection-added="refreshSchemas"
      />

      <!-- Hidden File Input -->
      <input 
        type="file" 
        ref="fileInput" 
        class="hidden" 
        @change="onFileSelected"
      />

       <!-- Delete File Confirmation -->
       <Dialog :open="deleteFileConfirmationOpen" @update:open="(v) => !v && (deleteFileConfirmationOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
           <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Delete File</DialogTitle>
                <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                  This file will be permanently deleted.
                </DialogDescription>
              </div>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to delete <span class="font-bold text-foreground">{{ fileToDelete?.filename }}</span>?
            </p>
          </div>
          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button @click="deleteFileConfirmationOpen = false" class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmDeleteFile" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Delete File</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Delete Note Confirmation -->
      <Dialog :open="deleteNoteConfirmationOpen" @update:open="(v) => !v && (deleteNoteConfirmationOpen = false)">
        <DialogContent class="bg-card border-border text-foreground max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
           <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Delete Note</DialogTitle>
                <DialogDescription class="text-muted-foreground text-sm mt-1.5 font-medium">
                  This note will be permanently deleted.
                </DialogDescription>
              </div>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to delete <span class="font-bold text-foreground">{{ noteToDelete?.title }}</span>?
            </p>
          </div>
          <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3 px-6">
            <button @click="deleteNoteConfirmationOpen = false" class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmDeleteNote" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Delete Note</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Teleport>
  </aside>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
