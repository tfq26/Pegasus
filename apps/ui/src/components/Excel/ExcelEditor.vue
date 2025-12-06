```
<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { HyperFormula } from 'hyperformula'
import { HotTable } from '@handsontable/vue3'
import { registerAllModules } from 'handsontable/registry'
import 'handsontable/dist/handsontable.full.min.css'
import FormulaBar from './FormulaBar.vue'

// Register Handsontable modules
registerAllModules()

const props = defineProps<{
  data: any[]
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'save', data: any[]): void
}>()

// State
const hfInstance = ref<HyperFormula | null>(null)
const sheetId = ref<string>('Sheet1')
const hotRef = ref<any>(null)
const hotSettings = ref<any>({
  licenseKey: 'non-commercial-and-evaluation',
  data: [],
  colHeaders: true,
  rowHeaders: true,
  height: '100%',
  width: '100%',
  contextMenu: true,
  formulas: {
    engine: null // Will be set in init
  },
  fillHandle: true,
  selectionMode: 'multiple',
  outsideClickDeselects: false,
  afterSelection: (r: number, c: number, r2: number, c2: number) => {
    updateSelection(r, c, r2, c2)
  },
  afterChange: (changes: any, source: string) => {
    if (source === 'loadData') return
    debouncedSave()
  }
})

const currentFormula = ref('')
const aiMode = ref(false)
let saveTimeout: ReturnType<typeof setTimeout> | null = null

// Selection State
const selection = ref<{ start: { row: number, col: number }, end: { row: number, col: number } } | null>(null)

const selectedCellAddress = computed(() => {
  if (!selection.value || !hfInstance.value) return ''
  const { start, end } = selection.value
  
  if (start.row === end.row && start.col === end.col) {
    return hfInstance.value.simpleCellAddressToString({ sheet: 0, row: start.row, col: start.col }, 0)
  }
  
  const startAddr = hfInstance.value.simpleCellAddressToString({ sheet: 0, row: start.row, col: start.col }, 0)
  const endAddr = hfInstance.value.simpleCellAddressToString({ sheet: 0, row: end.row, col: end.col }, 0)
  return `${startAddr}:${endAddr}`
})

// Initialize HyperFormula & Handsontable
const initHyperFormula = () => {
  console.log('[ExcelEditor] initHyperFormula called')
  
  if (!props.data || props.data.length === 0) {
    console.warn('[ExcelEditor] No data to initialize')
    return
  }

  const headers = Object.keys(props.data[0])
  const values = props.data.map(row => headers.map(header => {
    const val = row[header]
    if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
      return Number(val)
    }
    return val
  }))
  
  const initialData = [headers, ...values]

  hfInstance.value = HyperFormula.buildEmpty({
    licenseKey: 'gpl-v3'
  })

  // Add sheet
  hfInstance.value.addSheet(sheetId.value)
  hfInstance.value.setSheetContent(0, initialData)
  
  // Update Handsontable settings
  hotSettings.value = {
    ...hotSettings.value,
    data: initialData,
    formulas: {
      engine: hfInstance.value
    }
  }
}

const updateSelection = (r: number, c: number, r2: number, c2: number) => {
  selection.value = {
    start: { row: r, col: c },
    end: { row: r2, col: c2 }
  }
  
  // Update formula bar with value of top-left cell
  const minR = Math.min(r, r2)
  const minC = Math.min(c, c2)
  
  if (hotRef.value) {
    const hot = hotRef.value.hotInstance
    const val = hot.getDataAtCell(minR, minC)
    currentFormula.value = val === null || val === undefined ? '' : String(val)
  }
}

const onFormulaSubmit = () => {
  if (!selection.value || !hotRef.value) return
  
  const { row, col } = selection.value.start
  const hot = hotRef.value.hotInstance
  hot.setDataAtCell(row, col, currentFormula.value)
}

const onAISubmit = async () => {
  console.log('AI Submit:', currentFormula.value)
}

const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    if (!hotRef.value) return
    
    const hot = hotRef.value.hotInstance
    const data = hot.getData()
    
    // Convert back to array of objects
    const headers = data[0]
    const rows = data.slice(1)
    
    const dataToSave = rows.map((row: any[]) => {
      const obj: any = {}
      headers.forEach((header: string, index: number) => {
        obj[header] = row[index]
      })
      return obj
    })
    
    emit('save', dataToSave)
  }, 1000)
}

const getSelectedData = () => {
  if (!hotRef.value) return null
  const hot = hotRef.value.hotInstance
  const selected = hot.getSelected()
  if (!selected) return null
  
  // Handsontable returns array of selections [startRow, startCol, endRow, endCol]
  // We take the first selection
  const [r1, c1, r2, c2] = selected[0]
  const data = hot.getData(r1, c1, r2, c2)
  
  // Get headers
  const allData = hot.getData()
  const headers = allData[0]
  
  // Map to objects
  // Note: If selection includes header row (row 0), we should handle it.
  // Assuming row 0 is headers.
  
  const startRow = Math.min(r1, r2)
  const endRow = Math.max(r1, r2)
  const startCol = Math.min(c1, c2)
  const endCol = Math.max(c1, c2)
  
  const result = []
  // If we selected headers, skip them in result? Or include?
  // Let's skip row 0 if it's headers
  
  const effectiveStartRow = startRow === 0 ? 1 : startRow
  
  for (let r = effectiveStartRow; r <= endRow; r++) {
    const rowObj: any = {}
    for (let c = startCol; c <= endCol; c++) {
      const header = headers[c]
      const val = hot.getDataAtCell(r, c)
      rowObj[header] = val
    }
    result.push(rowObj)
  }
  
  return result
}

const toggleAIMode = () => {
  aiMode.value = !aiMode.value
  currentFormula.value = ''
}

const handleFormat = (type: string, value?: any) => {
  // TODO: Implement formatting with Handsontable
  console.log('Format:', type, value)
}

defineExpose({
  handleFormat,
  toggleAIMode,
  aiMode,
  getSelectedData
})

// Lifecycle
onMounted(() => {
  initHyperFormula()
})

watch(() => props.data, (newData) => {
  if (newData && newData.length > 0) {
    initHyperFormula()
  }
}, { deep: true })

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
})

</script>

<template>
  <div class="flex flex-col h-full bg-background overflow-hidden">
    <FormulaBar 
      :selected-cell="selectedCellAddress || ''"
      v-model:value="currentFormula"
      :ai-mode="aiMode"
      @submit="aiMode ? onAISubmit() : onFormulaSubmit()"
    />
    
    <div class="flex-1 overflow-hidden relative w-full h-full">
      <div v-if="!hfInstance && data.length > 0" class="flex items-center justify-center h-full text-muted-foreground">
        <div class="flex flex-col items-center gap-2">
            <span class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
             <span>Initializing spreadsheet engine...</span>
        </div>
      </div>
      <HotTable
        v-if="hfInstance"
        ref="hotRef"
        :settings="hotSettings"
        style="width: 100%; height: 100%; overflow: hidden;"
      />
    </div>
  </div>
</template>
```
