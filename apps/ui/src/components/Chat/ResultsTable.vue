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
import { toast } from 'vue-sonner'
import type { SettingsModel } from '@/views/settings/types'
import { useTimeAgo, useStorage } from '@vueuse/core'

const props = defineProps<{
  data: any[]
  settings?: SettingsModel
}>()

const selectedData = ref<any>(null)
const isDialogOpen = ref(false)
const currentPage = ref(1)
const pageSize = ref(props.settings?.defaultPageSize || 50)
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

watch(() => props.settings?.defaultPageSize, (newSize) => {
  if (newSize) pageSize.value = newSize
})

const totalPages = computed(() => Math.ceil((props.data?.length || 0) / pageSize.value))

const paginatedData = computed(() => {
  if (!props.data) return []
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return props.data.slice(start, end)
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

const formatValue = (val: any): string => {
  if (val === null) return '-'
  if (val === undefined) return '-'
  if (val === '') return '(empty)'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  
  // Date formatting
  if (props.settings?.dateFormat && (val instanceof Date || (typeof val === 'string' && !isNaN(Date.parse(val)) && val.length > 10))) {
    const date = new Date(val)
    if (props.settings.dateFormat === 'local') {
      return date.toLocaleString()
    } else if (props.settings.dateFormat === 'relative') {
      return useTimeAgo(date).value
    }
    // Default to ISO/Original for 'iso' or fallback
    return val instanceof Date ? val.toISOString() : val
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
  
  const delimiter = props.settings?.csvDelimiter || '\t'
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
  const delimiter = props.settings?.csvDelimiter || '\t'
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
  <div class="flex flex-col h-full bg-transparent">
    <ContextMenu>
      <ContextMenuTrigger class="w-full flex-1 flex flex-col min-h-0">
        <div class="flex-1 overflow-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-background sticky top-0 z-10 ring-1 ring-border/20">
            <tr>
              <th
                v-for="col in columns"
                :key="col"
                class="px-4 py-2 font-medium text-muted-foreground border-b border-border/50 whitespace-nowrap bg-background/95 backdrop-blur-sm"
              >
                {{ col }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/20">
            <tr
              v-for="(row, i) in paginatedData"
              :key="i"
              :class="[
                'transition-colors cursor-pointer',
                selectedRows.has((currentPage - 1) * pageSize + i) 
                  ? 'bg-primary/10' 
                  : 'hover:bg-muted/30'
              ]"
              @click="toggleRowSelection((currentPage - 1) * pageSize + i, $event)"
            >
              <td
                v-for="col in columns"
                :key="col"
                class="px-4 py-2 text-foreground whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis"
              >
                <button 
                  v-if="isObject(row[col])"
                  @click.stop="openJsonModal(row[col])"
                  class="flex items-center gap-1.5 px-2 py-1 rounded bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors text-[10px] font-medium"
                >
                  <Braces class="w-3 h-3" />
                  <span>View JSON</span>
                </button>
                <span v-else :title="formatValue(row[col])">
                  {{ formatValue(row[col]) }}
                  <!-- Debug: show raw value if formatted is empty -->
                  <span v-if="!formatValue(row[col]) || formatValue(row[col]) === '-'" class="text-xs text-red-500 ml-2">
                    [{{ typeof row[col] }}: {{ JSON.stringify(row[col]) }}]
                  </span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent class="w-64 bg-popover border-border">
        <ContextMenuItem 
          v-if="selectedRows.size > 0"
          @select="copySelectedRows"
          class="text-foreground hover:bg-muted focus:bg-muted"
        >
          Copy {{ selectedRows.size }} Selected Row{{ selectedRows.size > 1 ? 's' : '' }}
        </ContextMenuItem>
        <ContextMenuItem 
          @select="copyAllRows"
          class="text-foreground hover:bg-muted focus:bg-muted"
        >
          Copy All Rows ({{ data.length }})
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <div class="flex items-center justify-between px-4 py-2 border-t border-border/30 text-xs text-muted-foreground bg-transparent mt-auto shrink-0">
      <div class="flex items-center gap-4">
        <span v-if="selectedRows.size > 0" class="text-primary font-medium">
          {{ selectedRows.size }} selected
        </span>
        <span>{{ data.length }} total rows</span>
      </div>

      <!-- Pagination Controls -->
      <div class="flex items-center gap-2" v-if="totalPages > 1">
        <button 
          @click="currentPage--" 
          :disabled="currentPage === 1"
          class="p-1 rounded hover:bg-muted disabled:opacity-30"
          title="Previous Page"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div class="flex items-center gap-1 mx-2">
          <span class="font-medium text-foreground">{{ currentPage }}</span>
          <span class="text-muted-foreground/50">/</span>
          <span>{{ totalPages }}</span>
        </div>
        <button 
          @click="currentPage++" 
          :disabled="currentPage === totalPages"
          class="p-1 rounded hover:bg-muted disabled:opacity-30"
          title="Next Page"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        
        <div class="w-px h-3 bg-border mx-2"></div>
        
        <select 
          v-model="pageSize" 
          class="bg-transparent border-none text-xs text-muted-foreground focus:ring-0 cursor-pointer hover:text-foreground"
        >
          <option :value="10">10 / page</option>
          <option :value="50">50 / page</option>
          <option :value="100">100 / page</option>
          <option :value="500">500 / page</option>
        </select>
      </div>
    </div>

    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-w-[95vw] w-full max-h-[90vh] h-[90vh] overflow-hidden flex flex-col bg-background border-border text-foreground">
        <DialogHeader class="flex flex-row items-center justify-between border-b border-border/50 pb-2">
          <DialogTitle>JSON View</DialogTitle>
          <div class="flex items-center gap-2 mr-8">
            <span class="text-xs text-muted-foreground">Text Size:</span>
            <button 
              @click="decreaseZoom" 
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
              :disabled="zoomLevel === 0"
            >
              <Minus class="w-4 h-4" />
            </button>
            <button 
              @click="increaseZoom" 
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
              :disabled="zoomLevel === zoomClasses.length - 1"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>
        <div class="flex-1 overflow-auto p-4 bg-muted/30 rounded-md">
          <JsonViewer :data="selectedData" :max-depth="5" :text-size="zoomClass" />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
