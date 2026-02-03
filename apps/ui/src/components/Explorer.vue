<script setup lang="ts">
import { ref, toRefs, computed, onMounted, watch, unref } from 'vue'
import { toast } from '@/composables/useNotifications'
import { 
  Database, Plus, Trash, Search, Sparkles, FolderOpen, Lock, Unlock,
  FileText, Notebook, FileUp, StickyNote, RefreshCw,
  MoreHorizontal
} from 'lucide-vue-next'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStorage } from '@vueuse/core'
import { isTauri } from '@/composables/usePlatform'

// UI Components
import AddConnectionModal from '@/components/AddConnectionModal.vue'
import AddTableToConnectionModal from './Explorer/AddTableToConnectionModal.vue'
import ExplorerTree from './Explorer/ExplorerTree.vue'
import SpaceSelector from './Explorer/SpaceSelector.vue'
import ConfirmDialog from '@/components/Common/ConfirmDialog.vue'
import { useSpaceStore } from '@/stores/space'
import { useConnectionStore } from '@/stores/connection'
import { useSheetStore } from '@/stores/sheet'
import { useDashboardStore } from '@/stores/dashboard'

const connectionStore = useConnectionStore()
const sheetStore = useSheetStore()
const dashboardStore = useDashboardStore()

// Add state for selected table
const selectedTable = ref<{ connectionId: string; tableName: string } | null>(null)
const selectedItems = ref<{ type: string, id: string, connectionId?: string, tableName?: string }[]>([])
const isDeleteMode = ref(false)

// Explorer enhancements state
const searchFilter = ref('')
const isRefreshing = ref(false)

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
// UI Parts
// Dialog components removed as we use ConfirmDialog now

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
  'preview-chat': [id: string]
  'load-query': [query: string]
  'sanitize-table': [connection: ConnectionEntry, table: string]
  'toggle-pin': []
  'select-note': [note: any]
  'select-file': [file: any]
  'select-sheet': [sheet: any]
}>()

// --- Data Spaces ---
const spaceStore = useSpaceStore()

onMounted(() => {
  spaceStore.loadSpaces()
  sheetStore.loadSheets(unref(spaceStore.currentSpaceId) || '')
  
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
const currentSheets = computed(() => sheetStore.getAllSheets())

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

// --- Global Refresh Logic ---
const handleGlobalRefresh = async () => {
  isRefreshing.value = true
  try {
    await Promise.all([
      refreshSchemas(true),
      spaceStore.loadSpaces(),
      sheetStore.loadSheets(unref(spaceStore.currentSpaceId) || ''),
      connectionStore.loadConnections(true)
    ])
    toast.success('Refreshed', { description: 'All sources updated' })
  } catch (err: any) {
    toast.error('Refresh failed', { description: err.message })
  } finally {
    isRefreshing.value = false
  }
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

const handleAddNoteToDashboard = async (note: any) => {
  if (!dashboardStore.currentDashboard) {
    toast.error('No dashboard open', { description: 'Please open a dashboard to add this note to it.' })
    return
  }

  try {
    const element = {
      type: 'text',
      title: note.title,
      config: {
        content: note.content || ''
      },
      w: 6,
      h: 4
    }
    
    const dashboardId = (unref(dashboardStore.currentDashboard) as any)?.id
    if (!dashboardId) throw new Error('Dashboard ID not found')
    
    await dashboardStore.addElementToDashboard(dashboardId, element)
    toast.success('Note added to dashboard', { description: note.title })
  } catch (err: any) {
    toast.error('Failed to add note', { description: err.message })
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
    // Ensure we have a space selected
    if (!spaceStore.currentSpaceId) {
        toast.info('Selecting primary space...')
        await spaceStore.loadSpaces()
    }
    
    if (!spaceStore.currentSpaceId) {
        toast.error('No space selected', { description: 'Please create or select a space first.' })
        return
    }

    try {
        const spaceId = spaceStore.currentSpaceId as any
        const note = await createSpaceNote(spaceId, {
            title: "New Note",
            content: "",
            note_type: "general"
        })
        await spaceStore.fetchSpaceContext()
        toast.success('Note created')
        
        // Switch context to notes after creating one
        currentContext.value = 'notes'
    } catch (e: any) {
        toast.error('Failed to create note', { description: e.message })
    }
}

const fileInput = ref<HTMLInputElement | null>(null)
const zipInput = ref<HTMLInputElement | null>(null)

// --- Unified Confirm Dialog State ---
const confirmDialogState = ref<{
    open: boolean
    title: string
    description: string
    variant: 'destructive' | 'default'
    confirmText: string
    validationText?: string
    onConfirm: () => Promise<void>
    loading: boolean
}>({
    open: false,
    title: '',
    description: '',
    variant: 'destructive',
    confirmText: 'Confirm',
    validationText: undefined,
    onConfirm: async () => {},
    loading: false
})

const handleConfirmDialogConfirm = async () => {
    confirmDialogState.value.loading = true
    try {
        await confirmDialogState.value.onConfirm()
    } finally {
        confirmDialogState.value.loading = false
        confirmDialogState.value.open = false
    }
}

const handleBulkDelete = async () => {
    if (!selectedItems.value.length) return
    
    // Use Confirm Dialog
    confirmDialogState.value = {
        open: true,
        title: 'Delete Items',
        description: `Are you sure you want to delete ${selectedItems.value.length} items? This cannot be undone.`,
        variant: 'destructive',
        confirmText: 'Delete Items',
        loading: false,
        onConfirm: async () => {
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
                
                // Refresh specific lists if needed (Queries, Chats)
                if (selectedItems.value.some(i => i.type === 'query')) {
                    window.dispatchEvent(new CustomEvent('pegasus:queries-updated'))
                }
                if (selectedItems.value.some(i => i.type === 'chat')) {
                    window.dispatchEvent(new CustomEvent('pegasus:chats-updated'))
                }
                
                selectedItems.value = []
            } catch (e: any) {
                toast.error('Bulk delete failed', { description: e.message })
            }
        }
    }
}

const handleUploadFile = () => {
    fileInput.value?.click()
}

const onFileSelected = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    
    // Ensure we have a space selected
    if (!spaceStore.currentSpaceId) {
        toast.info('Selecting primary space...')
        await spaceStore.loadSpaces()
    }

    if (!file || !spaceStore.currentSpaceId) {
        if (!spaceStore.currentSpaceId) toast.error('No space selected')
        return
    }

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

const handleSelectFile = (file: any) => {
    emit('select-file', file)
}

// --- Refactored Delete Logic ---
const handleDeleteFile = (file: any) => {
    confirmDialogState.value = {
        open: true,
        title: 'Delete File',
        description: `This file "${file.filename}" will be permanently deleted.`,
        variant: 'destructive',
        confirmText: 'Delete File',
        loading: false,
        onConfirm: async () => {
            try {
                await deleteSpaceFile(file.id)
                toast.success('File deleted')
                await spaceStore.fetchSpaceContext()
            } catch (err: any) {
                toast.error('Failed to delete file', { description: err.message })
            }
        }
    }
}

const handleDeleteNote = (note: any) => {
    confirmDialogState.value = {
        open: true,
        title: 'Delete Note',
        description: `This note "${note.title}" will be permanently deleted.`,
        variant: 'destructive',
        confirmText: 'Delete Note',
        loading: false,
        onConfirm: async () => {
             try {
                await deleteSpaceNote(note.id)
                toast.success('Note deleted')
                await spaceStore.fetchSpaceContext()
            } catch (err: any) {
                toast.error('Failed to delete note', { description: err.message })
            }
        }
    }
}

const handleDeleteTable = (conn: ConnectionEntry, table: string) => {
    confirmDialogState.value = {
        open: true,
        title: 'Delete Table',
        description: `Are you sure you want to delete ${table}? All data associated with this table will be purged.`,
        variant: 'destructive',
        confirmText: 'Delete Table',
        loading: false,
        onConfirm: async () => {
            try {
                await apiDeleteTable(conn, table)
                toast.success('Table deleted')
                refreshSchemas(true)
            } catch (err: any) {
                toast.error('Failed to delete table', { description: err.message })
            }
        }
    }
}

const handleDeleteConnection = (conn: ConnectionEntry) => {
    confirmDialogState.value = {
        open: true,
        title: 'Remove Connection',
        description: `You are about to remove ${conn.nickname}. This will remove access in Pegasus but won't delete actual data.`,
        variant: 'destructive',
        confirmText: 'Remove Connection',
        validationText: conn.isLocked ? conn.nickname : undefined,
        loading: false,
        onConfirm: async () => {
            try {
                await apiDeleteConnection(conn.id)
                toast.success('Connection removed')
                const connStore = useConnectionStore()
                await connStore.loadConnections(true)
            } catch (err: any) {
                toast.error('Failed to remove connection', { description: err.message })
            }
        }
    }
}

const { openLocalFile, processing: openingFile } = useLocalFile()

// --- Chat Logic ---
const startDeleteChat = (chat: any) => {
    confirmDialogState.value = {
        open: true,
        title: 'Delete Session',
        description: 'Are you sure you want to delete this chat session? This cannot be undone.',
        variant: 'destructive',
        confirmText: 'Delete',
        loading: false,
        onConfirm: async () => {
             try {
                await deleteChat(chat.id)
                toast.success('Deleted session')
                window.dispatchEvent(new CustomEvent('pegasus:chats-updated'))
            } catch (err: any) {
                toast.error('Failed to delete session', { description: err.message })
            }
        }
    }
}

const confirmClearAllChats = () => {
     confirmDialogState.value = {
        open: true,
        title: 'Clear History',
        description: 'Are you sure you want to clear your entire chat history? All sessions will be lost.',
        variant: 'destructive',
        confirmText: 'Clear All',
        loading: false,
        onConfirm: async () => {
            try {
                await clearAllChats()
                toast.success('History cleared')
                window.dispatchEvent(new CustomEvent('pegasus:chats-updated'))
            } catch (err: any) {
                toast.error('Failed to clear history', { description: err.message })
            }
        }
    }
}

// --- Query History Logic ---
const handleShareQuery = (query: any) => {
  // For now, just copy to clipboard with a special message
  navigator.clipboard.writeText(query.query)
  toast.success('Query copied to clipboard', {
    description: 'Paste this to share with your team'
  })
}

const handleDeleteQuery = (id: string) => {
    confirmDialogState.value = {
        open: true,
        title: 'Delete Query',
        description: 'Remove this query from your history. This action cannot be undone.',
        variant: 'destructive',
        confirmText: 'Delete',
        loading: false,
        onConfirm: async () => {
             try {
                await apiDeleteQuery(id)
                toast.success('Query deleted')
                window.dispatchEvent(new CustomEvent('pegasus:queries-updated'))
            } catch (err: any) {
                toast.error('Failed to delete query', { description: err.message })
            }
        }
    }
}

const handleClearHistory = () => {
    confirmDialogState.value = {
        open: true,
        title: 'Clear Query Log',
        description: 'Are you sure you want to delete your entire query history?',
        variant: 'destructive',
        confirmText: 'Clear All',
        loading: false,
        onConfirm: async () => {
            try {
                await apiClearAllQueries()
                toast.success('Query history cleared')
                window.dispatchEvent(new CustomEvent('pegasus:queries-updated'))
            } catch (err: any) {
                toast.error('Failed to clear queries', { description: err.message })
            }
        }
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

// --- Sheet Logic ---
const handleAddSheet = async () => {
    // Ensure we have a space selected
    if (!spaceStore.currentSpaceId) {
        toast.info('Selecting primary space...')
        await spaceStore.loadSpaces()
    }

    if (!spaceStore.currentSpaceId) {
        toast.error('No space selected', { description: 'Please create or select a space first.' })
        return
    }

    try {
        await sheetStore.saveSheet({
            name: "New Spreadsheet",
            data: { cells: [], rowCount: 100, colCount: 26, version: 1 },
            spaceId: unref(spaceStore.currentSpaceId)
        })
        toast.success('Spreadsheet created')
    } catch (e: any) {
        toast.error('Failed to create sheet', { description: e.message })
    }
}

const handleDeleteSheet = async (sheet: any) => {
    confirmDialogState.value = {
        open: true,
        title: 'Delete Sheet',
        description: `Delete sheet "${sheet.name}"?`,
        variant: 'destructive',
        confirmText: 'Delete Sheet',
        loading: false,
        onConfirm: async () => {
             try {
                await sheetStore.deleteSheet(sheet.id)
                toast.success('Sheet deleted')
            } catch (e: any) {
                toast.error('Delete failed', { description: e.message })
            }
        }
    }
}

const handleSelectSheet = (sheet: any) => {
    // TODO: Open sheet in specialized viewer/editor
    // For now, emit event or open in grid (handled by parent Workspace probably?)
    // Actually, Explorer shouldn't handle VIEWING, just selection.
    // We emit an event.
    
    // We will assume the parent handles `select-sheet` if we emit something?
    // But `Explorer` props/emits don't have `select-sheet`.
    // Let's rely on `emit('edit-table')` maybe? No, that's for DB.
    
    // The Workspace needs to know to open a Link/Route for this Sheet.
    // Or we emit a custom event.
    // Let's add 'select-sheet' to Explorer Emits first.
}


</script>

<template>
  <aside 
    class="flex flex-col h-full bg-background border-r border-border w-full"
  >
   <!-- QUICK HEADER & ACTIONS -->
    <div class="flex items-center gap-2 p-3 border-b border-border">
      <!-- Space Selector (Flex Grow) -->
      <div class="flex-1 min-w-0">
         <SpaceSelector />
      </div>

      <!-- Action Menu (3 Dots) -->
      <div class="flex items-center gap-1 shrink-0">
           <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button 
                class="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95 outline-none focus:ring-2 focus:ring-ring/20"
                title="Options"
              >
                <MoreHorizontal class="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuItem @select="handleGlobalRefresh">
                <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': isRefreshing }" />
                Refresh Data
              </DropdownMenuItem>
              <DropdownMenuItem @select="emit('toggle-pin')">
                <component :is="isPinned ? Unlock : Lock" class="w-3.5 h-3.5 mr-2" />
                {{ isPinned ? 'Unlock Sidebar' : 'Lock Sidebar' }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @select="isDeleteMode = !isDeleteMode" :class="{ 'bg-rose-500/10 text-rose-500': isDeleteMode }">
                 <Trash class="w-3.5 h-3.5 mr-2" />
                 {{ isDeleteMode ? 'Exit Delete Mode' : 'Delete Items' }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </div>
    </div>
    
    <!-- DELETE MODE BAR -->
    <div v-if="isDeleteMode" class="px-3 py-2 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between animate-in slide-in-from-top-2">
        <span class="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <Trash class="w-3.5 h-3.5" />
            Delete items
        </span>
        <div class="flex items-center gap-2">
             <button 
                @click="isDeleteMode = false; selectedItems = []"
                class="text-[10px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
             >
                Cancel
             </button>
             <button 
                @click="handleBulkDelete"
                :disabled="selectedItems.length === 0"
                class="text-[10px] font-bold bg-rose-500 hover:bg-rose-600 text-white px-2.5 py-1 rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
             >
                Delete {{ selectedItems.length ? `(${selectedItems.length})` : '' }}
             </button>
        </div>
    </div>

    <!-- Quick Search Bar (Hidden in delete mode to reduce clutter?) -->
    <!-- Keeping it visible as searching might help find items to delete -->
    <div v-if="!isDeleteMode" class="px-3 pb-2 pt-2">
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          v-model="searchFilter"
          type="text"
          placeholder="Search connections, tables, notes..."
          class="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-muted/50 border border-border/50 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none placeholder:text-muted-foreground/60 transition-all"
        />
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden relative flex flex-col">
       <div class="flex-1 overflow-hidden p-2">
           <ExplorerTree 
              :connections="filteredConnections"
              :files="(currentFiles as any)"
              :notes="(currentNotes as any)"
              :spaces="(spaceStore.allSpaces as any)"
              :sheets="(currentSheets as any)"
              :chats="chats"
              :query-history="queryHistory"
              
              :selected-table="selectedTable"
              :search-filter="searchFilter"
              :is-delete-mode="isDeleteMode"
              
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
              @add-note-to-dashboard="handleAddNoteToDashboard"
              
              @select-file="handleSelectFile"
              @select-note="handleSelectNote"
              @select-sheet="(sheet) => emit('select-sheet', sheet)"
              
              @add-connection="addConnectionModalOpen = true"
              @upload-file="handleUploadFile"
              @add-file="handleUploadFile"
              @add-note="handleAddNote"
              @add-sheet="handleAddSheet"
              
              @update:context="(c) => currentContext = c"
              @move-connection="handleMoveConnection"
              
              @delete-file="handleDeleteFile"
              @delete-note="handleDeleteNote"
              @delete-sheet="handleDeleteSheet"
              
              @selection-change="(items) => selectedItems = items"
              @delete-files="handleBulkDelete"
              @delete-notes="handleBulkDelete"
              @delete-chats="handleBulkDelete"
              @delete-queries="handleBulkDelete"
              
              @select-chat="(id) => emit('select-chat', id)"
              @preview-chat="(id: string) => emit('preview-chat', id)"
              @create-chat="emit('create-chat')"
              @delete-chat="startDeleteChat"
              
              @load-query="(q) => emit('load-query', q)"
              @delete-query="handleDeleteQuery"
            />
       </div>
    </div>

    <!-- Viewer & Dialogs -->
    <Teleport to="body">
      <AddConnectionModal
        :open="addConnectionModalOpen"
        @update:open="(v) => addConnectionModalOpen = v"
        @connection-added="refreshSchemas(true)"
      />

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

      <!-- Unified Confirmation Dialog -->
      <ConfirmDialog
        v-model:open="confirmDialogState.open"
        :title="confirmDialogState.title"
        :description="confirmDialogState.description"
        :confirm-text="confirmDialogState.confirmText"
        :variant="confirmDialogState.variant"
        :validation-text="confirmDialogState.validationText"
        :loading="confirmDialogState.loading"
        @confirm="handleConfirmDialogConfirm"
      />
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
