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
  addConnection: () => void
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
  if (!url || !url.includes('mongodb')) return

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
      // immediately probe when switching to MongoDB
      probeTempSchema()
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
  <div class="flex flex-col space-y-6 max-w-5xl mx-auto">
    <h2 class="text-2xl font-semibold text-violet-400 mb-2">
      Database Connections
    </h2>

    <!-- ╔══════════════════════════════════════╗ -->
    <!--            ADD CONNECTION MODAL         -->
    <!-- ╚══════════════════════════════════════╝ -->
    <div class="flex justify-end">
      <Dialog v-model:open="open">
        <DialogTrigger>
          <button 
            class="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500"
          >
            + Add Connection
          </button>
        </DialogTrigger>

        <DialogContent class="max-w-2xl bg-stone-950 border border-stone-800 text-stone-100">
          <DialogHeader>
            <DialogTitle class="text-xl font-semibold text-violet-400">
              Add Database Connection
            </DialogTitle>
            <DialogDescription class="text-stone-500">
              Configure a new database source for Pegasus.
            </DialogDescription>
          </DialogHeader>

          <!-- ╔══════════════════════════╗ -->
          <!--         FORM BODY          -->
          <!-- ╚══════════════════════════╝ -->
          <form 
            class="space-y-4 mt-4"
            @submit.prevent="() => { props.addConnection(); closeModal() }"
          >
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="text-xs uppercase tracking-[0.3em] text-stone-500">Nickname</label>
                <input
                  v-model="props.connectionForm.nickname"
                  type="text"
                  placeholder="Pegasus Reporting"
                  class="mt-2 w-full rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm text-stone-100 focus:border-violet-500"
                />
              </div>
              <div>
                <label class="text-xs uppercase tracking-[0.3em] text-stone-500">Provider</label>
                <Select v-model="props.connectionForm.provider" class="mt-2 w-full">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                    <SelectItem value="kusto">Kusto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label class="text-xs uppercase tracking-[0.3em] text-stone-500">Description</label>
              <textarea
                v-model="props.connectionForm.description"
                rows="2"
                placeholder="Describe this connection (optional)"
                class="mt-2 w-full rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm text-stone-100 focus:border-violet-500"
              />
            </div>

            <!-- MySQL -->
            <div v-if="props.connectionForm.provider === 'mysql'" class="grid gap-3 md:grid-cols-3">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Host</label>
                <input v-model="props.connectionForm.mysql.host" placeholder="127.0.0.1" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Port</label>
                <input v-model.number="props.connectionForm.mysql.port" type="number" placeholder="3306" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Database</label>
                <input v-model="props.connectionForm.mysql.database" placeholder="pegasus" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">User</label>
                <input v-model="props.connectionForm.mysql.user" placeholder="root" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
              <div class="flex flex-col gap-1 md:col-span-2">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Password</label>
                <input v-model="props.connectionForm.mysql.password" type="password" placeholder="(optional)" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
            </div>

            <!-- MongoDB -->
            <div v-else-if="props.connectionForm.provider === 'mongodb'" class="grid gap-3 md:grid-cols-3">
              <div class="flex flex-col gap-1 md:col-span-2">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">URI</label>
                <input v-model="props.connectionForm.mongodb.url" placeholder="mongodb://localhost:27017" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
              <!-- Remove DB dropdown: DB selection will be handled in Explorer/ChatSidebar -->
              <!-- Remove collection input: user will select collection in Explorer/ChatSidebar -->
              <!-- If databases are discovered, do not show collection input; user will select DB and collection in Explorer -->
            </div>

            <!-- Live discovery: show collections discovered from the provided URI -->
            <div v-if="props.connectionForm.provider === 'mongodb'" class="mt-3">
              <p class="text-xs text-stone-400 mb-2">{{ tempDatabases.length ? 'Discovered databases' : 'Discovered collections' }}</p>

              <div v-if="tempLoading" class="text-xs text-stone-500">Scanning the server for databases and collections…</div>
              <div v-else-if="tempError" class="text-xs text-rose-400">
                <div>{{ tempError }}</div>
                <div v-if="tempErrorCode" class="text-[10px] text-stone-400 mt-1">Error code: {{ tempErrorCode }}</div>

                <div v-if="tempErrorCode === 'MongoNetworkError'" class="text-[10px] text-stone-400">Network error: check your host, DNS and that the cluster is reachable (SRV/port).</div>
                <div v-else-if="tempErrorCode === 'MongoParseError'" class="text-[10px] text-stone-400">URI parse error: validate your connection string.</div>
                <div v-else-if="tempErrorCode === 'MongoAuthenticationError' || tempErrorCode === 'AuthenticationFailed'" class="text-[10px] text-stone-400">Authentication failed: check username/password or authSource.</div>
                <div v-else-if="tempErrorCode === 'LIST_DATABASES_DENIED'" class="text-[10px] text-stone-400">Insufficient privileges to list databases. Either provide the target database in the connection string (e.g. add /your_db to the URI) or grant the user the <code>listDatabases</code> privilege.</div>
              </div>

              <ul v-else-if="!tempDatabases.length && displayedTables.length" class="space-y-2">
                <li v-for="table in displayedTables" :key="table" class="rounded-md border border-stone-800 bg-stone-900/40 px-3 py-2 text-sm">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-stone-100 font-medium">{{ table }}</p>
                      <p class="text-[10px] uppercase tracking-[0.3em] text-stone-500">Collection</p>
                    </div>
                    <div>
                      <button @click="() => { const parts = table.split('.',2); if (parts.length === 2) { props.connectionForm.mongodb.database = parts[0]; props.connectionForm.mongodb.collection = parts[1]; } else { props.connectionForm.mongodb.collection = table } }" class="rounded-md border border-stone-700 px-2 py-1 text-[11px] text-stone-200 hover:border-violet-500">Use</button>
                    </div>
                  </div>

                  <div v-if="(tempSchema.previews || []).find(p => p.table === table)?.rows.length" class="mt-2 text-[10px] text-stone-200 font-mono">
                    <div v-for="(row, idx) in (tempSchema.previews.find(p => p.table === table)?.rows || []).slice(0,2)" :key="`${table}-${idx}`">{{ formatRow(row) }}</div>
                    <p v-if="(tempSchema.previews.find(p => p.table === table)?.rows || []).length > 2" class="text-[9px] text-stone-500">and more…</p>
                  </div>
                </li>
              </ul>

              <p v-else class="text-xs text-stone-500">No collections discovered yet. Paste a MongoDB URI to scan the server.</p>
            </div>

            <!-- Kusto -->
            <div v-else class="grid gap-3 md:grid-cols-2">
              <div class="flex flex-col gap-1">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Cluster</label>
                <input v-model="props.connectionForm.kusto.cluster" placeholder="https://yourcluster.kusto.windows.net" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[10px] uppercase tracking-wide text-stone-500">Database</label>
                <input v-model="props.connectionForm.kusto.database" placeholder="Samples" class="rounded-md border border-stone-800 bg-stone-900 px-3 py-2 text-sm" />
              </div>
            </div>

            <DialogFooter class="flex justify-end mt-6">
              <button
                type="button"
                @click="closeModal"
                class="px-4 py-2 rounded-md border border-stone-700 text-stone-300 hover:bg-stone-800"
              >
                Cancel
              </button>

              <button
                :disabled="!props.canAddConnection"
                class="ml-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                Save connection
              </button>
            </DialogFooter>

          </form>
        </DialogContent>
      </Dialog>
    </div>

    <!-- ╔══════════════════════════════════════╗ -->
    <!--            SAVED CONNECTIONS           -->
    <!-- ╚══════════════════════════════════════╝ -->
    <div class="space-y-3 mt-4">
      <h3 class="text-sm font-semibold text-stone-300">Saved connections</h3>

      <div v-if="props.savedConnections.length" class="space-y-2">
        <article
          v-for="conn in props.savedConnections"
          :key="conn.id"
          class="rounded-md border border-stone-800 bg-stone-950 p-3 text-sm"
        >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-stone-100">{{ conn.nickname }}</p>
                <p class="text-xs text-stone-500">{{ conn.provider.toUpperCase() }}</p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  @click="props.testConnection(conn)"
                  :disabled="props.connectionStatusFor(conn.id)?.status === 'loading'"
                  class="px-3 py-1 rounded-md border border-violet-600 text-xs font-semibold uppercase tracking-[0.3em] text-violet-300 hover:border-violet-400 disabled:opacity-40"
                >
                  Test
                </button>
                <button
                  @click="props.deleteConnection(conn.id)"
                  class="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400 hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
            </div>

          <div class="mt-2 flex items-center justify-between text-xs text-stone-400">
            <div class="flex items-center gap-2">
              <span
                :class="[
                  'h-2 w-2 rounded-full',
                  props.statusDotClasses(props.connectionStatusFor(conn.id)?.status),
                ]"
              />
              <span class="font-semibold text-stone-200">
                {{ props.statusLabel(props.connectionStatusFor(conn.id)) }}
              </span>
            </div>

            <span>{{ props.connectionStatusFor(conn.id)?.tables.length ?? 0 }} tables</span>
          </div>

          <p
            v-if="props.connectionStatusFor(conn.id)?.status === 'error'"
            class="mt-1 text-xs text-rose-400"
          >
            <span class="font-semibold text-rose-300 mr-1">Reason:</span>
            {{ props.connectionStatusFor(conn.id)?.error ?? 'Connection failed unexpectedly.' }}
            <div v-if="props.connectionStatusFor(conn.id)?.errorCode === 'LIST_DATABASES_DENIED'" class="mt-1 text-[10px] text-stone-400">
              Insufficient privileges to list databases. Add the target database to the connection (e.g. append <code>/your_db</code> to the URI) or grant the user the <code>listDatabases</code> privilege.
            </div>
          </p>

          <p v-if="conn.description" class="mt-2 text-xs text-stone-500">
            {{ conn.description }}
          </p>

          <pre class="mt-2 rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2 text-[10px] text-stone-300">
{{ props.summaryFor(conn) }}
          </pre>

          <div
            v-if="props.connectionStatusFor(conn.id)?.previews?.length"
            class="mt-3 space-y-2 text-[10px] text-stone-100"
          >
            <div
              v-for="preview in props.connectionStatusFor(conn.id)?.previews"
              :key="`${conn.id}-${preview.table}`"
              class="rounded-md border border-stone-800 bg-stone-900/50 p-3 space-y-1"
            >
              <p class="text-[9px] uppercase tracking-[0.4em] text-stone-500">
                {{ preview.table }}
              </p>

              <div v-if="preview.rows.length" class="space-y-1">
                <div
                  v-for="(row, rowIndex) in preview.rows.slice(0, 2)"
                  :key="`${conn.id}-${preview.table}-${rowIndex}`"
                  class="font-mono text-[10px] text-stone-200 leading-tight">
                  {{ formatRow(row) }}
                </div>
                <p
                  v-if="preview.rows.length > 2"
                  class="text-[9px] text-stone-500"
                >
                  and {{ preview.rows.length - 2 }} more rows…
                </p>
              </div>
              <p v-else class="text-[9px] text-stone-500 italic">No rows yet.</p>
            </div>
          </div>
        </article>
      </div>

      <p v-else class="text-xs text-stone-500">
        No connections saved yet. Add one to begin querying in the Pegasus Chat editor.
      </p>
    </div>
  </div>
</template>
