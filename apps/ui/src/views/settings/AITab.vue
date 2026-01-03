<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { computed, ref, onMounted } from 'vue'

// Check if running in Tauri desktop environment
const isTauri = computed(() => '__TAURI_INTERNALS__' in window)
import type { SettingsModel } from './types'
import { getAIModels } from '@/lib/api'
import { localAI, type OllamaStatus } from '@/services/LocalAIService'
import { Loader2, Server, Power, Download, CheckCircle2, AlertCircle } from 'lucide-vue-next'

const props = defineProps<{
  settings: SettingsModel
}>()

const models = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const localStatus = ref<OllamaStatus>({ is_running: false, version: null, models: [] })
const isStartingLocal = ref(false)
const pullProgress = ref<any>(null)

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
    const [cloudModels, _] = await Promise.all([
      getAIModels(),
      checkLocalStatus()
    ])
    models.value = cloudModels
    
    // Merge local models into the list if available
    if (localStatus.value.is_running) {
       const localModels = localStatus.value.models.map(m => ({
         id: `local:${m}`,
         name: m,
         provider: 'local',
         description: 'Run locally via Ollama',
         contextWindow: 4096 // Default assumption
       }))
       models.value = [...localModels, ...models.value]
    }

    // Only initialize enabledModels if it doesn't exist yet (undefined)
    if (props.settings.enabledModels === undefined) {
      props.settings.enabledModels = []
    }
  } catch (e) {
    error.value = 'Failed to load models'
  } finally {
    loading.value = false
  }
})

const isModelEnabled = (id: string) => {
  if (props.settings.enabledModels === undefined) return true
  return props.settings.enabledModels.includes(id)
}

const toggleModelEnabled = (id: string, checked: boolean) => {
  if (props.settings.enabledModels === undefined) {
    props.settings.enabledModels = models.value.map(m => m.id)
  }
  
  if (checked) {
    if (!props.settings.enabledModels.includes(id)) {
      props.settings.enabledModels.push(id)
    }
  } else {
    // Prevent disabling the active model
    if (isModelActive(id)) return
    
    props.settings.enabledModels = props.settings.enabledModels.filter(m => m !== id)
  }
}

const selectModel = (id: string) => {
  props.settings.activeModel = id
  // Auto-enable if selected
  if (props.settings.enabledModels === undefined) {
     props.settings.enabledModels = models.value.map(m => m.id)
  }
  if (!props.settings.enabledModels.includes(id)) {
    props.settings.enabledModels.push(id)
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

const isModelActive = (id: string) => {
  return props.settings.activeModel === id
}

const sliderValue = computed({
  get: () => [props.settings.aiDetail],
  set: ([value]) => {
    props.settings.aiDetail = Number(value ?? 0)
  },
})

const temperatureValue = computed({
  get: () => [props.settings.temperature ?? 0.7],
  set: ([value]) => {
    props.settings.temperature = Number(value ?? 0.7)
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
    </div>

    <div>
      <h3 class="text-foreground font-medium mb-1">Response Detail</h3>
      <Slider v-model="sliderValue" :min="0" :max="2" class="w-full" />
      <p class="text-muted-foreground text-sm">Level: <strong>{{ ['Brief', 'Balanced', 'Detailed'][props.settings.aiDetail] }}</strong></p>
    </div>

    <div class="grid grid-cols-2 gap-6">
      <div>
        <h3 class="text-foreground font-medium mb-1">Temperature</h3>
        <Slider v-model="temperatureValue" :min="0" :max="1" :step="0.1" class="w-full" />
        <p class="text-muted-foreground text-sm">Creativity: <strong>{{ props.settings.temperature ?? 0.7 }}</strong></p>
      </div>
      
      <div>
        <h3 class="text-foreground font-medium mb-1">Max Tokens</h3>
        <input 
          v-model.number="props.settings.maxTokens"
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
        v-model="props.settings.customInstructions"
        class="w-full h-24 px-3 py-2 text-sm bg-background border border-input rounded-md text-foreground focus:outline-none focus:border-primary resize-none"
        placeholder="e.g. Always format SQL keywords in uppercase. Be concise."
      ></textarea>
      <p class="text-muted-foreground text-xs mt-1">These instructions will be added to the system prompt.</p>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.enableContext" class="accent-violet-600" />
      Enable conversation memory
    </label>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.enableCodeHints" class="accent-violet-600" />
      Enable AI code suggestions
    </label>

    <div class="pt-4 border-t border-border">
      <h3 class="text-foreground font-medium mb-3">Chat History Management</h3>
      <div class="space-y-3">
        <div>
          <label class="text-sm text-foreground mb-2 block">Auto-delete chats after</label>
          <select 
            v-model="props.settings.chatAutoDeleteDays"
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
        <h3 class="text-foreground font-medium">Available Models</h3>
        <input 
          v-model="searchQuery"
          type="text"
          placeholder="Search models..."
          class="px-3 py-1.5 text-xs bg-background border border-input rounded-md text-foreground focus:outline-none focus:border-primary w-48"
        />
      </div>
      
      <div v-if="loading" class="text-muted-foreground text-sm">Loading models...</div>
      <div v-else-if="error" class="text-destructive text-sm">{{ error }}</div>
      <div v-else class="space-y-3">
        <div 
          v-for="model in filteredModels" 
          :key="model.id"
          @click="selectModel(model.id)"
          class="p-3 rounded-lg border border-border bg-card flex items-start justify-between group transition-all cursor-pointer"
          :class="isModelActive(model.id) 
            ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' 
            : 'hover:border-primary/50 hover:bg-accent'"
        >
          <div class="flex items-start gap-3 flex-1">
            <Checkbox 
              :model-value="isModelEnabled(model.id)"
              @update:model-value="(v: boolean) => toggleModelEnabled(model.id, v)"
              @click.stop
              :disabled="isModelActive(model.id)"
              class="mt-1 accent-violet-600"
            />
            <div class="flex-1">
              <div class="font-medium text-foreground text-sm flex items-center gap-2">
                {{ model.name }}
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
                  Gemini
                </span>
                <span 
                   v-else-if="model.provider === 'local'" 
                   class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30"
                >
                  Local
                </span>
                <!--
                <span 
                  v-else-if="model.provider === 'anthropic'" 
                  class="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30"
                >
                  Anthropic
                </span>
                -->
                <span v-if="isModelActive(model.id)" class="px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary border border-primary/30">
                  Active
                </span>
              </div>
              <div class="text-xs text-muted-foreground mt-1">{{ model.description }}</div>
              <div class="text-[10px] text-muted-foreground mt-2 font-mono">
                Context: {{ model.contextWindow?.toLocaleString() || 'N/A' }} tokens
              </div>
            </div>
          </div>
        </div>
        <div v-if="filteredModels.length === 0" class="text-center py-8 text-muted-foreground text-sm">
          No models found matching "{{ searchQuery }}"
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
</style>
