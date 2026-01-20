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
  let i = index
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label
    i = Math.floor(i / 26) - 1
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


</script>

<template>
  <div class="overflow-auto relative select-none w-full h-full spreadsheet-scrollbar">
    <table 
      class="border-collapse w-full table-fixed"
      @mousedown="onMouseDown"
      @dragstart.prevent
    >
      <thead>
        <tr>
          <!-- Corner Header -->
          <th class="w-10 bg-muted/50 border border-border sticky top-0 left-0 z-20"></th>
          
          <!-- Column Headers -->
          <th 
            v-for="(col, colIndex) in data[0] || []" 
            :key="colIndex"
            class="h-8 min-w-[100px] bg-muted/50 border border-border text-xs font-medium text-muted-foreground sticky top-0 z-10 px-2 text-center cursor-pointer hover:bg-muted/80"
            :class="{ 'bg-purple-500/10 text-purple-600 font-bold': isSelectedHeaderCol(colIndex) }"
            @click.stop="emit('select-col', colIndex, $event.shiftKey)"
          >
            {{ getColumnLabel(colIndex) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in data" :key="rowIndex">
          <!-- Row Header -->
          <td 
            class="w-10 bg-muted/50 border border-border text-xs font-medium text-muted-foreground sticky left-0 z-10 text-center cursor-pointer hover:bg-muted/80"
            :class="{ 'bg-purple-500/10 text-purple-600 font-bold': isSelectedHeaderRow(rowIndex) }"
            @click.stop="emit('select-row', rowIndex, $event.shiftKey)"
          >
            {{ rowIndex + 1 }}
          </td>

          <!-- Cells -->
          <td 
            v-for="(cell, colIndex) in row" 
            :key="colIndex"
            class="border border-border h-8 px-2 text-sm relative cursor-cell whitespace-nowrap overflow-hidden text-foreground select-none"
            :class="{
              'bg-purple-500/10': isInSelection(rowIndex, colIndex),
              'outline outline-2 outline-purple-500 z-10': selection?.start.row === rowIndex && selection?.start.col === colIndex,
              'bg-background': !isInSelection(rowIndex, colIndex)
            }"
            :style="getCellStyle(rowIndex, colIndex)"
            :data-row="rowIndex"
            :data-col="colIndex"
            @dblclick="startEditing(rowIndex, colIndex)"
          >
            <!-- Editing Mode -->
            <input
              v-if="editingCell?.row === rowIndex && editingCell?.col === colIndex"
              ref="editInput"
              :value="cell"
              @input="emit('update:value', ($event.target as HTMLInputElement).value)"
              @blur="emit('edit-end', ($event.target as HTMLInputElement).value)"
              @keydown="onEditKeydown"
              class="absolute inset-0 w-full h-full px-2 bg-background outline-none font-mono text-sm"
              :style="getCellStyle(rowIndex, colIndex)"
            />
            
            <!-- Display Mode -->
            <span v-else class="pointer-events-none">
              {{ cell }}
            </span>
            
            <!-- Fill Handle (Excel-style drag corner) -->
            <div 
              v-if="fillHandlePosition && fillHandlePosition.row === rowIndex && fillHandlePosition.col === colIndex"
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
