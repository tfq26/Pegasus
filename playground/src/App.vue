
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { 
  Upload, 
  Database, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Table as TableIcon,
  Layers,
  History,
  FileSpreadsheet,
  Activity,
  Zap,
  Globe,
  Settings,
  ChevronDown
} from 'lucide-vue-next'

const BACKEND_URL = 'http://localhost:3333'
const token = ref('')
const isConnected = ref(false)
const isLoading = ref(false)
const statusMessage = ref('System standby')

// Data State
const tableName = ref('')
const uploadId = ref('')
const headers = ref<string[]>([])

// State Management: Three Versions
const dbRows = ref<any[]>([])      // Exact state from Database
const syncRows = ref<any[]>([])    // Last state "Saved" to Local Sync
const localRows = ref<any[]>([])   // Current state with pending edits

// Change Tracking
const pendingEdits = computed(() => {
  const edits: Record<string, string> = {}
  localRows.value.forEach((row, rowIndex) => {
    const syncRow = syncRows.value[rowIndex]
    if (!syncRow) return
    headers.value.forEach(col => {
      if (String(row[col]) !== String(syncRow[col])) {
        edits[`${rowIndex}-${col}`] = row[col]
      }
    })
  })
  return edits
})

const uncommittedSavedChanges = computed(() => {
  const edits: Record<string, string> = {}
  syncRows.value.forEach((row, rowIndex) => {
    const dbRow = dbRows.value.find(r => r.__id === row.__id) || dbRows.value[rowIndex]
    if (!dbRow) return
    headers.value.forEach(col => {
      if (String(row[col]) !== String(dbRow[col])) {
        edits[`${rowIndex}-${col}`] = row[col]
      }
    })
  })
  return edits
})

// Lifecycle
onMounted(async () => {
  await authenticate()
  
  // Restore session
  const savedTable = localStorage.getItem('pg_tableName')
  const savedUploadId = localStorage.getItem('pg_uploadId')
  
  if (savedTable && savedUploadId) {
    tableName.value = savedTable
    uploadId.value = savedUploadId
    await fetchData()
    statusMessage.value = 'Session restored from local storage'
  }
})

function resetSession() {
  localStorage.removeItem('pg_tableName')
  localStorage.removeItem('pg_uploadId')
  tableName.value = ''
  uploadId.value = ''
  dbRows.value = []
  syncRows.value = []
  localRows.value = []
  headers.value = []
  statusMessage.value = 'Session cleared'
}

async function authenticate() {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`)
    const data = await res.json()
    if (data.token) {
      token.value = data.token
      isConnected.value = true
      statusMessage.value = 'Neural link established'
    }
  } catch (e) {
    statusMessage.value = 'Quantum server offline'
    isConnected.value = false
  }
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  isLoading.value = true
  statusMessage.value = 'Ingesting data packet...'
  
  const file = input.files[0]
  const formData = new FormData()
  formData.append('file', file)

  try {
    const res = await fetch(`${BACKEND_URL}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token.value}` },
      body: formData
    })
    const data = await res.json()
    
    if (data.success) {
      tableName.value = data.tables[0]
      uploadId.value = data.uploadId
      
      // Persist session
      localStorage.setItem('pg_tableName', tableName.value)
      localStorage.setItem('pg_uploadId', uploadId.value)
      
      await fetchData()
      statusMessage.value = 'Substrate successfully mapped'
    }
  } catch (e: any) {
    statusMessage.value = `Interference: ${e.message}`
  } finally {
    isLoading.value = false
  }
}

async function fetchData() {
  if (!tableName.value) return
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/table/${tableName.value}/query`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token.value}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: 'surrealdb',
        connection: { uploadId: uploadId.value },
        limit: 50
      })
    })
    const data = await res.json()
    
    if (data.rows) {
      if (data.rows.length > 0) {
        headers.value = Object.keys(data.rows[0]).filter(k => 
          !['id', '__id', '_row_order'].includes(k)
        )
      }
      
      dbRows.value = JSON.parse(JSON.stringify(data.rows))
      syncRows.value = JSON.parse(JSON.stringify(data.rows))
      localRows.value = JSON.parse(JSON.stringify(data.rows))
    }
  } catch (e) {
    console.error(e)
  }
}

async function handleSave() {
  isLoading.value = true
  statusMessage.value = 'Syncing memory buffers...'
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/table/${tableName.value}/operations`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token.value}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: 'surrealdb',
        connection: { uploadId: uploadId.value },
        operations: [
          {
            type: 'full_replacement',
            rows: localRows.value
          }
        ]
      })
    })

    if (res.ok) {
      syncRows.value = JSON.parse(JSON.stringify(localRows.value))
      statusMessage.value = 'Sync successful: Active memory updated'
    }
  } catch (e: any) {
    statusMessage.value = `Sync error: ${e.message}`
  } finally {
    isLoading.value = false
  }
}

async function handleCommit() {
  isLoading.value = true
  statusMessage.value = 'Persisting deltas to permanent sector...'
  
  try {
    const operations: any[] = []
    
    syncRows.value.forEach((row, idx) => {
      const dbRow = dbRows.value.find(r => r.__id === row.__id) || dbRows.value[idx]
      const changes: Record<string, any> = {}
      let hasChanges = false
      
      headers.value.forEach(col => {
        if (String(row[col]) !== String(dbRow[col])) {
          changes[col] = row[col]
          hasChanges = true
        }
      })
      
      if (hasChanges) {
        operations.push({
          type: 'update',
          id: row.id,
          changes
        })
      }
    })

    if (operations.length === 0) {
        statusMessage.value = 'No deltas found for commitment'
        isLoading.value = false
        return
    }

    const res = await fetch(`${BACKEND_URL}/api/table/${tableName.value}/operations`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token.value}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: 'surrealdb',
        connection: { uploadId: uploadId.value },
        operations
      })
    })

    if (res.ok) {
      await fetchData()
      statusMessage.value = `Commit complete: ${operations.length} sectors written`
    }
  } catch (e: any) {
    statusMessage.value = `Commit terminal error: ${e.message}`
  } finally {
    isLoading.value = false
  }
}

function updateLocal(rowIdx: number, col: string, value: string) {
  localRows.value[rowIdx][col] = value
}
</script>

<template>
  <div class="min-h-screen custom-scrollbar overflow-x-hidden">
    <!-- Hero Aura -->
    <div class="fixed top-0 left-1/4 w-1/2 h-64 bg-purple-600/10 blur-[120px] pointer-events-none"></div>

    <div class="relative z-10 p-6 md:p-12 max-w-[1600px] mx-auto space-y-10 animate-slide-up">
      <!-- Navigation / Top Bar -->
      <nav class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <div class="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[10px] font-bold tracking-widest text-white/40 uppercase">Production Preview</div>
             <span class="text-white/20 text-[10px]">•</span>
            <div class="flex items-center gap-1.5">
               <div class="status-dot"></div>
               <span class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Core Active</span>
            </div>
          </div>
          <h1 class="text-5xl font-extrabold tracking-tight title-gradient">Data Persistence <span class="text-white/20">Lab</span></h1>
        </div>

        <div class="flex items-center gap-3 glass p-2 rounded-2xl">
          <button class="p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white">
            <Globe class="w-4 h-4" />
          </button>
          <button class="p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white">
            <Settings class="w-4 h-4" />
          </button>
          <div class="h-6 w-px bg-white/10 mx-1"></div>
          <div class="flex items-center gap-3 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
            <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span class="text-xs font-semibold tabular-nums">{{ statusMessage }}</span>
          </div>
        </div>
      </nav>

      <!-- Main Interaction Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        <!-- Left Sidebar: Actions -->
        <aside class="lg:col-span-1 space-y-6">
          
          <!-- Upload Widget -->
          <div class="glass p-6 space-y-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <FileSpreadsheet class="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 class="text-sm font-bold">Import Data</h3>
                  <p class="text-[10px] text-white/30 uppercase tracking-widest font-bold">XLSX / CSV Ingestion</p>
                </div>
              </div>
            </div>

            <label class="block w-full cursor-pointer group relative">
              <div class="absolute inset-0 bg-blue-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div class="relative border-2 border-dashed border-white/5 rounded-3xl p-8 text-center group-hover:border-blue-500/40 transition-all bg-white/[0.01] hover:bg-blue-500/[0.02]">
                <input type="file" @change="handleFileUpload" class="hidden" accept=".xlsx,.csv" />
                <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Upload class="w-6 h-6 text-white/20 group-hover:text-blue-500 transition-colors" />
                </div>
                <p class="text-xs font-semibold text-white/40 group-hover:text-white/60">Initialize environment</p>
              </div>
            </label>

             <div v-if="tableName" class="flex flex-col gap-2">
                <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <span class="text-[10px] font-bold text-white/40">TABLE ID</span>
                    <span class="text-[10px] font-mono text-blue-400 truncate max-w-[120px]">{{ tableName }}</span>
                </div>
                <button @click="resetSession" class="text-xs text-red-400 hover:text-red-300 underline text-center w-full py-2">
                  Reset / Clear Session
                </button>
            </div>
          </div>

          <!-- Persistence Controls -->
          <div class="glass p-6 space-y-6" :class="{ 'opacity-30 pointer-events-none grayscale': !tableName }">
             <div class="space-y-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Zap class="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 class="text-sm font-bold">Sync & Persist</h3>
                    <p class="text-[10px] text-white/30 uppercase tracking-widest font-bold">Write Multi-Level Operations</p>
                  </div>
                </div>

                <div class="space-y-3">
                   <button 
                    @click="handleSave" 
                    :disabled="isLoading || Object.keys(pendingEdits).length === 0" 
                    class="btn-primary w-full group relative overflow-hidden"
                   >
                     <div class="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-amber-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"></div>
                     <Save class="w-4 h-4" />
                     <span>Sync to Session</span>
                     <div class="ml-auto px-2 py-0.5 bg-black/20 rounded text-[10px] tabular-nums">{{ Object.keys(pendingEdits).length }}</div>
                   </button>

                   <button 
                    @click="handleCommit" 
                    :disabled="isLoading" 
                    class="btn-primary w-full !bg-emerald-500 !text-white hover:!bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all"
                   >
                     <Database class="w-4 h-4" />
                     <span>Commit to Database</span>
                     <div class="ml-auto px-2 py-0.5 bg-black/20 rounded text-[10px] tabular-nums">{{ Object.keys(uncommittedSavedChanges).length }}</div>
                   </button>
                </div>
             </div>

             <div class="pt-6 border-t border-white/5 space-y-3">
                <h4 class="text-[10px] font-bold text-white/20 uppercase tracking-widest">Process Analytics</h4>
                <div class="grid grid-cols-2 gap-2">
                   <div class="p-3 bg-white/5 rounded-xl border border-white/10">
                      <div class="text-[10px] text-white/40 mb-1">Deltas</div>
                      <div class="text-lg font-bold tabular-nums">{{ Object.keys(pendingEdits).length }}</div>
                   </div>
                   <div class="p-3 bg-white/5 rounded-xl border border-white/10">
                      <div class="text-[10px] text-white/40 mb-1">Latency</div>
                      <div class="text-lg font-bold tabular-nums text-emerald-500">12ms</div>
                   </div>
                </div>
             </div>
          </div>
        </aside>

        <!-- Main Workspace: Visual Grid -->
        <main class="lg:col-span-3 space-y-6">
          <!-- Table Workspace Header -->
          <div v-if="tableName" class="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                   <Activity class="w-4 h-4 text-white/40" />
                </div>
                <h2 class="text-xl font-bold tracking-tight">Active Buffer <span class="text-white/20">/ {{ tableName.slice(0, 15) }}...</span></h2>
             </div>
             
             <div class="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                <div class="badge badge-blue">
                   <Clock class="w-3 h-3" /> Step 1: Local
                </div>
                <ArrowRight class="w-4 h-4 text-white/10" />
                <div class="badge badge-amber">
                   <RefreshCw class="w-3 h-3" /> Step 2: Sync
                </div>
                 <ArrowRight class="w-4 h-4 text-white/10" />
                <div class="badge badge-emerald">
                   <Database class="w-3 h-3" /> Step 3: DB
                </div>
             </div>
          </div>

          <!-- Empty State -->
          <div v-else class="glass h-[600px] flex flex-col items-center justify-center p-12 text-center space-y-8 relative overflow-hidden">
             <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/5 blur-[100px] pointer-events-none animate-pulse"></div>
             <div class="relative w-24 h-24 bg-white/[0.02] border border-white/5 rounded-[40px] flex items-center justify-center group">
                <Layers class="w-12 h-12 text-white/10 group-hover:text-blue-500/40 transition-colors duration-700" />
             </div>
             <div class="space-y-2 relative">
                <h3 class="text-2xl font-bold tracking-tight">Awaiting Initialization</h3>
                <p class="text-sm text-white/30 max-w-sm mx-auto leading-relaxed">
                   Ingest an Excel or CSV substrate to activate the multi-layer persistence visualization environment.
                </p>
             </div>
             <div class="relative pt-4">
                <div class="px-4 py-2 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold tracking-widest text-white/40 uppercase">System Ready</div>
             </div>
          </div>

          <!-- Active Grid Workspace -->
          <div v-if="tableName" class="glass overflow-hidden flex flex-col h-[700px]">
             <!-- Grid Toolbar -->
             <div class="px-6 py-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                <div class="flex items-center gap-6">
                   <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-amber-500"></div>
                      <span class="text-[10px] font-bold text-white/40 tracking-wider">UNSAVED EDITS</span>
                   </div>
                   <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span class="text-[10px] font-bold text-white/40 tracking-wider">UNCOMMITTED CHANGES</span>
                   </div>
                </div>
                <div class="flex items-center gap-2">
                   <span class="text-[10px] font-bold text-white/20">VIEW:</span>
                   <button class="p-1 px-2 bg-white/5 rounded text-[10px] font-bold hover:bg-white/10 transition-all">NORMAL</button>
                   <button class="p-1 px-2 text-white/20 rounded text-[10px] font-bold hover:bg-white/5 transition-all">DIFF ONLY</button>
                </div>
             </div>

             <!-- Table Visualizer -->
             <div class="flex-1 overflow-auto custom-scrollbar bg-black/40">
                <table>
                  <thead class="sticky top-0 z-20">
                    <tr>
                      <th class="w-12 text-center backdrop-blur-md">#</th>
                      <th v-for="h in headers" :key="h" class="backdrop-blur-md">
                        <div class="flex items-center justify-between">
                            {{ h }}
                            <ChevronDown class="w-3 h-3 opacity-20" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rIdx) in localRows" :key="rIdx" class="hover:bg-white/[0.02] active:bg-white/[0.03] transition-all">
                      <td class="text-center font-mono text-[10px] text-white/20 border-r border-white/5 tabular-nums select-none bg-black/20">{{ rIdx + 1 }}</td>
                      <td v-for="h in headers" :key="h" 
                          :class="[
                            'p-0 px-2 transition-all duration-300',
                            pendingEdits[`${rIdx}-${h}`] ? 'modified-cell' : '',
                            uncommittedSavedChanges[`${rIdx}-${h}`] ? 'uncommitted-cell' : ''
                          ]"
                      >
                         <div class="relative group h-full flex items-center">
                            <input 
                              type="text" 
                              :value="row[h]" 
                              @input="(e) => updateLocal(rIdx, h, (e.target as HTMLInputElement).value)"
                              class="w-full h-10 bg-transparent border-none px-2 text-sm focus:bg-white/5 transition-all outline-none"
                            />
                            <!-- Indicators Overlay -->
                            <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                <span v-if="pendingEdits[`${rIdx}-${h}`]" 
                                      class="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" 
                                      title="Local Edit"></span>
                                <span v-if="uncommittedSavedChanges[`${rIdx}-${h}`]" 
                                      class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                                      title="Synced to Memory"></span>
                            </div>
                         </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
             </div>

             <!-- Grid Footer Info -->
             <div class="px-6 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                 <div class="flex items-center gap-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                    <span>{{ localRows.length }} Records Ingested</span>
                    <span class="text-white/10">|</span>
                    <span>SurrealDB Cluster: US-EAST-MEM-01</span>
                 </div>
                 <div class="flex items-center gap-1">
                    <History class="w-3 h-3 text-white/20" />
                    <span class="text-[10px] font-bold text-white/20 tracking-widest uppercase">Version 1.0.4 - LATEST_SNAPSHOT</span>
                 </div>
             </div>
          </div>
        </main>
      </div>

      <!-- Global Footer -->
      <footer class="pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 opacity-30">
        <div class="flex items-center gap-4">
          <ShieldCheck class="w-5 h-5" />
          <div class="text-[10px] font-bold uppercase tracking-[0.2em] leading-tight">
            Advanced Persistence Engine<br/>
            Verified Security Protocols Active
          </div>
        </div>
        <div class="flex items-center gap-8 text-[10px] font-bold uppercase tracking-[0.2em]">
           <a href="#" class="hover:text-white transition-colors">Documentation</a>
           <a href="#" class="hover:text-white transition-colors">API Reference</a>
           <a href="#" class="hover:text-white transition-colors">System Status</a>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modified-cell {
  background: rgba(245, 158, 11, 0.04) !important;
}

.uncommitted-cell {
  background: rgba(16, 185, 129, 0.04) !important;
}

/* Add a glowing edge effect to modified cells */
.modified-cell::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
}

.uncommitted-cell::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

input:focus {
  caret-color: #3b82f6;
}
</style>
