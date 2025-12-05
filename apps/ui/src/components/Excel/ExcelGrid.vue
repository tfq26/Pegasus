<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps<{
  data: any[][] // 2D array of cell values (computed)
  width: number
  height: number
  selectedCell: { row: number, col: number } | null
  editingCell: { row: number, col: number } | null
}>()

const emit = defineEmits<{
  (e: 'select', row: number, col: number): void
  (e: 'edit-start', row: number, col: number): void
  (e: 'edit-end', value: string): void
  (e: 'update:value', value: string): void
}>()

// Generate column headers (A, B, ... Z, AA, AB...)
const getColumnLabel = (index: number) => {
  let label = ''
  let i = index
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label
    i = Math.floor(i / 26) - 1
  }
  return label
}

const editInput = ref<HTMLInputElement | null>(null)

// Focus input when editing starts
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
</script>

<template>
  <div 
    class="overflow-auto relative select-none"
    :style="{ width: width + 'px', height: height + 'px' }"
  >
    <table class="border-collapse w-full table-fixed">
      <thead>
        <tr>
          <!-- Corner Header -->
          <th class="w-10 bg-muted/50 border border-border sticky top-0 left-0 z-20"></th>
          
          <!-- Column Headers -->
          <th 
            v-for="(col, colIndex) in data[0] || []" 
            :key="colIndex"
            class="h-8 min-w-[100px] bg-muted/50 border border-border text-xs font-medium text-muted-foreground sticky top-0 z-10 px-2 text-center"
            :class="{ 'bg-primary/10 text-primary font-bold': selectedCell?.col === colIndex }"
          >
            {{ getColumnLabel(colIndex) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in data" :key="rowIndex">
          <!-- Row Header -->
          <td 
            class="w-10 bg-muted/50 border border-border text-xs font-medium text-muted-foreground sticky left-0 z-10 text-center"
            :class="{ 'bg-primary/10 text-primary font-bold': selectedCell?.row === rowIndex }"
          >
            {{ rowIndex + 1 }}
          </td>

          <!-- Cells -->
          <td 
            v-for="(cell, colIndex) in row" 
            :key="colIndex"
            class="border border-border h-8 px-2 text-sm relative cursor-cell whitespace-nowrap overflow-hidden"
            :class="{
              'bg-primary/5 outline outline-2 outline-primary z-10': selectedCell?.row === rowIndex && selectedCell?.col === colIndex,
              'bg-background': !(selectedCell?.row === rowIndex && selectedCell?.col === colIndex)
            }"
            @click="emit('select', rowIndex, colIndex)"
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
            />
            
            <!-- Display Mode -->
            <span v-else>
              {{ cell }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
