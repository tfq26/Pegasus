<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { computed, ref, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'

// Check if running in Tauri desktop environment
const isTauri = computed(() => '__TAURI_INTERNALS__' in window)
import type { SettingsModel } from './types'
import { getAIModels } from '@/lib/api'
import { localAI, type OllamaStatus } from '@/services/LocalAIService'
import { useEntitlements } from '@/composables/useEntitlements'
import UpgradeModal from '@/components/UpgradeModal.vue'
import { Loader2, Server, Power, Download, CheckCircle2, AlertCircle, Lock } from 'lucide-vue-next'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const models = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const localStatus = ref<OllamaStatus>({ is_running: false, version: null, models: [] })
const isStartingLocal = ref(false)
const pullProgress = ref<any>(null)
const showUpgradeModal = ref(false)

const { subscriptionTier, fetchEntitlements, isPro, isProPlus } = useEntitlements()

const checkLocalStatus = async () => {
  localStatus.value = await localAI.getStatus()
}

const startLocalEngine = async () => {
  isStartingLocal.value = true
  try {
    const success = await localAI.startSidecar()
    if (success) {
      // Poll for status
      let retries = 0
      const interval = setInterval(async () => {
        await checkLocalStatus()
        if (localStatus.value.is_running || retries > 10) {
          clearInterval(interval)
          isStartingLocal.value = false
        }
        retries++
      }, 1000)
    } else {
      isStartingLocal.value = false
    }
  } catch (e) {
    isStartingLocal.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    // Ensure settings are loaded
    if (!settings.value.activeModel) {
       await settingsStore.loadSettings()
    }
    
    // Fetch subscription info first
    await fetchEntitlements()
    
    const [cloudModelsResponse, _] = await Promise.all([
      getAIModels(),
      checkLocalStatus()
    ])
    
    // The backend now returns { models: [...], tier: 'free' }
    const cloudModels = Array.isArray(cloudModelsResponse) ? cloudModelsResponse : ((cloudModelsResponse as any).models || [])
    
    // Add tier information to each model
    const TIER_REQUIREMENTS: Record<string, 'free' | 'pro' | 'pro_plus'> = {
      // OpenAI models
      'gpt-5.1-mini': 'free',
      'o4-mini': 'pro',
      'gpt-5.1': 'pro',
      // Gemini models
      'gemini-2.5-flash-lite': 'free',
      'gemini-3-flash-preview': 'pro',
      'gemini-3-pro-preview': 'pro',
      // Anthropic models
      'claude-3-5-haiku-latest': 'pro',
      'claude-3-5-sonnet-latest': 'pro',
      'claude-3-opus-latest': 'pro_plus',
      // Legacy/Future models
      'gpt-4o-mini': 'free',
      'gemini-2.5-flash': 'free',
      'gemini-2.5-pro': 'free',
      'gemini-1.5-flash': 'free',
      'gemini-1.5-pro': 'pro',
      'o1-mini': 'pro',
      'o1-preview': 'pro_plus',
      'claude-3-5-sonnet-20241022': 'pro_plus'
    }
    
    const TIER_LABELS: Record<string, string> = {
      'free': 'Free',
      'pro': 'Pro',
      'pro_plus': 'Pro+'
    }
    
    const TIER_ORDER = { 'free': 0, 'pro': 1, 'pro_plus': 2 }
    
    models.value = cloudModels.map((m: any) => {
      const requiredTier = TIER_REQUIREMENTS[m.id] || 'free'
      const isLocked = TIER_ORDER[requiredTier] > TIER_ORDER[subscriptionTier.value]
      
      return {
        ...m,
        requiredTier,
        requiredTierLabel: TIER_LABELS[requiredTier],
        isLocked
      }
    })
    
    // Merge local models into the list if available
    if (localStatus.value.is_running) {
       const localModels = localStatus.value.models.map(m => ({
         id: `local:${m}`,
         name: m,
         provider: 'local',
         description: 'Run locally via Ollama',
         contextWindow: 4096,
         requiredTier: 'free',
         requiredTierLabel: 'Free',
         isLocked: false
       }))
       models.value = [...localModels, ...models.value]
    }

    // Only initialize enabledModels if it doesn't exist yet (undefined)
    if (settings.value.enabledModels === undefined) {
      settings.value.enabledModels = []
    }
    
    // Auto-set local model if not set
    if (localStatus.value.is_running && localStatus.value.models.length > 0) {
      if (!settings.value.localModel || !localStatus.value.models.includes(settings.value.localModel)) {
        settings.value.localModel = localStatus.value.models[0]
      }
    }
  } catch (e) {
    error.value = 'Failed to load models'
  } finally {
    loading.value = false
  }
})

const isModelEnabled = (id: string) => {
  if (settings.value.enabledModels === undefined) return true
  return settings.value.enabledModels.includes(id)
}

const toggleModelEnabled = (id: string, checked: boolean) => {
  if (settings.value.enabledModels === undefined) {
    settings.value.enabledModels = models.value.map(m => m.id)
  }
  
  if (checked) {
    if (!settings.value.enabledModels.includes(id)) {
      settings.value.enabledModels.push(id)
    }
  } else {
    // Prevent disabling the active model
    if (isModelActive(id)) return
    
    settings.value.enabledModels = settings.value.enabledModels.filter(m => m !== id)
  }
}

const selectModel = (model: any) => {
  // Check if model is locked
  if (model.isLocked) {
    showUpgradeModal.value = true
    return
  }
  
  const id = model.id
  settings.value.activeModel = id
  // Auto-enable if selected
  if (settings.value.enabledModels === undefined) {
     settings.value.enabledModels = models.value.filter(m => !m.isLocked).map(m => m.id)
  }
  if (!settings.value.enabledModels.includes(id)) {
    settings.value.enabledModels.push(id)
  }
}

const filteredModels = computed(() => {
  if (!searchQuery.value) return models.value
  const query = searchQuery.value.toLowerCase()
  return models.value.filter(m => 
    m.name.toLowerCase().includes(query) || 
    m.id.toLowerCase().includes(query)
  )
})

// Group models by access level
const availableModels = computed(() => {
  return filteredModels.value.filter(m => !m.isLocked)
})

const lockedModels = computed(() => {
  return filteredModels.value.filter(m => m.isLocked)
})

const isModelActive = (id: string) => {
  return settings.value.activeModel === id
}

const handleUpgrade = () => {
  showUpgradeModal.value = true
}

const sliderValue = computed({
  get: () => [settings.value.aiDetail],
  set: ([value]) => {
    settings.value.aiDetail = Number(value ?? 0)
  },
})

const temperatureValue = computed({
  get: () => [settings.value.temperature ?? 0.7],
  set: ([value]) => {
    settings.value.temperature = Number(value ?? 0.7)
  },
})

</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <h2 class="text-2xl font-semibold text-primary mb-6">Pegasus AI</h2>
    
    <!-- Local AI Status (Desktop Only) -->
    <div v-if="isTauri" class="p-4 rounded-xl border border-border bg-card/50 mb-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Server class="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 class="font-medium text-foreground">Local Inference Engine (Ollama)</h3>
            <p class="text-xs text-muted-foreground">Run models offline on your device</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
           <span v-if="localStatus.is_running" class="flex items-center gap-1.5 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
             <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
             Running
           </span>
           <span v-else class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full border border-border">
             <div class="w-1.5 h-1.5 rounded-full bg-muted-foreground"></div>
             Stopped
           </span>
        </div>
         </div>
      </div>

      <!-- Local Model Selector -->
      <div v-if="localStatus.is_running && localStatus.models.length > 0" class="mb-4 bg-background border border-border rounded-lg p-3 flex items-center justify-between">
         <div class="text-sm">
           <p class="font-medium text-foreground">Default Local Model</p>
           <p class="text-xs text-muted-foreground">Used for offline tasks across the app</p>
         </div>
         <select 
           v-model="settings.localModel"
           class="px-2 py-1 text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:border-primary min-w-[150px]"
         >
            <option v-for="m in localStatus.models" :key="m" :value="m">{{ m }}</option>
         </select>
      </div>

      <div v-if="!localStatus.is_running" class="flex items-center justify-between bg-background border border-border rounded-lg p-3">
         <div class="text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle class="w-4 h-4" />
            Local engine is not active.
         </div>
         <button 
           @click="startLocalEngine" 
           :disabled="isStartingLocal"
           class="flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all"
         >
           <Loader2 v-if="isStartingLocal" class="w-3.5 h-3.5 animate-spin" />
           <Power v-else class="w-3.5 h-3.5" />
           {{ isStartingLocal ? 'Starting...' : 'Start Engine' }}
         </button>
      </div>

      <div v-if="localStatus.is_running && localStatus.models.length === 0" class="mt-4">
         <div class="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-start gap-2">
            <Download class="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p class="font-bold">No models found</p>
              <p class="opacity-80 mt-1">You need to pull a model to use local AI. Open your terminal and run <code>ollama pull llama3</code> or download one from the library.</p>
            </div>
      </div>
    </div>

    <div>
      <h3 class="text-foreground font-medium mb-1">Response Detail</h3>
      <Slider v-model="sliderValue" :min="0" :max="2" class="w-full" />
      <p class="text-muted-foreground text-sm">Level: <strong>{{ ['Brief', 'Balanced', 'Detailed'][settings.aiDetail] }}</strong></p>
    </div>

    <div class="grid grid-cols-2 gap-6">
      <div>
        <h3 class="text-foreground font-medium mb-1">Temperature</h3>
        <Slider v-model="temperatureValue" :min="0" :max="1" :step="0.1" class="w-full" />
        <p class="text-muted-foreground text-sm">Creativity: <strong>{{ settings.temperature ?? 0.7 }}</strong></p>
      </div>
      
      <div>
        <h3 class="text-foreground font-medium mb-1">Max Tokens</h3>
        <input 
          v-model.number="settings.maxTokens"
          type="number"
          min="100"
          max="8000"
          class="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:border-primary"
          placeholder="2000"
        />
        <p class="text-muted-foreground text-xs mt-1">Limit response length</p>
      </div>
    </div>

    <div>
      <h3 class="text-foreground font-medium mb-2">Custom Instructions</h3>
      <textarea
        v-model="settings.customInstructions"
        class="w-full h-24 px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:border-primary resize-none"
        placeholder="e.g. Always format SQL keywords in uppercase. Be concise."
      ></textarea>
      <p class="text-muted-foreground text-xs mt-1">These instructions will be added to the system prompt.</p>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="settings.enableContext" class="accent-violet-600" />
      Enable conversation memory
    </label>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="settings.enableCodeHints" class="accent-violet-600" />
      Enable AI code suggestions
    </label>

    <div class="pt-4 border-t border-border">
      <h3 class="text-foreground font-medium mb-3">Chat History Management</h3>
      <div class="space-y-3">
        <div>
          <label class="text-sm text-foreground mb-2 block">Auto-delete chats after</label>
          <select 
            v-model="settings.chatAutoDeleteDays"
            class="w-full px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:border-primary"
          >
            <option :value="1">1 day</option>
            <option :value="7">7 days</option>
            <option :value="30">30 days (default)</option>
            <option :value="90">90 days</option>
            <option :value="0">Never</option>
          </select>
          <p class="text-muted-foreground text-xs mt-1">
            Automatically delete chats older than the selected period. Set to "Never" to keep all chats.
          </p>
        </div>
      </div>
    </div>

    <div class="pt-6 border-t border-border">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <h3 class="text-foreground font-medium">AI Models</h3>
          <span class="px-2 py-1 rounded text-xs bg-primary/10 text-primary border border-primary/20 font-medium">
            Current Tier: {{ subscriptionTier }}
          </span>
        </div>
        <input 
          v-model="searchQuery"
          type="text"
          placeholder="Search models..."
          class="px-3 py-1.5 text-xs bg-background border border-input rounded-md text-foreground focus:outline-none focus:border-primary w-48"
        />
      </div>
      
      <div v-if="loading" class="text-muted-foreground text-sm">Loading models...</div>
      <div v-else-if="error" class="text-destructive text-sm">{{ error }}</div>
      <div v-else class="space-y-6">
        <!-- Your Models (Available) -->
        <div v-if="availableModels.length > 0">
          <div class="flex items-center gap-2 mb-3">
            <h4 class="text-sm font-semibold text-foreground">Your Models</h4>
            <span class="text-xs text-muted-foreground">({{ availableModels.length }} available)</span>
          </div>
          <div class="space-y-2">
            <div 
              v-for="model in availableModels" 
              :key="model.id"
              class="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-all"
              :class="isModelActive(model.id) ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : ''"
            >
              <div class="flex items-start justify-between gap-4">
                <!-- Left: Model Info -->
                <div 
                  class="flex-1 cursor-pointer"
                  @click="selectModel(model)"
                >
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    <span class="font-medium text-foreground">{{ model.name }}</span>
                    <span 
                      v-if="model.provider === 'openai'" 
                      class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    >
                      OpenAI
                    </span>
                    <span 
                      v-else-if="model.provider === 'gemini'" 
                      class="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    >
                      Google
                    </span>
                    <span 
                      v-else-if="model.provider === 'anthropic'" 
                      class="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    >
                      Anthropic
                    </span>
                    <span 
                       v-else-if="model.provider === 'local'" 
                       class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    >
                      Local
                    </span>
                    <span v-if="isModelActive(model.id)" class="px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary border border-primary/30 font-medium">
                      Active
                    </span>
                  </div>
                  <div class="text-xs text-muted-foreground mb-2">{{ model.description }}</div>
                  <div class="text-[10px] text-muted-foreground font-mono">
                    Context: {{ model.contextWindow?.toLocaleString() || 'N/A' }} tokens
                  </div>
                </div>
                
                <!-- Right: Toggle Switch -->
                <div class="flex flex-col items-end gap-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <span class="text-xs text-muted-foreground">{{ isModelEnabled(model.id) ? 'Enabled' : 'Disabled' }}</span>
                    <input
                      type="checkbox"
                      :checked="isModelEnabled(model.id)"
                      @change="(e: any) => toggleModelEnabled(model.id, e.target.checked)"
                      :disabled="isModelActive(model.id)"
                      class="w-10 h-5 appearance-none bg-muted rounded-full relative cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed checked:bg-primary"
                      :class="isModelActive(model.id) ? 'cursor-not-allowed' : ''"
                    />
                  </label>
                  <span v-if="isModelActive(model.id)" class="text-[10px] text-muted-foreground italic">
                    Can't disable active model
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Locked Models (Upgrade Required) -->
        <div v-if="lockedModels.length > 0">
          <div class="flex items-center gap-2 mb-3">
            <h4 class="text-sm font-semibold text-foreground">Upgrade to Unlock</h4>
            <span class="text-xs text-muted-foreground">({{ lockedModels.length }} premium models)</span>
          </div>
          <div class="space-y-2">
            <div 
              v-for="model in lockedModels" 
              :key="model.id"
              class="p-4 rounded-lg border border-border bg-card/50 opacity-75"
            >
              <div class="flex items-start justify-between gap-4">
                <!-- Left: Model Info -->
                <div class="flex items-start gap-3 flex-1">
                  <div class="mt-1">
                    <Lock class="w-4 h-4 text-purple-500" />
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                      <span class="font-medium text-foreground">{{ model.name }}</span>
                      <span 
                        v-if="model.provider === 'openai'" 
                        class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      >
                        OpenAI
                      </span>
                      <span 
                        v-else-if="model.provider === 'gemini'" 
                        class="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      >
                        Google
                      </span>
                      <span 
                        v-else-if="model.provider === 'anthropic'" 
                        class="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      >
                        Anthropic
                      </span>
                      <span class="px-1.5 py-0.5 rounded text-[10px] bg-gradient-to-r from-purple-500/20 to-orange-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-bold">
                        {{ model.requiredTierLabel }}
                      </span>
                    </div>
                    <div class="text-xs text-muted-foreground mb-2">{{ model.description }}</div>
                    <div class="text-[10px] text-muted-foreground font-mono">
                      Context: {{ model.contextWindow?.toLocaleString() || 'N/A' }} tokens
                    </div>
                  </div>
                </div>
                
                <!-- Right: Upgrade Button -->
                <div>
                  <button
                    @click="handleUpgrade"
                    class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-500 hover:to-orange-400 text-white text-xs font-bold transition-all shadow-sm hover:shadow-md"
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- No Results -->
        <div v-if="filteredModels.length === 0" class="text-center py-8 text-muted-foreground text-sm">
          No models found matching "{{ searchQuery }}"
        </div>
      </div>
    </div>
    
    <!-- Upgrade Modal -->
    <UpgradeModal
      v-model:open="showUpgradeModal"
      limit-type="models"
      :current-tier="subscriptionTier"
    />
  </div>
</template>
<style scoped>
/* Toggle Switch Styling */
input[type="checkbox"] {
  position: relative;
}

input[type="checkbox"]::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  top: 1px;
  left: 1px;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

input[type="checkbox"]:checked::before {
  transform: translateX(20px);
}
</style>
