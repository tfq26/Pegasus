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
} from 'lucide-vue-next'
import Pagination from '@/components/ui/pagination/Pagination.vue'
import JsonViewer from '@/components/JsonViewer.vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
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
import { fetchConnectionSchema, fetchTableEntries, fetchTableCount } from '@/lib/api'

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

const isAddConnectionModalOpen = ref(false)

const handleConnectionSelect = (value: string) => {
  if (value === 'add-new') {
    isAddConnectionModalOpen.value = true
    // Don't change selection yet
  } else {
    emit('update:selectedConnectionId', value)
  }
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
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/api/chats/${chatToDelete.value.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete chat')
    }
    
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
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/api/chats`, {
      method: 'DELETE',
      credentials: 'include',
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to clear chats')
    }
    
    const result = await response.json()
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
  <div class="flex flex-col h-full text-sm select-none">
    <div class="flex border-b border-border">
      <button
        v-for="tab in sidebarTabs"
        :key="tab"
        @click="activeTab = tab"
        class="flex-1 py-2 text-center capitalize transition-colors"
        :class="[
          activeTab === tab
            ? 'bg-muted/50 text-primary font-semibold border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
        ]"
      >
        {{ tab }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-3">
      <template v-if="activeTab === 'data'">
        <div class="space-y-3">
          <!-- Connection Selector -->
          <div class="px-1">
            <Select :model-value="selectedConnectionId" @update:model-value="handleConnectionSelect">
              <SelectTrigger class="w-full h-9 text-xs bg-background border-border text-foreground">
                <SelectValue placeholder="Select a connection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add-new" class="text-primary font-medium cursor-pointer">
                  <div class="flex items-center gap-2">
                    <Plus class="w-3 h-3" />
                    <span>Add New Connection</span>
                  </div>
                </SelectItem>
                <SelectSeparator />
                <SelectItem v-if="connections.length === 0" value="no-connections" disabled>
                  <span class="text-muted-foreground">No databases found</span>
                </SelectItem>
                <template v-else>
                  <SelectItem
                    v-for="conn in connections"
                    :key="conn.id"
                    :value="conn.id"
                  >
                    <div class="flex items-center gap-2">
                      <Database class="w-3 h-3 text-muted-foreground" />
                      <span class="font-medium text-foreground">{{ conn.nickname }}</span>
                      <!-- <span class="text-[10px] text-muted-foreground uppercase ml-auto">{{ conn.provider }}</span> -->
                    </div>
                  </SelectItem>
                </template>
              </SelectContent>
            </Select>
          </div>

          <!-- Selected Connection Schema -->
          <div v-if="selectedConnectionId && connections.find(c => c.id === selectedConnectionId)" class="space-y-3">
            <ContextMenu
              v-for="conn in [connections.find(c => c.id === selectedConnectionId)!]"
              :key="conn.id"
            >
              <ContextMenuTrigger class="w-full">
                <article
                  class="rounded-md border border-border bg-card p-3 space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-semibold text-foreground">{{ conn.nickname }}</p>
                      <p class="text-xs text-muted-foreground">{{ conn.provider.toUpperCase() }}</p>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-muted-foreground">
                      <span :class="['h-2 w-2 rounded-full', statusDotClasses(schemaFor(conn.id)?.status)]"></span>
                      <span>{{ statusLabel(schemaFor(conn.id)) }}</span>
                      <span class="text-[11px] text-muted-foreground">{{ schemaFor(conn.id)?.tables.length ?? 0 }} items</span>
                    </div>
                  </div>
                  <p v-if="schemaFor(conn.id)?.status === 'error'" class="text-xs text-destructive">
                    {{ schemaFor(conn.id)?.error }}
                  </p>

                  <!-- If the schema includes discovered databases and the saved connection has no specific database, show databases to expand -->
                  <div v-if="schemaFor(conn.id)?.databases && conn.provider === 'mongodb' && !(conn.mongodb && conn.mongodb.database)">
                    <ul class="space-y-1">
                      <li
                        v-for="db in schemaFor(conn.id)?.databases"
                        :key="`${conn.id}-db-${db}`"
                        class="group rounded-md border border-border bg-muted/30 px-3 py-2 transition hover:border-primary flex items-center justify-between"
                      >
                        <div class="flex items-center gap-2">
                          <button @click="loadTablesForDatabase(conn, db)" class="flex items-center gap-2 text-left">
                            <span
                              class="text-muted-foreground transition-transform"
                              :style="{ transform: expandedDbByConn[conn.id] === db ? 'rotate(90deg)' : 'rotate(0deg)' }"
                            >
                              ▸
                            </span>
                            <div class="flex flex-col">
                              <span class="font-medium text-foreground truncate">{{ db }}</span>
                              <span class="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Database</span>
                            </div>
                          </button>
                        </div>
                        <div class="text-xs text-muted-foreground">{{ expandedDbByConn[conn.id] === db ? 'Showing' : 'Expand' }}</div>
                      </li>
                    </ul>
                    <p class="text-xs text-muted-foreground mt-2">Select a database to list its collections.</p>
                  </div>

                  <!-- Otherwise show tables/collections (either from a DB-scoped probe or legacy schema) -->
                  <ul v-else-if="schemaFor(conn.id)?.tables.length" class="space-y-1">
                    <li
                      v-for="table in schemaFor(conn.id)?.tables"
                      :key="`${conn.id}-${table}`"
                    >
                      <ContextMenu>
                        <ContextMenuTrigger class="w-full">
                          <div class="group rounded-md border border-border bg-muted/30 px-3 py-2 transition hover:border-primary">
                            <div class="flex items-center justify-between gap-2">
                              <div class="flex flex-col flex-1 min-w-0">
                                <input
                                  v-if="renamingTable?.oldName === table && renamingTable?.conn.id === conn.id"
                                  v-model="renamingTable.newName"
                                  @keyup.enter="confirmRename"
                                  @keyup.escape="cancelRename"
                                  @blur="confirmRename"
                                  class="font-medium text-foreground bg-muted border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                  @click.stop
                                />
                                <span v-else class="font-medium text-foreground truncate">{{ formatTableName(table, conn.id) }}</span>
                                <span class="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                                  {{ conn.provider === 'mongodb' ? 'Collection' : 'Table' }}
                                </span>
                              </div>
                              <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                                <button
                                  @click.stop="openViewer(conn, table)"
                                  class="rounded-md border border-border p-2 text-muted-foreground hover:text-primary hover:border-primary hover:bg-muted transition-colors"
                                  title="View entries"
                                >
                                  <Eye class="w-4 h-4" />
                                </button>
                                <button
                                  @click.stop="handleEditTable(conn, table)"
                                  class="rounded-md border border-border p-2 text-muted-foreground hover:text-primary hover:border-primary hover:bg-muted transition-colors"
                                  title="Edit values"
                                >
                                  <Edit class="w-4 h-4" />
                                </button>
                                <button
                                  @click.stop="handleDeleteTable(conn, table)"
                                  class="rounded-md border border-border p-2 text-muted-foreground hover:text-destructive hover:border-destructive hover:bg-muted transition-colors"
                                  title="Delete table"
                                >
                                  <Trash class="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        
                        <ContextMenuContent class="w-56 bg-popover border-border">
                          <ContextMenuItem 
                            @select="copyAllTableData(conn, table)"
                            class="text-foreground hover:bg-muted focus:bg-muted"
                          >
                            Copy All Data
                          </ContextMenuItem>
                          <ContextMenuItem 
                            @select="startRenameTable(conn, table)"
                            class="text-foreground hover:bg-muted focus:bg-muted"
                          >
                            Rename Table
                          </ContextMenuItem>
                          <ContextMenuItem 
                            @select="$emit('sanitize-table', conn, table)"
                            class="text-foreground hover:bg-muted focus:bg-muted"
                          >
                            Sanitize Table
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </li>
                  </ul>

                  <div v-else class="text-xs text-muted-foreground space-y-2">
                    <p>No tables or collections available yet.</p>
                    <button
                      @click="handleDeleteConnection(conn)"
                      class="text-red-600 dark:text-red-400 hover:underline text-xs"
                    >
                      Delete this connection
                    </button>
                  </div>
                </article>
              </ContextMenuTrigger>
              
              <ContextMenuContent class="w-56 bg-popover border-border">
                <ContextMenuItem 
                  @select="refreshSchemas()"
                  class="text-foreground hover:bg-muted focus:bg-muted"
                >
                  <RefreshCw class="w-4 h-4 mr-2" />
                  Refresh Schema
                </ContextMenuItem>
                <ContextMenuItem 
                  @select="handleDeleteConnection(conn)"
                  class="text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash class="w-4 h-4 mr-2" />
                  Delete Connection
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
          <p v-else class="text-xs text-muted-foreground px-2">
            Select a connection to browse its schema.
          </p>
        </div>
      </template>


      <template v-else-if="activeTab === 'chats'">
        <div class="px-2 space-y-3">
          <div class="flex gap-2">
            <button @click="emit('create-chat')" class="flex-1 py-2 px-4 bg-primary hover:bg-primary/90 rounded-lg text-primary-foreground text-sm font-medium transition-colors shadow-lg shadow-primary/20">
              + New Chat
            </button>
            <button 
              v-if="props.chats && props.chats.length > 0"
              @click="handleClearAllChats" 
              class="py-2 px-3 bg-destructive/10 hover:bg-destructive/20 rounded-lg text-destructive text-sm font-medium transition-colors border border-destructive/20"
              title="Clear all chats"
            >
              Clear All
            </button>
          </div>
          <div v-if="props.chats && props.chats.length > 0" class="space-y-2">
            <ContextMenu v-for="chat in props.chats" :key="chat.id">
              <ContextMenuTrigger class="w-full">
                <div
                  @click="emit('select-chat', chat.id)"
                  :class="['p-3 rounded-lg cursor-pointer transition-colors text-sm border', props.selectedChatId === chat.id ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border hover:bg-muted text-muted-foreground']"
                >
                  <div class="font-medium truncate">{{ chat.title }}</div>
                  <div class="text-xs text-muted-foreground/70 mt-1">{{ formatDate(chat.updated_at) }}</div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent class="w-48 bg-popover border-border">
                <ContextMenuItem 
                  @select="handleDeleteChat(chat)"
                  class="text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash class="w-4 h-4 mr-2" />
                  Delete Chat
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
          <div v-else class="text-center text-muted-foreground text-sm py-8">
            No chats yet. Start a new conversation!
          </div>
        </div>
      </template>

      <template v-else>
        <div class="px-2 space-y-3">
          <h2 class="py-1 font-semibold text-primary">Past Queries</h2>
          <div v-if="props.queryHistory && props.queryHistory.length > 0" class="space-y-1">
            <div
              v-for="q in props.queryHistory"
              :key="q.id"
              @click="() => { console.log('Explorer: clicked query', q.query); emit('load-query', q.query) }"
              class="flex items-center justify-between p-2 rounded-md hover:bg-muted/70 cursor-pointer transition"
            >
              <div class="flex items-center gap-2 truncate flex-1 min-w-0">
                <span
                  v-if="q.source === 'ai'"
                  class="inline-block w-4 h-4 bg-primary rounded-sm flex-shrink-0"
                  title="Generated by Pegasus AI"
                ></span>
                <span class="truncate text-foreground text-xs font-mono">
                  {{ q.query }}
                </span>
              </div>
              <span class="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                {{ new Date(q.timestamp).toLocaleTimeString() }}
              </span>
            </div>
          </div>
          <div v-else class="text-center text-muted-foreground text-sm py-8">
            No queries yet. Run a query to see it here!
          </div>
        </div>
      </template>
    </div>

    <div
      v-if="viewer.open"
      class="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4 py-6"
      @click.self="closeViewer"
    >
      <div class="relative max-w-[95vw] w-full max-h-[70vh] h-[70vh] overflow-hidden flex flex-col rounded-lg border border-border bg-background p-6 shadow-2xl">
        <div class="flex items-center justify-between flex-shrink-0 mb-4">
          <div>
            <p class="text-lg font-semibold text-foreground">Entries in {{ formatTableName(viewer.table, viewer.connection?.id) }}</p>
            <p class="text-xs text-muted-foreground">{{ viewer.connection?.nickname }}</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">Text Size:</span>
              <button 
                @click="decreaseViewerZoom" 
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                :disabled="viewerZoomLevel === 0"
              >
                <Minus class="w-4 h-4" />
              </button>
              <button 
                @click="increaseViewerZoom" 
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                :disabled="viewerZoomLevel === viewerZoomClasses.length - 1"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>
            <button
              @click="closeViewer"
              class="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>

        <div class="flex-1 flex flex-col min-h-0 space-y-3">
          <!-- Search Box -->
          <div class="flex items-center gap-2 px-1">
            <div class="relative flex-1">
              <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search in table..."
                class="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <span v-if="searchQuery" class="text-xs text-muted-foreground whitespace-nowrap">
              {{ filteredAndSortedRows.length }} of {{ viewerDataRows.length }} rows
            </span>
          </div>
          
          <div v-if="viewer.loading" class="text-xs text-muted-foreground">Loading rows…</div>
          <div v-else-if="viewer.error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {{ viewer.error }}
          </div>
          <div v-else-if="viewer.entries.length" class="flex-1 overflow-auto rounded-md border border-border bg-muted/30">
            <ContextMenu>
              <ContextMenuTrigger class="w-full">
                <table :class="['w-full table-auto text-foreground', viewerTextSizeClass]">
                  <thead class="text-left text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    <tr>
                      <th class="px-2 py-1 sticky top-0 bg-muted w-8"></th>
                      <th
                        v-for="col in viewerColumns"
                        :key="col"
                        @click="toggleSort(col)"
                        class="px-2 py-1 sticky top-0 bg-muted cursor-pointer hover:bg-muted/80 transition-colors select-none group"
                        :class="{ 'text-primary font-semibold': sortColumn === col }"
                      >
                        <div class="flex items-center gap-1">
                          <span>{{ col }}</span>
                          <span class="opacity-0 group-hover:opacity-100 transition-opacity" :class="{ '!opacity-100': sortColumn === col }">
                            <span v-if="sortColumn === col && sortDirection === 'asc'">↑</span>
                            <span v-else-if="sortColumn === col && sortDirection === 'desc'">↓</span>
                            <span v-else class="text-muted-foreground/50">↕</span>
                          </span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(entry, index) in filteredAndSortedRows" :key="`row-${index}`">
                      <!-- Main row -->
                      <tr
                        :class="[
                          'border-t border-border transition-colors',
                          selectedRows.has(index) 
                            ? 'bg-primary/20 hover:bg-primary/30' 
                            : 'hover:bg-muted/30'
                        ]"
                        @click="(e) => { 
                          if (!e.defaultPrevented) {
                            toggleRowSelection(index, e)
                          }
                        }"
                      >
                        <td class="px-2 py-1 align-top">
                          <button 
                            @click.stop="toggleRowExpansion(index)"
                            class="text-muted-foreground hover:text-foreground p-0.5 rounded"
                          >
                            <component :is="expandedRows.has(index) ? ChevronDown : ChevronRight" class="w-3 h-3" />
                          </button>
                        </td>
                        <td
                          v-for="col in viewerColumns"
                          :key="col"
                          class="px-2 py-1 align-top max-w-[200px] truncate"
                          :title="String(entry[col])"
                        >
                          <span v-if="isJsonValue(entry[col])" class="font-mono text-[10px] text-blue-400">
                            {{ formatCellValue(entry[col]) }}
                          </span>
                          <span v-else>
                            {{ formatCellValue(entry[col]) }}
                          </span>
                        </td>
                      </tr>
                      <!-- Expanded row details -->
                      <tr v-if="expandedRows.has(index)" class="bg-muted/10">
                        <td :colspan="viewerColumns.length + 1" class="px-4 py-2">
                          <JsonViewer :data="entry" :text-size="viewerTextSizeClass" />
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </ContextMenuTrigger>
              <ContextMenuContent class="w-56 bg-popover border-border">
                <ContextMenuItem @select="copySelectedRows" class="text-foreground hover:bg-muted focus:bg-muted">
                  Copy Selected Rows
                </ContextMenuItem>
                <ContextMenuItem @select="copyAllRows" class="text-foreground hover:bg-muted focus:bg-muted">
                  Copy All Rows
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
          <div v-else class="text-xs text-muted-foreground">No entries found.</div>
          
          <Pagination
            :page="viewer.page"
            :has-prev="viewer.page > 1"
            :has-next="viewer.hasMore"
            :total-pages="viewer.total ? Math.ceil(viewer.total / viewer.limit) : undefined"
            @page-change="loadViewerPage"
          />
          <div class="flex items-center gap-4 text-xs text-muted-foreground">
            <span v-if="selectedRows.size > 0" class="text-primary font-medium">
              {{ selectedRows.size }} selected
            </span>
            <span>
              Showing up to {{ viewer.limit }} rows per page
            </span>
          </div>
        </div>
      </div>
    </div>

    <AddConnectionModal
      v-model:open="isAddConnectionModalOpen"
    />
    
    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Table</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete "{{ tableToDelete ? formatTableName(tableToDelete.table, tableToDelete.conn.id) : '' }}"?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <button
            @click="deleteDialogOpen = false"
            class="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            @click="confirmDelete"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    <!-- Delete Connection Dialog -->
    <Dialog v-model:open="deleteConnectionDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Connection</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the connection "{{ connectionToDelete?.nickname }}"? 
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <button
            @click="deleteConnectionDialogOpen = false"
            class="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            @click="confirmDeleteConnection"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
          >
          Delete Connection
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    <!-- Delete Chat Dialog -->
    <Dialog v-model:open="deleteChatDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Chat</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{{ chatToDelete?.title }}"? 
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <button
            @click="deleteChatDialogOpen = false"
            class="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            @click="confirmDeleteChat"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Delete Chat
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    <!-- Clear All Chats Dialog -->
    <Dialog v-model:open="clearAllChatsDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear All Chats</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete ALL chats? 
            This will permanently delete all your chat history and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <button
            @click="clearAllChatsDialogOpen = false"
            class="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            @click="confirmClearAllChats"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Clear All Chats
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
