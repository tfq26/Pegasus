<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import JsonViewer from '@/components/JsonViewer.vue'
import { Braces, Minus, Plus } from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'
import type { SettingsModel } from '@/views/settings/types'
import { useTimeAgo, useStorage } from '@vueuse/core'

const props = defineProps<{
  data: any[]
}>()

import { useSettingsStore } from '@/stores/settings'
import { unref } from 'vue'
const settingsStore = useSettingsStore()
// Use computed to ensure reactivity and consistent ref access
const settings = computed(() => unref(settingsStore.settings))

const selectedData = ref<any>(null)
const isDialogOpen = ref(false)
const currentPage = ref(1)
// Use store setting for default page size
const pageSize = ref(settings.value?.defaultPageSize || 50)
const selectedRows = ref<Set<number>>(new Set())
const zoomLevel = useStorage('pegasus-results-zoom', 0) // 0=xs, 1=sm, 2=base, 3=lg, 4=xl
const zoomClasses = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl']

const zoomClass = computed(() => zoomClasses[zoomLevel.value])

const increaseZoom = () => {
  if (zoomLevel.value < zoomClasses.length - 1) zoomLevel.value++
}

const decreaseZoom = () => {
  if (zoomLevel.value > 0) zoomLevel.value--
}

watch(() => props.data, () => {
  currentPage.value = 1
  selectedRows.value.clear()
})

watch(() => settings.value?.defaultPageSize, (newSize) => {
  if (newSize) pageSize.value = newSize
})

const totalPages = computed(() => Math.ceil((props.data?.length || 0) / pageSize.value))

const paginatedData = computed(() => {
  if (!props.data) return []
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  
  return props.data.slice(start, end).map(item => {
    // Normalize primitives to objects so row[col] works
    if (item !== null && typeof item !== 'object') {
        return { Value: item }
    }
    return item
  })
})

const openJsonModal = (data: any) => {
  selectedData.value = data
  isDialogOpen.value = true
}

const isObject = (val: any) => {
  return typeof val === 'object' && val !== null
}

const columns = computed(() => {
  if (!props.data || props.data.length === 0) return []
  
  // Check if first item is primitive
  const firstItem = props.data[0]
  if (firstItem !== null && typeof firstItem !== 'object') {
      return ['Value']
  }

  const keys = new Set<string>()
  const sample = props.data.slice(0, 50)
  sample.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(k => keys.add(k))
    }
  })
  const cols = Array.from(keys)
  console.log('[ResultsTable] Columns:', cols)
  console.log('[ResultsTable] Sample data:', props.data[0])
  return cols
})

const formatValue = (val: any, columnName?: string): string => {
  if (val === null) return '-'
  if (val === undefined) return '-'
  if (val === '') return '(empty)'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  
  // Date formatting
  if (settings.value?.dateFormat && (val instanceof Date || (typeof val === 'string' && !isNaN(Date.parse(val)) && val.length > 10))) {
    const date = new Date(val)
    if (settings.value.dateFormat === 'local') {
      return date.toLocaleString()
    } else if (settings.value.dateFormat === 'relative') {
      return useTimeAgo(date).value
    }
    // Default to ISO/Original for 'iso' or fallback
    return val instanceof Date ? val.toISOString() : val
  }

  // Smart number formatting based on column name
  if (typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)) && isFinite(parseFloat(val)))) {
    const numVal = typeof val === 'number' ? val : parseFloat(val)
    const colLower = columnName?.toLowerCase() || ''
    
    // Currency fields (salary, price, cost, revenue, amount, etc.)
    if (colLower.includes('salary') || colLower.includes('price') || colLower.includes('cost') || 
        colLower.includes('revenue') || colLower.includes('amount') || colLower.includes('payment') ||
        colLower.includes('fee') || colLower.includes('charge') || colLower.includes('total')) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(numVal)
    }
    
    // Percentage fields
    if (colLower.includes('percent') || colLower.includes('rate') || colLower.includes('ratio')) {
      return `${numVal.toFixed(1)}%`
    }
    
    // Count/quantity fields (students, employees, items, count, quantity, etc.)
    if (colLower.includes('count') || colLower.includes('quantity') || colLower.includes('qty') ||
        colLower.includes('students') || colLower.includes('employees') || colLower.includes('users') ||
        colLower.includes('items') || colLower.includes('orders') || colLower.includes('total')) {
      return numVal.toLocaleString('en-US') // Add thousand separators
    }
    
    // Weight/measurement fields
    if (colLower.includes('weight') || colLower.includes('kg') || colLower.includes('lb')) {
      return `${numVal.toLocaleString('en-US')} ${colLower.includes('kg') ? 'kg' : 'lbs'}`
    }
    
    // Distance fields
    if (colLower.includes('distance') || colLower.includes('miles') || colLower.includes('km')) {
      return `${numVal.toLocaleString('en-US')} ${colLower.includes('km') ? 'km' : 'mi'}`
    }
    
    // Default number formatting with thousand separators
    if (Number.isInteger(numVal)) {
      return numVal.toLocaleString('en-US')
    }
    return numVal.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  return String(val)
}

const toggleRowSelection = (index: number, event: MouseEvent) => {
  if (event.shiftKey && selectedRows.value.size > 0) {
    // Shift-click: select range
    const indices = Array.from(selectedRows.value)
    const lastSelected = Math.max(...indices)
    const start = Math.min(lastSelected, index)
    const end = Math.max(lastSelected, index)
    for (let i = start; i <= end; i++) {
      selectedRows.value.add(i)
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd-click: toggle individual
    if (selectedRows.value.has(index)) {
      selectedRows.value.delete(index)
    } else {
      selectedRows.value.add(index)
    }
  } else {
    // Normal click: select only this row
    selectedRows.value.clear()
    selectedRows.value.add(index)
  }
}

const copySelectedRows = async () => {
  if (selectedRows.value.size === 0) return
  
  const delimiter = settings.value?.csvDelimiter || '\t'
  const indices = Array.from(selectedRows.value).sort((a, b) => a - b)
  const rowsToCopy = indices.map(i => paginatedData.value[i])
  
  const headers = columns.value.join(delimiter)
  const rows = rowsToCopy.map(row => 
    columns.value.map(col => formatValue(row[col])).join(delimiter)
  ).join('\n')
  
  const text = headers + '\n' + rows
  
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${selectedRows.value.size} row${selectedRows.value.size > 1 ? 's' : ''}`)
  } catch (e) {
    toast.error('Failed to copy')
  }
}

const copyAllRows = async () => {
  const delimiter = settings.value?.csvDelimiter || '\t'
  const headers = columns.value.join(delimiter)
  const rows = paginatedData.value.map(row => 
    columns.value.map(col => formatValue(row[col])).join(delimiter)
  ).join('\n')
  
  const text = headers + '\n' + rows
  
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${paginatedData.value.length} rows`)
  } catch (e) {
    toast.error('Failed to copy')
  }
}

const copyCellValue = async (value: any) => {
  try {
    await navigator.clipboard.writeText(formatValue(value))
    toast.success('Copied cell value')
  } catch (e) {
    toast.error('Failed to copy')
  }
}

</script>

<template>
  <div class="flex flex-col h-full bg-transparent overflow-hidden">
    <ContextMenu>
      <ContextMenuTrigger class="w-full flex-1 flex flex-col min-h-0">
        <div class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
          <table class="w-full text-left text-[12px] border-collapse relative" :class="{ 'compact-mode': settings?.compactMode }">
            <thead class="sticky top-0 z-20">
              <tr class="bg-stone-900/80 backdrop-blur-md">
                <th
                  v-for="col in columns"
                  :key="col"
                  class="px-5 py-2 font-black uppercase tracking-[0.1em] text-[10px] text-stone-500 border-b border-stone-800/50 whitespace-nowrap first:pl-6"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-900">
              <tr
                v-for="(row, i) in paginatedData"
                :key="i"
                :class="[
                  'transition-all duration-200 group/row',
                  selectedRows.has((currentPage - 1) * pageSize + i) 
                    ? 'bg-violet-500/10' 
                    : 'hover:bg-stone-900/40'
                ]"
                @click="toggleRowSelection((currentPage - 1) * pageSize + i, $event)"
              >
                <td
                  v-for="col in columns"
                  :key="col"
                  class="px-5 py-2 text-stone-300 whitespace-nowrap max-w-[400px] overflow-hidden text-ellipsis selection:bg-violet-500/30 first:pl-6"
                >
                  <button 
                    v-if="isObject(row[col])"
                    @click.stop="openJsonModal(row[col])"
                    class="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 group-hover/row:border-stone-700 text-stone-500 hover:text-stone-100 transition-all text-[10px] font-bold uppercase tracking-wider"
                  >
                    <Braces class="w-3 h-3 text-violet-400" />
                    <span>View Object</span>
                  </button>
                  <span v-else :title="formatValue(row[col], col)" class="font-normal font-sans">
                    {{ formatValue(row[col], col) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent class="w-64 bg-stone-950 border-stone-800 text-stone-100">
        <ContextMenuItem 
          v-if="selectedRows.size > 0"
          @select="copySelectedRows"
          class="hover:bg-stone-900 focus:bg-stone-900"
        >
          Copy Selected Records ({{ selectedRows.size }})
        </ContextMenuItem>
        <ContextMenuItem 
          @select="copyAllRows"
          class="hover:bg-stone-900 focus:bg-stone-900"
        >
          Copy Full Dataset ({{ data.length }})
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <!-- Analytical Footer -->
    <div v-if="settings?.showRowCount" class="flex items-center justify-between px-6 py-3 border-t border-stone-800/50 text-[10px] bg-stone-900/20 mt-auto shrink-0">
      <div class="flex items-center gap-6">
        <div v-if="selectedRows.size > 0" class="flex items-center gap-2 px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 font-bold uppercase tracking-widest animate-in fade-in slide-in-from-left-2 transition-all">
           <div class="w-1 h-1 rounded-full bg-violet-400 shadow-[0_0_8px_theme(colors.violet.400)]"></div>
           {{ selectedRows.size }} selected
        </div>
        <div class="flex items-center gap-2 text-stone-500 font-bold uppercase tracking-[0.2em]">
           <span>Total Records: {{ data.length.toLocaleString() }}</span>
        </div>
      </div>

      <!-- High-Precision Pagination -->
      <div class="flex items-center gap-4" v-if="totalPages > 1">
        <div class="flex items-center p-0.5 bg-stone-950 rounded-lg border border-stone-800">
          <button 
            @click="currentPage--" 
            :disabled="currentPage === 1"
            class="p-1 px-2 rounded-md hover:bg-stone-800 text-stone-500 disabled:opacity-20 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div class="flex items-center gap-1.5 px-3">
            <span class="font-black text-stone-200">{{ currentPage }}</span>
            <span class="text-stone-700">/</span>
            <span class="text-stone-500">{{ totalPages }}</span>
          </div>
          <button 
            @click="currentPage++" 
            :disabled="currentPage === totalPages"
            class="p-1 px-2 rounded-md hover:bg-stone-800 text-stone-500 disabled:opacity-20 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
        
        <select 
          v-model="pageSize" 
          class="bg-stone-950 border border-stone-800 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-stone-400 focus:ring-0 cursor-pointer hover:border-stone-700 transition-all outline-none"
        >
          <option :value="10">10 PER PAGE</option>
          <option :value="50">50 PER PAGE</option>
          <option :value="100">100 PER PAGE</option>
          <option :value="500">500 PER PAGE</option>
        </select>
      </div>
    </div>

    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-w-[95vw] w-full max-h-[90vh] h-[90vh] overflow-hidden flex flex-col bg-[#0a0a0b] border-stone-800 text-stone-100 rounded-[32px] p-0 shadow-2xl">
        <div class="flex items-center justify-between px-8 py-6 border-b border-stone-800/50">
           <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                 <Braces class="w-6 h-6" />
              </div>
              <h3 class="text-lg font-black uppercase tracking-wider">Object Inspector</h3>
           </div>
           
           <div class="flex items-center gap-4">
              <div class="flex items-center p-1 bg-stone-900 rounded-xl border border-stone-800">
                <button 
                  @click="decreaseZoom" 
                  class="p-2 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-stone-100 disabled:opacity-20 transition-all"
                  :disabled="zoomLevel === 0"
                >
                  <Minus class="w-4 h-4" />
                </button>
                <div class="w-px h-4 bg-stone-800"></div>
                <button 
                  @click="increaseZoom" 
                  class="p-2 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-stone-100 disabled:opacity-20 transition-all"
                  :disabled="zoomLevel === zoomClasses.length - 1"
                >
                  <Plus class="w-4 h-4" />
                </button>
              </div>
           </div>
        </div>
        <div class="flex-1 overflow-auto p-8 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
          <JsonViewer :data="selectedData" :max-depth="5" :text-size="zoomClass" />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
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

select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2357534e' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}
</style>
