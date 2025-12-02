<template>
  <div class="min-h-screen bg-stone-950 text-stone-100 flex overflow-hidden">
    <aside
      class="w-64 border-r border-stone-800 bg-stone-900/80 backdrop-blur-md p-6 flex flex-col sticky top-0 h-screen overflow-y-auto z-10"
    >
      <h2 class="text-xl font-semibold text-violet-400 mb-6">Settings</h2>
      <nav class="space-y-2">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'w-full text-left px-3 py-2 rounded-md transition-all duration-200 text-sm font-medium',
            activeTab === tab.id
              ? 'bg-violet-600/20 text-violet-400 border border-violet-500/40'
              : 'text-stone-400 hover:bg-stone-800 hover:text-violet-300'
          ]"
        >
          {{ tab.label }}
        </button>
      </nav>
    </aside>

    <main class="flex-1 flex flex-col h-screen overflow-hidden bg-stone-950 relative">
      <div class="flex-1 overflow-y-auto p-10 pb-32">
        <section v-if="activeTab === 'general'" class="fade-section">
          <GeneralTab :settings="settings" :is-dark="isDark" :toggle-theme="toggleTheme" />
        </section>

        <section v-if="activeTab === 'ai'" class="fade-section">
          <AITab :settings="settings" />
        </section>

        <section v-if="activeTab === 'queries'" class="fade-section">
          <QueriesTab :settings="settings" />
        </section>

        <section v-if="activeTab === 'data'" class="fade-section">
          <DataTab :settings="settings" />
        </section>

        <section v-if="activeTab === 'cloud'" class="fade-section">
          <CloudTab :settings="settings" />
        </section>

        <section v-if="activeTab === 'view'" class="fade-section">
          <ViewTab :settings="settings" />
        </section>

        <section v-if="activeTab === 'integrations'" class="fade-section">
          <IntegrationsTab :settings="settings" />
        </section>

        <section v-if="activeTab === 'database'" class="fade-section h-full">
          <DatabaseConnectionsTab
            :connection-form="connectionForm"
            :saved-connections="savedConnections"
            :can-add-connection="canAddConnection"
            :is-edit-mode="isEditMode"
            :add-connection="addConnection"
            :edit-connection="editConnection"
            :update-connection="updateConnection"
            :delete-connection="deleteConnection"
            :connection-status-for="connectionStatusFor"
            :status-dot-classes="statusDotClasses"
            :status-label="statusLabel"
            :summary-for="summaryFor"
            :test-connection="testConnection"
          />
        </section>
      </div>

      <!-- Sticky Footer Action Bar -->
      <div class="absolute bottom-0 left-0 right-0 border-t border-stone-800 bg-stone-900/90 backdrop-blur-md p-4 flex justify-between items-center z-20">
        <div class="text-xs text-stone-500">
          <span v-if="activeTab === 'database'">Database connections are saved automatically.</span>
          <span v-else>Changes are saved locally.</span>
        </div>
        <button
          v-if="activeTab !== 'database'"
          class="px-6 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition shadow-lg shadow-violet-900/20"
          @click="saveSettings"
        >
          Save Changes
        </button>
      </div>
    </main>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { toast } from 'vue-sonner'
import GeneralTab from './GeneralTab.vue'
import AITab from './AITab.vue'
import QueriesTab from './QueriesTab.vue'
import DataTab from './DataTab.vue'
import CloudTab from './CloudTab.vue'
import ViewTab from './ViewTab.vue'
import IntegrationsTab from './IntegrationsTab.vue'
import DatabaseConnectionsTab from './DatabaseConnectionsTab.vue'
import { CONNECTION_STORAGE_KEY, defaultConnections } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { fetchConnectionSchema } from '@/lib/api'
import type { SettingsModel, ConnectionFormState, ConnectionStatusState } from './types'

defineOptions({ name: 'SettingsPage' })

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'Pegasus AI' },
  { id: 'queries', label: 'Queries' },
  { id: 'data', label: 'Data' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'view', label: 'View' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'database', label: 'Database Connections' }
]

const activeTab = ref('general')

// --- Theme ---
const isDark = ref(document.documentElement.classList.contains('dark'))

const toggleTheme = () => {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

onMounted(() => {
  const saved = localStorage.getItem('theme')
  if (saved) {
    document.documentElement.classList.toggle('dark', saved === 'dark')
    isDark.value = saved === 'dark'
  }
})

onMounted(() => {
  loadConnections()
})

// --- Settings model ---
const settings = ref<SettingsModel>({
  language: 'English',
  aiDetail: 1,
  enableContext: true,
  enableCodeHints: true,
  autoSaveQueries: true,
  syntaxHighlighting: true,
  showQueryTips: false,
  autoRefresh: true,
  showRowCount: true,
  cloudProvider: 'Azure',
  cloudRegion: 'eastus2',
  showDashboardGrid: true,
  compactMode: false,
  githubConnected: false,
  slackConnected: false,
  azureConnected: true,
})

const savedConnections = ref<ConnectionEntry[]>([])
const connectionStatuses = ref<Record<string, ConnectionStatusState>>({})
const editingConnectionId = ref<string | null>(null)
const connectionForm = reactive<ConnectionFormState>({
  nickname: '',
  description: '',
  provider: 'mysql',
  mysql: {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'pegasus',
  },
  mongodb: {
    url: 'mongodb://127.0.0.1:27017',
    database: '',
    collection: '',
  },
  kusto: {
    cluster: 'https://help.kusto.windows.net',
    database: 'Samples',
    tenantId: '',
    clientId: '',
    clientSecret: '',
  },
  sqlite: {
    path: '',
  },
  postgres: {
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'postgres',
    ssl: false
  }
})

const canAddConnection = computed(() => connectionForm.nickname.trim().length > 0)
const isEditMode = computed(() => editingConnectionId.value !== null)

const connectionStatusFor = (id: string) => connectionStatuses.value[id]

const statusDotClasses = (status?: ConnectionStatusState['status']) => {
  if (status === 'connected') return 'bg-emerald-500'
  if (status === 'error') return 'bg-rose-500'
  if (status === 'loading') return 'bg-amber-500/80 animate-pulse'
  return 'bg-stone-500'
}

const statusLabel = (state?: ConnectionStatusState) => {
  if (!state) return 'Unknown'
  if (state.status === 'connected') return 'Connected'
  if (state.status === 'loading') return 'Connecting...'
  return 'Connection error'
}

const updateConnectionStatus = (id: string, state: ConnectionStatusState) => {
  connectionStatuses.value = { ...connectionStatuses.value, [id]: state }
}

const probeConnection = async (conn: ConnectionEntry) => {
  updateConnectionStatus(conn.id, { status: 'loading', tables: [], previews: [] })

  try {
    const schema = await fetchConnectionSchema(conn)
    updateConnectionStatus(conn.id, {
      status: 'connected',
      tables: schema.tables,
      previews: schema.previews,
    })
    return schema
  } catch (error) {
    updateConnectionStatus(conn.id, {
      status: 'error',
      tables: [],
      error: error instanceof Error ? error.message : 'Unable to reach database',
      errorCode: (error as any)?.code,
    })
    return undefined
  }
}

const refreshConnectionStatuses = async () => {
  if (typeof window === 'undefined') return

  const next: Record<string, ConnectionStatusState> = {}
  savedConnections.value.forEach((conn) => {
    next[conn.id] = { status: 'loading', tables: [], previews: [] }
  })
  connectionStatuses.value = next

  await Promise.all(
    savedConnections.value.map((conn) => probeConnection(conn))
  )
}

const testConnection = async (conn: ConnectionEntry) => {
  const schema = await probeConnection(conn)
  if (schema) {
    console.log(`[/test-connection] ${conn.nickname ?? conn.id} returned ${schema.tables.length} tables`)
  } else {
    console.log(`[/test-connection] ${conn.nickname ?? conn.id} failed to fetch schema`)
  }
}

const commitConnections = (emitEvent = true) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(savedConnections.value))
  if (emitEvent) {
    window.dispatchEvent(new CustomEvent('pegasus:connections-updated'))
  }
}

const resetConnectionForm = () => {
  editingConnectionId.value = null
  const fresh: ConnectionFormState = {
    nickname: '',
    description: '',
    provider: 'mysql',
    mysql: {
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'pegasus',
    },
    mongodb: {
      url: 'mongodb://127.0.0.1:27017',
      database: '',
      collection: '',
    },
    kusto: {
      cluster: 'https://help.kusto.windows.net',
      database: 'Samples',
      tenantId: '',
      clientId: '',
      clientSecret: '',
    },
    sqlite: {
      path: '',
    },
    postgres: {
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'postgres',
      ssl: false
    }
  }
  Object.assign(connectionForm, fresh)
}

const summaryFor = (conn: ConnectionEntry) => {
  const payload =
    conn.provider === 'mysql'
      ? conn.mysql
      : conn.provider === 'mongodb'
        ? conn.mongodb
        : conn.kusto
  return payload ? JSON.stringify(payload, null, 2) : ''
}

const loadConnections = async () => {
  try {
    const res = await fetch('http://localhost:3000/connections', {
      credentials: 'include'
    })
    
    if (res.ok) {
      const data = await res.json()
      savedConnections.value = data.connections || []
    } else {
      savedConnections.value = []
    }
  } catch (e) {
    console.error('Failed to load connections:', e)
    savedConnections.value = []
  }
  
  refreshConnectionStatuses()
}

const addConnection = async () => {
  const payload: ConnectionEntry = {
    id: crypto.randomUUID(),
    nickname: connectionForm.nickname.trim(),
    description: connectionForm.description.trim() || undefined,
    provider: connectionForm.provider,
  }

  if (payload.provider === 'mysql') {
    payload.mysql = { ...connectionForm.mysql }
  }
  if (payload.provider === 'mongodb') {
    payload.mongodb = { ...connectionForm.mongodb }
  }
  if (payload.provider === 'kusto') {
    payload.kusto = { ...connectionForm.kusto }
  }
  if (payload.provider === 'sqlite') {
    payload.sqlite = { ...connectionForm.sqlite }
  }
  if (payload.provider === 'postgres') {
    payload.postgres = { ...connectionForm.postgres }
  }

  try {
    const res = await fetch('http://localhost:3000/connections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      savedConnections.value = [...savedConnections.value, payload]
      refreshConnectionStatuses()
      resetConnectionForm()
      toast.success('Connection saved!')
    } else {
      const error = await res.text()
      toast.error('Failed to save connection', { description: error })
    }
  } catch (e) {
    toast.error('Failed to save connection', { description: e instanceof Error ? e.message : String(e) })
  }
}

const editConnection = (conn: ConnectionEntry) => {
  editingConnectionId.value = conn.id
  connectionForm.nickname = conn.nickname
  connectionForm.description = conn.description || ''
  connectionForm.provider = conn.provider
  
  if (conn.provider === 'mysql' && conn.mysql) {
    connectionForm.mysql = { ...conn.mysql }
  }
  if (conn.provider === 'mongodb' && conn.mongodb) {
    connectionForm.mongodb = { ...conn.mongodb }
  }
  if (conn.provider === 'kusto' && conn.kusto) {
    connectionForm.kusto = { 
      cluster: '', 
      database: '', 
      tenantId: '', 
      clientId: '', 
      clientSecret: '', 
      ...conn.kusto 
    }
  }
  if (conn.provider === 'sqlite' && conn.sqlite) {
    connectionForm.sqlite = { ...conn.sqlite }
  }
  if (conn.provider === 'postgres' && conn.postgres) {
    connectionForm.postgres = { ...conn.postgres }
  }
}

const updateConnection = async () => {
  if (!editingConnectionId.value) return
  
  const payload: ConnectionEntry = {
    id: editingConnectionId.value,
    nickname: connectionForm.nickname.trim(),
    description: connectionForm.description.trim() || undefined,
    provider: connectionForm.provider,
  }

  if (payload.provider === 'mysql') {
    payload.mysql = { ...connectionForm.mysql }
  }
  if (payload.provider === 'mongodb') {
    payload.mongodb = { ...connectionForm.mongodb }
  }
  if (payload.provider === 'kusto') {
    payload.kusto = { ...connectionForm.kusto }
  }
  if (payload.provider === 'sqlite') {
    payload.sqlite = { ...connectionForm.sqlite }
  }
  if (payload.provider === 'postgres') {
    payload.postgres = { ...connectionForm.postgres }
  }

  try {
    const res = await fetch(`http://localhost:3000/connections/${editingConnectionId.value}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    
    if (res.ok) {
      const index = savedConnections.value.findIndex(c => c.id === editingConnectionId.value)
      if (index !== -1) {
        savedConnections.value[index] = payload
      }
      refreshConnectionStatuses()
      resetConnectionForm()
      toast.success('Connection updated!')
    } else {
      const error = await res.text()
      toast.error('Failed to update connection', { description: error })
    }
  } catch (e) {
    toast.error('Failed to update connection', { description: e instanceof Error ? e.message : String(e) })
  }
}

const deleteConnection = async (id: string) => {
  try {
    const res = await fetch(`http://localhost:3000/connections/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    if (res.ok) {
      savedConnections.value = savedConnections.value.filter((conn) => conn.id !== id)
      refreshConnectionStatuses()
      toast.success('Connection removed')
    } else {
      toast.error('Failed to remove connection')
    }
  } catch (e) {
    console.error('Failed to remove connection:', e)
    toast.error('Failed to remove connection')
  }
}

const saveSettings = async () => {
  try {
    const res = await fetch('http://localhost:3000/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(settings.value)
    })

    if (res.ok) {
      toast.success('Settings saved!')
    } else {
      toast.error('Failed to save settings')
    }
  } catch (e) {
    console.error('Failed to save settings:', e)
    toast.error('Failed to save settings')
  }
}

onMounted(async () => {
  try {
    const res = await fetch('http://localhost:3000/settings', {
      credentials: 'include'
    })
    
    if (res.ok) {
      const data = await res.json()
      if (data.settings && Object.keys(data.settings).length > 0) {
        settings.value = { ...settings.value, ...data.settings }
      }
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
    // Fallback to local storage if DB fails? 
    // For now, let's stick to the requested DB implementation.
    const saved = localStorage.getItem('pegasusSettings')
    if (saved) settings.value = JSON.parse(saved)
  }
})
</script>

<style scoped>
.fade-section {
  animation: fadeIn 0.4s ease;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>