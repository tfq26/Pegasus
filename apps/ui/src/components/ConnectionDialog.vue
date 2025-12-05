<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { fetchConnectionSchema } from '@/lib/api'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import DialogContent from '@/components/ui/dialog/DialogContent.vue'
import DialogHeader from '@/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '@/components/ui/dialog/DialogTitle.vue'
import DialogDescription from '@/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '@/components/ui/dialog/DialogFooter.vue'
import { 
  AlertCircle, 
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  Search, 
  Server, 
  Upload
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
import type { ConnectionFormState } from '@/views/settings/types'
import { uploadFile } from '@/lib/api'

const props = defineProps<{
  open: boolean
  isEditMode: boolean
  connectionForm: ConnectionFormState
  canAddConnection: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': []
  'update': []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const showAdvancedKusto = ref(false)

const closeModal = () => {
  isOpen.value = false
  showAdvancedKusto.value = false
}

// ... (Logic from DatabaseConnectionsTab.vue) ...
// We need to duplicate or move the probing logic here if we want it to work in the dialog.
// For now, I'll copy the essential parts for MongoDB discovery.

const tempSchema = ref<{ tables: string[]; previews: { table: string; rows: Record<string, unknown>[] }[] }>({ tables: [], previews: [] })
const tempDatabases = ref<string[]>([])
const tempLoading = ref(false)
const tempError = ref<string | null>(null)
const tempErrorCode = ref<string | undefined>(undefined)
let probeTimer: ReturnType<typeof setTimeout> | null = null

const probeTempSchema = async () => {
  if (props.connectionForm.provider !== 'mongodb') return
  const url = props.connectionForm.mongodb.url
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
    
    if (!props.connectionForm.mongodb.database?.trim() && tempDatabases.value.length === 1) {
      props.connectionForm.mongodb.database = tempDatabases.value[0]!
    }
  } catch (err) {
    if (err instanceof Error) {
      tempError.value = err.message
      tempErrorCode.value = (err as any).code
    } else {
      tempError.value = String(err)
      tempErrorCode.value = undefined
    }
  } finally {
    tempLoading.value = false
  }
}

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
    if (props.connectionForm.provider === 'mongodb') {
        const inferred = getMongoDatabaseFromUrl(url)
        if (inferred && !props.connectionForm.mongodb.database?.trim()) {
            props.connectionForm.mongodb.database = inferred
        }
        scheduleProbe(350)
    }
  },
  { immediate: false },
)

watch(
  () => props.connectionForm.provider,
  (provider) => {
    if (provider === 'mongodb') {
      // syncMongoDatabase()
    }
  },
)

const formatRow = (row: Record<string, unknown>) => {
  const text = JSON.stringify(row, null, 2)
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}

// File Upload Logic
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files[0]
  if (!file) return
  isUploading.value = true

  try {
    const result = await uploadFile(file)
    if (result.success) {
      props.connectionForm.sqlite.path = result.dbPath
      // Auto-set nickname if empty
      if (!props.connectionForm.nickname) {
        props.connectionForm.nickname = file.name.split('.')[0]
      }
    } else {
      tempError.value = (result.error as string) || 'Upload failed'
    }
  } catch (e) {
    tempError.value = e instanceof Error ? e.message : 'Upload failed'
  } finally {
    isUploading.value = false
  }
}

</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-w-2xl bg-background border border-border text-foreground sm:rounded-xl shadow-2xl">
      <DialogHeader>
        <DialogTitle class="text-xl font-semibold text-primary flex items-center gap-2">
          <Database class="w-5 h-5" />
          {{ props.isEditMode ? 'Edit Database Connection' : 'Add Database Connection' }}
        </DialogTitle>
        <DialogDescription class="text-muted-foreground">
          {{ props.isEditMode ? 'Update your database connection settings.' : 'Configure a new database source for Pegasus to access.' }}
        </DialogDescription>
      </DialogHeader>

      <form 
        class="space-y-6 mt-4"
        @submit.prevent="() => { props.isEditMode ? emit('update') : emit('save'); closeModal() }"
      >
        <div class="grid gap-6 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nickname</label>
            <input
              v-model="props.connectionForm.nickname"
              type="text"
              placeholder="e.g. Production DB"
              class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider</label>
            <Select v-model="props.connectionForm.provider">
              <SelectTrigger class="w-full rounded-lg border-input bg-background h-[42px]">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent class="bg-popover border-border">
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
                <SelectItem value="mongodb">MongoDB</SelectItem>
                <SelectItem value="kusto">Kusto</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="file">File Import (Excel/JSON/XML)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
          <textarea
            v-model="props.connectionForm.description"
            rows="2"
            placeholder="Optional description for this connection..."
            class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground resize-none"
          />
        </div>

        <div class="h-px bg-border my-4"></div>

        <!-- File Import -->
        <div v-if="props.connectionForm.provider === 'file'" class="space-y-4">
             <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Upload File</label>
                <div class="flex items-center gap-3">
                    <input 
                        type="file" 
                        ref="fileInput"
                        accept=".xlsx,.xml,.json"
                        @change="handleFileUpload"
                        class="hidden"
                    />
                    <button 
                        type="button"
                        @click="fileInput?.click()"
                        class="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-input hover:border-primary hover:bg-muted/50 transition-colors text-sm text-muted-foreground"
                    >
                        <Upload class="w-4 h-4" />
                        {{ isUploading ? 'Uploading...' : 'Choose File (Excel, JSON, XML)' }}
                    </button>
                    <span v-if="props.connectionForm.sqlite.path" class="text-xs text-emerald-400">
                        File uploaded successfully!
                    </span>
                </div>
                <p class="text-[10px] text-muted-foreground">Supported formats: .xlsx, .xml, .json</p>
             </div>
             <!-- Hidden SQLite path field -->
             <input type="hidden" v-model="props.connectionForm.sqlite.path" />
        </div>

        <!-- MySQL -->
        <div v-else-if="props.connectionForm.provider === 'mysql'" class="grid gap-4 md:grid-cols-3">
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Host</label>
            <input v-model="props.connectionForm.mysql.host" placeholder="127.0.0.1" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Port</label>
            <input v-model.number="props.connectionForm.mysql.port" type="number" placeholder="3306" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database</label>
            <input v-model="props.connectionForm.mysql.database" placeholder="pegasus" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">User</label>
            <input v-model="props.connectionForm.mysql.user" placeholder="root" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Password</label>
            <input v-model="props.connectionForm.mysql.password" type="password" placeholder="(optional)" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
        </div>

        <!-- PostgreSQL -->
        <div v-else-if="props.connectionForm.provider === 'postgres'" class="grid gap-4 md:grid-cols-3">
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Host</label>
            <input v-model="props.connectionForm.postgres.host" placeholder="127.0.0.1" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Port</label>
            <input v-model.number="props.connectionForm.postgres.port" type="number" placeholder="5432" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database</label>
            <input v-model="props.connectionForm.postgres.database" placeholder="postgres" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">User</label>
            <input v-model="props.connectionForm.postgres.user" placeholder="postgres" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Password</label>
            <input v-model="props.connectionForm.postgres.password" type="password" placeholder="(optional)" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5 md:col-span-3">
                <label class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" v-model="props.connectionForm.postgres.ssl" class="rounded border-input bg-background text-primary focus:ring-primary" />
                Enable SSL (Required for most cloud databases)
                </label>
            </div>
        </div>

        <!-- MongoDB -->
        <div v-else-if="props.connectionForm.provider === 'mongodb'" class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Connection String (URI)</label>
            <div class="relative">
              <input 
                v-model="props.connectionForm.mongodb.url" 
                placeholder="mongodb://localhost:27017" 
                class="w-full rounded-lg border border-input bg-background pl-3 pr-10 py-2 text-sm focus:border-primary transition-colors font-mono" 
              />
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 v-if="tempLoading" class="w-4 h-4 text-primary animate-spin" />
                <Search v-else class="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          <!-- Live discovery -->
          <div class="rounded-lg border border-border bg-muted/30 p-4">
            <div class="flex items-center justify-between mb-3">
              <p class="text-xs font-medium text-muted-foreground">
                {{ tempDatabases.length ? 'Discovered Databases' : 'Discovered Collections' }}
              </p>
              <span v-if="tempLoading" class="text-[10px] text-primary animate-pulse">Scanning...</span>
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
              <div v-for="db in tempDatabases" :key="db" class="group rounded-md border border-border bg-background px-3 py-2.5 hover:border-primary/50 transition-colors">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Database class="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span class="text-sm text-foreground font-medium">{{ db }}</span>
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
              <div v-for="table in displayedTables" :key="table" class="group rounded-md border border-border bg-background px-3 py-2.5 hover:border-primary/50 transition-colors">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Database class="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span class="text-sm text-foreground font-medium">{{ table }}</span>
                  </div>
                  <button 
                    @click="() => { const parts = table.split('.',2); if (parts.length === 2) { props.connectionForm.mongodb.database = parts[0]!; props.connectionForm.mongodb.collection = parts[1]!; } else { props.connectionForm.mongodb.collection = table } }" 
                    class="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-primary/20 text-primary text-[10px] font-medium hover:bg-primary/30 transition-all"
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
              <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database (Optional)</label>
              <input 
                v-model="props.connectionForm.mongodb.database" 
                placeholder="e.g. myDatabase" 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
              />
              <p class="text-[10px] text-muted-foreground">Leave empty to list all databases</p>
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Collection (Optional)</label>
              <input 
                v-model="props.connectionForm.mongodb.collection" 
                placeholder="e.g. users" 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
              />
              <p class="text-[10px] text-muted-foreground">Leave empty to list all collections</p>
            </div>
          </div>
        </div>

        <!-- Kusto -->
        <div v-else-if="props.connectionForm.provider === 'kusto'" class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Cluster URL</label>
            <input 
              v-model="props.connectionForm.kusto.cluster" 
              placeholder="https://<cluster>.<region>.kusto.windows.net" 
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database Name</label>
            <input 
              v-model="props.connectionForm.kusto.database" 
              placeholder="e.g. MyDatabase" 
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
            />
          </div>

          <!-- Advanced Auth Toggle -->
          <div class="pt-2">
            <button 
              type="button" 
              @click="showAdvancedKusto = !showAdvancedKusto"
              class="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium select-none"
            >
              <component :is="showAdvancedKusto ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" />
              Advanced Authentication (Service Principal)
            </button>
          </div>

          <div v-if="showAdvancedKusto" class="space-y-4 pl-3 border-l-2 border-border ml-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
            <div class="space-y-1.5">
              <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Tenant ID</label>
              <input 
                v-model="props.connectionForm.kusto.tenantId" 
                placeholder="Azure Tenant ID" 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Client ID</label>
              <input 
                v-model="props.connectionForm.kusto.clientId" 
                placeholder="Azure Client ID (App ID)" 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Client Secret</label>
              <input 
                v-model="props.connectionForm.kusto.clientSecret" 
                type="password"
                placeholder="Azure Client Secret" 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
              />
            </div>
          </div>
        </div>

        <!-- SQLite -->
        <div v-else-if="props.connectionForm.provider === 'sqlite'" class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database Path or URL</label>
            <input 
              v-model="props.connectionForm.sqlite.path" 
              placeholder="/path/to/db.sqlite or https://...turso.io" 
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors font-mono" 
            />
            <p class="text-[10px] text-muted-foreground">Absolute path to local file, ":memory:", or Turso Database URL</p>
          </div>

          <div class="space-y-1.5">
            <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Auth Token (Optional)</label>
            <input 
              v-model="props.connectionForm.sqlite.authToken" 
              type="password"
              placeholder="Turso Auth Token" 
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors font-mono" 
            />
            <p class="text-[10px] text-muted-foreground">Required for remote Turso connections</p>
          </div>
        </div>

        <DialogFooter class="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            @click="closeModal"
            class="px-4 py-2 rounded-lg border border-input text-muted-foreground text-sm font-medium hover:bg-muted transition-colors"
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
