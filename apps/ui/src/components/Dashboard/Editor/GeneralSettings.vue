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

    <!-- Description -->
    <div class="space-y-2">
      <label class="text-sm font-medium">Description</label>
      <textarea 
        v-model="description"
        @input="updateConfig"
        rows="3"
        placeholder="Explain what this metric represents..."
        class="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      ></textarea>
      <p class="text-xs text-muted-foreground">
        This description will appear below the title on the dashboard card
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
        <option value="horizontalBar">Horizontal Bar</option>
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
        ></textarea>
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
    <!-- Chart Appearance -->
    <div v-if="localConfig.type !== 'stat'" class="space-y-3 pt-2 border-t border-border">
      <label class="text-sm font-medium">Chart Appearance</label>
      
      <div class="grid grid-cols-2 gap-4">
        <!-- Time Format -->
        <div class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.use24HourTime"
            @change="(e: any) => updateCustomization('use24HourTime', e.target.checked)"
            id="use24h"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="use24h" class="text-sm">24-Hour Time Format</label>
        </div>

        <!-- Axis Grids -->
        <div class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.showGridX ?? true"
            @change="(e: any) => updateCustomization('showGridX', e.target.checked)"
            id="gridX"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="gridX" class="text-sm">Show X-Axis Grid</label>
        </div>

        <div class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.showGridY ?? true"
            @change="(e: any) => updateCustomization('showGridY', e.target.checked)"
            id="gridY"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="gridY" class="text-sm">Show Y-Axis Grid</label>
        </div>
        

        
        <!-- Legend Toggle -->
        <div class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.showLegend ?? true"
            @change="(e: any) => updateCustomization('showLegend', e.target.checked)"
            id="legend"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="legend" class="text-sm">Show Legend</label>
        </div>

        <!-- Tooltip Toggle -->
        <div class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.showTooltips ?? true"
            @change="(e: any) => updateCustomization('showTooltips', e.target.checked)"
            id="tooltips"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="tooltips" class="text-sm">Show Tooltips</label>
        </div>

        <!-- Line Options -->
        <div v-if="isLineBased" class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.showPoints ?? true"
            @change="(e: any) => updateCustomization('showPoints', e.target.checked)"
            id="points"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="points" class="text-sm">Show Points</label>
        </div>

        <div v-if="isLineBased" class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.smoothLines"
            @change="(e: any) => updateCustomization('smoothLines', e.target.checked)"
            id="smooth"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="smooth" class="text-sm">Smooth Lines</label>
        </div>

        <div v-if="isLineBased" class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.fillArea"
            @change="(e: any) => updateCustomization('fillArea', e.target.checked)"
            id="fill"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="fill" class="text-sm">Fill Area</label>
        </div>
        
        <!-- Trend Coloring -->
        <div v-if="localConfig.type === 'line'" class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.trendColoring"
            @change="(e: any) => updateCustomization('trendColoring', e.target.checked)"
            id="trend"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="trend" class="text-sm">Trend Coloring</label>
        </div>

        <!-- Bar Options -->
        <div v-if="localConfig.type === 'bar'" class="flex items-center gap-2">
          <input 
            type="checkbox" 
            :checked="localConfig.customization?.stacked"
            @change="(e: any) => updateCustomization('stacked', e.target.checked)"
            id="stacked"
            class="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <label for="stacked" class="text-sm">Stacked Bars</label>
        </div>
      </div>

      <!-- Advanced Line Settings -->
      <div v-if="isLineBased" class="grid grid-cols-2 gap-4 mt-2 pt-2 border-t border-dashed border-border">
        <div class="space-y-1">
          <label class="text-xs font-medium">Line Thickness</label>
          <input 
            type="range" 
            min="1" 
            max="10" 
            :value="localConfig.customization?.lineThickness || 2"
            @input="(e: any) => updateCustomization('lineThickness', parseInt(e.target.value))"
            class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div class="text-xs text-muted-foreground text-right">{{ localConfig.customization?.lineThickness || 2 }}px</div>
        </div>

        <div class="space-y-1">
          <label class="text-xs font-medium">Line Style</label>
          <select 
            :value="localConfig.customization?.lineStyle || 'solid'"
            @change="(e: any) => updateCustomization('lineStyle', e.target.value)"
            class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>

        <div v-if="localConfig.customization?.showPoints !== false" class="space-y-1">
          <label class="text-xs font-medium">Point Size</label>
          <input 
            type="range" 
            min="1" 
            max="10" 
            :value="localConfig.customization?.pointRadius || 4"
            @input="(e: any) => updateCustomization('pointRadius', parseInt(e.target.value))"
            class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div class="text-xs text-muted-foreground text-right">{{ localConfig.customization?.pointRadius || 4 }}px</div>
        </div>
      </div>

      <!-- Advanced Bar Settings -->
      <div v-if="localConfig.type === 'bar'" class="grid grid-cols-2 gap-4 mt-2 pt-2 border-t border-dashed border-border">
        <div class="space-y-1">
          <label class="text-xs font-medium">Bar Radius</label>
          <input 
            type="range" 
            min="0" 
            max="20" 
            :value="localConfig.customization?.borderRadius || 0"
            @input="(e: any) => updateCustomization('borderRadius', parseInt(e.target.value))"
            class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div class="text-xs text-muted-foreground text-right">{{ localConfig.customization?.borderRadius || 0 }}px</div>
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium">Bar Thickness</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            :value="localConfig.customization?.barThickness || 0"
            @input="(e: any) => updateCustomization('barThickness', parseInt(e.target.value))"
            class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div class="text-xs text-muted-foreground text-right">{{ localConfig.customization?.barThickness ? localConfig.customization.barThickness + 'px' : 'Auto' }}</div>
        </div>
      </div>

      <!-- Statistic Appearance -->
      <div v-if="localConfig.type === 'stat'" class="space-y-3 pt-2 border-t border-border">
        <label class="text-sm font-medium">Stat Appearance</label>
        
        <div class="grid grid-cols-2 gap-4">

          
          <!-- Font Size -->
          <div class="space-y-1">
            <label class="text-xs font-medium">Font Size</label>
            <input 
              type="range" 
              min="12" 
              max="120" 
              step="4"
              :value="localConfig.customization?.fontSize || 36"
              @input="(e: any) => updateCustomization('fontSize', parseInt(e.target.value))"
              class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div class="text-xs text-muted-foreground text-right">{{ localConfig.customization?.fontSize || 36 }}px</div>
          </div>

          <!-- Alignment -->
          <div class="space-y-1 col-span-2">
            <label class="text-xs font-medium">Alignment</label>
            <div class="flex items-center gap-1 p-1 bg-muted rounded-md w-fit">
              <button 
                @click="updateCustomization('textAlign', 'left')"
                :class="['p-1.5 rounded transition-colors', localConfig.customization?.textAlign === 'left' ? 'bg-background shadow-sm' : 'hover:bg-background/50']"
                title="Align Left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-left"><line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/></svg>
              </button>
              <button 
                @click="updateCustomization('textAlign', 'center')"
                :class="['p-1.5 rounded transition-colors', (localConfig.customization?.textAlign === 'center' || !localConfig.customization?.textAlign) ? 'bg-background shadow-sm' : 'hover:bg-background/50']"
                title="Align Center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-center"><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="3" y1="12" y2="12"/><line x1="21" x2="3" y1="18" y2="18"/></svg>
              </button>
              <button 
                @click="updateCustomization('textAlign', 'right')"
                :class="['p-1.5 rounded transition-colors', localConfig.customization?.textAlign === 'right' ? 'bg-background shadow-sm' : 'hover:bg-background/50']"
                title="Align Right"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-align-right"><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast } from '@/composables/useNotifications'

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

// Update customization helpers
const updateCustomization = (key: string, value: any) => {
  if (!localConfig.value.customization) {
    localConfig.value.customization = {}
  }
  localConfig.value.customization[key] = value
  updateConfig()
}

const isLineBased = computed(() => {
  const type = localConfig.value.type
  return ['line', 'area', 'radar', 'scatter'].includes(type)
})

// Copy query
const copyQuery = () => {
  if (!localConfig.value.query) return
  navigator.clipboard.writeText(localConfig.value.query)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}
</script>
