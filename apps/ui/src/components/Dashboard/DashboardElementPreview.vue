<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent size="xl" class="bg-background border-border text-foreground overflow-hidden shadow-2xl" @pointerDownOutside.prevent @interactOutside.prevent>
      <DialogHeader class="pb-2 text-center sm:text-left bg-muted/20 border-b border-border/40 px-6 py-4">
        <DialogTitle class="text-2xl font-bold tracking-tight">Create Dashboard Element</DialogTitle>
        <DialogDescription class="text-muted-foreground font-medium">
          Preview and customize your visualization.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-6 p-6">
        <!-- Chart Preview Container -->
        <div 
          :class="showData ? 'h-[240px]' : 'h-[360px]'" 
          class="w-full bg-muted/40 rounded-2xl p-6 border border-border/60 transition-all duration-500 ease-in-out shadow-inner relative overflow-hidden"
        >
          <div class="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-muted/20 pointer-events-none"></div>
          
          <ChartRenderer 
            v-if="config && config.type !== 'table'" 
            :type="config.type" 
            :data="config.type === 'stat' ? config.config : config.config.data" 
            :options="config.type === 'stat' ? config.config : config.config.options"
            class="w-full h-full relative z-10"
          />
          <TableElement
            v-else-if="config && config.type === 'table'"
            :config="config.config"
            :title="config.title"
            class="w-full h-full relative z-10"
          />
          <div v-else class="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Loader2 class="w-8 h-8 animate-spin text-primary/50" />
            <span class="text-sm font-medium animate-pulse">Generating preview...</span>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <button 
              @click="showData = !showData"
              class="px-4 py-2 text-xs font-bold rounded-full border transition-all duration-300 flex items-center gap-2 active:scale-95 shadow-sm"
              :class="showData ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'"
            >
              <component :is="showData ? ChevronUp : ChevronDown" class="w-3.5 h-3.5" />
              {{ showData ? 'Hide Raw Data' : 'View Raw Data' }}
            </button>
            <span v-if="results?.length" class="text-xs font-semibold text-muted-foreground bg-muted p-1 px-2 rounded-md">
              {{ results.length }} rows found
            </span>
          </div>

          <div class="flex items-center gap-2 bg-muted/30 p-1 rounded-full border border-border/50">
             <button 
                v-for="t in chartTypes" 
                :key="t.value"
                @click="applyChartType(t.value)"
                class="p-2 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300"
                :class="config?.type === t.value || (config?.type === 'bar' && t.value === 'horizontalBar' && config.config?.options?.indexAxis === 'y') ? 'bg-background text-primary shadow-sm scale-105' : 'text-muted-foreground hover:text-foreground'"
             >
                {{ t.label }}
             </button>
          </div>
        </div>

        <!-- Data Table (Expandable) -->
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="transform -translate-y-4 opacity-0"
          enter-to-class="transform translate-y-0 opacity-100"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="transform translate-y-0 opacity-100"
          leave-to-class="transform -translate-y-4 opacity-0"
        >
          <div v-if="showData && results?.length > 0" class="max-h-[180px] overflow-auto border border-border/50 rounded-xl bg-card shadow-sm spreadsheet-scrollbar">
            <table class="w-full text-xs border-collapse">
              <thead class="sticky top-0 bg-muted z-20">
                <tr>
                  <th v-for="col in dataColumns" :key="col" class="px-4 py-3 text-left font-bold text-foreground/80 border-b border-border/50 uppercase tracking-widest text-[9px]">
                    {{ col }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in results.slice(0, 50)" :key="idx" class="border-b border-border/30 hover:bg-primary/5 transition-colors group">
                  <td v-for="col in dataColumns" :key="col" class="px-4 py-2.5 text-muted-foreground group-hover:text-foreground font-medium">
                    {{ formatCellValue(row[col]) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="results.length > 50" class="px-4 py-3 text-[10px] font-bold text-muted-foreground/60 text-center bg-muted/20 uppercase tracking-widest">
              Limited to first 50 rows ({{ results.length }} total)
            </div>
          </div>
        </Transition>
      </div>

      <div class="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center mt-2">
        <!-- Dashboard Selector -->
        <div class="flex-1">
             <Select v-model="selectedDashboardId">
            <SelectTrigger class="w-full h-11 rounded-xl shadow-sm border-border/60">
              <SelectValue placeholder="Target Dashboard" />
            </SelectTrigger>
            <SelectContent class="rounded-xl">
              <SelectItem value="create_new" class="font-bold text-primary border-b border-border/50 mb-1 py-3 px-3">
                <div class="flex items-center gap-2">
                  <PlusCircle class="w-4 h-4" />
                  Create New Dashboard...
                </div>
              </SelectItem>
              <SelectItem v-for="d in dashboardsList" :key="(d as any).id" :value="(d as any).id" class="py-2.5 px-3">
                {{ (d as any).title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <button 
          @click="saveToDashboard"
          :disabled="!selectedDashboardId || isSaving"
          class="px-8 py-3 bg-primary hover:bg-primary/90 hover:scale-[1.02] active:scale-95 text-primary-foreground rounded-xl text-sm font-bold transition-all duration-300 disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
        >
          <Save v-if="!isSaving" class="w-4 h-4" />
          <Loader2 v-else class="w-4 h-4 animate-spin" />
          {{ isSaving ? 'Saving...' : 'Add to Dashboard' }}
        </button>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Create Dashboard Modal (Keep existing functional logic) -->
  <Dialog :open="showCreateDashboardModal" @update:open="(val: boolean) => !val && cancelCreateDashboard()">
    <DialogContent class="sm:max-w-[425px] rounded-2xl">
      <DialogHeader>
        <DialogTitle class="text-xl font-bold">New Dashboard</DialogTitle>
        <DialogDescription class="font-medium">
          Create a home for your new visualization.
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <label for="name" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dashboard Name</label>
          <input 
            id="name" 
            v-model="newDashboardName" 
            placeholder="e.g. Sales Metrics"
            class="flex h-11 w-full rounded-xl border border-input bg-muted/20 px-4 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 "
            @keydown.enter="handleCreateDashboard"
            autofocus
          />
        </div>
      </div>
      <div class="flex justify-end gap-3 mt-4">
        <button 
          @click="cancelCreateDashboard"
          class="px-5 py-2.5 bg-muted/50 hover:bg-muted text-foreground rounded-xl text-sm font-semibold transition-all"
        >
          Cancel
        </button>
        <button 
          @click="handleCreateDashboard"
          :disabled="isCreatingDashboard || !newDashboardName"
          class="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold transition-all disabled:opacity-50"
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
import { VisualizationService } from '@/services/visualizationService'
import { 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  PlusCircle, 
  Save,
  LineChart,
  BarChart,
  PieChart,
  Table as TableIcon
} from 'lucide-vue-next'

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

// Create Dashboard State
const showCreateDashboardModal = ref(false)
const newDashboardName = ref('')
const isCreatingDashboard = ref(false)

// View Data State
const showData = ref(false)

const chartTypes = [
    { label: 'Bar', value: 'bar' },
    { label: 'Horizontal', value: 'horizontalBar' },
    { label: 'Line', value: 'line' },
    { label: 'Area', value: 'area' },
    { label: 'Pie', value: 'pie' },
    { label: 'Stat', value: 'stat' },
    { label: 'Table', value: 'table' },
]

// Computed column names from results
const dataColumns = computed(() => {
  if (!props.results || props.results.length === 0) return []
  return Object.keys(props.results[0])
})

// Format cell values for display
const formatCellValue = (value: any): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

watch(() => props.initialConfig, (newConfig) => {
  if (newConfig) {
    config.value = JSON.parse(JSON.stringify(newConfig))
  }
}, { immediate: true })

watch(() => props.open, async (isOpen) => {
    if (isOpen) {
        if (dashboardsList.value.length === 0) await store.loadDashboards()
        if (activeDashboard.value) selectedDashboardId.value = activeDashboard.value.id
        else if (dashboardsList.value.length > 0) selectedDashboardId.value = dashboardsList.value[0]!.id
        showData.value = false
    }
})

watch(selectedDashboardId, (val) => {
  if (val === 'create_new') {
    newDashboardName.value = `Dashboard ${dashboardsList.value.length + 1}`
    showCreateDashboardModal.value = true
  }
})

const applyChartType = async (newType: string) => {
  if (!config.value) return

  // Handle Table to Chart transition with AI help
  if (config.value.type === 'table' && newType !== 'table') {
      isRefining.value = true
      try {
          const refinedQuery = `${props.query} (Visualize as ${newType})`
          const recommended = await recommendVisualization(refinedQuery, props.results, { type: newType })
          if (recommended) {
              config.value = recommended
              return
          }
      } catch (e) {
          console.error('[Preview] Auto-viz failed:', e)
      } finally {
          isRefining.value = false
      }
      
      // Fallback: Use heuristic columns
      const numericCols = dataColumns.value.filter(col => typeof props.results[0]?.[col] === 'number')
      const heuristic = VisualizationService.updateChartColumns(config.value, props.results, numericCols.slice(0, 2))
      if (heuristic) {
          heuristic.type = newType
          config.value = heuristic
          return
      }
  }

  const newConfig = VisualizationService.convertToChartType(config.value, newType, props.results)
  if (newConfig) {
    config.value = newConfig
  }
}

const saveToDashboard = async () => {
  if (!selectedDashboardId.value) return
  isSaving.value = true
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
  } finally {
    isSaving.value = false
  }
}

const handleCreateDashboard = async () => {
  if (!newDashboardName.value.trim()) return
  isCreatingDashboard.value = true
  try {
    const newId = await store.createNewDashboard(newDashboardName.value)
    selectedDashboardId.value = newId
    showCreateDashboardModal.value = false
    toast.success('Dashboard created')
    await saveToDashboard()
  } catch (error) {
    toast.error('Failed to create')
  } finally {
    isCreatingDashboard.value = false
  }
}

const cancelCreateDashboard = () => {
  showCreateDashboardModal.value = false
  selectedDashboardId.value = ''
}
</script>
