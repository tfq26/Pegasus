<template>
  <div class="min-h-screen bg-stone-950 text-stone-100 flex overflow-hidden">
    <aside
      class="w-64 border-r border-stone-800 bg-stone-900/80 backdrop-blur-md p-6 flex flex-col sticky top-0 h-screen overflow-y-auto"
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

    <main
      class="flex-1 overflow-y-auto p-10 space-y-10 bg-stone-950"
    >
      <section v-if="activeTab === 'general'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">General</h2>
        <div class="space-y-6 max-w-3xl">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="text-stone-300 font-medium">Appearance</h3>
              <p class="text-stone-400 text-sm">Switch between light and dark themes.</p>
            </div>
            <button
              @click="toggleTheme"
              class="px-4 py-2 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-200 transition"
            >
              {{ isDark ? 'Switch to Light Mode ☀️' : 'Switch to Dark Mode 🌙' }}
            </button>
          </div>

          <div class="flex justify-between items-center">
            <div>
              <h3 class="text-stone-300 font-medium">Language</h3>
              <p class="text-stone-400 text-sm">Choose your interface language.</p>
            </div>
            <Select v-model="settings.language" class="w-40">
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="English">English</SelectItem>
                <SelectItem value="Spanish">Spanish</SelectItem>
                <SelectItem value="French">French</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'ai'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Pegasus AI</h2>
        <div class="space-y-4 max-w-3xl">
          <div>
            <h3 class="text-stone-300 font-medium mb-1">Response Detail</h3>
            <Slider v-model="sliderValue" :min="0" :max="2" class="w-full" />
            <p class="text-stone-400 text-sm">Level: <strong>{{ aiDetailLabel }}</strong></p>
          </div>

          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.enableContext" class="accent-violet-600" />
            Enable conversation memory
          </label>

          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.enableCodeHints" class="accent-violet-600" />
            Enable AI code suggestions
          </label>
        </div>
      </section>

      <section v-if="activeTab === 'queries'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Queries</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.autoSaveQueries" class="accent-violet-600" />
            Auto-save queries
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.syntaxHighlighting" class="accent-violet-600" />
            Syntax highlighting
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.showQueryTips" class="accent-violet-600" />
            Show AI query recommendations
          </label>
        </div>
      </section>

      <section v-if="activeTab === 'data'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Data</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.autoRefresh" class="accent-violet-600" />
            Auto-refresh data every 30s
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.showRowCount" class="accent-violet-600" />
            Show table row count
          </label>
        </div>
      </section>

      <section v-if="activeTab === 'cloud'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Cloud</h2>
        <div class="space-y-4 max-w-3xl">
          <div>
            <h3 class="text-stone-300 font-medium">Provider</h3>
            <Select v-model="settings.cloudProvider" class="w-40">
              <SelectTrigger>
                <SelectValue placeholder="Select Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Azure">Azure</SelectItem>
                <SelectItem value="AWS">AWS</SelectItem>
                <SelectItem value="Google Cloud">Google Cloud</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <h3 class="text-stone-300 font-medium mb-1">Region</h3>
            <input
              v-model="settings.cloudRegion"
              placeholder="e.g., eastus2"
              class="w-full px-3 py-2 bg-stone-800 border border-stone-700 text-stone-200 rounded-md text-sm"
            />
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'view'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">View</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.showDashboardGrid" class="accent-violet-600" />
            Show dashboard gridlines
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.compactMode" class="accent-violet-600" />
            Compact mode
          </label>
        </div>
      </section>

      <section v-if="activeTab === 'integrations'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Integrations</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.githubConnected" class="accent-violet-600" />
            GitHub
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.slackConnected" class="accent-violet-600" />
            Slack
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Checkbox v-model="settings.azureConnected" class="accent-violet-600" />
            Azure DevOps
          </label>
        </div>
      </section>

        <!-- DATABASE CONNECTIONS -->
        <section v-if="activeTab === 'database'" class="fade-section flex flex-col">
          <h2 class="text-2xl font-semibold text-violet-400 mb-6">Database Connections</h2>
          <div class="space-y-6 max-w-4xl overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
            <form class="space-y-4" @submit.prevent="addConnection">
              <div class="grid gap-4 md:grid-cols-2">
                <div>
                  <label class="text-xs uppercase tracking-[0.3em] text-stone-500">Nickname</label>
                  <input
                    v-model="connectionForm.nickname"
                    type="text"
                    placeholder="Pegasus Reporting"
                    class="mt-2 w-full rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label class="text-xs uppercase tracking-[0.3em] text-stone-500">Provider</label>
                  <Select v-model="connectionForm.provider" class="mt-2 w-full">
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
                  v-model="connectionForm.description"
                  rows="2"
                  placeholder="Describe this connection (optional)"
                  class="mt-2 w-full rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div v-if="connectionForm.provider === 'mysql'" class="grid gap-3 md:grid-cols-3">
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Host</label>
                  <input v-model="connectionForm.mysql.host" placeholder="127.0.0.1" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Port</label>
                  <input v-model.number="connectionForm.mysql.port" type="number" placeholder="3306" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Database</label>
                  <input v-model="connectionForm.mysql.database" placeholder="pegasus" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">User</label>
                  <input v-model="connectionForm.mysql.user" placeholder="root" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Password</label>
                  <input v-model="connectionForm.mysql.password" type="password" placeholder="(leave blank locally)" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
              </div>

              <div v-else-if="connectionForm.provider === 'mongodb'" class="grid gap-3 md:grid-cols-3">
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">URI</label>
                  <input v-model="connectionForm.mongodb.url" placeholder="mongodb://localhost:27017" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">DB</label>
                  <input v-model="connectionForm.mongodb.database" placeholder="pegasus" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Collection</label>
                  <input v-model="connectionForm.mongodb.collection" placeholder="logs" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
              </div>

              <div v-else class="grid gap-3 md:grid-cols-2">
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Cluster</label>
                  <input v-model="connectionForm.kusto.cluster" placeholder="https://yourcluster.kusto.windows.net" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] uppercase tracking-wide text-stone-500">Database</label>
                  <input v-model="connectionForm.kusto.database" placeholder="Samples" class="rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm" />
                </div>
              </div>

              <div class="flex justify-end">
                <button
                  :disabled="!canAddConnection"
                  class="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  Save connection
                </button>
              </div>
            </form>

            <div class="space-y-3">
              <h3 class="text-sm font-semibold text-stone-300">Saved connections</h3>
              <div v-if="savedConnections.length" class="space-y-2">
                <article
                  v-for="conn in savedConnections"
                  :key="conn.id"
                  class="rounded-md border border-stone-800 bg-stone-950 p-3 text-sm"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-semibold text-stone-100">{{ conn.nickname }}</p>
                      <p class="text-xs text-stone-500">{{ conn.provider.toUpperCase() }}</p>
                    </div>
                    <button
                      @click="deleteConnection(conn.id)"
                      class="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400 hover:text-rose-300"
                    >
                      Remove
                    </button>
                  </div>
                  <div class="mt-2 flex items-center justify-between text-xs text-stone-400">
                    <div class="flex items-center gap-2">
                      <span
                        :class="[
                          'h-2 w-2 rounded-full',
                          statusDotClasses(connectionStatusFor(conn.id)?.status),
                        ]"
                      ></span>
                      <span class="font-semibold text-stone-200">{{ statusLabel(connectionStatusFor(conn.id)) }}</span>
                    </div>
                    <span>{{ connectionStatusFor(conn.id)?.tables.length ?? 0 }} tables</span>
                  </div>
                  <p
                    v-if="connectionStatusFor(conn.id)?.status === 'error'"
                    class="mt-1 text-xs text-rose-400"
                  >
                    {{ connectionStatusFor(conn.id)?.error }}
                  </p>
                  <p v-if="conn.description" class="mt-2 text-xs text-stone-500">{{ conn.description }}</p>
                  <pre class="mt-2 rounded-md border border-stone-800 bg-stone-900/50 px-3 py-2 text-[10px] text-stone-300">
  {{ summaryFor(conn) }}
  </pre>
                </article>
              </div>
              <p v-else class="text-xs text-stone-500">No connections saved yet. Add one above to make it available in the Chat editor.</p>
            </div>
          </div>
        </section>

      <div class="pt-10 border-t border-stone-800 max-w-3xl flex justify-end">
        <button
          class="px-6 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition"
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
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { CONNECTION_STORAGE_KEY, defaultConnections } from '@/lib/db-connections'
import type {
  ConnectionEntry,
  KustoConfig,
  MongoConfig,
  MySQLConfig,
  Provider,
} from '@/lib/db-connections'
import { fetchConnectionSchema } from '@/lib/api'
import { db } from '@/lib/local-db'
import { generateKey, encryptData, decryptData } from '@/lib/crypto'

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
const settings = ref({
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
  azureConnected: true
})

const aiDetailLabel = computed(() => ['Brief', 'Balanced', 'Detailed'][settings.value.aiDetail])

type ConnectionFormState = {
  nickname: string
  description: string
  provider: Provider
  mysql: MySQLConfig
  mongodb: MongoConfig
  kusto: KustoConfig
}

type ConnectionStatusState = {
  status: 'loading' | 'connected' | 'error'
  tables: string[]
  error?: string
}

const savedConnections = ref<ConnectionEntry[]>([])
const connectionStatuses = ref<Record<string, ConnectionStatusState>>({})
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
    database: 'pegasus',
    collection: 'logs',
  },
  kusto: {
    cluster: 'https://help.kusto.windows.net',
    database: 'Samples',
  },
})

const canAddConnection = computed(() => connectionForm.nickname.trim().length > 0)

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

const refreshConnectionStatuses = async () => {
  if (typeof window === 'undefined') return
  const next: Record<string, ConnectionStatusState> = {}

  savedConnections.value.forEach((conn) => {
    next[conn.id] = { status: 'loading', tables: [] }
  })

  connectionStatuses.value = next

  await Promise.all(
    savedConnections.value.map(async (conn) => {
      try {
        const tables = await fetchConnectionSchema(conn)
        connectionStatuses.value[conn.id] = { status: 'connected', tables }
      } catch (error) {
        connectionStatuses.value[conn.id] = {
          status: 'error',
          tables: [],
          error: error instanceof Error ? error.message : 'Unable to reach database',
        }
      }
    }),
  )
}

const commitConnections = (emitEvent = true) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(savedConnections.value))
  if (emitEvent) {
    window.dispatchEvent(new CustomEvent('pegasus:connections-updated'))
  }
}

const resetConnectionForm = () => {
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
      database: 'pegasus',
      collection: 'logs',
    },
    kusto: {
      cluster: 'https://help.kusto.windows.net',
      database: 'Samples',
    },
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

const loadConnections = () => {
  if (typeof window === 'undefined') {
    savedConnections.value = [...defaultConnections]
    refreshConnectionStatuses()
    return
  }

  const stored = window.localStorage.getItem(CONNECTION_STORAGE_KEY)
  if (!stored) {
    savedConnections.value = [...defaultConnections]
    commitConnections(false)
    refreshConnectionStatuses()
    return
  }

  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      // Accept an empty array as a valid saved state (user may intentionally remove all connections)
      savedConnections.value = parsed
      refreshConnectionStatuses()
      return
    }
  } catch {
    // fall back
  }

  savedConnections.value = [...defaultConnections]
  commitConnections(false)
  refreshConnectionStatuses()
}

const addConnection = () => {
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

  savedConnections.value = [...savedConnections.value, payload]
  commitConnections()
  refreshConnectionStatuses()
  resetConnectionForm()
}

const deleteConnection = (id: string) => {
  savedConnections.value = savedConnections.value.filter((conn) => conn.id !== id)
  commitConnections()
  refreshConnectionStatuses()
}

const sliderValue = computed({
  get: () => [settings.value.aiDetail],
  set: ([val]) => { settings.value.aiDetail = val }
})

const encryptionKey = ref(null)

onMounted(async () => {
  encryptionKey.value = await generateKey()
  // Load settings from IndexedDB
  const encrypted = await db.settings.get('user')
  if (encrypted && encryptionKey.value) {
    try {
      const decrypted = await decryptData(encryptionKey.value, encrypted.value)
      settings.value = decrypted
    } catch (e) {
      // fallback: do nothing
    }
  }
})

const saveSettings = async () => {
  if (!encryptionKey.value) return
  const encrypted = await encryptData(encryptionKey.value, settings.value)
  await db.settings.put({ key: 'user', value: encrypted })
  toast('Settings saved!', {
    description: 'Your preferences have been updated.',
    position: 'top-right',
  })
}
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