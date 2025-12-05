<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { HyperFormula } from 'hyperformula'
import ExcelToolbar from './ExcelToolbar.vue'
import FormulaBar from './FormulaBar.vue'
import ExcelGrid from './ExcelGrid.vue'

const props = defineProps<{
  data: any[]
  readOnly?: boolean
}>()

// State
const hfInstance = ref<HyperFormula | null>(null)
const sheetId = ref<string>('Sheet1')
const gridData = ref<any[][]>([])
const selectedCell = ref<{ row: number, col: number } | null>(null)
const editingCell = ref<{ row: number, col: number } | null>(null)
const currentFormula = ref('')

// Computed
const canUndo = computed(() => hfInstance.value?.isUndoAvailable() ?? false)
const canRedo = computed(() => hfInstance.value?.isRedoAvailable() ?? false)

const selectedCellAddress = computed(() => {
  if (!selectedCell.value) return ''
  return hfInstance.value?.simpleCellAddressToString(
    { sheet: 0, row: selectedCell.value.row, col: selectedCell.value.col },
    0
  ) || ''
})

// Initialize HyperFormula
const initHyperFormula = () => {
  // Convert array of objects to 2D array
  // First row: Headers
  // Subsequent rows: Values
  if (!props.data || props.data.length === 0) return

  const headers = Object.keys(props.data[0])
  const values = props.data.map(row => headers.map(header => row[header]))
  const initialData = [headers, ...values]

  hfInstance.value = HyperFormula.buildEmpty({
    licenseKey: 'gpl-v3'
  })

  // Add sheet
  hfInstance.value.addSheet(sheetId.value)
  hfInstance.value.setSheetContent(0, initialData)
  
  updateGridData()
}

const updateGridData = () => {
  if (!hfInstance.value) return
  
  const width = hfInstance.value.getSheetDimensions(0).width
  const height = hfInstance.value.getSheetDimensions(0).height
  
  const newData = []
  for (let r = 0; r < height; r++) {
    const row = []
    for (let c = 0; c < width; c++) {
      row.push(hfInstance.value.getCellValue({ sheet: 0, row: r, col: c }))
    }
    newData.push(row)
  }
  gridData.value = newData
}

// Event Handlers
const onSelect = (row: number, col: number) => {
  selectedCell.value = { row, col }
  editingCell.value = null
  
  // Get raw formula/value
  if (hfInstance.value) {
    const cellValue = hfInstance.value.getCellFormula({ sheet: 0, row, col }) || 
                      hfInstance.value.getCellValue({ sheet: 0, row, col })
    currentFormula.value = String(cellValue)
  }
}

const onEditStart = (row: number, col: number) => {
  if (props.readOnly) return
  editingCell.value = { row, col }
}

const onEditEnd = (value: string) => {
  if (!editingCell.value || !hfInstance.value) return
  
  const { row, col } = editingCell.value
  hfInstance.value.setCellContents({ sheet: 0, row, col }, [[value]])
  updateGridData()
  editingCell.value = null
  currentFormula.value = value
}

const onFormulaSubmit = () => {
  if (!selectedCell.value || !hfInstance.value) return
  
  const { row, col } = selectedCell.value
  hfInstance.value.setCellContents({ sheet: 0, row, col }, [[currentFormula.value]])
  updateGridData()
}

const onUndo = () => {
  hfInstance.value?.undo()
  updateGridData()
}

const onRedo = () => {
  hfInstance.value?.redo()
  updateGridData()
}

// Lifecycle
onMounted(() => {
  initHyperFormula()
})

watch(() => props.data, () => {
  initHyperFormula()
})
</script>

<template>
  <div class="flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden">
    <ExcelToolbar 
      :can-undo="canUndo"
      :can-redo="canRedo"
      @undo="onUndo"
      @redo="onRedo"
    />
    
    <FormulaBar 
      :selected-cell="selectedCellAddress"
      v-model:value="currentFormula"
      @submit="onFormulaSubmit"
    />
    
    <div class="flex-1 overflow-hidden relative">
      <ExcelGrid 
        :data="gridData"
        :width="800"
        :height="500"
        :selected-cell="selectedCell"
        :editing-cell="editingCell"
        @select="onSelect"
        @edit-start="onEditStart"
        @edit-end="onEditEnd"
        @update:value="currentFormula = $event"
      />
    </div>
  </div>
</template>
