<template>
  <div class="h-full bg-background text-foreground flex overflow-hidden transition-colors duration-300">
    <!-- Loading State -->
    <LoadingScreen 
      v-if="isInitializing" 
      title="Configuring Environment"
      message="Loading core preferences and secure adapter configs..."
    />

    <template v-else>
      <aside
        class="w-64 border-r border-border bg-card/80 backdrop-blur-md p-6 flex flex-col sticky top-0 h-full overflow-y-auto z-10"
      >
      <h2 class="text-xl font-semibold text-primary mb-6">Settings</h2>
      <nav class="space-y-2">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'w-full text-left px-3 py-2 rounded-md transition-all duration-200 text-sm font-medium',
            activeTab === tab.id
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          ]"
        >
          {{ tab.label }}
        </button>
      </nav>
    </aside>

    <main class="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
      <div class="flex-1 overflow-y-auto p-10 pb-24">
        <section v-if="activeTab === 'profile'" class="fade-section">
          <ProfileTab :preloaded-payments="profilePayments" />
        </section>

        <section v-if="activeTab === 'general'" class="fade-section">
          <GeneralTab 
            :settings="settings" 
            :theme-mode="mode" 
            :toggle-theme="toggleTheme" 
          />
          
          <!-- Debug Area -->
          <div class="mt-8 pt-8 border-t border-border">
             <h3 class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Debug Actions</h3>
             <button 
                @click="() => { throw new Error('This is a simulated crash to test the global error boundary.') }"
                class="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-lg text-sm font-medium transition-colors"
             >
                Trigger Test Error
             </button>
          </div>
        </section>


        <section v-if="activeTab === 'ai'" class="fade-section">
          <AITab :settings="settings" />
        </section>

        <section v-if="activeTab === 'cloud'" class="fade-section">
          <CloudTab :settings="settings" />
        </section>

        <section v-if="activeTab === 'database'" class="fade-section h-full">
          <DatabaseConnectionsTab
            :connection-form="connectionForm"
            :saved-connections="savedConnections"
            :can-add-connection="canAddConnection"
            :is-edit-mode="isEditMode"
            :edit-connection="editConnection"
            :update-connection="updateConnection"
            :delete-connection="deleteConnection"
            :connection-status-for="connectionStatusFor"
            :status-dot-classes="statusDotClasses"
            :status-label="statusLabel"
            :summary-for="summaryFor"
            :test-connection="testConnection"
            :reset-connection-form="resetConnectionForm"
          />
        </section>

        <section v-if="activeTab === 'experimental'" class="fade-section">
          <ExperimentalSettings />
        </section>

        <section v-if="activeTab === 'analytics'" class="fade-section">
           <AnalyticsTab />
        </section>
      </div>

      <!-- Sticky Footer Action Bar -->
      <div class="fixed bottom-8 right-8 flex items-center gap-4 z-50">
        <div class="text-xs text-muted-foreground bg-background/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-border/50 shadow-sm">
          <span v-if="activeTab === 'database'">Autosaved</span>
          <span v-else>Local changes</span>
        </div>
        <button
          v-if="activeTab !== 'database'"
          class="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-105 active:scale-95"
          @click="saveSettings"
        >
          Save Changes
        </button>
      </div>
    </main>
    </template>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import LoadingScreen from '@/components/ui/LoadingScreen.vue'
import { useColorMode } from '@vueuse/core'
import { toast } from '@/composables/useNotifications'
import GeneralTab from './GeneralTab.vue'
import ProfileTab from './ProfileTab.vue'
import AITab from './AITab.vue'
import CloudTab from './CloudTab.vue'
import DatabaseConnectionsTab from './DatabaseConnectionsTab.vue'
import ExperimentalSettings from './ExperimentalSettings.vue'
import AnalyticsTab from './AnalyticsTab.vue'
import { defaultConnections } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'
import { fetchConnectionSchema } from '@/lib/api'
import type { SettingsModel, ConnectionFormState, ConnectionStatusState } from './types'
import { usePlatform } from '@/composables/usePlatform'
import { useEntitlements } from '@/composables/useEntitlements'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useConnectionStore } from '@/stores/connection'
import { storeToRefs } from 'pinia'
import { unref, watch } from 'vue'

defineOptions({ name: 'SettingsPage' })

const router = useRouter()
const { isPhone } = usePlatform()
const { subscriptionTier } = useEntitlements()

const tabs = computed(() => {
  const list = [
    { id: 'profile', label: 'Profile' },
    { id: 'general', label: 'General' },
    { id: 'ai', label: 'AI' },
    { id: 'database', label: 'Database Connections' },
  ]

  // Only show Cloud Infrastructure tab for Teams/Enterprise plans
  if (['teams', 'enterprise'].includes(subscriptionTier.value)) {
    list.push({ id: 'cloud', label: 'Cloud Infrastructure' })
  }

  list.push(
    { id: 'analytics', label: 'Analytics & Logs' },
    { id: 'experimental', label: 'Experimental' }
  )

  return list
})

const activeTab = ref('profile')
const isInitializing = ref(true)

// Redirect if active tab becomes invalid (e.g. on plan downgrade)
watch(tabs, (newTabs) => {
  if (!newTabs.find(t => t.id === activeTab.value)) {
    activeTab.value = 'general'
  }
})

// --- Theme ---
const mode = useColorMode({
  emitAuto: true,
  selector: 'html',
  attribute: 'class',
  storageKey: 'pegasus-theme',
})

const isDark = computed(() => mode.value === 'dark')

const toggleTheme = () => {
  if (mode.value === 'auto') {
    mode.value = 'light'
  } else if (mode.value === 'light') {
    mode.value = 'dark'
  } else {
    mode.value = 'auto'
  }
}

// --- Settings model ---
const settingsStore = useSettingsStore()
const { isLoading } = storeToRefs(settingsStore)
const settings = computed(() => unref(settingsStore.settings))

// Use Connection Store
const connectionStore = useConnectionStore()
const savedConnections = computed(() => unref(connectionStore.connections))

const connectionStatuses = ref<Record<string, ConnectionStatusState>>({})
const editingConnectionId = ref<string | null>(null)
const connectionForm = reactive<ConnectionFormState>({
  nickname: '',
  alias: '',
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
  duckdb: {
    path: '',
  },
  postgres: {
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'postgres',
    ssl: false
  },
  surrealdb: {},
  ai_provider: {
    service: 'openai',
    apiKey: '',
    defaultModel: ''
  },
  cloud_storage: {
      service: 'azure_blob',
      bucket: ''
  },
  isLocked: false
})

const profilePayments = ref<any[]>([])

const canAddConnection = computed(() => connectionForm.alias.trim().length > 0)
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
  if (emitEvent) {
    window.dispatchEvent(new CustomEvent('pegasus:connections-updated'))
  }
}

const resetConnectionForm = () => {
  editingConnectionId.value = null
  const fresh: ConnectionFormState = {
    nickname: '',
    alias: '',
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
    duckdb: {
      path: '',
    },
    postgres: {
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'postgres',
      ssl: false
    },
    surrealdb: {},
    ai_provider: {
      service: 'openai',
      apiKey: '',
      defaultModel: ''
    },
    cloud_storage: {
        service: 'azure_blob',
        bucket: ''
    },
    isLocked: false
  }
  Object.assign(connectionForm, fresh)
}

const summaryFor = (conn: ConnectionEntry) => {
  if (conn.provider === 'mysql') return JSON.stringify(conn.mysql, null, 2)
  if (conn.provider === 'postgres') return JSON.stringify(conn.postgres, null, 2)
  if (conn.provider === 'mongodb') return JSON.stringify(conn.mongodb, null, 2)
  if (conn.provider === 'kusto') return JSON.stringify(conn.kusto, null, 2)
  if (conn.provider === 'sqlite') return JSON.stringify(conn.sqlite, null, 2)
  if (conn.provider === 'duckdb') return JSON.stringify(conn.duckdb, null, 2)
  if (conn.provider === 'surrealdb') return JSON.stringify(conn.surrealdb, null, 2)
  return ''
}

const loadConnections = async (force = false) => {
  try {
    // Delegate to store, which handles caching and local aliases
    await connectionStore.loadConnections(force)
    // console.log(`[Settings] Loaded ${savedConnections.value.length} connections from store`)
  } catch (e) {
    console.error('[Settings] Failed to load connections via store:', e)
  }
  
  refreshConnectionStatuses()
}


const editConnection = (conn: ConnectionEntry) => {
  editingConnectionId.value = conn.id
  connectionForm.nickname = conn.nickname
  connectionForm.alias = conn.alias || ''
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
      tenantId: '', 
      clientId: '', 
      clientSecret: '', 
      ...conn.kusto 
    }
  }
  if (conn.provider === 'sqlite' && conn.sqlite) {
    connectionForm.sqlite = { ...conn.sqlite }
  }
  if (conn.provider === 'duckdb' && conn.duckdb) {
    connectionForm.duckdb = { ...conn.duckdb }
  }
  if (conn.provider === 'postgres' && conn.postgres) {
    connectionForm.postgres = { ...conn.postgres }
  }
  if (conn.provider === 'surrealdb' && conn.surrealdb) {
    connectionForm.surrealdb = { ...conn.surrealdb }
  }
}

const updateConnection = async () => {
  if (!editingConnectionId.value) return
  
  const payload: ConnectionEntry = {
    id: editingConnectionId.value,
    nickname: connectionForm.nickname.trim(),
    alias: connectionForm.alias?.trim() || undefined,
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
  if (payload.provider === 'duckdb') {
    payload.duckdb = { ...connectionForm.duckdb }
  }
  if (payload.provider === 'postgres') {
    payload.postgres = { ...connectionForm.postgres }
  }
  if (payload.provider === 'surrealdb') {
    payload.surrealdb = { ...connectionForm.surrealdb }
  }
  if (payload.provider === 'file') {
    payload.provider = 'sqlite'
    payload.sqlite = { ...connectionForm.sqlite }
  }

  try {
    // Delegate to store for updating. Store handles API call and alias mapping.
    await connectionStore.updateConnection(payload)
    
    // UI Updates
    refreshConnectionStatuses()
    resetConnectionForm()
    toast.success('Connection updated!')
    
  } catch (e) {
    console.error(e)
    toast.error('Failed to update connection', { description: e instanceof Error ? e.message : String(e) })
  }
}

const deleteConnection = async (id: string) => {
  try {
    // Delegate to store
    await connectionStore.deleteConnection(id)
    
    refreshConnectionStatuses()
    toast.success('Connection removed')
  } catch (e) {
    console.error('Failed to remove connection:', e)
    toast.error('Failed to remove connection')
  }
}

const saveSettings = async () => {
  try {
    await settingsStore.saveSettings()
    toast.success('Settings saved!')
  } catch (e) {
    console.error('Failed to save settings:', e)
    toast.error('Failed to save settings')
  }
}

const connectionUpdateHandler = () => loadConnections(true)

onMounted(async () => {
  if (isPhone.value) {
    toast.error('Settings are only available on desktop devices.')
    router.replace('/profile')
    return
  }

  isInitializing.value = true
  try {
    // Wait for auth to complete and token to be stored
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Load connections, settings, and profile data in parallel
    // settingsStore.loadSettings handles loading and merging
    await Promise.all([
      loadConnections(),
      settingsStore.loadSettings(),
      // Pre-load profile data
      (async () => {
         try {
           // We use the global entitlements composable to fetch tiers/usage
           const { fetchEntitlements } = useEntitlements()
           await fetchEntitlements(true)
           
           // We fetch payments for the profile tab
           // Using getPayments is fast (DB only). We skip syncPayments() here to avoid slowing down Settings load too much.
           // ProfileTab can background sync if needed.
           const { getPayments } = await import('@/lib/api') 
           const res = await getPayments()
           if (res.success) {
             profilePayments.value = res.payments
           }
         } catch (err) {
           console.error('[Settings] Failed to preload profile data:', err)
         }
      })()
    ])

    window.addEventListener('pegasus:connections-updated', connectionUpdateHandler)
  } catch (e) {
    console.error('[Settings] Initialization failed:', e)
    toast.error('Failed to load settings')
  } finally {
    isInitializing.value = false
  }
})


onUnmounted(() => {
  window.removeEventListener('pegasus:connections-updated', connectionUpdateHandler)
})
</script>

<style scoped>
.fade-section {
  animation: fadeIn 0.4s ease;
}
@keyframes spin-slow {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}
.animate-spin-slow {
  animation: spin-slow 3s linear infinite;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>