<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
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
import { Loader2, Server, Power, Download, CheckCircle2, AlertCircle, Lock, ChevronDown } from 'lucide-vue-next'

const settingsStore = useSettingsStore()
const settings = settingsStore.settings

const models = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const localStatus = ref<OllamaStatus>({ is_running: false, version: null, models: [] })
const isStartingLocal = ref(false)
const pullProgress = ref<any>(null)


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
    if (settings.value.enabledModels === undefined) {
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
    
    const TIER_ORDER: Record<string, number> = { 'free': 0, 'pro': 1, 'pro_plus': 2, 'teams': 3, 'enterprise': 4 }
    
    models.value = cloudModels.map((m: any) => {
      const requiredTier = TIER_REQUIREMENTS[m.id] || 'free'
      const isLocked = (TIER_ORDER[requiredTier] || 0) > (TIER_ORDER[subscriptionTier.value] || 0)
      
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
    settings.value.enabledModels = settings.value.enabledModels.filter((m: any) => m !== id)
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


const handleUpgrade = () => {
  upgradeModalState.value = {
    open: true,
    title: '',
    description: '',
    benefits: [],
    targetTier: 'pro',
    limitType: 'models'
  }
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

// Advanced Settings State
const showAdvanced = ref(false)

const toggleAdvancedSettings = () => {
  if (!isPro.value) {
    upgradeModalState.value = {
      open: true,
      title: 'Advanced AI Settings',
      description: 'Fine-tune your AI experience with temperature control, custom instructions, and more.',
      benefits: [
        'Custom System Instructions',
        'Temperature & Token Limits',
        'Conversation Memory Control',
        'Chat Auto-deletion Rules'
      ],
      targetTier: 'pro',
      limitType: undefined
    }
    return
  }
  showAdvanced.value = !showAdvanced.value
}

// --- BYOM Logic ---
const currentProvider = ref('default') // 'default' | 'aws' | 'azure' | 'gcp'
const canUseByom = computed(() => {
  return ['pro_plus', 'teams', 'enterprise'].includes(subscriptionTier.value)
})

// Modular Upgrade Modal State
const upgradeModalState = ref({
  open: false,
  title: '',
  description: '',
  benefits: [] as string[],
  targetTier: 'pro' as 'pro' | 'pro_plus' | 'teams' | 'enterprise',
  limitType: undefined as 'connections' | 'dashboards' | 'tables' | 'tokens' | 'storage' | 'models' | undefined
})

const changeProvider = async (provider: string) => {
  if (provider !== 'default' && !canUseByom.value) {
    upgradeModalState.value = {
      open: true,
      title: 'Connect Your Own Cloud',
      description: 'Connecting external cloud providers like AWS, Azure, and Google Cloud is a Pro+ feature.',
      benefits: [
        'Bring Your Own Model (BYOM)',
        'AWS Bedrock Integration',
        'Azure OpenAI Integration',
        'Google Cloud Vertex AI',
        'Centralized Team Management'
      ],
      targetTier: 'pro_plus',
      limitType: undefined
    }
    return
  }
  
  // Optimistic update
  currentProvider.value = provider
  
  try {
    // Call backend to save preference
    const response = await fetch(`${import.meta.env.VITE_API_URL}/ai/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'x-user-id': localStorage.getItem('user_id') || ''
      },
      body: JSON.stringify({ provider })
    })
    
    if (!response.ok) {
       // Revert if failed (e.g. entitlement check failed on backend)
       currentProvider.value = 'default'
       if (response.status === 403) {
          upgradeModalState.value = {
             open: true,
             title: 'Access Restricted',
             description: 'You need a Pro+ subscription to change providers.',
             benefits: ['Unlock Cloud Providers', 'Prioritized Inference'],
             targetTier: 'pro_plus',
             limitType: undefined
          }
       }
    } else {
      // Reload models for the new provider
      loading.value = true
      // const newModels = await getAIModels()
      window.location.reload() 
    }
  } catch (e) {
    currentProvider.value = 'default'
  }
}

// Ensure we load the current provider on mount
onMounted(async () => {
  try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/ai/config`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'x-user-id': localStorage.getItem('user_id') || ''
        }
      })
      if (res.ok) {
          const config = await res.json()
          if (config.provider) {
              currentProvider.value = config.provider
          }
      }
  } catch (e) {}
})

</script>

<template>
<div class="space-y-6 max-w-3xl">
    <h2 class="text-2xl font-semibold text-primary mb-6">Pegasus AI</h2>

    <!-- Provider Selection (Enterprise/Teams) -->
    <div class="p-4 rounded-xl border border-border bg-card">
      <h3 class="text-foreground font-medium mb-3 flex items-center gap-2">
        Model Provider
        <span class="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-500 border border-purple-500/20 font-bold uppercase">
          Pro+
        </span>
      </h3>
      
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <!-- Pegasus Default -->
        <div 
          @click="changeProvider('default')"
          class="relative cursor-pointer p-3 rounded-lg border transition-all"
          :class="currentProvider === 'default' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
        >
          <div class="flex items-center gap-2 mb-1">
             <div class="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px]">P</div>
             <span class="text-sm font-medium text-foreground">Pegasus</span>
          </div>
          <p class="text-[10px] text-muted-foreground">Managed models, standard limits.</p>
          <div v-if="currentProvider === 'default'" class="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse"></div>
        </div>

        <!-- AWS -->
        <div 
          @click="changeProvider('aws')"
          class="relative cursor-pointer p-3 rounded-lg border transition-all"
          :class="[
            currentProvider === 'aws' ? 'border-orange-500 bg-orange-500/5' : 'border-border',
            !canUseByom ? 'opacity-60 cursor-not-allowed' : 'hover:border-orange-500/50'
          ]"
        >
          <div class="flex items-center gap-2 mb-1">
             <div class="w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-[10px]">A</div>
             <span class="text-sm font-medium text-foreground">AWS Bedrock</span>
          </div>
          <p class="text-[10px] text-muted-foreground">Use your AWS credits & models.</p>
           <Lock v-if="!canUseByom" class="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground" />
           <div v-else-if="currentProvider === 'aws'" class="absolute top-2 right-2 w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
        </div>

        <!-- Azure -->
        <div 
          @click="changeProvider('azure')"
          class="relative cursor-pointer p-3 rounded-lg border transition-all"
          :class="[
            currentProvider === 'azure' ? 'border-blue-500 bg-blue-500/5' : 'border-border',
            !canUseByom ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-500/50'
          ]"
        >
          <div class="flex items-center gap-2 mb-1">
             <div class="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold text-[10px]">M</div>
             <span class="text-sm font-medium text-foreground">Azure OpenAI</span>
          </div>
           <p class="text-[10px] text-muted-foreground">Private GPT-4 deployments.</p>
           <Lock v-if="!canUseByom" class="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground" />
           <div v-else-if="currentProvider === 'azure'" class="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
        </div>

        <!-- GCP -->
        <div 
          @click="changeProvider('gcp')"
          class="relative cursor-pointer p-3 rounded-lg border transition-all"
          :class="[
            currentProvider === 'gcp' ? 'border-emerald-500 bg-emerald-500/5' : 'border-border',
            !canUseByom ? 'opacity-60 cursor-not-allowed' : 'hover:border-emerald-500/50'
          ]"
        >
           <div class="flex items-center gap-2 mb-1">
             <div class="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold text-[10px]">G</div>
             <span class="text-sm font-medium text-foreground">Google Cloud</span>
          </div>
           <p class="text-[10px] text-muted-foreground">Vertex AI & Gemini Pro.</p>
           <Lock v-if="!canUseByom" class="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground" />
           <div v-else-if="currentProvider === 'gcp'" class="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        </div>
      </div>
      
      <div v-if="!canUseByom" class="mt-3 text-xs text-muted-foreground flex items-center gap-2 p-2 bg-muted/50 rounded-md">
         <AlertCircle class="w-3.5 h-3.5 text-purple-500" />
         Upgrade to <strong>Pro+</strong> to connect your own cloud providers.
      </div>
    </div>
    
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
      <div v-if="isTauri && localStatus.is_running && localStatus.models.length > 0" class="mb-4 bg-background border border-border rounded-lg p-3 flex items-center justify-between">
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

      <div v-if="isTauri && !localStatus.is_running" class="flex items-center justify-between bg-background border border-border rounded-lg p-3">
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

      <div v-if="isTauri && localStatus.is_running && localStatus.models.length === 0" class="mt-4">
         <div class="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-start gap-2">
            <Download class="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p class="font-bold">No models found</p>
              <p class="opacity-80 mt-1">You need to pull a model to use local AI. Open your terminal and run <code>ollama pull llama3</code> or download one from the library.</p>
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
            >
              <div class="flex items-start justify-between gap-4">
                <!-- Left: Model Info -->
                <div 
                  class="flex-1"
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
                      class="w-10 h-5 appearance-none bg-muted rounded-full relative cursor-pointer transition-colors checked:bg-primary"
                    />
                  </label>
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
    
    <!-- Advanced Settings Section -->
    <div class="mt-8 pt-6 border-t border-border">
      <button 
        @click="toggleAdvancedSettings"
        class="flex items-center justify-between w-full py-2 hover:bg-secondary/50 rounded-lg px-2 -mx-2 transition-colors"
      >
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-medium text-foreground">Advanced Settings</h3>
          <span v-if="!isPro" class="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-500 border border-purple-500/20 font-bold uppercase">
            Pro
          </span>
        </div>
        <div class="flex items-center gap-2">
           <Lock v-if="!isPro" class="h-4 w-4 text-muted-foreground" />
           <ChevronDown 
             v-else 
             class="h-5 w-5 text-muted-foreground transition-transform duration-200"
             :class="{ 'rotate-180': showAdvanced }"
           />
        </div>
      </button>

      <!-- Advanced Settings Content -->
      <div 
        v-if="showAdvanced" 
        class="mt-6 grid gap-6 animate-in slide-in-from-top-2 duration-200"
      >
        <!-- Response Detail -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Label class="text-base font-medium">Response Detail</Label>
            <span class="text-sm text-muted-foreground">{{ ['Brief', 'Balanced', 'Detailed'][settings.aiDetail] }}</span>
          </div>
          <Slider
            v-model="sliderValue"
            :max="2"
            :step="1"
            class="w-full"
          />
        </div>

        <!-- Temperature -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Label class="text-base font-medium">Temperature</Label>
            <span class="text-sm text-muted-foreground">{{ settings.temperature }}</span>
          </div>
          <Slider
            v-model="temperatureValue" 
            :max="1" 
            :step="0.1"
            class="w-full"
          />
        </div>

        <!-- Max Tokens -->
         <div class="space-y-2">
          <Label class="text-base font-medium">Max Tokens</Label>
          <input 
            v-model.number="settings.maxTokens"
            type="number"
            placeholder="2048"
            class="w-full px-3 py-2 bg-secondary/50 border border-input rounded-md text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
           <p class="text-xs text-muted-foreground">Maximum length of AI response</p>
        </div>

        <!-- Custom Instructions -->
        <div class="space-y-2">
          <Label class="text-base font-medium">Custom Instructions</Label>
          <textarea
            v-model="settings.customInstructions"
            placeholder="e.g., You are a senior data analyst..."
            class="flex min-h-[100px] w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>

        <!-- Conversation Memory -->
        <div class="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
          <div class="space-y-0.5">
            <Label class="text-base">Conversation Memory</Label>
            <p class="text-sm text-muted-foreground">Allow AI to remember previous messages</p>
          </div>
          <Checkbox v-model="settings.enableContext" />
        </div>

         <!-- Code Hints -->
        <div class="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
          <div class="space-y-0.5">
            <Label class="text-base">Code Hints</Label>
            <p class="text-sm text-muted-foreground">Show AI suggestions while typing SQL</p>
          </div>
           <Checkbox v-model="settings.enableCodeHints" />
        </div>

        <!-- Chat Auto-delete -->
        <div class="space-y-2">
          <Label class="text-base font-medium">Auto-delete Chats</Label>
          <select 
            v-model="settings.chatAutoDeleteDays"
            class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="never">Never</option>
            <option value="30">After 30 days</option>
            <option value="60">After 60 days</option>
            <option value="90">After 90 days</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Upgrade Modal -->
    <UpgradeModal
      v-model:open="upgradeModalState.open"
      :limit-type="upgradeModalState.limitType"
      :override-title="upgradeModalState.title"
      :override-description="upgradeModalState.description"
      :override-benefits="upgradeModalState.benefits"
      :target-tier="upgradeModalState.targetTier"
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
