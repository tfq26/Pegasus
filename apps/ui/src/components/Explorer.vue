<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { toast } from 'vue-sonner'
import { ChevronDown, Database } from 'lucide-vue-next'
import Pagination from '@/components/ui/pagination/Pagination.vue'
import JsonViewer from '@/components/JsonViewer.vue'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CONNECTION_STORAGE_KEY, defaultConnections } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { fetchConnectionSchema, fetchTableEntries } from '@/lib/api'

const props = defineProps<{
  connections: ConnectionEntry[]
  selectedConnectionId: string
}>()

const emit = defineEmits<{
  'update:selectedConnectionId': [value: string]
  'edit-table': [connection: ConnectionEntry, table: string]
}>()

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

const chats = ref<ChatItem[]>([
  {
    id: '1',
    user: 'Pull the latest match data into today’s report',
    ai: 'Loading the matches collection so you can verify team stats.',
    queryLink: '/dashboard/matches',
  },
  {
    id: '2',
    user: 'Show me active sessions over the last hour',
    ai: 'Exploring Sessions to find recent activity so the dashboard stays live.',
  },
])

const queries = ref<QueryItem[]>([
  { id: 'q1', text: 'SELECT * FROM Logs WHERE timestamp > NOW() - INTERVAL 1 HOUR', byAI: true },
  { id: 'q2', text: 'db.matches.find({ status: "live" })', byAI: false },
  { id: 'q3', text: 'Analytics.Sessions | take 100', byAI: true },
])

const schemaFor = (id: string) => connectionSchemas.value[id]

const statusDotClasses = (status?: ConnectionSchemaState['status']) => {
  if (status === 'connected') return 'bg-emerald-500'
  if (status === 'error') return 'bg-rose-500'
  if (status === 'loading') return 'bg-amber-500/80 animate-pulse'
  return 'bg-stone-500'
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
        dbTablesCache.value[conn.id]['__root'] = schema.tables
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
    dbTablesCache.value[conn.id][db] = schema.tables

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
    <div class="flex border-b border-stone-800">
      <button
        v-for="tab in sidebarTabs"
        :key="tab"
        @click="activeTab = tab"
        class="flex-1 py-2 text-center capitalize transition-colors"
        :class="[
          activeTab === tab
            ? 'bg-stone-900 text-violet-400 font-semibold border-b-2 border-violet-500'
            : 'text-stone-400 hover:text-violet-300'
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
            <Select 
              :model-value="selectedConnectionId" 
              @update:model-value="emit('update:selectedConnectionId', $event)"
            >
              <SelectTrigger class="w-full h-9 text-xs bg-stone-950 border-stone-800">
                <SelectValue placeholder="Select a connection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="conn in connections"
                  :key="conn.id"
                  :value="conn.id"
                >
                  <div class="flex items-center gap-2">
                    <Database class="w-3 h-3 text-stone-500" />
                    <span class="font-medium">{{ conn.nickname }}</span>
                    <span class="text-[10px] text-stone-500 uppercase ml-auto">{{ conn.provider }}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Selected Connection Schema -->
          <div v-if="selectedConnectionId && connections.find(c => c.id === selectedConnectionId)" class="space-y-3">
            <article
              v-for="conn in [connections.find(c => c.id === selectedConnectionId)!]"
              :key="conn.id"
              class="rounded-md border border-stone-800 bg-stone-950 p-3 space-y-2"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-semibold text-stone-100">{{ conn.nickname }}</p>
                  <p class="text-xs text-stone-500">{{ conn.provider.toUpperCase() }}</p>
                </div>
                <div class="flex items-center gap-2 text-xs text-stone-400">
                  <span :class="['h-2 w-2 rounded-full', statusDotClasses(schemaFor(conn.id)?.status)]"></span>
                  <span>{{ statusLabel(schemaFor(conn.id)) }}</span>
                  <span class="text-[11px] text-stone-500">{{ schemaFor(conn.id)?.tables.length ?? 0 }} items</span>
                </div>
              </div>
              <p v-if="schemaFor(conn.id)?.status === 'error'" class="text-xs text-rose-400">
                {{ schemaFor(conn.id)?.error }}
              </p>

              <!-- If the schema includes discovered databases and the saved connection has no specific database, show databases to expand -->
              <div v-if="schemaFor(conn.id)?.databases && conn.provider === 'mongodb' && !(conn.mongodb && conn.mongodb.database)">
                <ul class="space-y-1">
                  <li
                    v-for="db in schemaFor(conn.id)?.databases"
                    :key="`${conn.id}-db-${db}`"
                    class="group rounded-md border border-stone-800 bg-stone-900/30 px-3 py-2 transition hover:border-violet-500 flex items-center justify-between"
                  >
                    <div class="flex items-center gap-2">
                      <button @click="loadTablesForDatabase(conn, db)" class="flex items-center gap-2 text-left">
                        <span
                          class="text-stone-400 transition-transform"
                          :style="{ transform: expandedDbByConn[conn.id] === db ? 'rotate(90deg)' : 'rotate(0deg)' }"
                        >
                          ▸
                        </span>
                        <div class="flex flex-col">
                          <span class="font-medium text-stone-100 truncate">{{ db }}</span>
                          <span class="text-[10px] uppercase tracking-[0.3em] text-stone-500">Database</span>
                        </div>
                      </button>
                    </div>
                    <div class="text-xs text-stone-400">{{ expandedDbByConn[conn.id] === db ? 'Showing' : 'Expand' }}</div>
                  </li>
                </ul>
                <p class="text-xs text-stone-500 mt-2">Select a database to list its collections.</p>
              </div>

              <!-- Otherwise show tables/collections (either from a DB-scoped probe or legacy schema) -->
              <ul v-else-if="schemaFor(conn.id)?.tables.length" class="space-y-1">
                <li
                  v-for="table in schemaFor(conn.id)?.tables"
                  :key="`${conn.id}-${table}`"
                  class="group rounded-md border border-stone-800 bg-stone-900/40 px-3 py-2 transition hover:border-violet-500"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex flex-col">
                      <span class="font-medium text-stone-100 truncate">{{ table }}</span>
                      <span class="text-[10px] uppercase tracking-[0.3em] text-stone-500">
                        {{ conn.provider === 'mongodb' ? 'Collection' : 'Table' }}
                      </span>
                    </div>
                    <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        @click="openViewer(conn, table)"
                        class="rounded-md border border-stone-700 p-2 text-stone-200 hover:border-violet-500 hover:bg-stone-800 transition-colors"
                        title="View entries"
                      >
                        <img src="/icons/eye/eye-white.svg" alt="View" class="w-4 h-4" />
                      </button>
                      <button
                        @click="handleEditTable(conn, table)"
                        class="rounded-md border border-stone-700 p-2 text-stone-200 hover:border-violet-500 hover:bg-stone-800 transition-colors"
                        title="Edit values"
                      >
                        <img src="/icons/edit/edit-white.svg" alt="Edit" class="w-4 h-4" />
                      </button>
                      <button
                        @click="handleDeleteTable(table)"
                        class="rounded-md border border-stone-700 p-2 text-stone-200 hover:border-rose-500 hover:bg-stone-800 transition-colors"
                        title="Delete table"
                      >
                        <img src="/icons/delete/delete-white.svg" alt="Delete" class="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              </ul>

              <p v-else class="text-xs text-stone-500">No tables or collections available yet.</p>
            </article>
          </div>
          <p v-else class="text-xs text-stone-500 px-2">
            Select a connection to browse its schema.
          </p>
        </div>
      </template>

      <template v-else-if="activeTab === 'chats'">
        <h2 class="px-2 py-1 font-semibold text-violet-500">Recent Chats</h2>
        <ul class="space-y-2 mt-1">
          <li
            v-for="chat in chats"
            :key="chat.id"
            class="p-2 rounded-lg bg-stone-900 hover:bg-stone-800/70 transition"
          >
            <p class="text-stone-200 text-sm font-medium">🧑 {{ chat.user }}</p>
            <p class="text-stone-400 text-xs mt-1">🤖 {{ chat.ai }}</p>
            <a
              v-if="chat.queryLink"
              :href="chat.queryLink"
              class="text-violet-400 text-xs underline mt-1 inline-block hover:text-violet-300"
            >
              View linked query
            </a>
          </li>
        </ul>
      </template>

      <template v-else>
        <h2 class="px-2 py-1 font-semibold text-violet-500">Past Queries</h2>
        <ul class="space-y-1 mt-1">
          <li
            v-for="q in queries"
            :key="q.id"
            class="flex items-center justify-between p-2 rounded-md hover:bg-stone-800/70 cursor-pointer transition"
          >
            <div class="flex items-center gap-2 truncate">
              <span
                v-if="q.byAI"
                class="inline-block w-4 h-4 bg-violet-600 rounded-sm"
                title="Generated by Pegasus AI"
              ></span>
              <span class="truncate text-stone-200 text-xs font-mono">
                {{ q.text }}
              </span>
            </div>
          </li>
        </ul>
      </template>
    </div>

    <div
      v-if="viewer.open"
      class="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/90 px-4 py-6"
      @click.self="closeViewer"
    >
      <div class="relative max-w-4xl w-full rounded-2xl border border-stone-700 bg-stone-950 p-6 shadow-2xl">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-lg font-semibold text-stone-100">Entries in {{ viewer.table }}</p>
            <p class="text-xs text-stone-400">{{ viewer.connection?.nickname }}</p>
          </div>
          <button
            @click="closeViewer"
            class="text-xs text-stone-400 hover:text-white"
          >
            Close
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div v-if="viewer.loading" class="text-xs text-stone-400">Loading rows…</div>
          <div v-else-if="viewer.error" class="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {{ viewer.error }}
          </div>
          <div v-else-if="viewer.entries.length" class="max-h-96 overflow-auto rounded-md border border-stone-800 bg-stone-900/60">
            <table class="w-full table-auto text-xs text-stone-200">
              <thead class="text-left text-[11px] uppercase tracking-[0.2em] text-stone-400">
                <tr>
                  <th class="px-2 py-1 sticky top-0 bg-stone-900 w-8"></th>
                  <th
                    v-for="col in viewerColumns"
                    :key="col"
                    class="px-2 py-1 sticky top-0 bg-stone-900"
                  >
                    {{ col }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(entry, index) in viewer.entries" :key="`row-${index}`">
                  <!-- Main row -->
                  <tr
                    class="border-t border-stone-800 hover:bg-stone-800/30 cursor-pointer transition-colors"
                    @click="toggleRowExpansion(index)"
                  >
                    <td class="px-2 py-1 align-top">
                      <ChevronDown
                        class="w-4 h-4 text-stone-500 transition-transform"
                        :class="{ 'rotate-0': expandedRows.has(index), '-rotate-90': !expandedRows.has(index) }"
                      />
                    </td>
                    <td
                      v-for="col in viewerColumns"
                      :key="`cell-${index}-${col}`"
                      class="px-2 py-1 align-top"
                    >
                      <JsonViewer v-if="isJsonValue(entry[col])" :data="entry[col]" :max-depth="1" />
                      <span v-else class="text-stone-200">{{ formatCellValue(entry[col]) }}</span>
                    </td>
                  </tr>
                  
                  <!-- Expanded row -->
                  <tr v-if="expandedRows.has(index)" class="border-t border-stone-800 bg-stone-900/80">
                    <td :colspan="viewerColumns.length + 1" class="px-4 py-3">
                      <div class="rounded-lg border border-stone-700 bg-stone-950/50 p-4">
                        <div class="flex items-center justify-between mb-3">
                          <h4 class="text-sm font-semibold text-violet-400">Full Document</h4>
                          <span class="text-[10px] text-stone-500">Row {{ index + 1 }}</span>
                        </div>
                        <JsonViewer :data="entry" :max-depth="10" />
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <p v-else class="text-xs text-stone-500">No rows were returned for {{ viewer.table }}.</p>
        </div>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Pagination
            :page="viewer.page"
            :has-prev="viewer.page > 1"
            :has-next="viewer.hasMore"
            @page-change="loadViewerPage"
          />
          <p class="text-xs text-stone-400">
            Showing up to {{ viewer.limit }} rows per page
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
