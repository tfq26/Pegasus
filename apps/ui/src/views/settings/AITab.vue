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

onMounted(async () => {
  loading.value = true
  try {
    models.value = await getAIModels()
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

const isModelEnabled = (id: string) => {
  return props.settings.enabledModels?.includes(id) ?? false
}

const toggleModel = (id: string) => {
  const current = props.settings.enabledModels || []
  if (current.includes(id)) {
    props.settings.enabledModels = current.filter(m => m !== id)
  } else {
    props.settings.enabledModels = [...current, id]
  }
}

const sliderValue = computed({
  get: () => [props.settings.aiDetail],
  set: ([value]) => {
    props.settings.aiDetail = Number(value ?? 0)
  },
})
</script>

<template>
  <div class="space-y-4 max-w-3xl">
    <h2 class="text-2xl font-semibold text-primary mb-6">Pegasus AI</h2>
    <div>
      <h3 class="text-foreground font-medium mb-1">Response Detail</h3>
      <Slider v-model="sliderValue" :min="0" :max="2" class="w-full" />
      <p class="text-muted-foreground text-sm">Level: <strong>{{ ['Brief', 'Balanced', 'Detailed'][props.settings.aiDetail] }}</strong></p>
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
      <div v-else class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        <div 
          v-for="model in filteredModels" 
          :key="model.id"
          class="p-3 rounded-lg border border-border bg-card flex items-start justify-between group hover:border-primary/50 transition-colors"
        >
          <div>
            <div class="font-medium text-foreground text-sm flex items-center gap-2">
              {{ model.name }}
              <span v-if="isModelEnabled(model.id)" class="px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary border border-primary/30">
                Active
              </span>
            </div>
            <div class="text-xs text-muted-foreground mt-1">{{ model.description }}</div>
            <div class="text-[10px] text-muted-foreground mt-2 font-mono">
              Context: {{ model.contextWindow }} tokens
            </div>
          </div>
          <button
            @click="toggleModel(model.id)"
            class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            :class="isModelEnabled(model.id) 
              ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20' 
              : 'bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground border border-border'"
          >
            {{ isModelEnabled(model.id) ? 'Remove' : 'Add' }}
          </button>
        </div>
        <div v-if="filteredModels.length === 0" class="text-center py-8 text-muted-foreground text-sm">
          No models found matching "{{ searchQuery }}"
        </div>
      </div>
    </div>
  </div>
</template>
