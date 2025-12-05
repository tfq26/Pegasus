<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { computed, ref, onMounted } from 'vue'
import type { SettingsModel } from './types'
import { getAIModels } from '@/lib/api'

const props = defineProps<{
  settings: SettingsModel
}>()

const models = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')

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

onMounted(async () => {
  loading.value = true
  try {
    models.value = await getAIModels()
    // Only initialize enabledModels if it doesn't exist yet (undefined)
    // Start with empty array - user must explicitly enable models
    if (props.settings.enabledModels === undefined) {
      props.settings.enabledModels = []
    }
  } catch (e) {
    error.value = 'Failed to load models'
  } finally {
    loading.value = false
  }
})

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
          class="p-3 rounded-lg border border-border bg-card flex items-start justify-between group hover:border-primary/50 transition-colors"
        >
          <div class="flex items-start gap-3">
            <Checkbox 
              :model-value="isModelEnabled(model.id)"
              @update:model-value="(v: boolean) => toggleModelEnabled(model.id, v)"
              :disabled="isModelActive(model.id)"
              class="mt-1 accent-violet-600"
            />
            <div>
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
          <button
            @click="selectModel(model.id)"
            class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            :class="isModelActive(model.id) 
              ? 'bg-primary/10 text-primary border border-primary/20 cursor-default' 
              : 'bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground border border-border'"
            :disabled="isModelActive(model.id)"
          >
            {{ isModelActive(model.id) ? 'Selected' : 'Select' }}
          </button>
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
