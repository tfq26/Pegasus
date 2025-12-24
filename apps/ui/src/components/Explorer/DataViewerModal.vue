<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { 
  Table, Minus, Plus, X, Search, Loader2, 
  ChevronDown, ChevronRight, AlignJustify, Columns 
} from 'lucide-vue-next'
import JsonViewer from '@/components/JsonViewer.vue'
import Pagination from '@/components/ui/pagination/Pagination.vue'
import type { ViewerState } from '@/composables/useDataViewer'

const props = defineProps<{
  viewer: ViewerState
  zoomLevel: number
  zoomClasses: string[]
  searchQuery: string
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'close': []
  'increase-zoom': []
  'decrease-zoom': []
  'toggle-sort': [column: string]
  'page-change': [page: number]
  'limit-change': [limit: number]
}>()

const localSearchQuery = computed({
  get: () => props.searchQuery,
  set: (val) => emit('update:searchQuery', val)
})

const expandedRows = ref<Set<number>>(new Set())
const selectedRows = ref<Set<number>>(new Set())
const currentPage = ref(1)
const rowsPerPage = ref(10)
const textWrap = ref(false)
const autoFitColumns = ref(false)

const toggleRowExpansion = (index: number) => {
  if (expandedRows.value.has(index)) expandedRows.value.delete(index)
  else expandedRows.value.add(index)
}

const toggleRowSelection = (index: number, event: MouseEvent) => {
  if (selectedRows.value.has(index)) selectedRows.value.delete(index)
  else selectedRows.value.add(index)
}

const viewerTextSizeClass = computed(() => props.zoomClasses[props.zoomLevel])

// Calculate optimal column widths based on content
const columnWidths = computed(() => {
  if (!autoFitColumns.value) return {}
  
  const widths: Record<string, number> = {}
  const minWidth = 80
  const maxWidth = 400
  const charWidth = 8 // approximate pixels per character
  
  viewerColumns.value.forEach(col => {
    // Start with header width
    let maxLen = String(col).length
    
    // Check data rows for max content length
    paginatedRows.value.forEach(row => {
      const val = row[col]
      const len = String(val ?? '').length
      if (len > maxLen) maxLen = len
    })
    
    // Calculate width with bounds
    const calculated = Math.min(maxWidth, Math.max(minWidth, maxLen * charWidth + 32))
    widths[col] = calculated
  })
  
  return widths
})

const getColumnStyle = (col: string) => {
  if (!autoFitColumns.value) return { maxWidth: '200px' }
  return { 
    width: `${columnWidths.value[col] || 150}px`,
    minWidth: `${columnWidths.value[col] || 150}px`,
    maxWidth: autoFitColumns.value ? 'none' : '200px'
  }
}

const viewerColumns = computed(() => {
  if (!props.viewer.entries.length) return []
  
  const firstRow = props.viewer.entries[0]
  if (!firstRow) return []
  
  const columns = Object.keys(firstRow).filter(key => 
    key !== 'id' && key !== '__id' && key !== '_row_order'
  )
  
  if (props.viewer.connection?.provider === 'surrealdb') {
    const isColumnLetters = columns.length > 0 && columns[0] && /^[A-Z]+$/.test(columns[0])
    if (isColumnLetters) {
      return columns.map(col => String(firstRow[col] ?? col))
    }
  }
  
  return columns
})

const viewerDataRows = computed(() => {
  if (!props.viewer.entries.length) return []
  
  if (props.viewer.connection?.provider === 'surrealdb') {
    const firstRow = props.viewer.entries[0]
    if (!firstRow) return []
    
    const columns = Object.keys(firstRow).filter(key => 
      key !== 'id' && key !== '__id' && key !== '_row_order'
    )
    
    const isColumnLetters = columns.length > 0 && columns[0] && /^[A-Z]+$/.test(columns[0])
    if (isColumnLetters) {
      return props.viewer.entries.slice(1)
    }
  }
  
  return props.viewer.entries
})

const filteredAndSortedRows = computed(() => {
  let rows = viewerDataRows.value
  
  if (props.searchQuery.trim()) {
    const query = props.searchQuery.toLowerCase()
    rows = rows.filter(row => {
      return Object.values(row).some(val => 
        String(val).toLowerCase().includes(query)
      )
    })
  }
  
  if (props.sortColumn) {
    const col = props.sortColumn
    const dir = props.sortDirection
    
    rows = [...rows].sort((a, b) => {
      const aVal = a[col]
      const bVal = b[col]
      
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return dir === 'asc' ? 1 : -1
      if (bVal == null) return dir === 'asc' ? -1 : 1
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      
      if (aStr < bStr) return dir === 'asc' ? -1 : 1
      if (aStr > bStr) return dir === 'asc' ? 1 : -1
      return 0
    })
  }
  
  return rows
})

// Local pagination
const totalPages = computed(() => Math.ceil(filteredAndSortedRows.value.length / rowsPerPage.value))
const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * rowsPerPage.value
  const end = start + rowsPerPage.value
  return filteredAndSortedRows.value.slice(start, end)
})

// Reset to page 1 when filters change
const resetPagination = () => {
  currentPage.value = 1
}

// Handle rows per page change
const handleLimitChange = () => {
  currentPage.value = 1
  emit('limit-change', rowsPerPage.value)
}

// Watch for filter/sort changes
import { watch } from 'vue'
watch([() => props.searchQuery, () => props.sortColumn, () => props.sortDirection], resetPagination)

const formatCellValue = (value: unknown) => {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function formatTableName(tableName: string | undefined, connectionId?: string | null): string {
  if (!tableName) return ''
  let name = tableName
  const pattern1 = /^data_[a-f0-9]{32}_(.+)$/
  const match1 = name.match(pattern1)
  if (match1) return match1[1]
  const pattern2 = /^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/
  const match2 = name.match(pattern2)
  if (match2) return match2[1]
  return name
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="viewer.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-md p-4 sm:p-8"
      @click.self="emit('close')"
    >
      <div class="relative w-full max-w-6xl h-full max-h-[85vh] overflow-hidden flex flex-col rounded-[32px] border border-stone-800 bg-[#0a0a0b] shadow-2xl">
        <!-- Viewer Header -->
        <div class="p-6 sm:px-8 border-b border-stone-800 flex items-center justify-between bg-stone-900/20">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 p-0.5 shadow-lg shadow-violet-500/10">
              <div class="w-full h-full bg-[#0a0a0b] rounded-[14px] flex items-center justify-center">
                <Table class="w-6 h-6 text-violet-400" />
              </div>
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">{{ formatTableName(viewer.table, viewer.connection?.id) }}</h3>
              <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">{{ viewer.connection?.nickname }} / {{ viewer.total ?? '...' }} Records</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex items-center bg-stone-900/60 rounded-xl p-1 border border-stone-800/50">
              <button 
                @click="textWrap = !textWrap"
                :title="textWrap ? 'Disable text wrapping' : 'Enable text wrapping'"
                class="p-2 rounded-lg hover:bg-stone-800 transition-all"
                :class="textWrap ? 'text-violet-400 bg-stone-800' : 'text-stone-500 hover:text-white'"
              >
                <AlignJustify class="w-4 h-4" />
              </button>
              <div class="h-4 w-[1px] bg-stone-800 mx-1"></div>
              <button 
                @click="autoFitColumns = !autoFitColumns"
                :title="autoFitColumns ? 'Fixed column widths' : 'Auto-fit column widths'"
                class="p-2 rounded-lg hover:bg-stone-800 transition-all"
                :class="autoFitColumns ? 'text-violet-400 bg-stone-800' : 'text-stone-500 hover:text-white'"
              >
                <Columns class="w-4 h-4" />
              </button>
            </div>
            <div class="flex items-center bg-stone-900/60 rounded-xl p-1 border border-stone-800/50">
              <button 
                @click="emit('decrease-zoom')" 
                class="p-2 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-white disabled:opacity-20 transition-all"
                :disabled="zoomLevel === 0"
              >
                <Minus class="w-4 h-4" />
              </button>
              <div class="h-4 w-[1px] bg-stone-800 mx-1"></div>
              <button 
                @click="emit('increase-zoom')" 
                class="p-2 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-white disabled:opacity-20 transition-all"
                :disabled="zoomLevel === zoomClasses.length - 1"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>
            <button
              @click="emit('close')"
              class="w-10 h-10 rounded-full flex items-center justify-center bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-all shadow-xl"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Viewer Content -->
        <div class="flex-1 overflow-hidden flex flex-col bg-stone-950/30">
          <!-- Toolbar -->
          <div class="px-8 py-4 border-b border-stone-800 flex items-center gap-4 bg-[#0a0a0b]">
            <div class="relative flex-1 group">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 transition-colors group-focus-within:text-violet-500" />
              <input
                v-model="localSearchQuery"
                type="text"
                placeholder="Filter data..."
                class="w-full pl-10 pr-4 py-2 bg-stone-900/50 border border-stone-800 rounded-xl text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/40 transition-all"
              />
            </div>
            <div v-if="localSearchQuery" class="text-[10px] font-bold uppercase tracking-widest text-violet-400">
              {{ filteredAndSortedRows.length }} matches
            </div>
          </div>

          <!-- Table -->
          <div class="flex-1 overflow-auto px-8 py-6 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
            <div v-if="viewer.loading" class="h-full flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 class="w-8 h-8 text-violet-500 animate-spin" />
              <p class="text-xs font-bold uppercase tracking-widest text-stone-600">Reading records...</p>
            </div>
            <div v-else-if="viewer.error" class="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-rose-400 text-sm">
              {{ viewer.error }}
            </div>
            <table v-else-if="viewer.entries.length" class="w-full border-separate border-spacing-0">
              <thead>
                <tr class="text-left">
                  <th class="sticky top-0 z-10 bg-[#0a0a0b]/80 backdrop-blur-sm border-b border-stone-800 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-500 w-10"></th>
                  <th
                    v-for="col in viewerColumns"
                    :key="col"
                    @click="emit('toggle-sort', col)"
                    class="sticky top-0 z-10 bg-[#0a0a0b]/80 backdrop-blur-sm border-b border-stone-800 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-500 cursor-pointer hover:text-white transition-colors"
                  >
                    <div class="flex items-center gap-2">
                      {{ col }}
                      <span v-if="sortColumn === col" class="text-violet-400">{{ sortDirection === 'asc' ? '↑' : '↓' }}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(entry, index) in paginatedRows" :key="`row-${index}`">
                  <tr 
                    @click="toggleRowSelection(index, $event)"
                    class="group/row transition-colors hover:bg-stone-900/40"
                    :class="selectedRows.has(index) ? 'bg-violet-500/10' : ''"
                  >
                    <td class="px-4 py-3 border-b border-stone-800/50">
                      <button @click.stop="toggleRowExpansion(index)" class="text-stone-700 hover:text-violet-400 transition-colors">
                        <ChevronDown v-if="expandedRows.has(index)" class="w-3.5 h-3.5" />
                        <ChevronRight v-else class="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td
                      v-for="col in viewerColumns"
                      :key="col"
                      :style="getColumnStyle(col)"
                      class="px-4 py-3 border-b border-stone-800/50 text-xs font-medium text-stone-400 group-hover/row:text-stone-100 transition-colors"
                      :class="textWrap ? 'whitespace-normal break-words' : 'truncate'"
                    >
                       {{ formatCellValue(entry[col]) }}
                    </td>
                  </tr>
                  <tr v-if="expandedRows.has(index)">
                    <td :colspan="viewerColumns.length + 1" class="p-6 bg-stone-900/20 border-b border-stone-800/50">
                      <JsonViewer :data="entry" :text-size="viewerTextSizeClass" />
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <div v-else class="py-20 text-center text-stone-600 font-bold uppercase tracking-widest text-xs">
              No entries found
            </div>
          </div>

          <!-- Footer -->
          <div class="px-8 py-4 border-t border-stone-800 bg-stone-900/10 flex items-center justify-between">
            <div class="flex items-center gap-6">
              <span v-if="selectedRows.size" class="text-[10px] font-bold uppercase tracking-widest text-violet-400 bg-violet-500/10 px-2 py-1 rounded">
                {{ selectedRows.size }} selected
              </span>
              <span class="text-[10px] font-bold uppercase tracking-widest text-stone-600">
                Showing {{ paginatedRows.length }} of {{ filteredAndSortedRows.length }} records
              </span>
              
              <!-- Rows per page selector -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-widest text-stone-600">Per page:</span>
                <select 
                  v-model.number="rowsPerPage"
                  @change="handleLimitChange"
                  class="px-2 py-1 bg-stone-900/50 border border-stone-800 rounded text-xs text-stone-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  <option :value="10">10</option>
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <!-- Local pagination -->
              <div v-if="totalPages > 1" class="flex items-center gap-2">
                <button
                  @click="currentPage = Math.max(1, currentPage - 1)"
                  :disabled="currentPage === 1"
                  class="px-3 py-1.5 bg-stone-900/50 border border-stone-800 rounded text-xs text-stone-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span class="text-xs text-stone-500 font-medium">
                  Page {{ currentPage }} of {{ totalPages }}
                </span>
                <button
                  @click="currentPage = Math.min(totalPages, currentPage + 1)"
                  :disabled="currentPage === totalPages"
                  class="px-3 py-1.5 bg-stone-900/50 border border-stone-800 rounded text-xs text-stone-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
              
              <!-- Database pagination (if applicable) -->
              <Pagination
                v-if="viewer.hasMore || viewer.page > 1"
                :page="viewer.page"
                :has-prev="viewer.page > 1"
                :has-next="viewer.hasMore"
                @page-change="(p) => emit('page-change', p)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: #1c1c1e;
  border-radius: 20px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: #2c2c2e;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
