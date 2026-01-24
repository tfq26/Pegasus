<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'

const props = defineProps<{
// ... (rest of props)
  data: any[][]
  selection: { start: { row: number, col: number }, end: { row: number, col: number } } | null
  editingCell: { row: number, col: number } | null
  styles?: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'select', row: number, col: number, expand: boolean): void
  (e: 'select-row', row: number, expand: boolean): void
  (e: 'select-col', col: number, expand: boolean): void
  (e: 'edit-start', row: number, col: number): void
  (e: 'edit-end', value: string): void
  (e: 'update:value', value: string): void
}>()

// Helper to get cell from event
const getCellFromEvent = (e: MouseEvent): { row: number, col: number } | null => {
  const target = e.target as HTMLElement
  const cell = target.closest('td')
  if (!cell) return null
  
  const row = parseInt(cell.dataset.row || '-1')
  const col = parseInt(cell.dataset.col || '-1')
  
  if (row >= 0 && col >= 0) return { row, col }
  return null
}

// State
const isDragging = ref(false)
const dragStart = ref<{ row: number, col: number } | null>(null)

// Handlers
const onMouseDown = (e: MouseEvent) => {
  // Ignore right clicks
  if (e.button !== 0) return

  const target = e.target as HTMLElement
  // Allow interaction with input elements (editing)
  if (target.tagName === 'INPUT') return

  const cell = getCellFromEvent(e)
  if (!cell) return

  // Shift-click for range extension
  if (e.shiftKey) {
    emit('select', cell.row, cell.col, true)
    return
  }

  // Start new selection
  isDragging.value = true
  dragStart.value = cell
  emit('select', cell.row, cell.col, false)
  
  // Attach global listeners for drag
  document.addEventListener('mousemove', onGlobalMouseMove)
  document.addEventListener('mouseup', onGlobalMouseUp)
  
  // Prevent text selection
  e.preventDefault()
}

const onGlobalMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !dragStart.value) return
  
  const cell = getCellFromEvent(e)
  if (cell) {
    // We are over a valid cell, update selection
    emit('select', cell.row, cell.col, true)
  }
}

const onGlobalMouseUp = () => {
  isDragging.value = false
  dragStart.value = null
  document.removeEventListener('mousemove', onGlobalMouseMove)
  document.removeEventListener('mouseup', onGlobalMouseUp)
}

// Cleanup
onUnmounted(() => {
  document.removeEventListener('mousemove', onGlobalMouseMove)
  document.removeEventListener('mouseup', onGlobalMouseUp)
})

const getColumnLabel = (index: number) => {
  let label = ''
  let num = index + 1 // Excel columns are 1-indexed
  
  while (num > 0) {
    let remainder = (num - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    num = Math.floor((num - 1) / 26)
  }
  
  return label
}

const getCellStyle = (row: number, col: number) => {
  if (!props.styles) return {}
  return props.styles[`${row},${col}`] || {}
}

const editInput = ref<HTMLInputElement | null>(null)

const startEditing = (row: number, col: number) => {
  emit('edit-start', row, col)
  nextTick(() => {
    editInput.value?.focus()
  })
}

const onEditKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    emit('edit-end', (e.target as HTMLInputElement).value)
  }
}

// Selection Helpers
const isInSelection = (row: number, col: number) => {
  if (!props.selection) return false
  const { start, end } = props.selection
  const minR = Math.min(start.row, end.row)
  const maxR = Math.max(start.row, end.row)
  const minC = Math.min(start.col, end.col)
  const maxC = Math.max(start.col, end.col)
  return row >= minR && row <= maxR && col >= minC && col <= maxC
}

const isSelectedHeaderCol = (col: number) => {
  if (!props.selection) return false
  const { start, end } = props.selection
  const minC = Math.min(start.col, end.col)
  const maxC = Math.max(start.col, end.col)
  return col >= minC && col <= maxC
}

const isSelectedHeaderRow = (row: number) => {
  if (!props.selection) return false
  const { start, end } = props.selection
  const minR = Math.min(start.row, end.row)
  const maxR = Math.max(start.row, end.row)
  return row >= minR && row <= maxR
}

// Computed for fill handle position (bottom-right corner of selection)
const fillHandlePosition = computed(() => {
  if (!props.selection) return null
  const { start, end } = props.selection
  const maxR = Math.max(start.row, end.row)
  const maxC = Math.max(start.col, end.col)
  return { row: maxR, col: maxC }
})

// === Dynamic Column Sizing ===
import { onMounted } from 'vue'

const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const minColWidth = 100 // pixels

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
    // Initial delay to ensure render
    setTimeout(() => {
        if (containerRef.value) {
            // Initial width
            containerWidth.value = containerRef.value.clientWidth
            
            // Watch for size changes
            resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0]
                if (entry) {
                    containerWidth.value = entry.contentRect.width
                }
            })
            resizeObserver.observe(containerRef.value)
        }
    }, 100)
})

onUnmounted(() => {
    if (resizeObserver) {
        resizeObserver.disconnect()
    }
})

// Calculate how many columns we need to fill the screen
// Plus adds a buffer to ensure we scroll a bit
const totalColumns = computed(() => {
    const dataCols = props.data[0]?.length || 0
    const neededCols = Math.ceil(containerWidth.value / minColWidth)
    // Always ensure at least 'neededCols' or 'dataCols', whichever is larger
    // Add small buffer +2
    return Math.max(dataCols, neededCols, 26) // At least A-Z
})

const totalRows = computed(() => {
    // Fill vertical space too if needed? User asked mainly about columns (right side void)
    // But let's ensure at least 20 rows or data length
    const dataRows = props.data.length
    return Math.max(dataRows, 50) 
})

// Helper to get value safely for any coordinate
const getCellValue = (rowIndex: number, colIndex: number) => {
    if (rowIndex < props.data.length) {
        return props.data[rowIndex][colIndex] ?? ''
    }
    return ''
}
</script>

<template>
  <div ref="containerRef" class="overflow-auto relative select-none w-full h-full spreadsheet-scrollbar">
    <table 
      class="border-collapse w-full table-auto"
      @mousedown="onMouseDown"
      @dragstart.prevent
    >
      <thead>
        <tr>
          <!-- Corner Header -->
          <th class="w-10 bg-muted/50 border border-border sticky top-0 left-0 z-20"></th>
          
          <!-- Column Headers -->
          <th 
            v-for="colIndex in totalColumns" 
            :key="colIndex - 1"
            class="h-8 min-w-[100px] bg-muted/50 border border-border text-xs font-medium text-muted-foreground sticky top-0 z-10 px-2 text-center cursor-pointer hover:bg-muted/80"
            :class="{ 'bg-purple-500/10 text-purple-600 font-bold': isSelectedHeaderCol(colIndex - 1) }"
            @click.stop="emit('select-col', colIndex - 1, $event.shiftKey)"
          >
            {{ getColumnLabel(colIndex - 1) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rowIndex in totalRows" :key="rowIndex - 1">
          <!-- Row Header -->
          <td 
            class="w-10 bg-muted/50 border border-border text-xs font-medium text-muted-foreground sticky left-0 z-10 text-center cursor-pointer hover:bg-muted/80"
            :class="{ 'bg-purple-500/10 text-purple-600 font-bold': isSelectedHeaderRow(rowIndex - 1) }"
            @click.stop="emit('select-row', rowIndex - 1, $event.shiftKey)"
          >
            {{ rowIndex }}
          </td>

          <!-- Cells -->
          <td 
            v-for="colIndex in totalColumns" 
            :key="colIndex - 1"
            class="border border-border h-8 px-2 text-sm relative cursor-cell whitespace-nowrap overflow-hidden text-foreground select-none"
            :class="{
              'bg-purple-500/10': isInSelection(rowIndex - 1, colIndex - 1),
              'outline outline-2 outline-purple-500 z-10': selection?.start.row === (rowIndex - 1) && selection?.start.col === (colIndex - 1),
              'bg-background': !isInSelection(rowIndex - 1, colIndex - 1)
            }"
            :style="getCellStyle(rowIndex - 1, colIndex - 1)"
            :data-row="rowIndex - 1"
            :data-col="colIndex - 1"
            @dblclick="startEditing(rowIndex - 1, colIndex - 1)"
          >
            <!-- Editing Mode -->
            <input
              v-if="editingCell?.row === (rowIndex - 1) && editingCell?.col === (colIndex - 1)"
              ref="editInput"
              :value="getCellValue(rowIndex - 1, colIndex - 1)"
              @input="emit('update:value', ($event.target as HTMLInputElement).value)"
              @blur="emit('edit-end', ($event.target as HTMLInputElement).value)"
              @keydown="onEditKeydown"
              class="absolute inset-0 w-full h-full px-2 bg-background outline-none font-mono text-sm"
              :style="getCellStyle(rowIndex - 1, colIndex - 1)"
            />
            
            <!-- Display Mode -->
            <span v-else class="pointer-events-none">
              {{ getCellValue(rowIndex - 1, colIndex - 1) }}
            </span>
            
            <!-- Fill Handle (Excel-style drag corner) -->
            <div 
              v-if="fillHandlePosition && fillHandlePosition.row === (rowIndex - 1) && fillHandlePosition.col === (colIndex - 1)"
              class="absolute bottom-0 right-0 w-2 h-2 bg-purple-500 cursor-crosshair z-20"
              style="transform: translate(50%, 50%)"
              @mousedown.stop="() => {}"
              title="Drag to fill"
            ></div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
