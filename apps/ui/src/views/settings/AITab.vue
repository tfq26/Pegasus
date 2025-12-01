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
    <h2 class="text-2xl font-semibold text-violet-400 mb-6">Pegasus AI</h2>
    <div>
      <h3 class="text-stone-300 font-medium mb-1">Response Detail</h3>
      <Slider v-model="sliderValue" :min="0" :max="2" class="w-full" />
      <p class="text-stone-400 text-sm">Level: <strong>{{ ['Brief', 'Balanced', 'Detailed'][props.settings.aiDetail] }}</strong></p>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.enableContext" class="accent-violet-600" />
      Enable conversation memory
    </label>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.enableCodeHints" class="accent-violet-600" />
      Enable AI code suggestions
    </label>

    <div class="pt-6 border-t border-stone-800">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-stone-300 font-medium">Available Models</h3>
        <input 
          v-model="searchQuery"
          type="text"
          placeholder="Search models..."
          class="px-3 py-1.5 text-xs bg-stone-900 border border-stone-800 rounded-md text-stone-200 focus:outline-none focus:border-violet-500 w-48"
        />
      </div>
      
      <div v-if="loading" class="text-stone-500 text-sm">Loading models...</div>
      <div v-else-if="error" class="text-rose-400 text-sm">{{ error }}</div>
      <div v-else class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        <div 
          v-for="model in filteredModels" 
          :key="model.id"
          class="p-3 rounded-lg border border-stone-800 bg-stone-900/50 flex items-start justify-between group hover:border-stone-700 transition-colors"
        >
          <div>
            <div class="font-medium text-stone-200 text-sm flex items-center gap-2">
              {{ model.name }}
              <span v-if="isModelEnabled(model.id)" class="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Active
              </span>
            </div>
            <div class="text-xs text-stone-500 mt-1">{{ model.description }}</div>
            <div class="text-[10px] text-stone-600 mt-2 font-mono">
              Context: {{ model.contextWindow }} tokens
            </div>
          </div>
          <button
            @click="toggleModel(model.id)"
            class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            :class="isModelEnabled(model.id) 
              ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20' 
              : 'bg-stone-800 text-stone-300 hover:bg-violet-600 hover:text-white border border-stone-700'"
          >
            {{ isModelEnabled(model.id) ? 'Remove' : 'Add' }}
          </button>
        </div>
        <div v-if="filteredModels.length === 0" class="text-center py-8 text-stone-500 text-sm">
          No models found matching "{{ searchQuery }}"
        </div>
      </div>
    </div>
  </div>
</template>
