<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { 
  Table, Minus, Plus, X, Search, Loader2, 
  ChevronDown, ChevronRight, AlignJustify, Columns,
  MoreVertical, Copy, Edit2, Trash2, Check, CheckSquare, Square,
  RefreshCcw
} from 'lucide-vue-next'
import JsonViewer from '@/components/JsonViewer.vue'
import Checkbox from '@/components/ui/checkbox/Checkbox.vue'
import Pagination from '@/components/ui/pagination/Pagination.vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import type { ViewerState } from '@/composables/useDataViewer'
import { toast } from '@/composables/useNotifications'

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
  'delete-row': [row: any]
  'update-cell': [row: any, column: string, value: any]
  'reload': []
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

// Advanced State
const contextMenuData = ref({ 
  rowIndex: -1, 
  col: '', 
  rowData: null as any 
})
const editingCell = ref<{ rowIndex: number, col: string, value: any } | null>(null)
const editInputRef = ref<HTMLInputElement | null>(null)

const toggleRowExpansion = (index: number) => {
  const newSet = new Set(expandedRows.value)
  if (newSet.has(index)) newSet.delete(index)
  else newSet.add(index)
  expandedRows.value = newSet
}

const toggleRowSelection = (index: number) => {
  const newSet = new Set(selectedRows.value)
  if (newSet.has(index)) newSet.delete(index)
  else newSet.add(index)
  selectedRows.value = newSet
}

const toggleAllSelection = () => {
  if (selectedRows.value.size === paginatedRows.value.length && paginatedRows.value.length > 0) {
    selectedRows.value = new Set()
  } else {
    const allIndices = paginatedRows.value.map((_, i) => i)
    selectedRows.value = new Set(allIndices)
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  } catch (err) {
    toast.error('Failed to copy')
  }
}

const copySelected = async () => {
  if (!selectedRows.value.size) return
  const selectedData = Array.from(selectedRows.value).map(idx => paginatedRows.value[idx])
  await copyToClipboard(JSON.stringify(selectedData, null, 2))
}

const setContextMenuContext = (rowIndex: number, col: string, rowData: any) => {
  contextMenuData.value = {
    rowIndex,
    col,
    rowData
  }
}

const handleContextMenuAction = async (action: string) => {
  const { rowIndex, col, rowData } = contextMenuData.value
  if (!rowData) return

  if (action === 'copy-cell') {
    await copyToClipboard(String(rowData[col] ?? ''))
  } else if (action === 'copy-row') {
    await copyToClipboard(JSON.stringify(rowData, null, 2))
  } else if (action === 'edit-cell') {
    startEdit(rowIndex, col, rowData[col])
  } else if (action === 'delete-row') {
    if (confirm('Are you sure you want to delete this row?')) {
      emit('delete-row', rowData)
    }
  }
}

const startEdit = (rowIndex: number, col: string, value: any) => {
  editingCell.value = { rowIndex, col, value }
  nextTick(() => {
    editInputRef.value?.focus()
  })
}

const saveEdit = () => {
  if (!editingCell.value) return
  const { rowIndex, col, value } = editingCell.value
  const row = paginatedRows.value[rowIndex]
  emit('update-cell', row, col, value)
  editingCell.value = null
}

const cancelEdit = () => {
  editingCell.value = null
}

const viewerTextSizeClass = computed(() => props.zoomClasses[props.zoomLevel])

// Calculate optimal column widths based on content
const columnWidths = computed(() => {
  if (!autoFitColumns.value) return {}
  
  const widths: Record<string, number> = {}
  const minWidth = 80
  const maxWidth = 400
  const charWidth = 8 // approximate pixels per character
  
  viewerColumns.value.forEach((col: string) => {
    // Start with header width
    let maxLen = String(col).length
    
    // Check data rows for max content length
    paginatedRows.value.forEach((row: any) => {
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
    key !== '__id' && key !== '_row_order'
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
    rows = rows.filter((row: any) => {
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
  selectedRows.value = new Set()
}

// Handle rows per page change
const handleLimitChange = () => {
  currentPage.value = 1
  selectedRows.value = new Set()
  emit('limit-change', rowsPerPage.value)
}

// Watch for filter/sort changes
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
  if (match1) return (match1[1] as string) || ''
  const pattern2 = /^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/
  const match2 = name.match(pattern2)
  if (match2) return (match2[1] as string) || ''
  return name
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="viewer.open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 sm:p-8"
      @click.self="emit('close')"
    >
      <div class="relative w-full max-w-6xl h-full max-h-[90vh] overflow-hidden flex flex-col rounded-[32px] border border-border bg-card shadow-2xl">
        <!-- Viewer Header -->
        <div class="p-6 sm:px-8 border-b border-border flex items-center justify-between bg-muted/30">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 p-0.5 shadow-lg shadow-violet-500/10">
              <div class="w-full h-full bg-card rounded-[14px] flex items-center justify-center">
                <Table class="w-6 h-6 text-violet-500 dark:text-violet-400" />
              </div>
            </div>
            <div>
              <h3 class="text-lg font-bold text-foreground">{{ formatTableName(viewer.table, viewer.connection?.id) }}</h3>
              <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{{ viewer.connection?.nickname }} / {{ viewer.total ?? '...' }} Records</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
               v-if="selectedRows.size > 0"
               @click="copySelected"
               class="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-violet-500/20 active:scale-95"
            >
               <Copy class="w-3.5 h-3.5" />
               Copy Selected ({{ selectedRows.size }})
            </button>

            <div class="flex items-center bg-muted/60 rounded-xl p-1 border border-border/50">
              <button 
                @click="textWrap = !textWrap"
                :title="textWrap ? 'Disable text wrapping' : 'Enable text wrapping'"
                class="p-2 rounded-lg hover:bg-muted transition-all"
                :class="textWrap ? 'text-violet-500 dark:text-violet-400 bg-muted' : 'text-muted-foreground hover:text-foreground'"
              >
                <AlignJustify class="w-4 h-4" />
              </button>
              <div class="h-4 w-[1px] bg-border mx-1"></div>
              <button 
                @click="autoFitColumns = !autoFitColumns"
                :title="autoFitColumns ? 'Fixed column widths' : 'Auto-fit column widths'"
                class="p-2 rounded-lg hover:bg-muted transition-all"
                :class="autoFitColumns ? 'text-violet-500 dark:text-violet-400 bg-muted' : 'text-muted-foreground hover:text-foreground'"
              >
                <Columns class="w-4 h-4" />
              </button>
            </div>
            <div class="flex items-center bg-muted/60 rounded-xl p-1 border border-border/50">
              <button 
                @click="emit('decrease-zoom')" 
                class="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-all"
                :disabled="zoomLevel === 0"
              >
                <Minus class="w-4 h-4" />
              </button>
              <div class="h-4 w-[1px] bg-border mx-1"></div>
              <button 
                @click="emit('increase-zoom')" 
                class="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-all"
                :disabled="zoomLevel === zoomClasses.length - 1"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>
            <button
              @click="emit('close')"
              class="w-10 h-10 rounded-full flex items-center justify-center bg-muted border border-border text-muted-foreground hover:text-foreground transition-all shadow-xl"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Viewer Content -->
        <div class="flex-1 overflow-hidden flex flex-col bg-background/50">
          <!-- Toolbar -->
          <div class="px-8 py-4 border-b border-border flex items-center gap-4 bg-card">
            <div class="relative flex-1 group">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-violet-500" />
              <input
                v-model="localSearchQuery"
                type="text"
                placeholder="Filter current view..."
                class="w-full pl-10 pr-4 py-2 bg-muted/50 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/40 transition-all"
              />
            </div>
            <div v-if="localSearchQuery" class="text-[10px] font-bold uppercase tracking-widest text-violet-500 dark:text-violet-400">
              {{ filteredAndSortedRows.length }} matches
            </div>
            <button 
               @click="emit('reload')" 
               title="Refresh data"
               class="p-2 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground transition-all active:rotate-180 duration-500"
            >
                <RefreshCcw class="w-4 h-4" />
            </button>
          </div>

          <!-- Table -->
          <div class="flex-1 overflow-auto px-8 py-6 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent">
            <div v-if="viewer.loading" class="h-full flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 class="w-8 h-8 text-violet-500 animate-spin" />
              <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reading records...</p>
            </div>
            <div v-else-if="viewer.error" class="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-sm">
              {{ viewer.error }}
            </div>
            
            <ContextMenu v-else-if="viewer.entries.length">
              <ContextMenuTrigger as-child>
                <table class="w-full border-separate border-spacing-0">
                  <thead>
                    <tr class="text-left">
                      <th class="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 py-3 w-10">
                        <Checkbox 
                          :model-value="selectedRows.size === paginatedRows.length && paginatedRows.length > 0" 
                          @update:model-value="toggleAllSelection"
                          class="border-border data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500" 
                        />
                      </th>
                      <th class="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-10"></th>
                      <th
                        v-for="col in viewerColumns"
                        :key="col"
                        @click="emit('toggle-sort', col)"
                        class="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      >
                        <div class="flex items-center gap-2">
                           {{ col }}
                           <span v-if="sortColumn === col" class="text-violet-500 dark:text-violet-400">{{ sortDirection === 'asc' ? '↑' : '↓' }}</span>
                        </div>
                      </th>
                      <th class="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(entry, index) in paginatedRows" :key="`row-${index}`">
                      <tr 
                        class="group/row transition-colors hover:bg-muted/40"
                        :class="selectedRows.has(index) ? 'bg-violet-500/5' : ''"
                      >
                        <td class="px-4 py-3 border-b border-border/50">
                          <Checkbox 
                            :model-value="selectedRows.has(index)" 
                            @update:model-value="toggleRowSelection(index)"
                            class="border-border data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500" 
                          />
                        </td>
                        <td class="px-4 py-3 border-b border-border/50">
                          <button @click.stop="toggleRowExpansion(index)" class="text-muted-foreground/50 hover:text-violet-500 dark:hover:text-violet-400 transition-colors">
                            <ChevronDown v-if="expandedRows.has(index)" class="w-3.5 h-3.5" />
                            <ChevronRight v-else class="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td
                          v-for="col in viewerColumns"
                          :key="col"
                          :style="getColumnStyle(col)"
                          @contextmenu="setContextMenuContext(index, col, entry)"
                          class="px-4 py-3 border-b border-border/50 text-xs font-medium text-muted-foreground group-hover/row:text-foreground transition-colors relative"
                          :class="[
                            textWrap ? 'whitespace-normal break-words' : 'truncate',
                            editingCell?.rowIndex === index && editingCell?.col === col ? 'bg-violet-500/10 ring-2 ring-violet-500 ring-inset z-20' : ''
                          ]"
                        >
                           <template v-if="editingCell?.rowIndex === index && editingCell?.col === col">
                              <input
                                 ref="editInputRef"
                                 v-model="editingCell.value"
                                 @blur="saveEdit"
                                 @keyup.enter="saveEdit"
                                 @keyup.esc="cancelEdit"
                                 class="absolute inset-0 w-full h-full bg-background text-foreground px-4 border-none focus:outline-none focus:ring-0"
                              />
                           </template>
                           <template v-else>
                              {{ formatCellValue(entry[col]) }}
                           </template>
                        </td>
                        <td class="px-4 py-3 border-b border-border/50 text-right opacity-0 group-hover/row:opacity-100 transition-opacity">
                            <button @contextmenu="setContextMenuContext(index, viewerColumns[0], entry)" class="text-muted-foreground hover:text-foreground transition-colors p-1">
                                <MoreVertical class="w-4 h-4" />
                            </button>
                        </td>
                      </tr>
                      <tr v-if="expandedRows.has(index)">
                        <td :colspan="viewerColumns.length + 3" class="p-6 bg-muted/20 border-b border-border/50">
                          <JsonViewer :data="entry" :text-size="viewerTextSizeClass || ''" />
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </ContextMenuTrigger>

              <ContextMenuContent class="w-56 bg-card border-border text-foreground">
                <ContextMenuItem @select="handleContextMenuAction('copy-cell')" class="gap-2 focus:bg-muted focus:text-foreground">
                  <Copy class="w-4 h-4 text-muted-foreground" />
                  <span>Copy Cell Value</span>
                </ContextMenuItem>
                <ContextMenuItem @select="handleContextMenuAction('copy-row')" class="gap-2 focus:bg-muted focus:text-foreground">
                  <Copy class="w-4 h-4 text-muted-foreground" />
                  <span>Copy Row (JSON)</span>
                </ContextMenuItem>
                <ContextMenuSeparator class="bg-border" />
                <ContextMenuItem @select="handleContextMenuAction('edit-cell')" class="gap-2 focus:bg-muted focus:text-foreground">
                  <Edit2 class="w-4 h-4 text-muted-foreground" />
                  <span>Edit Cell</span>
                </ContextMenuItem>
                <ContextMenuSeparator class="bg-border" />
                <ContextMenuItem @select="handleContextMenuAction('delete-row')" class="gap-2 focus:bg-rose-500/10 focus:text-rose-500 text-rose-500">
                  <Trash2 class="w-4 h-4" />
                  <span>Delete Record</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <div v-else class="py-20 text-center text-muted-foreground font-bold uppercase tracking-widest text-xs">
              No entries found
            </div>
          </div>

          <!-- Footer -->
          <div class="px-8 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
            <div class="flex items-center gap-6">
              <span v-if="selectedRows.size" class="text-[10px] font-bold uppercase tracking-widest text-violet-500 dark:text-violet-400 bg-violet-500/10 px-2 py-1 rounded">
                {{ selectedRows.size }} selected
              </span>
              <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Showing {{ paginatedRows.length }} of {{ filteredAndSortedRows.length }} records
              </span>
              
              <!-- Rows per page selector -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Per page:</span>
                <select 
                  v-model.number="rowsPerPage"
                  @change="handleLimitChange"
                  class="px-2 py-1 bg-muted/50 border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  <option :value="10">10</option>
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <!-- Local pagination -->
              <Pagination
                v-if="totalPages > 1"
                :page="currentPage"
                :has-prev="currentPage > 1"
                :has-next="currentPage < totalPages"
                :total-pages="totalPages"
                @page-change="(p) => currentPage = p"
              />
              
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
  background: hsl(var(--muted-foreground) / 0.3);
  border-radius: 20px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
