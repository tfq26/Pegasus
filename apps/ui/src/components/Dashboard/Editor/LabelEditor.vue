<template>
  <div class="space-y-6 h-full flex flex-col">
    <div class="space-y-2">
      <div class="flex justify-between items-center">
        <label class="text-sm font-medium">Data Points</label>
        <div class="flex gap-2">
          <button 
            @click="clearAll"
            class="text-xs text-muted-foreground hover:text-foreground transition"
          >
            Clear All
          </button>
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        Customize labels and add hover notes for specific data points.
      </p>
    </div>

    <!-- Data Points List -->
    <div class="flex-1 overflow-y-auto min-h-0 border border-border rounded-md">
      <div v-if="dataPoints.length === 0" class="p-8 text-center text-muted-foreground">
        No data points available to customize.
      </div>
      
      <div v-else class="divide-y divide-border">
        <div 
          v-for="(point, index) in dataPoints" 
          :key="index"
          class="p-3 hover:bg-muted/30 transition-colors"
        >
          <div class="flex items-center gap-3 mb-2">
            <div 
              class="w-3 h-3 rounded-lg border border-border"
              :style="{ backgroundColor: getPointColor(index) }"
            />
            <span class="text-sm font-medium truncate flex-1">{{ point.label }}</span>
            <span class="text-xs font-mono text-muted-foreground">{{ point.value }}</span>
          </div>

          <div class="grid grid-cols-2 gap-3 pl-6">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-bold text-muted-foreground">Custom Label</label>
              <input 
                v-model="customLabels[index]"
                @input="updateCustomization"
                class="flex h-7 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Override label"
              />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-bold text-muted-foreground">Hover Note</label>
              <input 
                v-model="customNotes[index]"
                @input="updateCustomization"
                class="flex h-7 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Add note..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'

interface DashboardElement {
  id: string
  config: {
    data: {
      labels?: string[]
      datasets?: Array<{
        data: number[]
        backgroundColor?: string[] | string
      }>
    }
  }
  customization?: {
    labels?: { [key: number]: string }
    notes?: { [key: number]: string }
    colorPalette?: {
      shades?: string[]
    }
    [key: string]: any
  }
}

const props = defineProps<{
  modelValue: DashboardElement
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DashboardElement]
}>()

const customLabels = ref<{ [key: number]: string }>({})
const customNotes = ref<{ [key: number]: string }>({})

// Initialize from prop
onMounted(() => {
  if (props.modelValue.customization) {
    customLabels.value = { ...(props.modelValue.customization.labels || {}) }
    customNotes.value = { ...(props.modelValue.customization.notes || {}) }
  }
})

const dataPoints = computed(() => {
  const data = props.modelValue.config.data
  if (!data || !data.labels) return []
  
  const dataset = data.datasets?.[0]
  const values = dataset?.data || []
  
  return data.labels.map((label, index) => ({
    label,
    value: values[index],
    index
  }))
})

const getPointColor = (index: number) => {
  const customColors = props.modelValue.customization?.colorPalette?.shades
  if (customColors && customColors[index]) {
    return customColors[index]
  }
  
  const dataset = props.modelValue.config.data?.datasets?.[0]
  if (dataset?.backgroundColor) {
    if (Array.isArray(dataset.backgroundColor)) {
      return dataset.backgroundColor[index] || dataset.backgroundColor[0]
    }
    return dataset.backgroundColor
  }
  
  return '#ccc'
}

const updateCustomization = () => {
  const updatedElement = JSON.parse(JSON.stringify(props.modelValue))
  
  if (!updatedElement.customization) {
    updatedElement.customization = {}
  }
  
  // Clean up empty strings
  const cleanedLabels: { [key: number]: string } = {}
  Object.keys(customLabels.value).forEach((k) => {
    const key = Number(k)
    const val = customLabels.value[key]
    if (val && val.trim() !== '') {
      cleanedLabels[key] = val
    }
  })
  
  const cleanedNotes: { [key: number]: string } = {}
  Object.keys(customNotes.value).forEach((k) => {
    const key = Number(k)
    const val = customNotes.value[key]
    if (val && val.trim() !== '') {
      cleanedNotes[key] = val
    }
  })
  
  updatedElement.customization.labels = cleanedLabels
  updatedElement.customization.notes = cleanedNotes
  
  emit('update:modelValue', updatedElement)
}

const clearAll = () => {
  customLabels.value = {}
  customNotes.value = {}
  updateCustomization()
}
</script>
