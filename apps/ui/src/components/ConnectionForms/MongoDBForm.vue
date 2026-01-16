<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Loader2, Search, Database, AlertCircle, Server, Info } from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { fetchConnectionSchema } from '@/lib/api'
import { getMongoDatabaseFromUrl } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import type { ConnectionFormState } from '@/views/settings/types'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

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

const formatRow = (row: Record<string, unknown>) => {
  const text = JSON.stringify(row, null, 2)
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Connection String (URI)</label>
      <div class="relative">
        <input 
          v-model="connectionForm.mongodb.url" 
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
              type="button"
              @click="() => { connectionForm.mongodb.database = db; }" 
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
              type="button"
              @click="() => { const parts = table.split('.',2); if (parts.length === 2) { connectionForm.mongodb.database = parts[0]!; connectionForm.mongodb.collection = parts[1]!; } else { connectionForm.mongodb.collection = table } }" 
              class="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-primary/20 text-primary text-[10px] font-medium hover:bg-primary/30 transition-all"
            >
              Select
            </button>
          </div>
          
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
          v-model="connectionForm.mongodb.database" 
          placeholder="e.g. myDatabase" 
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
        <p class="text-[10px] text-muted-foreground">Leave empty to list all databases</p>
      </div>
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Collection (Optional)</label>
        <input 
          v-model="connectionForm.mongodb.collection" 
          placeholder="e.g. users" 
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
        <p class="text-[10px] text-muted-foreground">Leave empty to list all collections</p>
      </div>
    </div>

    <!-- Live Cache Toggle -->
    <div class="mt-4 border p-3 rounded-lg bg-muted/20 space-y-4">
        <div class="flex items-center justify-between space-x-2">
            <div class="space-y-0.5">
                <Label class="text-xs font-medium">Enable Live Cache</Label>
                <p class="text-[10px] text-muted-foreground">Polls database periodically for live dashboard data.</p>
            </div>
            <Switch :checked="connectionForm.mongodb.enableLiveCache" @update:checked="(v) => connectionForm.mongodb.enableLiveCache = v" />
        </div>
        
        <div v-if="connectionForm.mongodb.enableLiveCache" class="space-y-3">
             <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Polling Interval (seconds)</label>
                <input 
                    v-model.number="connectionForm.mongodb.pollingInterval" 
                    type="number"
                    min="10"
                    placeholder="300" 
                    class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
                />
                <p class="text-[10px] text-muted-foreground">Minimum 10 seconds. Default 300 (5 mins).</p>
             </div>

             <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex gap-3 items-start">
                <Info class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div class="space-y-1">
                    <p class="text-xs font-medium text-green-500">Live Dashboard Ready</p>
                    <p class="text-[10px] text-muted-foreground leading-relaxed">
                        Data will be cached in Pegasus Cloud (SurrealDB). Dashboards will stream updates in real-time.
                    </p>
                </div>
            </div>
        </div>
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
  border-radius: 0.5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #57534e;
}
</style>
