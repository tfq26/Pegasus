<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { toast } from 'vue-sonner'
import {
  Database,
  Search,
  Table,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Plus,
  Eye,
  Edit,
  Trash,
  Minus,
  X,
  Sparkles,
  Loader2,
} from 'lucide-vue-next'
import Pagination from '@/components/ui/pagination/Pagination.vue'
import JsonViewer from '@/components/JsonViewer.vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import AddConnectionModal from '@/components/AddConnectionModal.vue'
import { updateConnection as apiUpdateConnection } from '@/lib/api'
import { CONNECTION_STORAGE_KEY, defaultConnections } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { fetchConnectionSchema, fetchTableEntries, fetchTableCount, deleteChat, clearAllChats, getAuthHeaders } from '@/lib/api'

const props = defineProps<{
  connections: ConnectionEntry[]
  selectedConnectionId: string
  chats?: any[]
  selectedChatId?: string
  queryHistory?: any[]
}>()

const emit = defineEmits<{
  'update:selectedConnectionId': [value: string]
  'edit-table': [connection: ConnectionEntry, table: string]
  'create-chat': []
  'select-chat': [id: string]
  'load-query': [query: string]
  'sanitize-table': [connection: ConnectionEntry, table: string]
}>()

// Format table names to hide internal UUIDs
// Converts "data_9649f81e5bf6413aa6e80799cb867c9c_data" to "data"
// Converts "data_60643368_3269_4be6_921e_dff7c585cd3c_Sheet1" to "Sheet1"
const formatTableName = (tableName: string, connectionId?: string): string => {
  // First, check if we have metadata with a display name
  if (connectionId) {
    const schema = connectionSchemas.value[connectionId]
    if (schema?.tableMetadata?.[tableName]?.displayName) {
      return schema.tableMetadata[tableName].displayName
    }
  }
  
  // Fallback: Pattern matching for data_{uuid}_{sheetname}
  // UUID can be either:
  //   - 32 hex chars: 9649f81e5bf6413aa6e80799cb867c9c
  //   - With underscores: 60643368_3269_4be6_921e_dff7c585cd3c
  const match = tableName.match(/^data_(?:[a-f0-9]{32}|[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_(.+)$/i)
  if (match && match[1]) {
    return match[1]
  }
  // If it doesn't match the pattern, return as-is
  return tableName
}

// Helper to safely format dates
const formatDate = (timestamp: any) => {
  if (!timestamp) return 'Never'
  
  try {
    // Handle Unix timestamp (number)
    if (typeof timestamp === 'number') {
      return new Date(timestamp * 1000).toLocaleDateString()
    }
    // Handle ISO string or other date formats
    if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleDateString()
    }
    // Fallback
    return new Date(timestamp).toLocaleDateString()
  } catch (e) {
    return 'Invalid date'
  }
}

const addConnectionModalOpen = ref(false)

const handleConnectionSelect = (id: string) => {
  if (id === 'add-new') {
    addConnectionModalOpen.value = true
    return
  }
  emit('update:selectedConnectionId', id)
}

// Chat deletion state
const deleteChatDialogOpen = ref(false)
const chatToDelete = ref<any>(null)
const clearAllChatsDialogOpen = ref(false)

const handleDeleteChat = (chat: any) => {
  chatToDelete.value = chat
  deleteChatDialogOpen.value = true
}

const confirmDeleteChat = async () => {
  if (!chatToDelete.value) return
  
  try {
    await deleteChat(chatToDelete.value.id)
    
    toast.success(`Deleted chat "${chatToDelete.value.title}"`)
    
    // Emit event to parent to refresh chats
    emit('select-chat', '') // Deselect if this was selected
    window.location.reload() // Refresh to update chat list
    
    deleteChatDialogOpen.value = false
    chatToDelete.value = null
  } catch (error) {
    toast.error('Failed to delete chat', {
      description: error instanceof Error ? error.message : String(error)
    })
  }
}

const handleClearAllChats = () => {
  clearAllChatsDialogOpen.value = true
}

const confirmClearAllChats = async () => {
  try {
    const result = await clearAllChats()
    toast.success(`Cleared ${result.deleted || 'all'} chats`)
    
    clearAllChatsDialogOpen.value = false
    window.location.reload() // Refresh to update chat list
  } catch (error) {
    toast.error('Failed to clear chats', {
      description: error instanceof Error ? error.message : String(error)
    })
  }
}

type ChatItem = {
  id: string
  user: string
  ai: string
  queryLink?: string
}

type QueryItem = {
  id: string
  text: string
  byAI: boolean
}

type ConnectionSchemaState = {
  status: 'loading' | 'connected' | 'error'
  tables: string[]
  databases?: string[]
  tableMetadata?: Record<string, { displayName: string; actualName: string }>
  error?: string
}

type ViewerState = {
  open: boolean
  connection: ConnectionEntry | null
  table: string
  entries: Record<string, unknown>[]
  loading: boolean
  page: number
  limit: number
  hasMore: boolean
  error: string
  total?: number
}

const getProviderColor = (provider: string) => {
  switch (provider?.toLowerCase()) {
    case 'postgres': return '#336791'
    case 'mongodb': return '#4DB33D'
    case 'sqlite': return '#003B57'
    case 'surrealdb': return '#FF00A0'
    default: return '#71717a'
  }
}

const handleTableClick = (conn: ConnectionEntry, table: string) => {
   emit('edit-table', conn, table)
}

const sidebarTabs = ['data', 'chats', 'queries'] as const
const activeTab = ref<typeof sidebarTabs[number]>('data')
// connections ref removed in favor of props
const connectionSchemas = ref<Record<string, ConnectionSchemaState>>({})
const viewer = ref<ViewerState>({
  open: false,
  connection: null,
  table: '',
  entries: [],
  loading: false,
  page: 1,
  limit: 50,
  hasMore: false,
  error: '',
  total: 0,
})

import { useStorage } from '@vueuse/core'

const viewerZoomLevel = useStorage('pegasus-viewer-zoom', 0) // 0=xs, 1=sm, 2=base, 3=lg, 4=xl
const viewerZoomClasses = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl']
const viewerTextSizeClass = computed(() => viewerZoomClasses[viewerZoomLevel.value])

const increaseViewerZoom = () => {
  if (viewerZoomLevel.value < viewerZoomClasses.length - 1) viewerZoomLevel.value++
}

const decreaseViewerZoom = () => {
  if (viewerZoomLevel.value > 0) viewerZoomLevel.value--
}

const expandedRows = ref<Set<number>>(new Set())
const selectedRows = ref<Set<number>>(new Set())

const toggleRowSelection = (index: number, event: MouseEvent) => {
  if (event.shiftKey && selectedRows.value.size > 0) {
    // Shift-click: select range
    const indices = Array.from(selectedRows.value)
    const lastSelected = Math.max(...indices)
    const start = Math.min(lastSelected, index)
    const end = Math.max(lastSelected, index)
    for (let i = start; i <= end; i++) {
      selectedRows.value.add(i)
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd-click: toggle individual
    if (selectedRows.value.has(index)) {
      selectedRows.value.delete(index)
    } else {
      selectedRows.value.add(index)
    }
  } else {
    // Normal click: select only this row
    selectedRows.value.clear()
    selectedRows.value.add(index)
  }
}

const copySelectedRows = async () => {
  if (selectedRows.value.size === 0) return

  const indices = Array.from(selectedRows.value).sort((a, b) => a - b)
  const rowsToCopy = indices.map(i => viewer.value.entries[i]).filter(row => row !== undefined)

  // Format as TSV (tab-separated values) for Excel compatibility
  const headers = viewerColumns.value.join('\t')
  const rows = rowsToCopy.map(row =>
    viewerColumns.value.map(col => formatCellValue(row[col])).join('\t')
  ).join('\n')

  const text = headers + '\n' + rows

  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${selectedRows.value.size} row${selectedRows.value.size > 1 ? 's' : ''}`)
  } catch (e) {
    toast.error('Failed to copy')
  }
}

const copyAllRows = async () => {
  const headers = viewerColumns.value.join('\t')
  const rows = viewer.value.entries.map(row =>
    viewerColumns.value.map(col => formatCellValue(row[col])).join('\t')
  ).join('\n')

  const text = headers + '\n' + rows

  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${viewer.value.entries.length} rows`)
  } catch (e) {
    toast.error('Failed to copy')
  }
}

const renamingTable = ref<{ conn: ConnectionEntry; oldName: string; newName: string } | null>(null)

const startRenameTable = (conn: ConnectionEntry, table: string) => {
  renamingTable.value = {
    conn,
    oldName: table,
    newName: formatTableName(table, conn.id) // Use user-friendly name for input
  }

  // Auto-focus and select the input on next tick
  nextTick(() => {
    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

const cancelRename = () => {
  renamingTable.value = null
}

const confirmRename = async () => {
  if (!renamingTable.value) return

  const { conn, oldName, newName } = renamingTable.value

  // Compare against formatted old name, because user expects to see/edit formatted name
  if (newName === formatTableName(oldName, conn.id) || !newName.trim()) {
    renamingTable.value = null
    return
  }

  try {
    // Extract the UUID from the old table name
    // Format: data_{uuid}_{sheetname}
    // UUID can be either:
    //   - 32 hex chars: 9649f81e5bf6413aa6e80799cb867c9c
    //   - With underscores: 60643368_3269_4be6_921e_dff7c585cd3c
    const match = oldName.match(/^data_([a-f0-9]{32}|[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_(.+)$/i)
    
    if (!match) {
      toast.error('Invalid table name format')
      renamingTable.value = null
      return
    }
    
    const uuid = match[1] // e.g., "9649f81e5bf6413aa6e80799cb867c9c" or "60643368_3269_4be6_921e_dff7c585cd3c"
    const newTableName = `data_${uuid}_${newName.trim()}`
    
    // Call backend to rename table
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/api/rename-table`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        connection: conn,
        oldTableName: oldName,
        newTableName: newTableName,
        provider: conn.provider
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to rename table')
    }
    
    toast.success(`Renamed table to "${newName}"`)
    
    // Update local connection object to reflect the change immediately
    // This is crucial because for uploaded connections, the table list is often hardcoded in the connection config
    if (conn.sqlite && Array.isArray(conn.sqlite.tables)) {
      const idx = conn.sqlite.tables.indexOf(oldName)
      if (idx !== -1) {
        conn.sqlite.tables[idx] = newTableName
      } else {
        // If not found (maybe not synced), just add it
        conn.sqlite.tables.push(newTableName)
      }
      
      // Also update the expandedDbByConn cache if it exists
      const cache = dbTablesCache.value[conn.id]
      if (cache) {
         // Force refresh by clearing cache for this db
         delete cache[conn.sqlite.database || 'main']
      }
    }
    
    // If it's a saved connection, we should also update it in the backend persistence
    // The backend rename endpoint should ideally handle this, but we can also trigger a connection update here if needed.
    // For now, updating the local object allows refreshSchemas() to work correctly.
    
    renamingTable.value = null
    
    // Refresh schemas to update UI
    await refreshSchemas()
    
  } catch (error) {
    toast.error('Failed to rename table', {
      description: error instanceof Error ? error.message : String(error)
    })
  } finally {
    renamingTable.value = null
  }
}

const copyAllTableData = async (conn: ConnectionEntry, table: string) => {
  toast.info('Fetching all data...')

  try {
    // Fetch all data (up to a reasonable limit)
    const result = await fetchTableEntries({
      entry: conn,
      table,
      page: 1,
      limit: 1000, // Fetch up to 1000 rows
    })

    if (result.rows.length === 0) {
      toast.warning('No data to copy')
      return
    }

    // Get all columns
    const columns = new Set<string>()
    result.rows.forEach((row: any) => {
      Object.keys(row).forEach(key => columns.add(key))
    })
    const columnArray = Array.from(columns)

    // Format as TSV
    const headers = columnArray.join('\t')
    const rows = result.rows.map((row: any) =>
      columnArray.map(col => formatCellValue(row[col])).join('\t')
    ).join('\n')

    const text = headers + '\n' + rows

    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${result.rows.length} rows from ${table}`)
  } catch (e) {
    toast.error('Failed to copy table data', {
      description: e instanceof Error ? e.message : String(e)
    })
  }
}

const schemaFor = (id: string) => connectionSchemas.value[id]

const statusDotClasses = (status?: ConnectionSchemaState['status']) => {
  if (status === 'connected') return 'bg-emerald-500 dark:bg-emerald-400'
  if (status === 'error') return 'bg-destructive'
  if (status === 'loading') return 'bg-amber-500/80 animate-pulse'
  return 'bg-muted-foreground'
}

const statusLabel = (state?: ConnectionSchemaState) => {
  if (!state) return 'Unknown'
  if (state.status === 'connected') return 'Connected'
  if (state.status === 'loading') return 'Checking...'
  return 'Connection error'
}

const refreshSchemas = async () => {
  if (typeof window === 'undefined') return

  // Do NOT clear existing schemas to prevent flickering
  // Instead, mark them as reloading if they exist, or initialize new ones
  const next = { ...connectionSchemas.value }

  props.connections.forEach((conn) => {
    if (!next[conn.id]) {
        // Only initialize if not already present
        next[conn.id] = {
            status: 'loading',
            tables: [],
        }
    } else {
        // Keep existing data but perhaps show a subtle loading state if we wanted
        // For now, allow silent refresh or keep 'connected' until done
    }
  })

  // Update ref to ensure new connections appear immediately
  connectionSchemas.value = next

  await Promise.all(
    props.connections.map(async (conn) => {
      try {
        const schema = await fetchConnectionSchema(conn)
        
        // Update in place
        connectionSchemas.value[conn.id] = {
          status: 'connected',
          tables: schema.tables,
          databases: schema.databases,
          tableMetadata: schema.tableMetadata,
        }
        
        // cache top-level tables so we can restore after DB-scoped views
        dbTablesCache.value[conn.id] = dbTablesCache.value[conn.id] || {}
        dbTablesCache.value[conn.id]!['__root'] = schema.tables
      } catch (error) {
        connectionSchemas.value[conn.id] = {
          status: 'error',
          tables: connectionSchemas.value[conn.id]?.tables || [], // Keep old tables if failed? Or clear? safely clear or keep
          error: error instanceof Error ? error.message : 'Unable to reach database',
          databases: connectionSchemas.value[conn.id]?.databases // Keep databases if we had them
        }
      }
    }),
  )
}

watch(() => props.connections, refreshSchemas, { deep: true })

onMounted(() => {
  refreshSchemas()
})



const loadViewerPage = async (page: number) => {
  if (!viewer.value.connection || !viewer.value.table) return
  viewer.value.loading = true
  viewer.value.error = ''
  expandedRows.value = new Set() // Reset expanded rows when changing pages
  selectedRows.value = new Set() // Reset selected rows when changing pages

  try {
    const result = await fetchTableEntries({
      entry: viewer.value.connection,
      table: viewer.value.table,
      page,
      limit: viewer.value.limit,
    })

    viewer.value.entries = result.rows
    viewer.value.page = result.page
    viewer.value.hasMore = result.hasNext
  } catch (error) {
    viewer.value.error = error instanceof Error ? error.message : 'Failed to load entries.'
  } finally {
    viewer.value.loading = false
  }
}

const openViewer = (connection: ConnectionEntry, table: string) => {
  viewer.value = {
    open: true,
    connection,
    table,
    entries: [],
    loading: false,
    page: 1,
    limit: 50,
    hasMore: false,
    error: '',
    total: 0,
  }
  expandedRows.value = new Set()
  selectedRows.value = new Set()
  
  // Load count and first page in parallel
  loadViewerPage(1)
  
  fetchTableCount({ entry: connection, table }).then(count => {
    if (viewer.value.open && viewer.value.table === table) {
      viewer.value.total = count
    }
  }).catch(err => {
    console.error('Failed to fetch count:', err)
  })
}
const toggleRowExpansion = (index: number) => {
  if (expandedRows.value.has(index)) {
    expandedRows.value.delete(index)
  } else {
    expandedRows.value.add(index)
  }
  // Trigger reactivity
  expandedRows.value = new Set(expandedRows.value)
}

const expandedDbByConn = ref<Record<string, string | null>>({})
// Cache of tables per connection per database to avoid re-probing repeatedly
const dbTablesCache = ref<Record<string, Record<string, string[]>>>({})

const loadTablesForDatabase = async (conn: ConnectionEntry, db: string) => {
  // toggle collapse
  if (expandedDbByConn.value[conn.id] === db) {
    expandedDbByConn.value[conn.id] = null
    // restore top-level tables from cache if available
    const root = dbTablesCache.value[conn.id]?.['__root']
    if (root) {
      connectionSchemas.value[conn.id] = {
        ...(connectionSchemas.value[conn.id] || { status: 'connected' }),
        tables: root,
      }
      return
    }
    // fallback: re-fetch all schemas
    await refreshSchemas()
    return
  }

  expandedDbByConn.value[conn.id] = db

  // check cache first
  const cached = dbTablesCache.value[conn.id]?.[db]
  if (cached) {
    connectionSchemas.value[conn.id] = {
      ...(connectionSchemas.value[conn.id] || { status: 'connected' }),
      tables: cached,
    }
    return
  }

  // create a temporary copy of the connection with database set
  const tempConn: ConnectionEntry = JSON.parse(JSON.stringify(conn))
  if (!tempConn.mongodb) tempConn.mongodb = { url: '', database: '', collection: '' }
  tempConn.mongodb.database = db

  try {
    const schema = await fetchConnectionSchema(tempConn)

    // ensure cache structures exist
    dbTablesCache.value[conn.id] = dbTablesCache.value[conn.id] || {}
    dbTablesCache.value[conn.id]![db] = schema.tables

    // replace the tables for this connection with the schema for the selected DB
    connectionSchemas.value[conn.id] = {
      status: 'connected',
      tables: schema.tables,
      databases: connectionSchemas.value[conn.id]?.databases,
    }
  } catch (err) {
    connectionSchemas.value[conn.id] = {
      status: 'error',
      tables: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}



const closeViewer = () => {
  viewer.value.open = false
}

const handleEditTable = (conn: ConnectionEntry, table: string) => {
  emit('edit-table', conn, table)
}

// Delete confirmation dialog state
const deleteDialogOpen = ref(false)
const tableToDelete = ref<{ conn: ConnectionEntry; table: string } | null>(null)

const handleDeleteTable = (conn: ConnectionEntry, table: string) => {
  tableToDelete.value = { conn, table }
  deleteDialogOpen.value = true
}

const confirmDelete = async () => {
  if (!tableToDelete.value) return
  
  const { conn, table } = tableToDelete.value
  
  try {
    // Call backend to delete table
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/api/delete-table`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        connection: conn,
        tableName: table,
        provider: conn.provider
      })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete table')
    }
    
    toast.success(`Deleted "${formatTableName(table, conn.id)}"`)
    
    // Update local connection object
    if (conn.sqlite && Array.isArray(conn.sqlite.tables)) {
      const idx = conn.sqlite.tables.indexOf(table)
      if (idx !== -1) {
        conn.sqlite.tables.splice(idx, 1)
      }
      
      // Clear cache
      const cache = dbTablesCache.value[conn.id]
      if (cache) {
        delete cache[conn.sqlite.database || 'main']
      }
    }
    
    // Refresh schemas to remove deleted table from list
    await refreshSchemas()
    
    // Close dialog and reset
    deleteDialogOpen.value = false
    tableToDelete.value = null
    
  } catch (error) {
    toast.error('Failed to delete table', {
      description: error instanceof Error ? error.message : String(error)
    })
    // Keep dialog open on error so user can retry or cancel
  }
}

// Delete connection dialog state
const deleteConnectionDialogOpen = ref(false)
const connectionToDelete = ref<ConnectionEntry | null>(null)

const handleDeleteConnection = (conn: ConnectionEntry) => {
  connectionToDelete.value = conn
  deleteConnectionDialogOpen.value = true
}

const confirmDeleteConnection = async () => {
  if (!connectionToDelete.value) return
  
  const conn = connectionToDelete.value
  
  try {
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/connections/${conn.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete connection')
    }
    
    toast.success(`Deleted connection "${conn.nickname}"`)
    
    // Remove from local storage
    const connections = JSON.parse(localStorage.getItem(CONNECTION_STORAGE_KEY) || '[]')
    const filtered = connections.filter((c: ConnectionEntry) => c.id !== conn.id)
    localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(filtered))
    
    // Refresh to update UI
    window.location.reload()
    
    deleteConnectionDialogOpen.value = false
    connectionToDelete.value = null
    
  } catch (error) {
    toast.error('Failed to delete connection', {
      description: error instanceof Error ? error.message : String(error)
    })
  }
}

const viewerColumns = computed(() => {
  if (!viewer.value.entries.length) return []
  
  // Get columns from first row to preserve order
  const firstRow = viewer.value.entries[0]
  if (!firstRow) return []
  
  const columns = Object.keys(firstRow).filter(key => 
    // Filter out internal ID and order columns
    key !== 'id' && key !== '__id' && key !== '_row_order'
  )
  
  // For SurrealDB with column-letters mode: use first row VALUES as headers
  // For SurrealDB with named-headers mode: use column names directly
  // For other DBs: use column names as-is
  if (viewer.value.connection?.provider === 'surrealdb') {
    // Check if this looks like column-letters mode (columns are A, B, C...)
    const isColumnLetters = columns.length > 0 && columns[0] && /^[A-Z]+$/.test(columns[0])
    
    if (isColumnLetters) {
      // Column-letters mode: Return first row's values as column headers
      return columns.map(col => String(firstRow[col] ?? col))
    }
  }
  
  // Named-headers mode or other providers: use column names directly
  return columns
})

// Data rows to display (skip first row for SurrealDB column-letters mode only)
const viewerDataRows = computed(() => {
  if (!viewer.value.entries.length) return []
  
  if (viewer.value.connection?.provider === 'surrealdb') {
    const firstRow = viewer.value.entries[0]
    if (!firstRow) return []
    
    const columns = Object.keys(firstRow).filter(key => 
      key !== 'id' && key !== '__id' && key !== '_row_order'
    )
    
    // Check if this looks like column-letters mode
    const isColumnLetters = columns.length > 0 && columns[0] && /^[A-Z]+$/.test(columns[0])
    
    if (isColumnLetters) {
      // Column-letters mode: Skip first row (it's the header row)
      return viewer.value.entries.slice(1)
    }
  }
  
  // Named-headers mode or other providers: use all rows
  return viewer.value.entries
})

// Sorting and search state
const sortColumn = ref<string | null>(null)
const sortDirection = ref<'asc' | 'desc'>('asc')
const searchQuery = ref('')

// Toggle sort on column click
const toggleSort = (column: string) => {
  if (sortColumn.value === column) {
    // Toggle direction if same column
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    // New column, default to ascending
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

// Filtered and sorted data rows
const filteredAndSortedRows = computed(() => {
  let rows = viewerDataRows.value
  
  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    rows = rows.filter(row => {
      return Object.values(row).some(val => 
        String(val).toLowerCase().includes(query)
      )
    })
  }
  
  // Apply sorting
  if (sortColumn.value) {
    const col = sortColumn.value
    const dir = sortDirection.value
    
    rows = [...rows].sort((a, b) => {
      const aVal = a[col]
      const bVal = b[col]
      
      // Handle null/undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return dir === 'asc' ? 1 : -1
      if (bVal == null) return dir === 'asc' ? -1 : 1
      
      // Compare values
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      
      if (aStr < bStr) return dir === 'asc' ? -1 : 1
      if (aStr > bStr) return dir === 'asc' ? 1 : -1
      return 0
    })
  }
  
  return rows
})

const isJsonValue = (value: unknown): boolean => {
  return value !== null && value !== undefined && typeof value === 'object'
}

const formatCellValue = (value: unknown) => {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

onMounted(() => {
  refreshSchemas()
})

// Event listeners removed as connection updates are handled via props
onBeforeUnmount(() => {
  // cleanup if needed
})
</script>

<template>
  <div class="flex flex-col h-full text-sm select-none bg-[#0a0a0b] text-stone-100 relative">
    <!-- Tab Navigation (Modern Pill Style) -->
    <div class="p-4 flex-shrink-0">
      <div class="flex p-1 bg-stone-900/60 backdrop-blur-md rounded-xl border border-stone-800/50 relative">
        <div 
          class="absolute inset-y-1 bg-stone-800/80 rounded-lg shadow-lg transition-all duration-300 ease-out z-0"
          :style="{ 
            width: `${100 / sidebarTabs.length}%`, 
            left: `${(sidebarTabs.indexOf(activeTab) * 100) / sidebarTabs.length}%` 
          }"
        ></div>

        <button
          v-for="tab in sidebarTabs"
          :key="tab"
          @click="activeTab = tab"
          class="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all relative z-10"
          :class="[
            activeTab === tab ? 'text-stone-100' : 'text-stone-500 hover:text-stone-300'
          ]"
        >
          {{ tab === 'data' ? 'Sources' : (tab === 'chats' ? 'History' : 'Log') }}
        </button>
      </div>
    </div>

    <!-- Active Tab Content -->
    <div class="flex-1 overflow-y-auto px-4 pb-6 space-y-6 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
      
      <!-- DATA TAB -->
      <template v-if="activeTab === 'data'">
        <div class="space-y-4">
          <div class="flex items-center justify-between px-1">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Connections</h3>
            <button 
              @click="addConnectionModalOpen = true"
              class="p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-white hover:bg-stone-800 transition-all"
            >
              <Plus class="w-3.5 h-3.5" />
            </button>
          </div>

          <div class="space-y-3">
            <div v-if="connections.length === 0" class="py-12 text-center space-y-4">
              <div class="w-12 h-12 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto">
                <Database class="w-6 h-6 text-stone-700" />
              </div>
              <p class="text-xs text-stone-500">No databases connected yet.</p>
              <button @click="addConnectionModalOpen = true" class="text-xs font-bold text-violet-400 hover:text-violet-300">
                Connect your first database
              </button>
            </div>

            <div
              v-for="conn in connections"
              :key="conn.id"
              class="group relative"
            >
              <div 
                v-if="selectedConnectionId === conn.id"
                class="absolute -inset-1 bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 blur-md rounded-xl"
              ></div>

              <article
                @click="handleConnectionSelect(conn.id)"
                class="relative cursor-pointer rounded-xl border p-3 transition-all duration-300 overflow-hidden"
                :class="[
                  selectedConnectionId === conn.id 
                    ? 'bg-stone-900/90 border-violet-500/30 ring-1 ring-violet-500/10' 
                    : 'bg-stone-900/40 border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/60'
                ]"
              >
                <div class="flex items-start justify-between relative z-10">
                  <div class="flex items-center gap-3">
                    <div 
                      class="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
                      :class="[
                        selectedConnectionId === conn.id 
                          ? 'bg-violet-500/10 border-violet-500/20 text-violet-400 shadow-[0_0_15px_-5px_theme(colors.violet.500)]' 
                          : 'bg-stone-800/50 border-stone-700/50 text-stone-500 group-hover:text-stone-300 group-hover:border-stone-600'
                      ]"
                    >
                      <Database class="w-4 h-4" />
                    </div>
                    <div>
                      <p class="font-semibold text-stone-200 group-hover:text-white transition-colors truncate max-w-[120px]">{{ conn.nickname }}</p>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-stone-500">{{ conn.provider }}</span>
                        <div class="w-1 h-1 rounded-full bg-stone-700"></div>
                        <div class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest" :class="schemaFor(conn.id)?.status === 'error' ? 'text-rose-500' : 'text-stone-500'">
                          <span :class="['h-1.5 w-1.5 rounded-full', statusDotClasses(schemaFor(conn.id)?.status)]"></span>
                          {{ statusLabel(schemaFor(conn.id)) }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col items-end gap-1">
                    <button 
                      @click.stop="handleDeleteConnection(conn)"
                      class="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-stone-800 text-stone-600 hover:text-rose-400 transition-all"
                    >
                      <Trash class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <!-- Table List (Inline) -->
                <div v-if="selectedConnectionId === conn.id" class="mt-4 pt-4 border-t border-stone-800/50 space-y-1 max-h-[400px] overflow-y-auto pr-1">
                  <div 
                    v-for="table in schemaFor(conn.id)?.tables" 
                    :key="table"
                    class="block"
                  >
                    <ContextMenu>
                      <ContextMenuTrigger class="flex-1 flex items-center justify-between">
                        <div 
                          class="flex items-center justify-between p-2 rounded-lg hover:bg-violet-500/5 group/table transition-all border border-transparent hover:border-violet-500/10 w-full cursor-pointer"
                          @click="handleTableClick(conn, table)"
                        >
                          <div class="flex items-center gap-2 overflow-hidden">
                            <Table class="w-3.5 h-3.5 text-stone-600 group-hover/table:text-violet-400 shrink-0" />
                            <span class="truncate text-stone-400 group-hover/table:text-stone-200 transition-colors">
                              {{ formatTableName(table, conn.id) }}
                            </span>
                          </div>
                          
                          <div class="flex items-center gap-1 opacity-0 group-hover/table:opacity-100 translate-x-1 group-hover/table:translate-x-0 transition-all">
                            <button 
                              @click.stop="openViewer(conn, table)" 
                              class="p-1 hover:text-violet-400 text-stone-500 transition-colors"
                              title="Preview Data"
                            >
                              <Eye class="w-3 h-3" />
                            </button>
                            <button 
                              @click.stop="emit('edit-table', conn, table)" 
                              class="p-1 hover:text-white text-stone-500 transition-colors"
                              title="Open in Editor"
                            >
                              <Edit class="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent class="w-48 bg-[#0a0a0b] border-stone-800 text-stone-100">
                         <ContextMenuItem @select="openViewer(conn, table)">
                            Preview Data
                         </ContextMenuItem>
                         <ContextMenuItem @select="emit('edit-table', conn, table)">
                            Open in Editor
                         </ContextMenuItem>
                         <ContextMenuSeparator class="bg-stone-800 my-1" />
                         <ContextMenuItem @select="startRenameTable(conn, table)">
                            Rename Table...
                         </ContextMenuItem>
                         <ContextMenuItem @select="handleDeleteTable(conn, table)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                            Delete Table
                         </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </template>

      <!-- CHATS TAB -->
      <template v-else-if="activeTab === 'chats'">
        <div class="space-y-6">
          <div class="flex items-center justify-between px-1">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Session History</h3>
            <div class="flex gap-2">
              <button 
                @click="emit('create-chat')"
                class="p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-all"
                title="New Session"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
              <button 
                v-if="props.chats?.length"
                @click="handleClearAllChats"
                class="p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-rose-400 hover:bg-stone-800 transition-all"
                title="Clear All"
              >
                <Trash class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div v-if="!props.chats?.length" class="py-12 text-center space-y-3">
              <div class="w-10 h-10 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto opacity-50">
                <Search class="w-5 h-5 text-stone-700" />
              </div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-stone-600">No session history</p>
            </div>

            <div
              v-for="chat in props.chats"
              :key="chat.id"
              @click="emit('select-chat', chat.id)"
              class="group relative cursor-pointer px-4 py-3 rounded-xl border transition-all duration-300"
              :class="[
                props.selectedChatId === chat.id 
                  ? 'bg-violet-500/5 border-violet-500/20 text-stone-100 shadow-[0_0_20px_-10px_theme(colors.violet.500)]' 
                  : 'bg-stone-900/40 border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/60 text-stone-400'
              ]"
            >
              <div class="flex justify-between items-start gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate group-hover:text-stone-100 transition-colors">{{ chat.title }}</p>
                  <p class="text-[10px] font-bold uppercase tracking-tighter text-stone-600 mt-1">{{ formatDate(chat.updated_at) }}</p>
                </div>
                <button 
                  @click.stop="handleDeleteChat(chat)"
                  class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-stone-800 text-stone-500 hover:text-rose-400 transition-all"
                >
                  <Trash class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- QUERIES TAB -->
      <template v-else>
        <div class="space-y-6">
          <div class="px-1">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Query History</h3>
          </div>

          <div class="space-y-2">
            <div v-if="!props.queryHistory?.length" class="py-12 text-center">
              <p class="text-[10px] font-bold uppercase tracking-widest text-stone-600 opacity-50">No recent queries</p>
            </div>

            <div
              v-for="q in props.queryHistory"
              :key="q.id"
              @click="emit('load-query', q.query)"
              class="group cursor-pointer p-3 rounded-xl bg-stone-900/40 border border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/60 transition-all"
            >
              <div class="flex items-center gap-3">
                <div 
                  class="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  :class="q.source === 'ai' ? 'bg-violet-500/10 text-violet-400' : 'bg-stone-800 text-stone-500'"
                >
                  <Sparkles v-if="q.source === 'ai'" class="w-3 h-3" />
                  <Database v-else class="w-3 h-3" />
                </div>
                <div class="flex-1 min-w-0 overflow-hidden">
                  <p class="text-xs font-mono truncate text-stone-400 group-hover:text-stone-200 transition-colors">{{ q.query }}</p>
                  <p class="text-[9px] text-stone-600 mt-1 uppercase tracking-tighter font-bold">
                    {{ new Date(q.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Viewer Overflow -->
    <Transition name="fade">
      <div
        v-if="viewer.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-md p-4 sm:p-8"
        @click.self="closeViewer"
      >
        <div class="relative w-full max-w-6xl h-full max-h-[85vh] overflow-hidden flex flex-col rounded-[32px] border border-stone-800 bg-[#0a0a0b] shadow-2xl">
          <!-- Viewer Header -->
          <div class="p-6 sm:px-8 border-b border-stone-800 flex items-center justify-between bg-stone-900/20">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 p-0.5 shadow-lg shadow-violet-500/10">
                <div class="w-full h-full bg-[#0a0a0b] rounded-[14px] flex items-center justify-center">
                  <Table class="w-6 h-6 text-violet-400" />
                </div>
              </div>
              <div>
                <h3 class="text-lg font-bold text-white">{{ formatTableName(viewer.table, viewer.connection?.id) }}</h3>
                <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">{{ viewer.connection?.nickname }} / {{ viewer.total ?? '...' }} Records</p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div class="flex items-center bg-stone-900/60 rounded-xl p-1 border border-stone-800/50">
                <button 
                  @click="decreaseViewerZoom" 
                  class="p-2 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-white disabled:opacity-20 transition-all"
                  :disabled="viewerZoomLevel === 0"
                >
                  <Minus class="w-4 h-4" />
                </button>
                <div class="h-4 w-[1px] bg-stone-800 mx-1"></div>
                <button 
                  @click="increaseViewerZoom" 
                  class="p-2 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-white disabled:opacity-20 transition-all"
                  :disabled="viewerZoomLevel === viewerZoomClasses.length - 1"
                >
                  <Plus class="w-4 h-4" />
                </button>
              </div>
              <button
                @click="closeViewer"
                class="w-10 h-10 rounded-full flex items-center justify-center bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-all shadow-xl"
              >
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Viewer Content -->
          <div class="flex-1 overflow-hidden flex flex-col bg-stone-950/30">
            <!-- Toolbar -->
            <div class="px-8 py-4 border-b border-stone-800 flex items-center gap-4 bg-[#0a0a0b]">
              <div class="relative flex-1 group">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 transition-colors group-focus-within:text-violet-500" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Filter data..."
                  class="w-full pl-10 pr-4 py-2 bg-stone-900/50 border border-stone-800 rounded-xl text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/40 transition-all"
                />
              </div>
              <div v-if="searchQuery" class="text-[10px] font-bold uppercase tracking-widest text-violet-400">
                {{ filteredAndSortedRows.length }} matches
              </div>
            </div>

            <!-- Table -->
            <div class="flex-1 overflow-auto px-8 py-6 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
              <div v-if="viewer.loading" class="h-full flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 class="w-8 h-8 text-violet-500 animate-spin" />
                <p class="text-xs font-bold uppercase tracking-widest text-stone-600">Reading records...</p>
              </div>
              <div v-else-if="viewer.error" class="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-rose-400 text-sm">
                {{ viewer.error }}
              </div>
              <table v-else-if="viewer.entries.length" class="w-full border-separate border-spacing-0">
                <thead>
                  <tr class="text-left">
                    <th class="sticky top-0 z-10 bg-[#0a0a0b]/80 backdrop-blur-sm border-b border-stone-800 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-500 w-10"></th>
                    <th
                      v-for="col in viewerColumns"
                      :key="col"
                      @click="toggleSort(col)"
                      class="sticky top-0 z-10 bg-[#0a0a0b]/80 backdrop-blur-sm border-b border-stone-800 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-500 cursor-pointer hover:text-white transition-colors"
                    >
                      <div class="flex items-center gap-2">
                        {{ col }}
                        <span v-if="sortColumn === col" class="text-violet-400">{{ sortDirection === 'asc' ? '↑' : '↓' }}</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="(entry, index) in filteredAndSortedRows" :key="`row-${index}`">
                    <tr 
                      @click="toggleRowSelection(index, $event)"
                      class="group/row transition-colors hover:bg-stone-900/40"
                      :class="selectedRows.has(index) ? 'bg-violet-500/10' : ''"
                    >
                      <td class="px-4 py-3 border-b border-stone-800/50">
                        <button @click.stop="toggleRowExpansion(index)" class="text-stone-700 hover:text-violet-400 transition-colors">
                          <ChevronDown v-if="expandedRows.has(index)" class="w-3.5 h-3.5" />
                          <ChevronRight v-else class="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td
                        v-for="col in viewerColumns"
                        :key="col"
                        class="px-4 py-3 border-b border-stone-800/50 text-xs font-medium text-stone-400 group-hover/row:text-stone-100 max-w-[200px] truncate transition-colors"
                      >
                         {{ formatCellValue(entry[col]) }}
                      </td>
                    </tr>
                    <tr v-if="expandedRows.has(index)">
                      <td :colspan="viewerColumns.length + 1" class="p-6 bg-stone-900/20 border-b border-stone-800/50">
                        <JsonViewer :data="entry" :text-size="viewerTextSizeClass" />
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
              <div v-else class="py-20 text-center text-stone-600 font-bold uppercase tracking-widest text-xs">
                No entries found
              </div>
            </div>

            <!-- Footer -->
            <div class="px-8 py-4 border-t border-stone-800 bg-stone-900/10 flex items-center justify-between">
              <div class="flex items-center gap-6">
                <span v-if="selectedRows.size" class="text-[10px] font-bold uppercase tracking-widest text-violet-400 bg-violet-500/10 px-2 py-1 rounded">
                  {{ selectedRows.size }} selected
                </span>
                <span class="text-[10px] font-bold uppercase tracking-widest text-stone-600">
                  Showing {{ viewer.entries.length }} records
                </span>
              </div>

              <div class="flex items-center gap-4">
                <Pagination
                  :page="viewer.page"
                  :has-prev="viewer.page > 1"
                  :has-next="viewer.hasMore"
                  @page-change="loadViewerPage"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Modals -->
    <AddConnectionModal v-model:open="addConnectionModalOpen" />

    <!-- Delete Table Dialog -->
    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-[32px]">
        <DialogHeader class="items-center text-center p-6 space-y-4">
          <div class="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500">
            <Trash class="w-8 h-8" />
          </div>
          <div>
            <DialogTitle class="text-xl font-bold">Delete Table</DialogTitle>
            <DialogDescription class="text-stone-500 mt-2">
              Are you sure you want to permanently delete "{{ tableToDelete ? formatTableName(tableToDelete.table, tableToDelete.conn.id) : '' }}"? This action is irreversible.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter class="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button @click="confirmDelete" class="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all">
            Confirm Deletion
          </button>
          <button @click="deleteDialogOpen = false" class="w-full py-3 rounded-2xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white font-bold transition-all">
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Connection Dialog -->
    <Dialog v-model:open="deleteConnectionDialogOpen">
      <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-[32px]">
        <DialogHeader class="items-center text-center p-6 space-y-4">
          <div class="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500">
            <Database class="w-8 h-8" />
          </div>
          <div>
            <DialogTitle class="text-xl font-bold">Delete Connection</DialogTitle>
            <DialogDescription class="text-stone-500 mt-2">
              Remove "{{ connectionToDelete?.nickname }}"? You'll need to reconnect it later to access its data.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter class="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button @click="confirmDeleteConnection" class="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all">
            Remove Connection
          </button>
          <button @click="deleteConnectionDialogOpen = false" class="w-full py-3 rounded-2xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white font-bold transition-all">
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Chat/Clear All Dialogs (Omitted for brevity, but I'll add them if needed) -->
    <Dialog v-model:open="deleteChatDialogOpen">
      <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-[32px]">
        <DialogHeader class="items-center text-center p-6 space-y-4">
          <div class="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500">
            <Trash class="w-8 h-8" />
          </div>
          <div>
            <DialogTitle class="text-xl font-bold">Delete Session</DialogTitle>
            <DialogDescription class="text-stone-500 mt-2">
              Are you sure you want to delete "{{ chatToDelete?.title }}"?
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter class="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button @click="confirmDeleteChat" class="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all">
            Delete Session
          </button>
          <button @click="deleteChatDialogOpen = false" class="w-full py-3 rounded-2xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white font-bold transition-all">
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="clearAllChatsDialogOpen">
      <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-[32px]">
        <DialogHeader class="items-center text-center p-6 space-y-4">
          <div class="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500">
            <Trash class="w-8 h-8" />
          </div>
          <div>
            <DialogTitle class="text-xl font-bold">Clear All History</DialogTitle>
            <DialogDescription class="text-stone-500 mt-2">
              This will wipe ALL your analysis sessions permanently.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter class="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button @click="confirmClearAllChats" class="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all">
            Wipe Everything
          </button>
          <button @click="clearAllChatsDialogOpen = false" class="w-full py-3 rounded-2xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white font-bold transition-all">
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Rename Table Dialog -->
    <Dialog :open="!!renamingTable" @update:open="(val) => !val && cancelRename()">
      <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-[32px]">
        <DialogHeader class="items-center text-center p-6 space-y-4">
          <div class="w-16 h-16 rounded-3xl bg-violet-500/10 flex items-center justify-center text-violet-400">
            <Edit class="w-8 h-8" />
          </div>
          <div>
            <DialogTitle class="text-xl font-bold">Rename Table</DialogTitle>
            <DialogDescription class="text-stone-500 mt-2">
              Update the name for "{{ renamingTable?.oldName }}"
            </DialogDescription>
          </div>
        </DialogHeader>
        <div class="px-6 pb-2">
           <input 
             v-if="renamingTable"
             v-model="renamingTable.newName"
             @keydown.enter="confirmRename"
             @keydown.esc="cancelRename"
             type="text" 
             placeholder="New Table Name" 
             class="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 transition-all font-mono text-sm"
           />
        </div>
        <DialogFooter class="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button @click="confirmRename" class="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all">
            Update Name
          </button>
          <button @click="cancelRename" class="w-full py-3 rounded-2xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white font-bold transition-all">
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #1c1c1e;
  border-radius: 20px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: #2c2c2e;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.expand-enter-active, .expand-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); max-height: 400px; opacity: 1; }
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; overflow: hidden; }
</style>
