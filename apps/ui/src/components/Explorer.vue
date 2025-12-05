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
  Trash
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
import AddConnectionModal from '@/components/AddConnectionModal.vue'
import { updateConnection as apiUpdateConnection } from '@/lib/api'
import { CONNECTION_STORAGE_KEY, defaultConnections } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { fetchConnectionSchema, fetchTableEntries } from '@/lib/api'

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
}>()

const isAddConnectionModalOpen = ref(false)

const handleConnectionSelect = (value: string) => {
  if (value === 'add-new') {
    isAddConnectionModalOpen.value = true
    // Don't change selection yet
  } else {
    emit('update:selectedConnectionId', value)
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
  limit: 6,
  hasMore: false,
  error: '',
})

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
    newName: table
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

  if (newName === oldName || !newName.trim()) {
    renamingTable.value = null
    return
  }

  // TODO: Implement actual table rename via backend
  toast.info('Table rename', {
    description: `Renaming tables is not yet supported. Would rename "${oldName}" to "${newName}"`
  })

  renamingTable.value = null
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
  const next: Record<string, ConnectionSchemaState> = {}

  props.connections.forEach((conn) => {
    next[conn.id] = {
      status: 'loading',
      tables: [],
    }
  })

  connectionSchemas.value = next

  await Promise.all(
    props.connections.map(async (conn) => {
      try {
        const schema = await fetchConnectionSchema(conn)
        connectionSchemas.value[conn.id] = {
          status: 'connected',
          tables: schema.tables,
          databases: schema.databases,
        }
        // cache top-level tables so we can restore after DB-scoped views
        dbTablesCache.value[conn.id] = dbTablesCache.value[conn.id] || {}
        dbTablesCache.value[conn.id]!['__root'] = schema.tables
      } catch (error) {
        connectionSchemas.value[conn.id] = {
          status: 'error',
          tables: [],
          error: error instanceof Error ? error.message : 'Unable to reach database',
        }
      }
    }),
  )
}

watch(() => props.connections, refreshSchemas, { deep: true })

onMounted(() => {
  refreshSchemas()
})



const openViewer = (connection: ConnectionEntry, table: string) => {
  viewer.value = {
    open: true,
    connection,
    table,
    entries: [],
    loading: false,
    page: 1,
    limit: 6,
    hasMore: false,
    error: '',
  }
  expandedRows.value = new Set()
  selectedRows.value = new Set()
  loadViewerPage(1)
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

const closeViewer = () => {
  viewer.value.open = false
}

const handleEditTable = (conn: ConnectionEntry, table: string) => {
  emit('edit-table', conn, table)
}

const handleDeleteTable = (table: string) => {
  toast('Delete table', {
    description: `${table} cannot be dropped from Pegasus just yet.`,
    position: 'top-right',
  })
}

const viewerColumns = computed(() => {
  if (!viewer.value.entries.length) return []
  const columns = new Set<string>()
  viewer.value.entries.forEach((entry) => {
    Object.keys(entry).forEach((key) => columns.add(key))
  })
  return Array.from(columns)
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
            <article
              v-for="conn in [connections.find(c => c.id === selectedConnectionId)!]"
              :key="conn.id"
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
                            <span v-else class="font-medium text-foreground truncate">{{ table }}</span>
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
                              @click.stop="handleDeleteTable(table)"
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
                    </ContextMenuContent>
                  </ContextMenu>
                </li>
              </ul>

              <p v-else class="text-xs text-muted-foreground">No tables or collections available yet.</p>
            </article>
          </div>
          <p v-else class="text-xs text-muted-foreground px-2">
            Select a connection to browse its schema.
          </p>
        </div>
      </template>

      <template v-else-if="activeTab === 'chats'">
        <div class="px-2 space-y-3">
          <button @click="emit('create-chat')" class="w-full py-2 px-4 bg-primary hover:bg-primary/90 rounded-lg text-primary-foreground text-sm font-medium transition-colors shadow-lg shadow-primary/20">
            + New Chat
          </button>
          <div v-if="props.chats && props.chats.length > 0" class="space-y-2">
            <div
              v-for="chat in props.chats"
              :key="chat.id"
              @click="emit('select-chat', chat.id)"
              :class="['p-3 rounded-lg cursor-pointer transition-colors text-sm border', props.selectedChatId === chat.id ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border hover:bg-muted text-muted-foreground']"
            >
              <div class="font-medium truncate">{{ chat.title }}</div>
              <div class="text-xs text-muted-foreground/70 mt-1">{{ new Date(chat.updated_at * 1000).toLocaleDateString() }}</div>
            </div>
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
      <div class="relative max-w-4xl w-full rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-lg font-semibold text-foreground">Entries in {{ viewer.table }}</p>
            <p class="text-xs text-muted-foreground">{{ viewer.connection?.nickname }}</p>
          </div>
          <button
            @click="closeViewer"
            class="text-xs text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div v-if="viewer.loading" class="text-xs text-muted-foreground">Loading rows…</div>
          <div v-else-if="viewer.error" class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {{ viewer.error }}
          </div>
          <div v-else-if="viewer.entries.length" class="max-h-96 overflow-auto rounded-md border border-border bg-muted/30">
            <ContextMenu>
              <ContextMenuTrigger class="w-full">
                <table class="w-full table-auto text-xs text-foreground">
                  <thead class="text-left text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    <tr>
                      <th class="px-2 py-1 sticky top-0 bg-muted w-8"></th>
                      <th
                        v-for="col in viewerColumns"
                        :key="col"
                        class="px-2 py-1 sticky top-0 bg-muted"
                      >
                        {{ col }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(entry, index) in viewer.entries" :key="`row-${index}`">
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
                          <JsonViewer :data="entry" class="text-xs" />
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
  </div>
</template>
