<template>
  <div class="space-y-6">
    <!-- Title -->
    <div class="space-y-2">
      <label class="text-sm font-medium">Element Title</label>
      <input 
        v-model="localConfig.title"
        @input="updateConfig"
        placeholder="Enter element title..."
        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>

    <!-- Description (Stats only) -->
    <div v-if="localConfig.type === 'stat'" class="space-y-2">
      <label class="text-sm font-medium">Description</label>
      <textarea 
        v-model="description"
        @input="updateConfig"
        rows="3"
        placeholder="Explain what this metric represents..."
        class="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p class="text-xs text-muted-foreground">
        This description will appear below the statistic value
      </p>
    </div>

    <!-- Chart Type -->
    <div class="space-y-2">
      <label class="text-sm font-medium">Chart Type</label>
      <select
        v-model="localConfig.type"
        @change="handleTypeChange"
        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="bar">Bar Chart</option>
        <option value="line">Line Chart</option>
        <option value="pie">Pie Chart</option>
        <option value="doughnut">Doughnut Chart</option>
        <option value="radar">Radar Chart</option>
        <option value="polarArea">Polar Area Chart</option>
        <option value="stat">Statistic</option>
      </select>
    </div>

    <!-- Refresh Frequency -->
    <div v-if="localConfig.query" class="space-y-2">
      <label class="text-sm font-medium">Refresh Frequency</label>
      <select
        v-model="localConfig.refreshFrequency"
        @change="updateConfig"
        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option :value="undefined">Manual Only</option>
        <option :value="60">Every 1 minute</option>
        <option :value="300">Every 5 minutes</option>
        <option :value="900">Every 15 minutes</option>
        <option :value="1800">Every 30 minutes</option>
        <option :value="3600">Every 1 hour</option>
        <option :value="86400">Daily</option>
      </select>
      <p class="text-xs text-muted-foreground">
        How often the data should be automatically re-fetched.
      </p>
    </div>

    <!-- Query (Read-only) -->
    <div class="space-y-2">
      <label class="text-sm font-medium">Source Query</label>
      <div class="relative">
        <textarea 
          :value="localConfig.query"
          readonly
          rows="4"
          class="flex min-h-[60px] w-full rounded-md border border-input bg-muted px-3 py-2 text-sm font-mono text-muted-foreground"
        />
        <div class="absolute top-2 right-2">
          <button
            @click="copyQuery"
            class="px-2 py-1 text-xs bg-background border border-border rounded hover:bg-muted transition"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        To modify the query, use "Edit Query" from the context menu
      </p>
    </div>

    <!-- Data Info -->
    <div class="space-y-2">
      <label class="text-sm font-medium">Data Summary</label>
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-muted rounded-lg">
          <div class="text-xs text-muted-foreground mb-1">Data Points</div>
          <div class="text-lg font-semibold">{{ dataPointCount }}</div>
        </div>
        <div class="p-3 bg-muted rounded-lg">
          <div class="text-xs text-muted-foreground mb-1">Chart Type</div>
          <div class="text-lg font-semibold capitalize">{{ localConfig.type }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'

interface DashboardElement {
  id: string
  title: string
  query?: string
  connectionId?: string
  type: string
  config: any
  refreshFrequency?: number
  lastResult?: any
  cacheUntil?: number
  customization?: {
    description?: string
    [key: string]: any
  }
}

const props = defineProps<{
  modelValue: DashboardElement
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DashboardElement]
}>()

const localConfig = ref<DashboardElement>({ ...props.modelValue })
const copied = ref(false)

// Description binding
const description = computed({
  get: () => localConfig.value.customization?.description || '',
  set: (value: string) => {
    if (!localConfig.value.customization) {
      localConfig.value.customization = {}
    }
    localConfig.value.customization.description = value
  }
})

// Data point count
const dataPointCount = computed(() => {
  if (localConfig.value.type === 'stat') {
    return 1
  }
  
  if (localConfig.value.config.data?.labels) {
    return localConfig.value.config.data.labels.length
  }
  
  if (localConfig.value.config.data?.datasets?.[0]?.data) {
    return localConfig.value.config.data.datasets[0].data.length
  }
  
  return 0
})

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  localConfig.value = { ...newValue }
}, { deep: true })

// Store previous type for validation
const previousType = ref(localConfig.value.type)

// Handle chart type changes with validation
const handleTypeChange = () => {
  const newType = localConfig.value.type
  const oldType = previousType.value
  
  // Prevent converting charts to stats (not supported)
  if (oldType !== 'stat' && newType === 'stat') {
    toast.error('Cannot convert chart to statistic', {
      description: 'Stats can only display single values. Create a new stat element instead.'
    })
    // Revert the change
    localConfig.value.type = oldType
    return
  }
  
  // Update previous type and emit changes
  previousType.value = newType
  updateConfig()
}

// Update parent
const updateConfig = () => {
  emit('update:modelValue', localConfig.value)
}

// Copy query
const copyQuery = () => {
  if (!localConfig.value.query) return
  navigator.clipboard.writeText(localConfig.value.query)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}
</script>
