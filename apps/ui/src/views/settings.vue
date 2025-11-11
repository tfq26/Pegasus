<template>
  <div class="min-h-screen bg-stone-950 text-stone-100 flex overflow-hidden">
    <!-- Sidebar -->
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

    <!-- Content Area -->
    <main
      class="flex-1 overflow-y-auto p-10 space-y-10 bg-stone-950"
    >
      <!-- GENERAL -->
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
            <select
              v-model="settings.language"
              class="bg-stone-800 border border-stone-700 text-stone-200 rounded-md px-3 py-2 text-sm"
            >
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
            </select>
          </div>
        </div>
      </section>

      <!-- PEGASUS AI -->
      <section v-if="activeTab === 'ai'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Pegasus AI</h2>
        <div class="space-y-4 max-w-3xl">
          <div>
            <h3 class="text-stone-300 font-medium mb-1">Response Detail</h3>
            <input type="range" min="0" max="2" v-model="settings.aiDetail" class="w-full accent-violet-500" />
            <p class="text-stone-400 text-sm">Level: <strong>{{ aiDetailLabel }}</strong></p>
          </div>

          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.enableContext" class="accent-violet-600" />
            Enable conversation memory
          </label>

          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.enableCodeHints" class="accent-violet-600" />
            Enable AI code suggestions
          </label>
        </div>
      </section>

      <!-- QUERIES -->
      <section v-if="activeTab === 'queries'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Queries</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.autoSaveQueries" class="accent-violet-600" />
            Auto-save queries
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.syntaxHighlighting" class="accent-violet-600" />
            Syntax highlighting
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.showQueryTips" class="accent-violet-600" />
            Show AI query recommendations
          </label>
        </div>
      </section>

      <!-- DATA -->
      <section v-if="activeTab === 'data'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Data</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.autoRefresh" class="accent-violet-600" />
            Auto-refresh data every 30s
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.showRowCount" class="accent-violet-600" />
            Show table row count
          </label>
        </div>
      </section>

      <!-- CLOUD -->
      <section v-if="activeTab === 'cloud'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Cloud</h2>
        <div class="space-y-4 max-w-3xl">
          <div>
            <h3 class="text-stone-300 font-medium">Provider</h3>
            <select
              v-model="settings.cloudProvider"
              class="bg-stone-800 border border-stone-700 text-stone-200 rounded-md px-3 py-2 text-sm"
            >
              <option>Azure</option>
              <option>AWS</option>
              <option>Google Cloud</option>
              <option>Custom</option>
            </select>
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

      <!-- VIEW -->
      <section v-if="activeTab === 'view'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">View</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.showDashboardGrid" class="accent-violet-600" />
            Show dashboard gridlines
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.compactMode" class="accent-violet-600" />
            Compact mode
          </label>
        </div>
      </section>

      <!-- INTEGRATIONS -->
      <section v-if="activeTab === 'integrations'" class="fade-section">
        <h2 class="text-2xl font-semibold text-violet-400 mb-6">Integrations</h2>
        <div class="space-y-3 max-w-3xl">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.githubConnected" class="accent-violet-600" />
            GitHub
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.slackConnected" class="accent-violet-600" />
            Slack
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" v-model="settings.azureConnected" class="accent-violet-600" />
            Azure DevOps
          </label>
        </div>
      </section>

      <!-- SAVE BUTTON -->
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
import { ref, computed, onMounted } from 'vue'

defineOptions({ name: 'SettingsPage' })

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'Pegasus AI' },
  { id: 'queries', label: 'Queries' },
  { id: 'data', label: 'Data' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'view', label: 'View' },
  { id: 'integrations', label: 'Integrations' }
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

const saveSettings = () => {
  localStorage.setItem('pegasusSettings', JSON.stringify(settings.value))
  alert('✅ Settings saved successfully!')
}

onMounted(() => {
  const saved = localStorage.getItem('pegasusSettings')
  if (saved) settings.value = JSON.parse(saved)
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
