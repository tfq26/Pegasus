<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { fetchConnectionSchema } from '@/lib/api'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import DialogContent from '@/components/ui/dialog/DialogContent.vue'
import DialogHeader from '@/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '@/components/ui/dialog/DialogTitle.vue'
import DialogDescription from '@/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '@/components/ui/dialog/DialogFooter.vue'
import DialogTrigger from '@/components/ui/dialog/DialogTrigger.vue'
import { 
  Activity,
  AlertCircle, 
  Database,
  Edit,
  Loader2,
  Play, 
  Plus, 
  Search, 
  Server, 
  Trash2
} from 'lucide-vue-next'

import { 
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from '@/components/ui/select'

import type { ConnectionEntry } from '@/lib/db-connections'
import { getMongoDatabaseFromUrl } from '@/lib/db-connections'
import type { ConnectionFormState, ConnectionStatusState } from './types'

const props = defineProps<{
  connectionForm: ConnectionFormState
  savedConnections: ConnectionEntry[]
  canAddConnection: boolean
  isEditMode: boolean
  addConnection: () => void
  editConnection: (conn: ConnectionEntry) => void
  updateConnection: () => void
  deleteConnection: (id: string) => void
  connectionStatusFor: (id: string) => ConnectionStatusState | undefined
  statusDotClasses: (status?: ConnectionStatusState['status']) => string
  statusLabel: (state?: ConnectionStatusState) => string
  summaryFor: (conn: ConnectionEntry) => string
  testConnection: (conn: ConnectionEntry) => void
}>()

const open = ref(false)

const closeModal = () => {
  open.value = false
}

const syncMongoDatabase = (uri?: string) => {
  if (props.connectionForm.provider !== 'mongodb') return
  const inferred = getMongoDatabaseFromUrl(uri || props.connectionForm.mongodb.url)
  if (inferred && !props.connectionForm.mongodb.database?.trim()) {
    props.connectionForm.mongodb.database = inferred
  }
}

// Temporary schema state shown inside the Add Connection dialog
const tempSchema = ref<{ tables: string[]; previews: { table: string; rows: Record<string, unknown>[] }[] }>({ tables: [], previews: [] })
// discovered databases returned by the backend when no DB was provided in the URI
const tempDatabases = ref<string[]>([])
const tempLoading = ref(false)
const tempError = ref<string | null>(null)
const tempErrorCode = ref<string | undefined>(undefined)

let probeTimer: ReturnType<typeof setTimeout> | null = null

const probeTempSchema = async () => {
  if (props.connectionForm.provider !== 'mongodb') return
  const url = props.connectionForm.mongodb.url
  // Don't scan if empty, invalid, or is the default placeholder
  if (!url || !url.includes('mongodb') || url === 'mongodb://127.0.0.1:27017') return

  tempLoading.value = true
  tempError.value = null
  tempSchema.value = { tables: [], previews: [] }

  try {
    const fakeEntry: ConnectionEntry = {
      id: '__temp',
      nickname: 'temp',
      provider: 'mongodb',
      mongodb: { ...props.connectionForm.mongodb },
    }

    const result = await fetchConnectionSchema(fakeEntry)
    tempSchema.value = { tables: result.tables, previews: result.previews }
    const _any = result as any
    tempDatabases.value = _any.databases || (props.connectionForm.mongodb.database ? [props.connectionForm.mongodb.database] : [])
    // If the probe found exactly one database and the user hasn't provided one, auto-fill it
    if (!props.connectionForm.mongodb.database?.trim() && tempDatabases.value.length === 1) {
      props.connectionForm.mongodb.database = tempDatabases.value[0]
    }
    // If the backend did NOT return a list of databases, we can still auto-select a collection
    // (legacy flow for servers that return collections directly). When databases are returned
    // we only auto-fill the DB (handled above) and let the user pick the DB — not the collection.
    if ((!tempDatabases.value || tempDatabases.value.length === 0) && !props.connectionForm.mongodb.collection?.trim() && result.tables && result.tables.length) {
      const nonSystem = result.tables.find((t) => {
        const lower = t.toLowerCase()
        return !lower.startsWith('admin.') && !lower.startsWith('local.') && !lower.startsWith('config.') && !lower.includes('system.')
      }) || result.tables[0]

      if (nonSystem) {
        if (nonSystem.includes('.')) {
          const [db, coll] = nonSystem.split('.', 2)
          props.connectionForm.mongodb.database = db
          props.connectionForm.mongodb.collection = coll
        } else {
          props.connectionForm.mongodb.collection = nonSystem
        }

        // Legacy behavior: if UI allows adding this connection, save it and close the modal for a smoother flow
        if (props.canAddConnection) {
          try {
            props.addConnection()
            // small delay to let any state updates propagate visually
            setTimeout(() => closeModal(), 120)
          } catch (e) {
            // swallow - addConnection should handle its own errors
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      tempError.value = err.message
      // some errors carry a code attached by the API helper (see api.ts)
      tempErrorCode.value = (err as any).code
    } else {
      tempError.value = String(err)
      tempErrorCode.value = undefined
    }
  } finally {
    tempLoading.value = false
  }
}

// computed list of tables to display: if a DB is selected, only show collections for that DB
const displayedTables = computed(() => {
  const tables = tempSchema.value.tables || []
  const selectedDb = props.connectionForm.mongodb.database?.trim()
  if (!selectedDb) return tables
  return tables.filter(t => {
    if (t.includes('.')) {
      return t.split('.', 2)[0] === selectedDb
    }
    return true
  })
})

const scheduleProbe = (delay = 350) => {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = setTimeout(() => probeTempSchema(), delay)
}

watch(
  () => props.connectionForm.mongodb.url,
  (url) => {
    syncMongoDatabase(url)
    // debounce the probe when the user pastes/types the URI
    scheduleProbe(350)
  },
  { immediate: false },
)

watch(
  () => props.connectionForm.provider,
  (provider) => {
    if (provider === 'mongodb') {
      syncMongoDatabase()
      // Don't immediately probe when switching to MongoDB to avoid scanning the placeholder
    }
  },
)

// If the backend returned databases and the user picks one, ensure we don't keep a collection value
watch(
  () => props.connectionForm.mongodb.database,
  (db) => {
    if (tempDatabases.value && tempDatabases.value.length > 0) {
      // clear collection field when DB is explicitly selected from discovered databases
      props.connectionForm.mongodb.collection = ''
    }
  },
)

const formatRow = (row: Record<string, unknown>) => {
  const text = JSON.stringify(row, null, 2)
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}
</script>

<template>
  <div class="flex flex-col space-y-8 max-w-6xl mx-auto p-2">
    <!-- Header Section -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <div class="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Database class="w-6 h-6 text-violet-400" />
          </div>
          Database Connections
        </h2>
        <p class="text-stone-400 mt-2 text-sm max-w-lg">
          Manage your database connections. Pegasus uses these connections to query data and generate insights.
        </p>
      </div>

      <Dialog v-model:open="open">
        <DialogTrigger>
          <button 
            class="group flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-all shadow-lg shadow-violet-900/20 hover:shadow-violet-900/40"
          >
            <Plus class="w-4 h-4 group-hover:scale-110 transition-transform" />
            Add Connection
          </button>
        </DialogTrigger>

        <DialogContent class="max-w-2xl bg-stone-950 border border-stone-800 text-stone-100 sm:rounded-xl shadow-2xl shadow-black/50">
          <DialogHeader>
            <DialogTitle class="text-xl font-semibold text-violet-400 flex items-center gap-2">
              <Database class="w-5 h-5" />
              {{ props.isEditMode ? 'Edit Database Connection' : 'Add Database Connection' }}
            </DialogTitle>
            <DialogDescription class="text-stone-500">
              {{ props.isEditMode ? 'Update your database connection settings.' : 'Configure a new database source for Pegasus to access.' }}
            </DialogDescription>
          </DialogHeader>

          <form 
            class="space-y-6 mt-4"
            @submit.prevent="() => { props.isEditMode ? props.updateConnection() : props.addConnection(); closeModal() }"
          >
            <div class="grid gap-6 md:grid-cols-2">
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wider text-stone-500">Nickname</label>
                <input
                  v-model="props.connectionForm.nickname"
                  type="text"
                  placeholder="e.g. Production DB"
                  class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2.5 text-sm text-stone-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors placeholder:text-stone-600"
                />
              </div>
              <div class="space-y-2">
                <label class="text-xs font-semibold uppercase tracking-wider text-stone-500">Provider</label>
                <Select v-model="props.connectionForm.provider">
                  <SelectTrigger class="w-full rounded-lg border-stone-800 bg-stone-900/50 h-[42px]">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent class="bg-stone-900 border-stone-800">
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                    <SelectItem value="kusto">Kusto</SelectItem>
                    <SelectItem value="sqlite">SQLite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wider text-stone-500">Description</label>
              <textarea
                v-model="props.connectionForm.description"
                rows="2"
                placeholder="Optional description for this connection..."
                class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2.5 text-sm text-stone-100 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors placeholder:text-stone-600 resize-none"
              />
            </div>

            <div class="h-px bg-stone-800/50 my-4"></div>

            <!-- MySQL -->
            <div v-if="props.connectionForm.provider === 'mysql'" class="grid gap-4 md:grid-cols-3">
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Host</label>
                <input v-model="props.connectionForm.mysql.host" placeholder="127.0.0.1" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Port</label>
                <input v-model.number="props.connectionForm.mysql.port" type="number" placeholder="3306" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Database</label>
                <input v-model="props.connectionForm.mysql.database" placeholder="pegasus" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">User</label>
                <input v-model="props.connectionForm.mysql.user" placeholder="root" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5 md:col-span-2">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Password</label>
                <input v-model="props.connectionForm.mysql.password" type="password" placeholder="(optional)" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
            </div>

            <!-- PostgreSQL -->
            <div v-else-if="props.connectionForm.provider === 'postgres'" class="grid gap-4 md:grid-cols-3">
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Host</label>
                <input v-model="props.connectionForm.postgres.host" placeholder="127.0.0.1" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Port</label>
                <input v-model.number="props.connectionForm.postgres.port" type="number" placeholder="5432" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Database</label>
                <input v-model="props.connectionForm.postgres.database" placeholder="postgres" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">User</label>
                <input v-model="props.connectionForm.postgres.user" placeholder="postgres" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5 md:col-span-2">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Password</label>
                <input v-model="props.connectionForm.postgres.password" type="password" placeholder="(optional)" class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" />
              </div>
              <div class="space-y-1.5 md:col-span-3">
                 <label class="flex items-center gap-2 text-sm text-stone-400 cursor-pointer">
                    <input type="checkbox" v-model="props.connectionForm.postgres.ssl" class="rounded border-stone-700 bg-stone-900/50 text-violet-600 focus:ring-violet-500" />
                    Enable SSL (Required for most cloud databases)
                 </label>
              </div>
            </div>

            <!-- MongoDB -->
            <div v-else-if="props.connectionForm.provider === 'mongodb'" class="space-y-4">
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Connection String (URI)</label>
                <div class="relative">
                  <input 
                    v-model="props.connectionForm.mongodb.url" 
                    placeholder="mongodb://localhost:27017" 
                    class="w-full rounded-lg border border-stone-800 bg-stone-900/50 pl-3 pr-10 py-2 text-sm focus:border-violet-500 transition-colors font-mono" 
                  />
                  <div class="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 v-if="tempLoading" class="w-4 h-4 text-violet-500 animate-spin" />
                    <Search v-else class="w-4 h-4 text-stone-600" />
                  </div>
                </div>
              </div>

              <!-- Live discovery -->
              <div class="rounded-lg border border-stone-800 bg-stone-900/30 p-4">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-xs font-medium text-stone-400">
                    {{ tempDatabases.length ? 'Discovered Databases' : 'Discovered Collections' }}
                  </p>
                  <span v-if="tempLoading" class="text-[10px] text-violet-400 animate-pulse">Scanning...</span>
                </div>

                <div v-if="tempError" class="rounded bg-rose-950/20 border border-rose-900/50 p-3">
                  <div class="flex items-start gap-2">
                    <AlertCircle class="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <div class="space-y-1">
                      <p class="text-xs text-rose-400">{{ tempError }}</p>
                      <p v-if="tempErrorCode" class="text-[10px] text-rose-500/70 font-mono">Code: {{ tempErrorCode }}</p>
                    </div>
                  </div>
                </div>

                <!-- Discovered Databases -->
                <div v-else-if="tempDatabases.length" class="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  <div v-for="db in tempDatabases" :key="db" class="group rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2.5 hover:border-violet-500/50 transition-colors">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Database class="w-3.5 h-3.5 text-stone-500 group-hover:text-violet-400 transition-colors" />
                        <span class="text-sm text-stone-200 font-medium">{{ db }}</span>
                      </div>
                      <button 
                        @click="() => { props.connectionForm.mongodb.database = db; }" 
                        class="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-violet-600/20 text-violet-300 text-[10px] font-medium hover:bg-violet-600/30 transition-all"
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Discovered Collections (when no databases) -->
                <div v-else-if="!tempDatabases.length && displayedTables.length" class="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  <div v-for="table in displayedTables" :key="table" class="group rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2.5 hover:border-violet-500/50 transition-colors">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Database class="w-3.5 h-3.5 text-stone-500 group-hover:text-violet-400 transition-colors" />
                        <span class="text-sm text-stone-200 font-medium">{{ table }}</span>
                      </div>
                      <button 
                        @click="() => { const parts = table.split('.',2); if (parts.length === 2) { props.connectionForm.mongodb.database = parts[0]; props.connectionForm.mongodb.collection = parts[1]; } else { props.connectionForm.mongodb.collection = table } }" 
                        class="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-violet-600/20 text-violet-300 text-[10px] font-medium hover:bg-violet-600/30 transition-all"
                      >
                        Select
                      </button>
                    </div>
                    
                    <!-- Preview Data -->
                    <div v-if="(tempSchema.previews || []).find(p => p.table === table)?.rows.length" class="mt-2 pl-5">
                       <div class="text-[10px] text-stone-500 mb-1">Preview:</div>
                       <div class="space-y-1">
                          <div v-for="(row, idx) in (tempSchema.previews.find(p => p.table === table)?.rows || []).slice(0,2)" :key="`${table}-${idx}`" class="font-mono text-[9px] text-stone-400 bg-black/20 p-1 rounded truncate">
                            {{ formatRow(row) }}
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <div v-else-if="!tempLoading" class="text-center py-6 text-stone-600">
                  <Server class="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p class="text-xs">Enter a valid connection string to discover databases.</p>
                </div>
              </div>

              <!-- Manual Database/Collection Input -->
              <div class="grid gap-4 md:grid-cols-2 mt-4">
                <div class="space-y-1.5">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Database (Optional)</label>
                  <input 
                    v-model="props.connectionForm.mongodb.database" 
                    placeholder="e.g. myDatabase" 
                    class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" 
                  />
                  <p class="text-[10px] text-stone-600">Leave empty to list all databases</p>
                </div>
                <div class="space-y-1.5">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Collection (Optional)</label>
                  <input 
                    v-model="props.connectionForm.mongodb.collection" 
                    placeholder="e.g. users" 
                    class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" 
                  />
                  <p class="text-[10px] text-stone-600">Leave empty to list all collections</p>
                </div>
              </div>
            </div>

            <!-- Kusto -->
            <!-- Kusto -->
            <div v-else-if="props.connectionForm.provider === 'kusto'" class="space-y-4">
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Cluster URL</label>
                <input 
                  v-model="props.connectionForm.kusto.cluster" 
                  placeholder="https://<cluster>.<region>.kusto.windows.net" 
                  class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" 
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Database Name</label>
                <input 
                  v-model="props.connectionForm.kusto.database" 
                  placeholder="e.g. MyDatabase" 
                  class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" 
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Tenant ID</label>
                <input 
                  v-model="props.connectionForm.kusto.tenantId" 
                  placeholder="Azure Tenant ID" 
                  class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" 
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Client ID</label>
                <input 
                  v-model="props.connectionForm.kusto.clientId" 
                  placeholder="Azure Client ID (App ID)" 
                  class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" 
                />
              </div>
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Client Secret</label>
                <input 
                  v-model="props.connectionForm.kusto.clientSecret" 
                  type="password"
                  placeholder="Azure Client Secret" 
                  class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors" 
                />
              </div>

              <!-- Helper Text -->
              <div class="rounded-md bg-stone-900/50 p-3 text-[11px] text-stone-400 border border-stone-800 mt-2">
                <p class="font-medium text-stone-300 mb-1">How to get these credentials:</p>
                <ol class="list-decimal list-inside space-y-0.5">
                  <li>Go to <a href="https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps" target="_blank" class="text-violet-400 hover:underline">Azure Portal > App registrations</a>.</li>
                  <li>Create a new registration. Copy <strong>Client ID</strong> & <strong>Tenant ID</strong> from Overview.</li>
                  <li>Go to <strong>Certificates & secrets</strong> to create a new <strong>Client Secret</strong>.</li>
                  <li>In Kusto, add this App as a user in the <strong>Permissions</strong> tab.</li>
                </ol>
              </div>
            </div>

            <!-- SQLite -->
            <div v-else-if="props.connectionForm.provider === 'sqlite'" class="space-y-4">
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Database File Path</label>
                <input 
                  v-model="props.connectionForm.sqlite.path" 
                  placeholder="/path/to/database.db or :memory:" 
                  class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-sm focus:border-violet-500 transition-colors font-mono" 
                />
                <p class="text-[10px] text-stone-600">Absolute path to your SQLite database file, or ":memory:" for in-memory database</p>
              </div>

              <!-- Helper Text -->
              <div class="rounded-md bg-stone-900/50 p-3 text-[11px] text-stone-400 border border-stone-800">
                <p class="font-medium text-stone-300 mb-1">Example paths:</p>
                <ul class="list-disc list-inside space-y-0.5">
                  <li><code class="text-violet-400">/Users/taufeeqali/Projects/Pegasus/apps/backend/test-data.db</code></li>
                  <li><code class="text-violet-400">./data/myapp.db</code> (relative to backend directory)</li>
                  <li><code class="text-violet-400">:memory:</code> (temporary in-memory database)</li>
                </ul>
              </div>
            </div>

            <DialogFooter class="flex justify-end gap-3 pt-4 border-t border-stone-800/50">
              <button
                type="button"
                @click="closeModal"
                class="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 text-sm font-medium hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>

              <button
                :disabled="!props.canAddConnection"
                class="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/20"
              >
                {{ props.isEditMode ? 'Update Connection' : 'Save Connection' }}
              </button>
            </DialogFooter>

          </form>
        </DialogContent>
      </Dialog>
    </div>

    <!-- Saved Connections Grid -->
    <div v-if="props.savedConnections.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <article
        v-for="conn in props.savedConnections"
        :key="conn.id"
        class="group relative flex flex-col rounded-xl border border-stone-800 bg-stone-950/50 hover:bg-stone-900/40 hover:border-stone-700 transition-all duration-200 overflow-hidden"
      >
        <!-- Status Bar -->
        <div class="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-stone-800 to-transparent group-hover:from-violet-500 transition-colors duration-300"></div>

        <div class="p-5 flex flex-col h-full">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-stone-900 border border-stone-800 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 transition-colors">
                <Database v-if="conn.provider === 'mysql'" class="w-5 h-5 text-blue-400" />
                <Server v-else-if="conn.provider === 'mongodb'" class="w-5 h-5 text-green-400" />
                <Activity v-else class="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 class="font-semibold text-stone-100 text-base leading-tight">{{ conn.nickname }}</h3>
                <p class="text-xs text-stone-500 mt-1 font-mono uppercase tracking-wider">{{ conn.provider }}</p>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <button
                @click="props.testConnection(conn)"
                :disabled="props.connectionStatusFor(conn.id)?.status === 'loading'"
                class="p-2 rounded-md text-stone-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                title="Test Connection"
              >
                <Play class="w-4 h-4" :class="{ 'animate-pulse': props.connectionStatusFor(conn.id)?.status === 'loading' }" />
              </button>
              <button
                @click="() => { props.editConnection(conn); open = true; }"
                class="p-2 rounded-md text-stone-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                title="Edit Connection"
              >
                <Edit class="w-4 h-4" />
              </button>
              <button
                @click="props.deleteConnection(conn.id)"
                class="p-2 rounded-md text-stone-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Remove Connection"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <p v-if="conn.description" class="text-sm text-stone-400 mb-4 line-clamp-2">
            {{ conn.description }}
          </p>

          <div class="mt-auto pt-4 border-t border-stone-800/50">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <div class="relative flex h-2.5 w-2.5">
                  <span 
                    v-if="props.connectionStatusFor(conn.id)?.status === 'connected'"
                    class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                  ></span>
                  <span 
                    :class="[
                      'relative inline-flex rounded-full h-2.5 w-2.5',
                      props.statusDotClasses(props.connectionStatusFor(conn.id)?.status)
                    ]"
                  ></span>
                </div>
                <span class="font-medium text-stone-300">
                  {{ props.statusLabel(props.connectionStatusFor(conn.id)) }}
                </span>
              </div>
              <span class="text-stone-500 font-mono">
                {{ props.connectionStatusFor(conn.id)?.tables.length ?? 0 }} tables
              </span>
            </div>

            <!-- Error Message -->
            <div v-if="props.connectionStatusFor(conn.id)?.status === 'error'" class="mt-3 rounded bg-rose-950/20 border border-rose-900/30 p-2">
              <p class="text-[10px] text-rose-400 leading-relaxed">
                <span class="font-bold text-rose-300">Error:</span>
                {{ props.connectionStatusFor(conn.id)?.error ?? 'Connection failed.' }}
              </p>
            </div>

            <!-- Connection Details Code Block -->
            <div class="mt-3 group/code relative">
              <pre class="rounded-lg border border-stone-800 bg-black/40 px-3 py-2 text-[10px] text-stone-400 font-mono overflow-x-auto custom-scrollbar">{{ props.summaryFor(conn) }}</pre>
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center py-24 px-4 text-center rounded-2xl border border-dashed border-stone-800 bg-stone-900/20">
      <div class="p-4 rounded-full bg-stone-900/50 mb-4">
        <Database class="w-8 h-8 text-stone-600" />
      </div>
      <h3 class="text-lg font-semibold text-stone-200 mb-2">No connections yet</h3>
      <p class="text-sm text-stone-500 max-w-sm mb-6">
        Add a database connection to start querying your data. We support MySQL, PostgreSQL, MongoDB, and Kusto.
      </p>
      <button 
        @click="open = true"
        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-800 text-stone-200 text-sm font-medium hover:bg-stone-700 hover:text-white transition-colors"
      >
        <Plus class="w-4 h-4" />
        Add your first connection
      </button>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #44403c;
  border-radius: 2px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #57534e;
}
</style>
