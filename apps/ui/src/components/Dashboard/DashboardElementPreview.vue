<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] bg-background border-border text-foreground">
      <DialogHeader>
        <DialogTitle>Create Dashboard Element</DialogTitle>
        <DialogDescription class="text-muted-foreground">
          Preview and customize your visualization.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- Chart Preview -->
        <div class="h-[400px] w-full bg-muted/30 rounded-lg p-4 border border-border flex items-center justify-center">
          <ChartRenderer 
            v-if="config" 
            :type="config.type" 
            :data="config.type === 'stat' ? config.config : config.config.data" 
            :options="config.type === 'stat' ? config.config : config.config.options" 
          />
          <div v-else class="text-muted-foreground">Loading preview...</div>
        </div>
      </div>

      <div class="flex gap-2 items-center">
        <!-- Dashboard Selector -->
        <div class="flex-1">
             <Select v-model="selectedDashboardId">
            <SelectTrigger class="w-full h-10">
              <SelectValue placeholder="Select Dashboard" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="d in dashboards" :key="d.id" :value="d.id">
                {{ d.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Refine (Hidden) -->
        <!-- 
        <input 
          v-model="input"
          @keydown.enter="refineChart"
          placeholder="Refine chart (e.g. 'Change to line chart', 'Make it red')..." 
          class="flex-1 bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <button 
          @click="refineChart"
          :disabled="isRefining || !input"
          class="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {{ isRefining ? 'Refining...' : 'Refine' }}
        </button>
        -->

        <button 
          @click="saveToDashboard"
          :disabled="!selectedDashboardId"
          class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          Add to Dashboard
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ChartRenderer from './ChartRenderer.vue'
import { recommendVisualization } from '@/lib/api'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  initialConfig: any
  query: string
  results: any[]
}>()

const emit = defineEmits(['update:open', 'saved'])

const store = useDashboardStore()
const { dashboards, currentDashboard } = storeToRefs(store)
const selectedDashboardId = ref('')

const config = ref<any>(null)
const input = ref('')
const isRefining = ref(false)

watch(() => props.initialConfig, (newConfig) => {
  if (newConfig) {
    config.value = JSON.parse(JSON.stringify(newConfig))
  }
}, { immediate: true })

// Initialize selected dashboard
watch(() => props.open, async (isOpen) => {
    if (isOpen) {
        if (dashboards.value.length === 0) {
            await store.loadDashboards()
        }
        
        if (currentDashboard.value) {
            selectedDashboardId.value = currentDashboard.value.id
        } else if (dashboards.value.length > 0) {
            selectedDashboardId.value = dashboards.value[0]!.id
        }
    }
})

const refineChart = async () => {
  if (!input.value) return
  
  isRefining.value = true
  try {
    console.log('[Refine] Requesting refinement with:', input.value)
    const refinementText = input.value.toLowerCase()
    
    // Try heuristic refinement first for common requests
    let heuristicConfig = null
    
    // Chart type changes
    if (refinementText.includes('bar chart') || refinementText.includes('to bar')) {
      heuristicConfig = convertToChartType('bar')
    } else if (refinementText.includes('line chart') || refinementText.includes('to line')) {
      heuristicConfig = convertToChartType('line')
    } else if (refinementText.includes('pie chart') || refinementText.includes('to pie')) {
      heuristicConfig = convertToChartType('pie')
    } else if (refinementText.includes('doughnut') || refinementText.includes('donut')) {
      heuristicConfig = convertToChartType('doughnut')
    }
    
    // Column selection changes (e.g., "show wins and losses")
    if (!heuristicConfig && props.results && props.results.length > 0) {
      const firstRow = props.results[0]
      const availableColumns = Object.keys(firstRow)
      
      // Check if user is requesting specific columns
      const requestedColumns = availableColumns.filter(col => 
        refinementText.includes(col.toLowerCase())
      )
      
      if (requestedColumns.length > 0) {
        heuristicConfig = updateChartColumns(requestedColumns)
      }
    }
    
    if (heuristicConfig) {
      console.log('[Refine] Applied heuristic refinement')
      config.value = heuristicConfig
      input.value = ''
      toast.success('Chart updated')
      isRefining.value = false
      return
    }
    
    // Fall back to AI if heuristics didn't work
    const refinedQuery = `${props.query} (Refinement: ${input.value})`
    const newConfig = await recommendVisualization(refinedQuery, props.results, config.value)
    
    console.log('[Refine] Received config:', newConfig)
    
    if (newConfig) {
      config.value = newConfig
      input.value = ''
      toast.success('Chart updated')
    } else {
      toast.error('AI could not refine the chart', {
        description: 'Try a different refinement request'
      })
    }
  } catch (e) {
    console.error('[Refine] Error:', e)
    toast.error('Failed to refine chart', {
      description: e instanceof Error ? e.message : String(e)
    })
  } finally {
    isRefining.value = false
  }
}

const convertToChartType = (newType: string) => {
  if (!config.value || config.value.type === 'stat') return null
  
  const newConfig = JSON.parse(JSON.stringify(config.value))
  newConfig.type = newType
  
  // Adjust config based on chart type
  if (newType === 'pie' || newType === 'doughnut') {
    // Pie/doughnut charts need single dataset
    if (newConfig.config.datasets && newConfig.config.datasets.length > 0) {
      const dataset = newConfig.config.datasets[0]
      dataset.backgroundColor = newConfig.config.labels?.map((_: any, i: number) => 
        `hsl(${i * 40}, 70%, 50%)`
      )
    }
  }
  
  return newConfig
}

const updateChartColumns = (columns: string[]) => {
  if (!config.value || !props.results || props.results.length === 0) return null
  
  const newConfig = JSON.parse(JSON.stringify(config.value))
  
  // Get the first non-numeric column as labels (category)
  const firstRow = props.results[0]
  const allColumns = Object.keys(firstRow)
  const categoryColumn = allColumns.find(col => 
    typeof firstRow[col] === 'string' && !columns.includes(col)
  ) || allColumns[0]
  
  // Filter to only numeric columns from the requested columns
  const numericColumns = columns.filter(col => {
    const val = firstRow[col]
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
  })
  
  if (numericColumns.length === 0) return null
  
  // Update labels
  newConfig.config.labels = props.results.map(r => r[categoryColumn!])
  
  // Update datasets
  newConfig.config.datasets = numericColumns.map((col, idx) => ({
    label: col,
    data: props.results.map(r => typeof r[col] === 'number' ? r[col] : parseFloat(r[col])),
    backgroundColor: newConfig.type === 'bar' ? `hsl(${idx * 60}, 70%, 50%)` : undefined,
    borderColor: newConfig.type === 'line' ? `hsl(${idx * 60}, 70%, 50%)` : undefined,
    borderWidth: newConfig.type === 'bar' ? 1 : undefined,
    tension: newConfig.type === 'line' ? 0.4 : undefined
  }))
  
  newConfig.title = `${numericColumns.join(' vs ')} by ${categoryColumn}`
  
  return newConfig
}

const saveToDashboard = async () => {
  if (!selectedDashboardId.value) {
      toast.error('Please select a dashboard')
      return
  }

  console.log('[DashboardElementPreview] Saving to dashboard:', selectedDashboardId.value)
  try {
    await store.addElementToDashboard(selectedDashboardId.value, {
      type: config.value.type,
      title: config.value.title,
      config: config.value.config,
      query: props.query
    })
    toast.success('Saved to Dashboard')
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    toast.error('Failed to save')
  }
}
</script>
