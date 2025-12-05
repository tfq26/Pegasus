<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { fetchConnectionSchema } from '@/lib/api'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import DialogContent from '@/components/ui/dialog/DialogContent.vue'
import DialogHeader from '@/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '@/components/ui/dialog/DialogTitle.vue'
import DialogDescription from '@/components/ui/dialog/DialogDescription.vue'
import ConnectionDialog from '@/components/ConnectionDialog.vue'
import AddConnectionModal from '@/components/AddConnectionModal.vue'
import { 
  Activity,
  AlertCircle, 
  Database,
  Edit2, // Changed from Edit
  Loader2,
  Play, 
  Plus, 
  Server, 
  Trash2,
  CheckCircle2 // Added
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
  editConnection: (conn: ConnectionEntry) => void
  updateConnection: () => void
  deleteConnection: (id: string) => void
  connectionStatusFor: (id: string) => ConnectionStatusState | undefined
  statusDotClasses: (status?: ConnectionStatusState['status']) => string
  statusLabel: (state?: ConnectionStatusState) => string
  summaryFor: (conn: ConnectionEntry) => string
  testConnection: (conn: ConnectionEntry) => void
  resetConnectionForm: () => void
}>()

const isModalOpen = ref(false) // For Edit Dialog
const isAddModalOpen = ref(false) // For Add Dialog
const isEditModeForDialog = ref(false)

// The original editConnection prop needs to be adapted to set the modal state
const handleEditConnection = (conn: ConnectionEntry) => {
  isEditModeForDialog.value = true
  props.editConnection(conn) // This populates the form
  isModalOpen.value = true
}

const openAddDialog = () => {
  isAddModalOpen.value = true
}


// The following functions and refs related to the inline dialog's schema discovery are removed
// as they are now expected to be handled within the ConnectionDialog component.
// const showAdvancedKusto = ref(false)
// const closeModal = () => {
//   open.value = false
//   showAdvancedKusto.value = false
// }
// const syncMongoDatabase = (uri?: string) => {
//   if (props.connectionForm.provider !== 'mongodb') return
//   const inferred = getMongoDatabaseFromUrl(uri || props.connectionForm.mongodb.url)
//   if (inferred && !props.connectionForm.mongodb.database?.trim()) {
//     props.connectionForm.mongodb.database = inferred
//   }
// }
// const tempSchema = ref<{ tables: string[]; previews: { table: string; rows: Record<string, unknown>[] }[] }>({ tables: [], previews: [] })
// const tempDatabases = ref<string[]>([])
// const tempLoading = ref(false)
// const tempError = ref<string | null>(null)
// const tempErrorCode = ref<string | undefined>(undefined)
// let probeTimer: ReturnType<typeof setTimeout> | null = null
// const probeTempSchema = async () => {
//   if (props.connectionForm.provider !== 'mongodb') return
//   const url = props.connectionForm.mongodb.url
//   if (!url || !url.includes('mongodb') || url === 'mongodb://127.0.0.1:27017') return
//   tempLoading.value = true
//   tempError.value = null
//   tempSchema.value = { tables: [], previews: [] }
//   try {
//     const fakeEntry: ConnectionEntry = {
//       id: '__temp',
//       nickname: 'temp',
//       provider: 'mongodb',
//       mongodb: { ...props.connectionForm.mongodb },
//     }
//     const result = await fetchConnectionSchema(fakeEntry)
//     tempSchema.value = { tables: result.tables, previews: result.previews }
//     const _any = result as any
//     tempDatabases.value = _any.databases || (props.connectionForm.mongodb.database ? [props.connectionForm.mongodb.database] : [])
//     if (!props.connectionForm.mongodb.database?.trim() && tempDatabases.value.length === 1) {
//       props.connectionForm.mongodb.database = tempDatabases.value[0]!
//     }
//     if ((!tempDatabases.value || tempDatabases.value.length === 0) && !props.connectionForm.mongodb.collection?.trim() && result.tables && result.tables.length) {
//       const nonSystem = result.tables.find((t) => {
//         const lower = t.toLowerCase()
//         return !lower.startsWith('admin.') && !lower.startsWith('local.') && !lower.startsWith('config.') && !lower.includes('system.')
//       }) || result.tables[0]
//       if (nonSystem) {
//         if (nonSystem.includes('.')) {
//           const [db, coll] = nonSystem.split('.', 2)
//           props.connectionForm.mongodb.database = db!
//           props.connectionForm.mongodb.collection = coll!
//         } else {
//           props.connectionForm.mongodb.collection = nonSystem
//         }
//         if (props.canAddConnection) {
//           try {
//             props.addConnection()
//             setTimeout(() => closeModal(), 120)
//           } catch (e) {
//           }
//         }
//       }
//     }
//   } catch (err) {
//     if (err instanceof Error) {
//       tempError.value = err.message
//       tempErrorCode.value = (err as any).code
//     } else {
//       tempError.value = String(err)
//       tempErrorCode.value = undefined
//     }
//   } finally {
//     tempLoading.value = false
//   }
// }
// const displayedTables = computed(() => {
//   const tables = tempSchema.value.tables || []
//   const selectedDb = props.connectionForm.mongodb.database?.trim()
//   if (!selectedDb) return tables
//   return tables.filter(t => {
//     if (t.includes('.')) {
//       return t.split('.', 2)[0] === selectedDb
//     }
//     return true
//   })
// })
// const scheduleProbe = (delay = 350) => {
//   if (probeTimer) clearTimeout(probeTimer)
//   probeTimer = setTimeout(() => probeTempSchema(), delay)
// }
// watch(
//   () => props.connectionForm.mongodb.url,
//   (url) => {
//     syncMongoDatabase(url)
//     scheduleProbe(350)
//   },
//   { immediate: false },
// )
// watch(
//   () => props.connectionForm.provider,
//   (provider) => {
//     if (provider === 'mongodb') {
//       syncMongoDatabase()
//     }
//   },
// )
// watch(
//   () => props.connectionForm.mongodb.database,
//   (db) => {
//     if (tempDatabases.value && tempDatabases.value.length > 0) {
//       props.connectionForm.mongodb.collection = ''
//     }
//   },
// )
// const formatRow = (row: Record<string, unknown>) => {
//   const text = JSON.stringify(row, null, 2)
//   return text.length > 180 ? `${text.slice(0, 180)}…` : text
// }
</script>

<template>
  <div class="flex flex-col space-y-8 max-w-6xl mx-auto p-2">
    <!-- Header Section -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Database class="w-6 h-6 text-primary" />
          </div>
          Database Connections
        </h2>
        <p class="text-stone-400">
          Connect your data sources to start querying.
        </p>
      </div>

      <button
        @click="openAddDialog"
        class="group flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40"
      >
        <Plus class="w-4 h-4 group-hover:scale-110 transition-transform" />
        Add Connection
      </button>
    </div>

    <!-- Connection List -->
    <div v-if="props.savedConnections.length" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="conn in props.savedConnections"
        :key="conn.id"
        class="group relative flex flex-col rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/50 transition-all duration-200 overflow-hidden"
      >
        <!-- Status Bar -->
        <div class="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-stone-800 to-transparent group-hover:from-violet-500 transition-colors duration-300"></div>

        <div class="p-5 flex flex-col h-full">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-muted border border-border group-hover:border-primary/30 group-hover:bg-primary/10 transition-colors">
                <Database v-if="conn.provider === 'mysql'" class="w-5 h-5 text-blue-400" />
                <Server v-else-if="conn.provider === 'mongodb'" class="w-5 h-5 text-green-400" />
                <Activity v-else class="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 class="font-semibold text-foreground text-base leading-tight">{{ conn.nickname }}</h3>
                <p class="text-xs text-muted-foreground mt-1 font-mono uppercase tracking-wider">{{ conn.provider }}</p>
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
                @click="() => handleEditConnection(conn)"
                class="p-2 rounded-md text-stone-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                title="Edit Connection"
              >
                <Edit2 class="w-4 h-4" />
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

          <p v-if="conn.description" class="text-sm text-muted-foreground mb-4 line-clamp-2">
            {{ conn.description }}
          </p>

          <div class="mt-auto pt-4 border-t border-border">
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
              <span class="text-muted-foreground font-mono">
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
              <pre class="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground font-mono overflow-x-auto custom-scrollbar">{{ props.summaryFor(conn) }}</pre>
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center py-24 px-4 text-center rounded-2xl border border-dashed border-border bg-muted/20">
      <div class="p-4 rounded-full bg-muted mb-4">
        <Database class="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">No connections yet</h3>
      <p class="text-sm text-muted-foreground max-w-sm mb-6">
        Add a database connection to start querying your data. We support MySQL, PostgreSQL, MongoDB, and Kusto.
      </p>
      <button
        @click="openAddDialog"
        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
      >
        <Plus class="w-4 h-4" />
        Add your first connection
      </button>
    </div>

    <!-- Connection Dialog (Modal) - For Editing Only -->
    <ConnectionDialog
      v-model:open="isModalOpen"
      :is-edit-mode="true"
      :connection-form="props.connectionForm"
      :can-add-connection="props.canAddConnection"
      @save="() => {}"
      @update="props.updateConnection"
    />

    <!-- Add Connection Modal -->
    <AddConnectionModal
      v-model:open="isAddModalOpen"
    />
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
```
