<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] bg-background border-border text-foreground" @pointerDownOutside.prevent @interactOutside.prevent>
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
        <!-- Chart Type Selector -->
        <div class="w-40">
           <Select :model-value="config?.type" @update:model-value="(val: string) => applyChartType(val)">
            <SelectTrigger class="w-full h-10">
              <SelectValue placeholder="Chart Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar Chart</SelectItem>
              <SelectItem value="line">Line Chart</SelectItem>
              <SelectItem value="area">Area Chart</SelectItem>
              <SelectItem value="pie">Pie Chart</SelectItem>
              <SelectItem value="doughnut">Doughnut</SelectItem>
              <SelectItem value="stat">Statistic</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Dashboard Selector -->
        <div class="flex-1">
             <Select v-model="selectedDashboardId">
            <SelectTrigger class="w-full h-10">
              <SelectValue placeholder="Select Dashboard" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="create_new" class="font-medium text-primary border-b border-border mb-1">
                + Create New Dashboard...
              </SelectItem>
              <SelectItem v-for="d in dashboardsList" :key="(d as any).id" :value="(d as any).id">
                {{ (d as any).title }}
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

  <!-- Create Dashboard Modal -->
  <Dialog :open="showCreateDashboardModal" @update:open="(val: boolean) => !val && cancelCreateDashboard()">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Create New Dashboard</DialogTitle>
        <DialogDescription>
          Enter a name for your new dashboard. The current visualization will be added to it automatically.
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <label for="name" class="text-sm font-medium">Name</label>
          <input 
            id="name" 
            v-model="newDashboardName" 
            placeholder="e.g. Sales Overview"
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            @keydown.enter="handleCreateDashboard"
            autofocus
          />
        </div>
      </div>
      <div class="flex justify-end gap-3">
        <button 
          @click="cancelCreateDashboard"
          class="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button 
          @click="handleCreateDashboard"
          :disabled="isCreatingDashboard || !newDashboardName"
          class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {{ isCreatingDashboard ? 'Creating...' : 'Create & Add' }}
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ChartRenderer from './ChartRenderer.vue'
import { recommendVisualization } from '@/lib/api'
import { toast } from '@/composables/useNotifications'

const props = defineProps<{
  open: boolean
  initialConfig: any
  query: string
  results: any[]
  connectionId?: string
}>()

const emit = defineEmits(['update:open', 'saved'])

const store = useDashboardStore()
const dashboardsList = computed((): any[] => (store.dashboards as any))
const activeDashboard = computed((): any => (store.currentDashboard as any))
const selectedDashboardId = ref<string>('')
const isSaving = ref(false)

const config = ref<any>(null)
const input = ref('')
const isRefining = ref(false)

// Store original chart data when converting to stat (for restoration)
const originalChartData = ref<any>(null)

// Create Dashboard State
const showCreateDashboardModal = ref(false)
const newDashboardName = ref('')
const isCreatingDashboard = ref(false)

watch(() => props.initialConfig, (newConfig) => {
  if (newConfig) {
    config.value = JSON.parse(JSON.stringify(newConfig))
    // Reset original data when new config is loaded
    originalChartData.value = null
  }
}, { immediate: true })

// Initialize selected dashboard and config when dialog opens
watch(() => props.open, async (isOpen) => {
    if (isOpen) {
        // Load dashboards
        if (dashboardsList.value.length === 0) {
            await store.loadDashboards()
        }
        
        if (activeDashboard.value) {
            selectedDashboardId.value = activeDashboard.value.id
        } else if (dashboardsList.value.length > 0) {
            selectedDashboardId.value = dashboardsList.value[0]!.id
        }
        
        // Reset original data when dialog opens
        originalChartData.value = null
    }
})

watch(selectedDashboardId, (val) => {
  if (val === 'create_new') {
    newDashboardName.value = `New Dashboard ${dashboardsList.value.length + 1}`
    showCreateDashboardModal.value = true
  }
})

const handleCreateDashboard = async () => {
  if (!newDashboardName.value.trim()) return
  
  isCreatingDashboard.value = true
  try {
    const newId = await store.createNewDashboard(newDashboardName.value)
    selectedDashboardId.value = newId
    showCreateDashboardModal.value = false
    toast.success('Dashboard created')
    
    // Automatically save element to new dashboard
    await saveToDashboard()
  } catch (error) {
    console.error('Failed to create dashboard:', error)
    toast.error('Failed to create dashboard')
    selectedDashboardId.value = '' 
  } finally {
    isCreatingDashboard.value = false
  }
}

const cancelCreateDashboard = () => {
  showCreateDashboardModal.value = false
  selectedDashboardId.value = ''
}

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

const applyChartType = (newType: string) => {
  if (!config.value) return

  // In preview mode, allow all conversions for experimentation
  // The restriction only applies to saved dashboard elements (in GeneralSettings.vue)
  
  if (newType === 'stat' && config.value.type !== 'stat') {
      // Converting Chart to Stat - store original data for restoration
      originalChartData.value = JSON.parse(JSON.stringify(config.value.config))
      
      const firstDataset = config.value.config.data?.datasets?.[0]
      if (firstDataset && firstDataset.data?.length > 0) {
          const val = firstDataset.data[0]
          const label = firstDataset.label || "Value"
          
          config.value = {
              type: 'stat',
              title: config.value.title,
              config: {
                  value: val,
                  label: label
              }
          }
          return
      }
  }

  // Converting Stat to Chart - restore original data if available
  if (config.value.type === 'stat' && newType !== 'stat') {
      // Check if we have original data stored
      if (originalChartData.value) {
          config.value = {
              type: newType,
              title: config.value.title,
              config: originalChartData.value
          }
          
          // Apply type-specific styling
          const styledConfig = convertToChartType(newType)
          if (styledConfig) {
              config.value = styledConfig
          }
          return
      }
      
      // No original data - create a simple single-point chart
      const statValue = config.value.config.value
      const statLabel = config.value.config.label || 'Value'
      
      config.value = {
          type: newType,
          title: config.value.title,
          config: {
              data: {
                  labels: [statLabel],
                  datasets: [{
                      label: statLabel,
                      data: [statValue],
                      backgroundColor: 'hsl(220, 70%, 50%)',
                      borderColor: 'hsl(220, 70%, 50%)',
                      borderWidth: 1
                  }]
              },
              options: {
                  responsive: true,
                  plugins: {
                      legend: { display: false }
                  }
              }
          }
      }
      return
  }

  const newConfig = convertToChartType(newType)
  if (newConfig) {
    config.value = newConfig
  }
}

const convertToChartType = (newType: string) => {
  if (!config.value || config.value.type === 'stat') return null
  
  const newConfig = JSON.parse(JSON.stringify(config.value))
  newConfig.type = newType
  
  // Clean up area/fill property if moving away from area
  if (newType !== 'area') {
      if (newConfig.config.data?.datasets) {
          newConfig.config.data.datasets.forEach((ds: any) => {
              delete ds.fill
          })
      }
  }

  // Adjust config based on chart type
  if (newType === 'area') {
      // Area is just line with fill: true
      newConfig.type = 'line'
      if (newConfig.config.data?.datasets) {
          newConfig.config.data.datasets.forEach((ds: any) => {
              ds.fill = true
              ds.tension = 0.4 // Smooth curves usually look better for area
          })
      }
  } else if (newType === 'pie' || newType === 'doughnut') {
    // Pie/doughnut charts need single dataset usually, and specific colors
    if (newConfig.config.data?.datasets && newConfig.config.data.datasets.length > 0) {
      // Take only the first dataset for simplicity for now
      const dataset = newConfig.config.data.datasets[0] // Use reference or clone? Already cloned deep above.
      
      // Generate colors for each segment (label)
      const labelsCount = newConfig.config.data.labels?.length || 0
      dataset.backgroundColor = Array.from({ length: labelsCount }).map((_, i) => 
        `hsl(${i * (360 / labelsCount)}, 70%, 50%)`
      )
      
      // Pie charts shouldn't have border color matching line charts usually
      delete dataset.borderColor
      delete dataset.tension
      delete dataset.fill
    }
  } else if (newType === 'bar') {
      if (newConfig.config.data?.datasets) {
          newConfig.config.data.datasets.forEach((ds: any, i: number) => {
              ds.backgroundColor = `hsl(${i * 60}, 70%, 50%)`
              delete ds.fill
              delete ds.tension
          })
      }
  } else if (newType === 'line') {
       if (newConfig.config.data?.datasets) {
          newConfig.config.data.datasets.forEach((ds: any, i: number) => {
              ds.borderColor = `hsl(${i * 60}, 70%, 50%)`
              ds.backgroundColor = `hsl(${i * 60}, 70%, 50%, 0.1)` // Transparent fill
              ds.tension = 0.4
              delete ds.fill
          })
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
      query: config.value.query || props.query,
      connectionId: props.connectionId
    })
    toast.success('Saved to Dashboard')
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    toast.error('Failed to save')
  }
}
</script>
