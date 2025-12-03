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
import { Braces } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{
  data: any[]
}>()

const selectedData = ref<any>(null)
const isDialogOpen = ref(false)
const currentPage = ref(1)
const pageSize = ref(50)
const selectedRows = ref<Set<number>>(new Set())

watch(() => props.data, () => {
  currentPage.value = 1
  selectedRows.value.clear()
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
  return Array.from(keys)
})

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return ''
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
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
  
  const indices = Array.from(selectedRows.value).sort((a, b) => a - b)
  const rowsToCopy = indices.map(i => paginatedData.value[i])
  
  // Format as TSV (tab-separated values) for Excel compatibility
  const headers = columns.value.join('\t')
  const rows = rowsToCopy.map(row => 
    columns.value.map(col => formatValue(row[col])).join('\t')
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
  const headers = columns.value.join('\t')
  const rows = paginatedData.value.map(row => 
    columns.value.map(col => formatValue(row[col])).join('\t')
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
  <div class="border border-border rounded-lg bg-muted/50 flex flex-col">
    <ContextMenu>
      <ContextMenuTrigger class="w-full">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-muted sticky top-0 z-10">
            <tr>
              <th
                v-for="col in columns"
                :key="col"
                class="px-4 py-2 font-medium text-muted-foreground border-b border-border whitespace-nowrap"
              >
                {{ col }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/50">
            <tr
              v-for="(row, i) in data"
              :key="i"
              :class="[
                'transition-colors cursor-pointer',
                selectedRows.has(i) 
                  ? 'bg-primary/20 hover:bg-primary/30' 
                  : 'hover:bg-muted/50'
              ]"
              @click="toggleRowSelection(i, $event)"
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
                <span v-else :title="formatValue(row[col])">{{ formatValue(row[col]) }}</span>
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

    <div class="flex items-center justify-between px-4 py-2 border-t border-border bg-muted text-xs text-muted-foreground sticky bottom-0 z-10">
      <div class="flex items-center gap-4">
        <span v-if="selectedRows.size > 0" class="text-primary">
          {{ selectedRows.size }} selected
        </span>
        <span>{{ data.length }} total rows</span>
      </div>
    </div>

    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle>JSON View</DialogTitle>
        </DialogHeader>
        <div class="flex-1 overflow-auto p-4 bg-muted/30 rounded-md">
          <JsonViewer :data="selectedData" :max-depth="5" />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
