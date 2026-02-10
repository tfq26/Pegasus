<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent size="xl" class="bg-background border-border text-foreground" @pointerDownOutside.prevent @interactOutside.prevent>
      <DialogHeader>
        <DialogTitle>Create Dashboard Element</DialogTitle>
        <DialogDescription class="text-muted-foreground">
          Preview and customize your visualization.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- Chart Preview -->
        <div :class="showData ? 'h-[280px]' : 'h-[400px]'" class="w-full bg-muted/30 rounded-lg p-4 border border-border transition-all duration-200">
          <ChartRenderer 
            v-if="config && config.type !== 'table'" 
            :type="config.type" 
            :data="config.type === 'stat' ? config.config : config.config.data" 
            :options="config.type === 'stat' ? config.config : config.config.options"
            class="w-full h-full"
          />
          <TableElement
            v-else-if="config && config.type === 'table'"
            :config="config.config"
            :title="config.title"
            class="w-full h-full"
          />
          <div v-else class="flex items-center justify-center h-full text-muted-foreground">Loading preview...</div>
        </div>

        <!-- View Data Toggle -->
        <div class="flex items-center gap-2">
          <button 
            @click="showData = !showData"
            class="px-3 py-1.5 text-xs font-medium rounded border transition-colors"
            :class="showData ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'"
          >
            {{ showData ? 'Hide Data' : 'View Data' }}
          </button>
          <span v-if="results?.length" class="text-xs text-muted-foreground">
            {{ results.length }} rows
          </span>
        </div>

        <!-- Data Table -->
        <div v-if="showData && results?.length > 0" class="max-h-[200px] overflow-auto border border-border rounded-lg">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th v-for="col in dataColumns" :key="col" class="px-3 py-2 text-left font-medium text-foreground border-b border-border">
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in results.slice(0, 50)" :key="idx" class="border-b border-border/50 hover:bg-muted/30">
                <td v-for="col in dataColumns" :key="col" class="px-3 py-1.5 text-muted-foreground">
                  {{ formatCellValue(row[col]) }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="results.length > 50" class="px-3 py-2 text-xs text-muted-foreground text-center bg-muted/30">
            Showing first 50 of {{ results.length }} rows
          </div>
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
              <SelectItem value="horizontalBar">Horizontal Bar</SelectItem>
              <SelectItem value="line">Line Chart</SelectItem>
              <SelectItem value="area">Area Chart</SelectItem>
              <SelectItem value="pie">Pie Chart</SelectItem>
              <SelectItem value="doughnut">Doughnut</SelectItem>
              <SelectItem value="stat">Statistic</SelectItem>
              <SelectItem value="table">Table</SelectItem>
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
import { ref, watch, computed, nextTick } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ChartRenderer from './ChartRenderer.vue'
import TableElement from './Elements/TableElement.vue'
import { recommendVisualization } from '@/lib/api'
import { toast } from '@/composables/useNotifications'

const MUTED_COLORS = [
    '#9e829c',
    '#3a3e3b',
    '#291528',
    'hsl(258, 45%, 65%)',
    'hsl(195, 40%, 60%)',
    'hsl(155, 30%, 55%)',
    'hsl(30, 30%, 60%)',
    'hsl(350, 30%, 65%)',
    'hsl(180, 25%, 50%)',
    'hsl(280, 25%, 60%)',
    'hsl(215, 15%, 50%)',
]

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

// View Data State
const showData = ref(false)

// Computed column names from results
const dataColumns = computed(() => {
  if (!props.results || props.results.length === 0) return []
  return Object.keys(props.results[0])
})

// Format cell values for display
const formatCellValue = (value: any): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    // Format large numbers with commas
    return value.toLocaleString()
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

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
        console.log('[DashboardElementPreview] Dialog Opened');
        console.log('[DashboardElementPreview] Results:', JSON.parse(JSON.stringify(props.results)));
        console.log('[DashboardElementPreview] Initial Config:', JSON.parse(JSON.stringify(props.initialConfig)));
        console.log('[DashboardElementPreview] Data Columns:', dataColumns.value);

        // Load dashboards
        if (dashboardsList.value.length === 0) {
            await store.loadDashboards()
        }
        
        if (activeDashboard.value) {
            selectedDashboardId.value = activeDashboard.value.id
        } else if (dashboardsList.value.length > 0) {
            selectedDashboardId.value = dashboardsList.value[0]!.id
        }
        
        // Reset original data and view state when dialog opens
        originalChartData.value = null
        showData.value = false

        nextTick(() => {
             console.log('[DashboardElementPreview] Active Config (after load):', JSON.parse(JSON.stringify(config.value)));
        });
    }
    // Log on close as well? No need.
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

const applyChartType = async (newType: string) => {
  if (!config.value) return

  // Store original chart data when converting to stat or table (for restoration)
  if ((newType === 'stat' || newType === 'table') && config.value.type !== 'stat' && config.value.type !== 'table') {
      originalChartData.value = JSON.parse(JSON.stringify(config.value.config))
  }

  if (newType === 'table' && config.value.type !== 'table') {
      config.value = {
          type: 'table',
          title: config.value.title,
          query: config.value.query || props.query,
          connectionId: props.connectionId,
          config: {
              data: props.results
          }
      }
      return
  }

  // Auto-visualize when moving from table to chart
  if (config.value.type === 'table' && newType !== 'table') {
      isRefining.value = true
      try {
          // Use AI to recommend a visualization for this specific chart type
          const refinedQuery = `${props.query} (Format as ${newType})`
          const recommended = await recommendVisualization(refinedQuery, props.results, { type: newType })
          
          if (recommended) {
              config.value = recommended
              return
          }
      } catch (e) {
          console.error('[DashboardElementPreview] Auto-viz failed:', e)
      } finally {
          isRefining.value = false
      }
      
      // Fallback: Use simple updateChartColumns if AI fails
      const numericCols = dataColumns.value.filter(col => {
          const val = props.results[0]?.[col]
          return typeof val === 'number'
      })
      
      const heuristic = updateChartColumns(numericCols.slice(0, 2))
      if (heuristic) {
          heuristic.type = newType
          config.value = heuristic
          return
      }
  }

  if (newType === 'stat' && config.value.type !== 'stat') {
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
                      backgroundColor: MUTED_COLORS[0],
                      borderColor: MUTED_COLORS[0],
                      borderWidth: 1
                  }]
              },
              options: {
                  responsive: true,
                  plugins: {
                      legend: { display: false, position: 'bottom' }
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

  // Reset indexAxis to 'x' by default (prevents persistent 'y' from horizontal bars)
  if (newConfig.config.options && newConfig.config.options.indexAxis) {
      newConfig.config.options.indexAxis = 'x'
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
        MUTED_COLORS[i % MUTED_COLORS.length]
      )

      if (!newConfig.config.options.plugins) newConfig.config.options.plugins = {}
      newConfig.config.options.plugins.legend = { display: true, position: 'bottom' }
      
      // Pie charts shouldn't have border color matching line charts usually
      delete dataset.borderColor
      delete dataset.tension
      delete dataset.fill
    }
  } else if (newType === 'bar' || newType === 'horizontalBar') {
      newConfig.type = 'bar'
      if (newConfig.config.data?.datasets) {
          newConfig.config.data.datasets.forEach((ds: any, i: number) => {
              ds.backgroundColor = MUTED_COLORS[i % MUTED_COLORS.length]
              delete ds.fill
              delete ds.tension
          })
      }
      if (!newConfig.config.options) newConfig.config.options = {}
      newConfig.config.options.indexAxis = newType === 'horizontalBar' ? 'y' : 'x'
      if (!newConfig.config.options.plugins) newConfig.config.options.plugins = {}
      newConfig.config.options.plugins.legend = { display: true, position: 'bottom' }
  } else if (newType === 'line') {
       if (newConfig.config.data?.datasets) {
          newConfig.config.data.datasets.forEach((ds: any, i: number) => {
              const color = MUTED_COLORS[i % MUTED_COLORS.length] || '#888'
              ds.borderColor = color
              ds.backgroundColor = color.replace('%)', '%, 0.1)') // Transparent fill
              ds.tension = 0.4
              delete ds.fill
          })
      }
      if (!newConfig.config.options.plugins) newConfig.config.options.plugins = {}
      newConfig.config.options.plugins.legend = { display: true, position: 'bottom' }
  }
  
  return newConfig
}


const updateChartColumns = (columns: string[]) => {
  if (!config.value || !props.results || props.results.length === 0) return null
  
  const newConfig = JSON.parse(JSON.stringify(config.value))
  
  // Get the first non-numeric column as labels (category)
  const firstRow = props.results[0]
  if (!firstRow) return null
  const allColumns = Object.keys(firstRow)
  const categoryColumn = allColumns.find(col => {
    const val = firstRow ? firstRow[col] : undefined
    return typeof val === 'string' && !columns.includes(col)
  }) || allColumns[0]
  
  // Filter to only numeric columns from the requested columns
  const numericColumns = columns.filter(col => {
    const val = firstRow ? firstRow[col] : undefined
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
  })
  
  if (numericColumns.length === 0) return null
  
  // Update labels
  newConfig.config.labels = props.results.map(r => r[categoryColumn!])
  
  // Update datasets
  newConfig.config.datasets = numericColumns.map((col, idx) => ({
    label: col,
    data: props.results.map(r => typeof r[col] === 'number' ? r[col] : parseFloat(r[col])),
    backgroundColor: newConfig.type === 'bar' ? MUTED_COLORS[idx % MUTED_COLORS.length] : undefined,
    borderColor: newConfig.type === 'line' ? MUTED_COLORS[idx % MUTED_COLORS.length] : undefined,
    borderWidth: newConfig.type === 'bar' ? 1 : undefined,
    tension: newConfig.type === 'line' ? 0.4 : undefined
  }))
  
  if (!newConfig.config.options) newConfig.config.options = {}
  if (!newConfig.config.options.plugins) newConfig.config.options.plugins = {}
  newConfig.config.options.plugins.legend = { display: true, position: 'bottom' }
  
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
