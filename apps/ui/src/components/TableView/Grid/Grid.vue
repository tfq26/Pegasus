
<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted, nextTick, watch, toRef } from 'vue';
import { Engine } from '../Engine/Engine';
import { colIndexToLabel, colLabelToIndex } from '../Engine/FormulaParser';
import { useGridScroll } from '../../../composables/grid/useGridScroll';
import { useGridSelection } from '../../../composables/grid/useGridSelection';
import { useRealtimeCursor } from '../../../composables/grid/useRealtimeCursor';
import { useGridEditing } from '../../../composables/grid/useGridEditing';
import type { CellPosition } from '../Engine/types';
import { CellType } from '../Engine/types';
import { toast } from 'vue-sonner';
import { useFeatureFlags } from '@/composables/useFeatureFlags';
import FindDialog from '../FindDialog.vue';
import { SearchEngine } from '../Engine/SearchEngine';
import ProviderBadge from '../ProviderBadge.vue';
import { 
  ChevronDown, 
  Sparkles, 
  X, 
  HelpCircle, 
  AlertTriangle, 
  AlertCircle,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Download,
  MessageSquare
} from 'lucide-vue-next';
import { CSVExporter, ExcelExporter } from '../Engine/Exporters';
import ContextMenu, { type ContextMenuItem } from '../ContextMenu.vue';
import NoteThread from '../NoteThread.vue';
import PresenceOverlay from '../PresenceOverlay.vue';
import { connectToSurreal } from '@/lib/surreal';
import { RealtimeSync } from '../Engine/RealtimeSync';

const props = defineProps<{
  engine: Engine;
  mode?: 'read' | 'write'; // Chat mode = AI input, Write mode = Excel formulas
  isAIMode?: boolean;
  autoExecuteMode?: boolean;
  privateMode?: boolean;
}>();

const emit = defineEmits<{
  'save-query': [query: string, type: 'formula']
}>();



// --- Viewport State (useGridScroll) ---
const { 
  gridContainer, 
  headerContainer, 
  virtualState, 
  visibleRows, 
  onScroll, 
  scrollToCell,
  rowCount,
  colCount,
  rowHeight,
  colWidth
} = useGridScroll(props.engine);

// Force re-render trigger
const renderKey = ref(0);

// --- Realtime & Follow Me (useRealtimeCursor) ---
// --- Selection State (useGridSelection) ---
const {
  selection,
  rangeSelection,
  selectedColumn,
  selectedRow,
  lastSelectedColumn,
  lastSelectedRow,
  selectColumn,
  selectRow,
  clearColumnRowSelection,
  deleteSelectedColumn,
  deleteSelectedRow,
  fillSelectedColumn,
  fillSelectedRow,
  isColumnSelected,
  isRowSelected,
  focusGrid
} = useGridSelection(props.engine, gridContainer, rowCount, colCount, renderKey);


// --- Realtime & Follow Me (useRealtimeCursor) ---
const {
  followedUserId,
  handleFollowUser,
  stopFollowing,
  updateCursor // Use this instead of direct realtimeSync access
} = useRealtimeCursor(props.engine, toRef(props, 'privateMode'), scrollToCell);


// --- Editing (useGridEditing) ---
const {
  editingCell,
  formulaBarValue,
  currentCellRawValue,
  startEditing,
  commitEdit,
  onCellInputChange,
  onCellBlur
} = useGridEditing(props.engine, gridContainer, selection);


// Subscribe to engine changes
props.engine.onChange(() => {
  renderKey.value++;
});

// Search State
const showFindDialog = ref(false);
const searchEngine = computed(() => new SearchEngine(props.engine));



// (realtimeSync definition removed - in useRealtimeCursor)

const onMatchSelected = (pos: CellPosition) => {
    scrollToCell(pos.row, pos.col);
    selection.value = pos;
    // Ensure we are in write mode?
    if (props.mode !== 'read') {
        focusGrid();
    }
};

const isProcessingAI = ref(false);



// Follow me logic removed (moved to useRealtimeCursor)
// const editingCell = ref<CellPosition | null>(null); -> moved to useGridEditing
// const formulaBarValue = ref(''); -> moved to useGridEditing
const isDragging = ref(false);
const dragStart = ref<CellPosition | null>(null);

// Watch selection to update engine state
// Watch selection to update engine state
// Watch selection to update engine state
// Watcher moved below definition

// Watch formula bar for autocomplete
watch(formulaBarValue, (val) => {
  if (val.startsWith('=')) {
    const input = val.substring(1).toUpperCase();
    // Find last function name being typed
    const lastFuncMatch = input.match(/([A-Z]+)$/);
    if (lastFuncMatch) {
      const partial = lastFuncMatch[1];
      formulaSuggestions.value = BUILT_IN_FUNCTIONS.filter(f => f.startsWith(partial));
      showSuggestions.value = formulaSuggestions.value.length > 0;
      selectedSuggestionIndex.value = 0;
    } else {
      showSuggestions.value = false;
    }
    
    // Extract references for highlighting
    const { cells, ranges } = props.engine.parser.extractReferences(val);
    formulaReferences.value = cells;
    formulaRanges.value = ranges;
  } else {
    showSuggestions.value = false;
    formulaReferences.value = [];
    formulaRanges.value = [];
  }
});

// Fill handle state
const isFillDragging = ref(false);
const fillStart = ref<CellPosition | null>(null);
const fillRange = ref<{ start: CellPosition, end: CellPosition } | null>(null);

// --- Selection State (useGridSelection) ---


// Watch selection to update engine state
watch(selection, (newVal) => {
  props.engine.viewState.selection = newVal;
  if (newVal) {
      updateCursor(newVal);
  }
});


// --- AI Feature State ---
// isAIMode and autoExecuteMode are now props
const selectedAIModel = ref('gemini-2.0-flash-exp');
const aiModels = ref([
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
]);

// Modals State
const showFormulaPreviewModal = ref(false);
const formulaPreviewData = ref<any>(null);

const showAmbiguityModal = ref(false);
const ambiguityData = ref<any>(null);

const showModificationWarningModal = ref(false);
const modificationWarningData = ref<any>(null);

const showFormulaErrorPopover = ref(false);
const formulaErrorData = ref<any>(null);
const popoverPosition = ref({ x: 0, y: 0 });
const isAnalyzingFormula = ref(false);

// --- Context Menu State ---
const showContextMenu = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextMenuOptions = ref<ContextMenuItem[]>([]);
const contextTarget = ref<{ type: 'cell' | 'row-header' | 'col-header', row?: number, col?: number } | null>(null);

// Note State
const activeNoteCell = ref<{row: number, col: number} | null>(null);
const activeNotePos = ref({ x: 0, y: 0 });
const activeNoteKey = computed(() => activeNoteCell.value ? `${activeNoteCell.value.row},${activeNoteCell.value.col}` : null);
const activeNoteLabel = computed(() => {
    if(!activeNoteCell.value) return '';
    const colName = colIndexToLabel(activeNoteCell.value.col);
    return `${colName}${activeNoteCell.value.row + 1}`;
});

const closeNotePopover = () => {
    activeNoteCell.value = null;
};

const handleAddNote = (entityId: string, content: string) => {
    props.engine.addNote('cell', entityId, content);
    // Force reactivity if needed, though engine notifyChange should trigger grid update
};

const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    
    // Check if we clicked a cell, row header, or column header
    const cell = target.closest('td');
    const thCol = target.closest('th[data-col]');
    const thRow = target.closest('th[data-row]');
    
    // Default options
    let options: ContextMenuItem[] = [];
    
    if (thCol) {
        // Column Header Click
        const colStr = thCol.getAttribute('data-col');
        const col = parseInt(colStr || '-1');
        if (col >= 0) {
            contextTarget.value = { type: 'col-header', col };
            selectColumn(col); // Auto-select the column
            options = [
                { label: 'Insert Column Left', action: 'insert_col_left', icon: ArrowLeft },
                { label: 'Insert Column Right', action: 'insert_col_right', icon: ArrowRight },
                { type: 'divider' },
                { label: 'Delete Column', action: 'delete_col', icon: Trash2, variant: 'destructive' },
                { label: 'Export Selection (CSV)', action: 'export_col_csv', icon: Download },
            ];
        }
    } else if (thRow) {
        // Row Header Click
        const rowStr = thRow.getAttribute('data-row');
        const row = parseInt(rowStr || '-1');
        if (row >= 0) {
            contextTarget.value = { type: 'row-header', row };
            selectRow(row); // Auto-select the row
            options = [
                { label: 'Insert Row Above', action: 'insert_row_above', icon: ArrowUp },
                { label: 'Insert Row Below', action: 'insert_row_below', icon: ArrowDown },
                { type: 'divider' },
                { label: 'Delete Row', action: 'delete_row', icon: Trash2, variant: 'destructive' },
            ];
        }
    } else if (cell) {
        // Regular Cell Click
        const rowStr = cell.dataset.row;
        const colStr = cell.dataset.col;
        const row = parseInt(rowStr || '-1');
        const col = parseInt(colStr || '-1');
        
        if (row >= 0 && col >= 0) {
            contextTarget.value = { type: 'cell', row, col };
            
            // If right-click is outside current selection, update selection
            if (!isInSelection(row, col)) {
                selection.value = { row, col };
                rangeSelection.value = null;
            }
            
            options = [
                { label: 'Insert Row Above', action: 'insert_row_above', icon: ArrowUp },
                { label: 'Insert Row Below', action: 'insert_row_below', icon: ArrowDown },
                { label: 'Insert Column Left', action: 'insert_col_left', icon: ArrowLeft },
                { label: 'Insert Column Right', action: 'insert_col_right', icon: ArrowRight },
                { type: 'divider' },
                { label: 'Delete Row', action: 'delete_row', icon: Trash2 },
                { label: 'Delete Column', action: 'delete_col', icon: Trash2 },
                { type: 'divider' },
                { label: 'Insert Note', action: 'insert_note', icon: MessageSquare },
                { type: 'divider' },
                { label: 'Toggle Simulation (Demo)', action: 'toggle_simulation', icon: Sparkles },
                { type: 'divider' },
                { label: 'Export Selection (CSV)', action: 'export_selection_csv', icon: Download },
            ];
        }
    } else {
        return; // Not a valid target
    }
    
    if (options.length > 0) {
        contextMenuOptions.value = options;
        contextMenuPos.value = { x: e.clientX, y: e.clientY };
        showContextMenu.value = true;
    }
};

const handleContextMenuAction = async (action: string) => {
    const target = contextTarget.value;
    if (!target) return;
    
    // Helper to get row/col safely
    const r = target.row ?? selection.value?.row ?? 0;
    const c = target.col ?? selection.value?.col ?? 0;
    
    try {
        switch (action) {
            case 'insert_row_above':
                await props.engine.insertRow(r);
                break;
            case 'insert_row_below':
                await props.engine.insertRow(r + 1);
                break;
            case 'insert_col_left':
                await props.engine.insertColumn(c);
                break;
            case 'insert_col_right':
                await props.engine.insertColumn(c + 1);
                break;
            case 'delete_row':
                await props.engine.deleteRow(r);
                break;
            case 'delete_col':
                await props.engine.deleteColumn(c);
                break;
            case 'insert_note':
                activeNoteCell.value = { row: r, col: c };
                activeNotePos.value = { x: contextMenuPos.value.x, y: contextMenuPos.value.y };
                break;
            case 'toggle_simulation':
                if (props.engine['simulationInterval']) {
                    props.engine.stopSimulation();
                    toast.info('Presence Simulation Stopped');
                } else {
                    props.engine.startSimulation();
                    toast.success('Presence Simulation Started');
                }
                break;
            case 'export_selection_csv':
                 // Determine range to export
                 let start = { row: r, col: c };
                 let end = { row: r, col: c };
                 if (target.type === 'col-header' && target.col !== undefined) {
                     start = { row: 0, col: target.col };
                     end = { row: rowCount - 1, col: target.col };
                 } else if (rangeSelection.value) {
                    start = rangeSelection.value.start;
                    end = rangeSelection.value.end;
                 }
                 
                // Trigger export logic (TODO: Phase 2 - Actually filter by range)
                // For now, we will just export the whole table as a placeholder
                toast.info('Exporting selection...');
                // Pass range
                CSVExporter.export(props.engine, 'selection.csv', { start, end }); 
                break;
        }
        
        // Force refresh
        renderKey.value++;
    } catch (e: any) {
        console.error('Menu Action Failed:', e);
        toast.error(`Action failed: ${e.message}`);
    }
};

// --- Feature Flags ---
const { hasManualFormulas } = useFeatureFlags();

// --- Formula Autocomplete State ---
const BUILT_IN_FUNCTIONS = [
  'SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX', 
  'IF', 'ROUND', 'ABS', 'SQRT'
];
const formulaSuggestions = ref<string[]>([]);
const showSuggestions = ref(false);
const selectedSuggestionIndex = ref(0);
const formulaReferences = ref<CellPosition[]>([]);
const formulaRanges = ref<{start: CellPosition, end: CellPosition}[]>([]); 

// Helper for formula bar placeholder
const formulaBarPlaceholder = computed(() => {
  return props.isAIMode 
    ? "✨ Ask AI to generate a formula (e.g., 'Calculate average profit')" 
    : 'Enter formula or value...';
});

// Show manual formula features only if AI mode is enabled OR user has the experimental feature
const showManualFormulaFeatures = computed(() => {
  return props.isAIMode || hasManualFormulas.value;
});


// Reference colors for highlighting
const REFERENCE_COLORS = [
  'ring-2 ring-blue-500 ring-inset',
  'ring-2 ring-green-500 ring-inset',
  'ring-2 ring-purple-500 ring-inset',
  'ring-2 ring-orange-500 ring-inset',
];

// --- Computed ---
const selectedCellLabel = computed(() => {
  if (!selection.value) return '';
  return `${colIndexToLabel(selection.value.col)}${selection.value.row + 1}`;
});

// const currentCellRawValue = computed ... moved to useGridEditing

// Helper for display value (direct engine access for performance)
const getDisplayValue = (row: number, col: number) => {
  // Use renderKey to force update when engine changes
  const _ = renderKey.value;
  if (row >= rowCount || col >= colCount) return '';
  return props.engine.getDisplayValue({ row, col });
};

// --- Helpers ---
const getCellFromEvent = (e: MouseEvent): CellPosition | null => {
  const target = e.target as HTMLElement;
  const cell = target.closest('td');
  if (!cell) return null;
  
  const row = parseInt(cell.dataset.row || '-1');
  const col = parseInt(cell.dataset.col || '-1');
  if (row >= 0 && col >= 0) return { row, col };
  return null;
};

const isInSelection = (row: number, col: number) => {
  // Check fill range first (during drag)
  if (fillRange.value) {
    const { start, end } = fillRange.value;
    const minR = Math.min(start.row, end.row);
    const maxR = Math.max(start.row, end.row);
    const minC = Math.min(start.col, end.col);
    const maxC = Math.max(start.col, end.col);
    if (row >= minR && row <= maxR && col >= minC && col <= maxC) {
      return true;
    }
  }
  
  // Check regular selection
  if (rangeSelection.value) {
    const { start, end } = rangeSelection.value;
    const minR = Math.min(start.row, end.row);
    const maxR = Math.max(start.row, end.row);
    const minC = Math.min(start.col, end.col);
    const maxC = Math.max(start.col, end.col);
    return row >= minR && row <= maxR && col >= minC && col <= maxC;
  }
  return selection.value?.row === row && selection.value?.col === col;
};

// Check if cell is referenced in current formula
const isReferencedInFormula = (row: number, col: number): number => {
  if (!editingCell.value || !formulaBarValue.value || !formulaBarValue.value.startsWith('=')) return -1;
  
  // Check direct cell references
  for (let i = 0; i < formulaReferences.value.length; i++) {
    const ref = formulaReferences.value[i];
    if (ref && ref.row === row && ref.col === col) return i;
  }
  
  // Check if cell is in a range
  for (let i = 0; i < formulaRanges.value.length; i++) {
    const range = formulaRanges.value[i];
    if (range) {
      const minRow = Math.min(range.start.row, range.end.row);
      const maxRow = Math.max(range.start.row, range.end.row);
      const minCol = Math.min(range.start.col, range.end.col);
      const maxCol = Math.max(range.start.col, range.end.col);
      if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
        return formulaReferences.value.length + i;
      }
    }
  }
  
  return -1;
};

// Get color class for referenced cell
const getReferenceColorClass = (row: number, col: number): string => {
  const refIndex = isReferencedInFormula(row, col);
  if (refIndex < 0) return '';
  return REFERENCE_COLORS[refIndex % REFERENCE_COLORS.length];
};



// --- Mouse Events ---
const onMouseDown = (row: number, col: number, e: MouseEvent) => {
  if (e.target instanceof HTMLInputElement) return;

  const cell = { row, col };

  // Commit any pending edit in background (don't block selection)
  if (editingCell.value) {
    commitEdit(); // Remove await - let it run in background
  }

  isDragging.value = true;
  
  if (e.shiftKey && selection.value) {
    // Shift-click: Extend selection from the original anchor
    // We keep the original dragStart validation or anchor point
    if (!dragStart.value) dragStart.value = selection.value;
    
    rangeSelection.value = { 
      start: dragStart.value, 
      end: cell 
    };
  } else {
    // Normal click: Start new selection
    dragStart.value = cell;
    selection.value = cell;
    rangeSelection.value = { start: cell, end: cell };
    formulaBarValue.value = currentCellRawValue.value;
  }

  // Focus the grid container for keyboard events
  focusGrid();

  document.addEventListener('mousemove', onGlobalMouseMove);
  document.addEventListener('mouseup', onGlobalMouseUp);
};

const onGlobalMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !dragStart.value) return;
  const cell = getCellFromEvent(e);
  if (cell) {
    rangeSelection.value = { start: dragStart.value, end: cell };
  }
};

const onGlobalMouseUp = () => {
  if (isFillDragging.value && fillStart.value && fillRange.value) {
    // Perform the fill operation
    performFill(fillStart.value, fillRange.value);
    isFillDragging.value = false;
    fillStart.value = null;
    fillRange.value = null;
  }
  
  isDragging.value = false;
  dragStart.value = null;
  document.removeEventListener('mousemove', onGlobalMouseMove);
  document.removeEventListener('mouseup', onGlobalMouseUp);
};

// --- Fill Handle ---
const startFillDrag = (e: MouseEvent) => {
  e.stopPropagation();
  if (!selection.value) return;
  
  isFillDragging.value = true;
  fillStart.value = selection.value;
  fillRange.value = { start: selection.value, end: selection.value };
  
  document.addEventListener('mousemove', onFillHandleMouseMove);
  document.addEventListener('mouseup', onGlobalMouseUp);
};

const onMouseEnter = (e: MouseEvent) => {
  // Update selection during drag
  if (isDragging.value && dragStart.value) {
     const cell = getCellFromEvent(e);
     if (cell) {
       rangeSelection.value = { start: dragStart.value, end: cell };
     }
  }
};

const handleInputKeydown = (e: KeyboardEvent) => {
  // Stop propagation to prevent grid navigation while typing
  e.stopPropagation();
};

const onFillHandleMouseMove = (e: MouseEvent) => {
  if (!isFillDragging.value || !fillStart.value) return;
  
  const cell = getCellFromEvent(e);
  if (cell) {
    fillRange.value = { start: fillStart.value, end: cell };
  }
};

const performFill = async (start: CellPosition, range: { start: CellPosition, end: CellPosition }) => {
  const sourceCell = props.engine.getCell(start);
  if (!sourceCell) return;
  
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  
  // Determine fill direction
  const isVertical = start.col === minCol && start.col === maxCol;
  const isHorizontal = start.row === minRow && start.row === maxRow;
  
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      // Skip the source cell
      if (row === start.row && col === start.col) continue;
      
      let newValue = sourceCell.rawInput;
      
      // Smart fill for formulas - adjust cell references
      if (sourceCell.rawInput.startsWith('=')) {
        const rowOffset = row - start.row;
        const colOffset = col - start.col;
        newValue = adjustFormulaReferences(sourceCell.rawInput, rowOffset, colOffset);
      }
      // Smart fill for numbers - increment
      else if (sourceCell.type === CellType.NUMBER) {
        const offset = isVertical ? (row - start.row) : (col - start.col);
        newValue = String(Number(sourceCell.value) + offset);
      }
      
      await props.engine.setValue({ row, col }, newValue);
    }
  }
};

const adjustFormulaReferences = (formula: string, rowOffset: number, colOffset: number): string => {
  // Simple regex to find cell references like A1, B2, etc.
  return formula.replace(/([A-Z]+)([0-9]+)/g, (match, colStr, rowStr) => {
    const col = colLabelToIndex(colStr);
    const row = parseInt(rowStr) - 1;
    
    const newCol = col + colOffset;
    const newRow = row + rowOffset;
    
    return `${colIndexToLabel(newCol)}${newRow + 1}`;
  });
};

// --- Styling ---
const getCellStyle = (row: number, col: number) => {
    const cell = props.engine.getCell({ row, col });
    if (!cell?.style) return {};
    return {
        fontWeight: cell.style.bold ? 'bold' : 'normal',
        fontStyle: cell.style.italic ? 'italic' : 'normal',
        textDecoration: cell.style.underline ? 'underline' : 'none',
        color: cell.style.color || 'inherit',
        backgroundColor: cell.style.background || 'inherit',
    };
};

const toggleStyle = async (styleKey: string, value?: any) => {
    if (!selection.value && !rangeSelection.value) return;
    const range = getSelectedRange();
    if (!range) return;

    let newValue = value;
    if (newValue === undefined) {
         const first = props.engine.getCell({ row: range.minRow, col: range.minCol });
         const current = !!(first?.style as any)?.[styleKey];
         newValue = !current;
    }

    props.engine.beginBatch();
    for (let r = range.minRow; r <= range.maxRow; r++) {
        for (let c = range.minCol; c <= range.maxCol; c++) {
             props.engine.setCellStyle({ row: r, col: c }, { [styleKey]: newValue });
        }
    }
    props.engine.endBatch();
};



// Watch selection to act as "formula bar sync" when not editing
watch(selection, () => {
  if (!editingCell.value && selection.value) {
     formulaBarValue.value = currentCellRawValue.value;
  }
});


const onFormulaBarChange = (e: Event) => {
  formulaBarValue.value = (e.target as HTMLInputElement).value;
};

const onFormulaBarKeydown = async (e: KeyboardEvent) => {
  // Handle autocomplete navigation
  if (showSuggestions.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggestionIndex.value = Math.min(selectedSuggestionIndex.value + 1, formulaSuggestions.value.length - 1);
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, 0);
      return;
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      const suggestion = formulaSuggestions.value[selectedSuggestionIndex.value];
      if (suggestion) {
        e.preventDefault();
        insertSuggestion(formulaSuggestions.value[selectedSuggestionIndex.value]);
        return;
      }
    } else if (e.key === 'Escape') {
      showSuggestions.value = false;
      return;
    }
  }
  
  if (e.key === 'Enter') {
    e.preventDefault();
    
    // In Write mode or when editing a cell, save the value
    if (selection.value) {
      await props.engine.setValue(selection.value, formulaBarValue.value);
      moveSelection('down');
    }
  } else if (e.key === 'Escape') {
    formulaBarValue.value = currentCellRawValue.value;
  }
};

// Insert autocomplete suggestion
const insertSuggestion = (suggestion: string) => {
  const val = formulaBarValue.value;
  // Find the last partial function name and replace it
  const match = val.match(/([A-Z]+)$/);
  if (match) {
    formulaBarValue.value = val.substring(0, val.length - match[1].length) + suggestion + '(';
  } else {
    formulaBarValue.value = val + suggestion + '(';
  }
  showSuggestions.value = false;
  // Focus back on formula bar
  nextTick(() => {
    const input = document.querySelector('.formula-bar-input') as HTMLInputElement;
    if (input) input.focus();
  });
};

// AI Command Processing

// --- AI Formula Generation Logic ---

const analyzeSpreadsheet = () => {
  const headers: string[] = [];
  const sampleData: any[][] = [];
  
  // Get headers from row 0
  for (let col = 0; col < colCount; col++) {
    const cell = props.engine.getCell({ row: 0, col });
    headers.push(cell?.rawInput || colIndexToLabel(col));
  }
  
  // Get sample data (first 10 rows after header)
  for (let row = 1; row < Math.min(11, rowCount); row++) {
    const rowData: any[] = [];
    for (let col = 0; col < colCount; col++) {
      rowData.push(props.engine.getDisplayValue({ row, col }));
    }
    sampleData.push(rowData);
  }
  
  return { headers, sampleData, rowCount, colCount };
};

const onAIInputEnter = async () => {
    if (!formulaBarValue.value.trim() || isProcessingAI.value) return;
    await generateAIFormula(formulaBarValue.value.trim());
};

const generateAIFormula = async (userRequest: string) => {
  isProcessingAI.value = true;
  
  try {
    // 1. Analyze spreadsheet structure
    const analysis = analyzeSpreadsheet();
    
    // 2. Call AI endpoint
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/ai/generate-formula`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        request: userRequest,
        spreadsheetData: analysis,
        model: selectedAIModel.value,
        autoExecute: props.autoExecuteMode
      })
    });
    
    if (!response.ok) throw new Error('Failed to generate formula');
    
    const result = await response.json();
    
    // 3. Handle ambiguity
    if (result.ambiguous) {
      const clarified = await showAmbiguityDialog(result.clarificationNeeded, result.options);
      if (!clarified) {
          // User cancelled
          return;
      }
      return; // The dialog callback re-triggers generation
    }
    
    // 4. Check if modifying existing data
    if (result.willModifyExistingData && !props.autoExecuteMode) {
      const confirmed = await showDataModificationWarning(result.affectedCells);
      if (!confirmed) return;
    }
    
    // 5. Apply formula
    if (props.autoExecuteMode) {
      await applyFormulaToAll(result.formula, result.targetColumn, result.columnHeader, formulaBarValue.value);
    } else {
      await showFormulaPreview(
          result.formula, 
          result.targetColumn,
          result.columnHeader,
          result.reasoning, 
          result.exampleResult,
          formulaBarValue.value
      );
    }
  } catch (e) {
    console.error('AI Error:', e);
    toast.error('Failed to generate formula');
  } finally {
    isProcessingAI.value = false;
  }
};

const showFormulaPreview = async (
  formula: string, 
  targetColumn: number,
  columnHeader: string,
  reasoning: string,
  exampleResult: any,
  userRequest: string
) => {
  showFormulaPreviewModal.value = true;
  formulaPreviewData.value = {
    formula,
    targetColumn,
    columnHeader,
    reasoning,
    exampleResult,
    exampleCell: `${colIndexToLabel(targetColumn)}2`, // First data row
    userRequest
  };
};

const applyFormulaToAll = async (formula: string, targetColumn: number, columnHeader?: string, userRequest?: string) => {
  props.engine.beginBatch();
  
  // Set column header if provided
  if (columnHeader) {
    await props.engine.setValue({ row: 0, col: targetColumn }, columnHeader);
  }
  
  // Apply formula to all data rows (skip header row 0)
  // Determine if it's a relative formula that needs row number adjustment
  // For simplicity, we assume the AI gives a formula for the first data row (row 2, index 1)
  // and we might need to increment row numbers if it contains relative references.
  // HOWEVER, for now, we will rely on the AI generating a formula that works for the first row,
  // and sophisticated relative adjustment logic is complex without a full parser re-builder.
  // A simple regex replacer for the row number might work for simple cases.
  
  // Actually, a better approach for "apply to column" is what Excel does:
  // The formula for row N uses references relative to row N.
  
  // Let's implement a basic row-shifter
  const shiftFormulaRow = (form: string, targetRowIndex: number, baseRowIndex: number) => {
      // Find row references (e.g. A2, B10) that are NOT absolute (no $ before number)
      // This regex is tricky. 
      // Simplified: Just replace the specific row number of the base row.
      // E.g. if base is row 2 (index 1), and formula has "A2", and we want row 3, we replace 2 with 3.
      // This is risky if the number 2 appears elsewhere (e.g. inside a string or as a constant).
      // But for a prototype, let's look for cell references.
      
      // Better regex: Look for [A-Z]+[0-9]+
      return form.replace(/([A-Z]+)(\$?)(\d+)/g, (match, col, dollar, rowNum) => {
          if (dollar) return match; // Absolute row reference, don't change
          const row = parseInt(rowNum);
          const diff = row - (baseRowIndex + 1); // logic is 1-based
          const newRow = (targetRowIndex + 1) + diff;
          return `${col}${newRow}`;
      });
  };

  for (let row = 1; row < rowCount; row++) {
      // Check if we should stop? Maybe stop at last meaningful data row?
      // For now, let's just go up to the visible range or a hard limit, 
      // OR maybe analyze where data ends.
      // Let's assume we fill down as far as column A has data.
      const colACell = props.engine.getCell({row, col: 0});
      if ((!colACell || !colACell.value) && row > 100) break; // formatting break
      
      const adjustedFormula = shiftFormulaRow(formula, row, 1);
      await props.engine.setValue({ row, col: targetColumn }, adjustedFormula);
  }
  
  props.engine.endBatch();
  showFormulaPreviewModal.value = false;
  
  // Save the Excel formula to query history (not the natural language request)
  // This way users see the actual formula they can reuse
  if (formula && columnHeader) {
    const formulaWithContext = `${columnHeader}: ${formula}`;
    emit('save-query', formulaWithContext, 'formula');
  }
  
  toast.success('Formula applied to all rows');
};

const showAmbiguityDialog = async (
  clarificationNeeded: string,
  options: string[]
) => {
  return new Promise<boolean>((resolve) => {
    showAmbiguityModal.value = true;
    ambiguityData.value = {
      question: clarificationNeeded,
      options,
      onSelect: (selectedOption: string) => {
        showAmbiguityModal.value = false;
        // Re-run with clarification
        generateAIFormula(`${formulaBarValue.value}. ${selectedOption}`);
        resolve(true);
      },
      onCancel: () => {
        showAmbiguityModal.value = false;
        resolve(false);
      }
    };
  });
};

const showDataModificationWarning = async (affectedCells: string) => {
  return new Promise<boolean>((resolve) => {
    showModificationWarningModal.value = true;
    modificationWarningData.value = {
      affectedCells,
      onConfirm: () => {
        showModificationWarningModal.value = false;
        resolve(true);
      },
      onCancel: () => {
        showModificationWarningModal.value = false;
        resolve(false);
      }
    };
  });
};

// --- Formula Error Analysis ---

const hasFormulaError = (row: number, col: number): boolean => {
  const cell = props.engine.getCell({ row, col });
  if (!cell?.rawInput?.startsWith('=')) return false;
  
  const value = props.engine.getDisplayValue({ row, col });
  
  // Check for error values
  if (value === '#ERROR!' || value === '#REF!' || value === '#DIV/0!' || value === '#VALUE!') {
    return true;
  }
  return false;
};

const analyzeFormulaError = async (row: number, col: number) => {
  const cell = props.engine.getCell({ row, col });
  if (!cell?.rawInput) return;
  
  isAnalyzingFormula.value = true;
  
  try {
    // Get context
    const context = {
      formula: cell.rawInput,
      result: props.engine.getDisplayValue({ row, col }),
      cellPosition: `${colIndexToLabel(col)}${row + 1}`,
      rowData: props.engine.getRowData(row),
      headers: analyzeSpreadsheet().headers,
      sampleData: analyzeSpreadsheet().sampleData
    };
    
    // Call AI endpoint
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/ai/analyze-formula-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        context,
        model: selectedAIModel.value
      })
    });
    
    const { explanation, suggestedFix } = await response.json();
    
    // Show popover
    // Calculate simple position (centered on screen for now or use mouse event if available)
    // For simplicity, let's just center it or use a fixed position relative to grid
    // Ideally we'd use floating-ui but that's overkill for now.
    // Let's position it near the mouse click if we had the event.
    // We can just center it for now.
    popoverPosition.value = { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 100 };
    
    showFormulaErrorPopover.value = true;
    formulaErrorData.value = { explanation, suggestedFix, row, col };
    
  } catch (e) {
      console.error(e);
      toast.error('Failed to analyze error');
  } finally {
    isAnalyzingFormula.value = false;
  }
};

const applyFormulaFix = async () => {
    if (!formulaErrorData.value) return;
    const { row, col, suggestedFix } = formulaErrorData.value;
    await props.engine.setValue({ row, col }, suggestedFix);
    showFormulaErrorPopover.value = false;
    toast.success('Fix applied');
};

// --- Keyboard Navigation ---
const moveSelection = (direction: 'up' | 'down' | 'left' | 'right') => {
  if (!selection.value) return;
  
  let { row, col } = selection.value;
  
  switch (direction) {
    case 'up': row = Math.max(0, row - 1); break;
    case 'down': row = Math.min(rowCount - 1, row + 1); break;
    case 'left': col = Math.max(0, col - 1); break;
    case 'right': col = Math.min(colCount - 1, col + 1); break;
  }
  
  selection.value = { row, col };
  rangeSelection.value = { start: { row, col }, end: { row, col } };
  formulaBarValue.value = currentCellRawValue.value;
};

const extendSelection = (direction: 'up' | 'down' | 'left' | 'right') => {
  if (!selection.value || !rangeSelection.value) return;
  
  let { row, col } = rangeSelection.value.end;
  
  switch (direction) {
    case 'up': row = Math.max(0, row - 1); break;
    case 'down': row = Math.min(rowCount - 1, row + 1); break;
    case 'left': col = Math.max(0, col - 1); break;
    case 'right': col = Math.min(colCount - 1, col + 1); break;
  }
  
  rangeSelection.value = { ...rangeSelection.value, end: { row, col } };
};

// Clipboard operations
const clipboardData = ref<string[][] | null>(null);

const getSelectedRange = () => {
  if (!rangeSelection.value) return null;
  const { start, end } = rangeSelection.value;
  return {
    minRow: Math.min(start.row, end.row),
    maxRow: Math.max(start.row, end.row),
    minCol: Math.min(start.col, end.col),
    maxCol: Math.max(start.col, end.col)
  };
};

const handleCopy = async () => {
  const range = getSelectedRange();
  if (!range) return;
  
  const data: string[][] = [];
  for (let row = range.minRow; row <= range.maxRow; row++) {
    const rowData: string[] = [];
    for (let col = range.minCol; col <= range.maxCol; col++) {
      const cell = props.engine.getCell({ row, col });
      rowData.push(cell?.rawInput || '');
    }
    data.push(rowData);
  }
  
  clipboardData.value = data;
  
  // Also copy to system clipboard as TSV
  const tsv = data.map(row => row.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
  } catch (e) {
    console.error('Failed to copy to clipboard:', e);
  }
};

const handleCut = async () => {
  await handleCopy();
  await handleDelete();
};


const handleDelete = async () => {
  const range = getSelectedRange();
  if (!range) return;
  
  // Only delete cells with content (skip empty cells)
  let clearedCount = 0;
  props.engine.beginBatch();
  
  for (let row = range.minRow; row <= range.maxRow; row++) {
    for (let col = range.minCol; col <= range.maxCol; col++) {
      const cell = props.engine.getCell({ row, col });
      // Only clear cells that have content (non-empty value)
      if (cell && cell.value !== null && cell.value !== undefined && cell.value !== '') {
        // Use silent=false so change is tracked (user requested treat all rows same)
        await props.engine.setValue({ row, col }, '', false);
        clearedCount++;
      }
    }
  }
  
  props.engine.endBatch();
  props.engine.notifyChange();
  
  if (clearedCount > 0) {
    toast.success(`Cleared ${clearedCount} cell(s)`);
  } else {
    toast.info('No cells with content to clear');
  }
};

const handlePaste = async () => {
  if (!selection.value || !clipboardData.value) return;
  
  const startRow = selection.value.row;
  const startCol = selection.value.col;
  
  for (let r = 0; r < clipboardData.value.length; r++) {
    const rowData = clipboardData.value[r];
    if (!rowData) continue;
    
    for (let c = 0; c < rowData.length; c++) {
      const targetRow = startRow + r;
      const targetCol = startCol + c;
      const value = rowData[c];
      
      if (targetRow < rowCount && targetCol < colCount && value !== undefined) {
        await props.engine.setValue(
          { row: targetRow, col: targetCol },
          value
        );
      }
    }
  }
};

// Handle Double Click to open notes if they exist
const handleCellDblClick = (row: number, col: number, e: MouseEvent) => {
    const key = `${row},${col}`;
    if (props.engine.hasNotes(key)) {
        activeNoteCell.value = { row, col };
        activeNotePos.value = { x: e.clientX, y: e.clientY };
        return; // specific handling prevents edit mode?
    }
    // allow default edit behavior otherwise
    startEditing(row, col);
};

const onKeyDown = async (e: KeyboardEvent) => {
  if (editingCell.value) {
    if (e.key === 'Enter') {
      e.preventDefault();
      await commitEdit();
      moveSelection('down');
    } else if (e.key === 'Escape') {
      editingCell.value = null;
      formulaBarValue.value = currentCellRawValue.value;
    }
    return;
  }
  
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
  
  // Undo (Ctrl/Cmd+Z)
  if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (props.engine.canUndo()) {
      props.engine.undo();
      toast.success('Undo');
    }
    return;
  }
  
  // Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)
  if (cmdOrCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    if (props.engine.canRedo()) {
      props.engine.redo();
      toast.success('Redo');
    }
    return;
  }

  // Find (Ctrl/Cmd+F)
  if (cmdOrCtrl && e.key === 'f') {
      e.preventDefault();
      showFindDialog.value = true;
      return;
  }

  
  // Select All (Ctrl/Cmd+A)
  if (cmdOrCtrl && e.key === 'a') {
    e.preventDefault();
    if (selection.value) {
      rangeSelection.value = {
        start: { row: 0, col: 0 },
        end: { row: rowCount - 1, col: colCount - 1 }
      };
    }
    return;
  }
  
  // Copy (Ctrl/Cmd+C)
  if (cmdOrCtrl && e.key === 'c') {
    e.preventDefault();
    await handleCopy();
    return;
  }
  
  // Cut (Ctrl/Cmd+X)
  if (cmdOrCtrl && e.key === 'x') {
    e.preventDefault();
    await handleCut();
    return;
  }
  
  // Paste (Ctrl/Cmd+V)
  if (cmdOrCtrl && e.key === 'v') {
    e.preventDefault();
    await handlePaste();
    return;
  }
  
  // Navigation with Shift for selection extension
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const dirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right'
    };
    const direction = dirMap[e.key];
    if (direction) {
      if (e.shiftKey) {
        extendSelection(direction);
      } else {
        moveSelection(direction);
      }
    }
  } else if (e.key === 'Enter' && selection.value) {
    e.preventDefault();
    startEditing(selection.value.row, selection.value.col);
  } else if (e.key === 'F2' && selection.value) {
    e.preventDefault();
    startEditing(selection.value.row, selection.value.col);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    // Prioritize explicit column/row selection over generic range selection
    if (selectedColumn.value !== null) {
      deleteSelectedColumn();
    } else if (selectedRow.value !== null) {
      deleteSelectedRow();
    } else if (rangeSelection.value) {
      await handleDelete();
    } else if (selection.value) {
      await handleDelete();
    }

  } else if (!cmdOrCtrl && !e.altKey && e.key.length === 1 && selection.value) {
    // Start typing - begin editing with the typed character
    e.preventDefault();
    await startEditing(selection.value.row, selection.value.col, e.key);
  }
};



// Ensure grid container gets focus on mount and click
// focusGrid provided by useGridSelection

onMounted(() => {
// Realtime sync init removed (moved to useRealtimeCursor)
  if (gridContainer.value && props.engine.viewState.scrollTop > 0) {
    gridContainer.value.scrollTop = props.engine.viewState.scrollTop;
  }
  // focusGrid called by useGridSelection logic? Wait, focusGrid is returned from useGridSelection.
  focusGrid();
});

// Cleanup
onUnmounted(() => {
  document.removeEventListener('mousemove', onGlobalMouseMove);
  document.removeEventListener('mouseup', onGlobalMouseUp);
  document.removeEventListener('mousemove', onFillHandleMouseMove);
});
</script>

<template>
  <div 
    class="flex flex-col w-full h-full bg-background transition-colors duration-300" 
    :class="{ 'border-4 border-dashed border-amber-500/50 rounded-lg p-1': privateMode }"
    @contextmenu.prevent="onContextMenu"
  >
    <!-- Simple Text Input (Default - No Experimental Access) -->
    <div v-if="!showManualFormulaFeatures" class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
      <div class="w-12 text-xs font-semibold text-muted-foreground text-center tabular-nums">
        {{ selectedCellLabel || 'A1' }}
      </div>
      
      <!-- Provider Badge -->
      <ProviderBadge 
        v-if="props.engine.sourceProvider" 
        :provider="props.engine.sourceProvider" 
      />
      
      <div class="flex-1">
        <input
          v-model="formulaBarValue"
          @input="onFormulaBarChange"
          @keydown="onFormulaBarKeydown"
          class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Enter value..."
        />
      </div>
    </div>

    <!-- Full Formula Bar (Experimental Feature) -->
    <div v-else class="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
      
      <!-- AI Mode Controls -->
      <div v-if="props.isAIMode" class="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
         <div class="relative">
             <select 
               v-model="selectedAIModel"
               class="h-7 text-xs border border-border rounded bg-background pl-2 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-primary w-[130px] cursor-pointer"
             >
                <option v-for="model in aiModels" :key="model.id" :value="model.id">
                  {{ model.name }}
                </option>
             </select>
             <ChevronDown class="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
         </div>
          
         <!-- Auto-Execute is now in toolbar -->
          
          <div class="w-px h-4 bg-border mx-1"></div>
      </div>

      <div class="w-12 text-xs font-semibold text-muted-foreground text-center tabular-nums">
        {{ selectedCellLabel || 'A1' }}
      </div>
      
      <!-- Provider Badge -->
      <ProviderBadge 
        v-if="props.engine.sourceProvider" 
        :provider="props.engine.sourceProvider" 
      />
      
      <div class="flex-1 relative">
        <input
          v-if="!props.isAIMode"
          v-model="formulaBarValue"
          @input="onFormulaBarChange"
          @keydown="onFormulaBarKeydown"
          class="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono formula-bar-input"
          placeholder="Enter formula or value..."
        />
        <input
          v-else
          v-model="formulaBarValue"
          @keydown.enter="onAIInputEnter"
          :disabled="isProcessingAI"
          class="w-full px-2 py-1 pr-8 text-sm border border-primary/50 rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 placeholder:text-primary/40"
          :placeholder="formulaBarPlaceholder"
        />
        
        <!-- Loading spinner for AI mode -->
        <div v-if="isProcessingAI" class="absolute right-2 top-1/2 -translate-y-1/2">
          <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        
        <!-- Autocomplete Dropdown -->
        <div 
          v-if="showSuggestions && showManualFormulaFeatures" 
          class="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-50 py-1"
        >
          <div
            v-for="(suggestion, index) in formulaSuggestions"
            :key="suggestion"
            @click="insertSuggestion(suggestion)"
            class="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors"
            :class="{ 'bg-accent': index === selectedSuggestionIndex }"
          >
            <span class="font-mono font-semibold">{{ suggestion }}</span>
            <span class="text-xs text-muted-foreground ml-2">()</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Toolbar -->
    <div class="flex items-center gap-1 px-3 py-1 border-b border-border bg-muted/30">
        <button class="w-8 h-8 flex items-center justify-center rounded hover:bg-accent font-bold text-foreground" @click="toggleStyle('bold')" title="Bold">B</button>
        <button class="w-8 h-8 flex items-center justify-center rounded hover:bg-accent italic text-foreground" @click="toggleStyle('italic')" title="Italic">I</button>
        <button class="w-8 h-8 flex items-center justify-center rounded hover:bg-accent underline text-foreground" @click="toggleStyle('underline')" title="Underline">U</button>
        <div class="w-px h-4 bg-border mx-2"></div>
        <div class="flex items-center gap-1" title="Text Color">
            <span class="text-xs text-muted-foreground">A</span>
            <input type="color" class="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent" @input="(e) => toggleStyle('color', (e.target as HTMLInputElement).value)" />
        </div>
        <div class="flex items-center gap-1" title="Background Color">
            <span class="text-xs text-muted-foreground bg-accent px-1 rounded">Bg</span>
            <input type="color" class="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent" @input="(e) => toggleStyle('background', (e.target as HTMLInputElement).value)" />
        </div>
    </div>

    <!-- Header Container (Static vertical, syncs horizontal) -->
    <div 
      ref="headerContainer"
      class="overflow-hidden border-b border-border bg-muted z-10 flex-none"
    >
      <table class="border-collapse table-fixed bg-background">
        <thead class="bg-muted text-xs font-semibold text-muted-foreground" style="height: 24px;">
          <tr>
            <th class="w-10 border-r border-border bg-muted/80 z-20 sticky left-0 text-[10px] text-center"></th>
            <th
              v-for="col in colCount"
              :key="col"
              class="border-r border-border px-1 select-none relative group transition-colors hover:bg-muted/80 cursor-pointer"
              :class="{ 'bg-primary/20 text-primary font-bold': isColumnSelected(col - 1) }"
              :style="{ width: `${colWidth}px`, minWidth: `${colWidth}px`, maxWidth: `${colWidth}px` }"
              @click="selectColumn(col - 1, $event)"
              :data-col="col - 1"
            >
              {{ colIndexToLabel(col - 1) }}
              <div class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </th>
          </tr>
        </thead>
      </table>
    </div>

    <!-- Grid Body -->
    <div 
      class="flex-1 overflow-auto relative select-none outline-none"
      ref="gridContainer"
      @scroll="onScroll"
      @keydown="onKeyDown"
      @click="focusGrid"
      tabindex="0"
    >
      <!-- Phantom spacer to set scroll height -->
      <div :style="{ height: `${rowCount * rowHeight}px`, width: `${colCount * colWidth}px` }"></div>
      
      <!-- Live Cursors Overlay -->
      <PresenceOverlay 
        :engine="engine" 
        :row-height="rowHeight" 
        :col-width="colWidth"
        :offset-x="40"
        :trigger="renderKey"
        @follow-user="handleFollowUser"
      />
      
      <!-- Follow Status Badge -->
      <div 
        v-if="followedUserId"
        class="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 cursor-pointer hover:bg-primary/90"
        @click="stopFollowing"
      >
        <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
        <span class="text-sm font-medium">Following {{ props.engine.presence.get(followedUserId)?.userName || 'User' }}</span>
        <X class="w-4 h-4 ml-1" />
      </div>

      <!-- Virtualized Table Body -->
      <table 
        class="border-collapse table-fixed bg-background absolute top-0 left-0"
        :style="{ transform: `translateY(${virtualState.startRow * rowHeight}px)` }"
      >
        <tbody>
          <tr
            v-for="rowOffset in visibleRows"
            :key="virtualState.startRow + rowOffset"
            class="h-6"
            :style="{ height: `${rowHeight}px` }"
          >
            <!-- Row Header -->
            <td 
              class="w-10 border-r border-b border-border bg-muted text-[10px] text-center text-muted-foreground select-none sticky left-0 z-10 cursor-pointer hover:bg-muted/80"
              :class="{ 'bg-primary/20 text-primary font-bold': isRowSelected(virtualState.startRow + rowOffset) }"
              @click="selectRow(virtualState.startRow + rowOffset, $event)"
              :data-row="virtualState.startRow + rowOffset"
            >
              {{ virtualState.startRow + rowOffset + 1 }}
            </td>
            
            <!-- Cells -->
            <td
              v-for="col in colCount"
              :key="col"
              class="border-r border-b border-border px-1 text-xs relative cursor-cell whitespace-nowrap overflow-hidden"
              :style="{ 
                width: `${colWidth}px`, 
                minWidth: `${colWidth}px`, 
                maxWidth: `${colWidth}px`,
                ...getCellStyle(virtualState.startRow + rowOffset, col - 1)
              }"
              :data-row="virtualState.startRow + rowOffset"
              :data-col="col - 1"
              :class="{
                'bg-blue-50/50 dark:bg-blue-900/10': isColumnSelected(col - 1) && !isInSelection(virtualState.startRow + rowOffset, col - 1),
                'ring-2 ring-primary ring-inset z-10 bg-background': selection?.row === (virtualState.startRow + rowOffset) && selection?.col === col - 1 && !editingCell,
                'bg-primary/15': isInSelection(virtualState.startRow + rowOffset, col - 1),
                'border-r-2 border-r-primary': fillRange && col - 1 === fillRange.end.col && virtualState.startRow + rowOffset >= fillRange.start.row && virtualState.startRow + rowOffset <= fillRange.end.row,
                'border-l-2 border-l-primary': fillRange && col - 1 === fillRange.start.col && virtualState.startRow + rowOffset >= fillRange.start.row && virtualState.startRow + rowOffset <= fillRange.end.row,
                'border-t-2 border-t-primary': fillRange && virtualState.startRow + rowOffset === fillRange.start.row && col - 1 >= fillRange.start.col && col - 1 <= fillRange.end.col,
                'border-b-2 border-b-primary': fillRange && virtualState.startRow + rowOffset === fillRange.end.row && col - 1 >= fillRange.start.col && col - 1 <= fillRange.end.col,
                [getReferenceColorClass(virtualState.startRow + rowOffset, col - 1)]: true,
                'text-foreground': true
              }"
              @mousedown="(e) => onMouseDown(virtualState.startRow + rowOffset, col - 1, e)"
              @mouseover="onMouseEnter(virtualState.startRow + rowOffset, col - 1)"
              @dblclick="(e) => handleCellDblClick(virtualState.startRow + rowOffset, col - 1, e)"
            >
              <!-- Editing Input -->
              <input
                v-if="editingCell?.row === (virtualState.startRow + rowOffset) && editingCell?.col === col - 1"
                ref="inputRef"
                v-model="formulaBarValue"
                @blur="onCellBlur"
                @keydown.enter.prevent="commitEdit(); moveSelection('down')"
                @keydown.tab.prevent="commitEdit(); moveSelection('right')"
                @keydown="handleInputKeydown"
                class="absolute inset-0 w-full h-full px-1 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary z-20 text-foreground"
              />
              <!-- Display Value -->
              <span v-else class="pointer-events-none">{{ getDisplayValue(virtualState.startRow + rowOffset, col - 1) }}</span>

              <!-- Note Indicator -->
              <div 
                v-if="props.engine.hasNotes(`${virtualState.startRow + rowOffset},${col - 1}`)" 
                class="absolute top-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-t-[6px] border-t-amber-500 pointer-events-none"
              ></div>

              <!-- Fill Handle (only on active cell) -->
              <div
                v-if="selection?.row === (virtualState.startRow + rowOffset) && selection?.col === col - 1 && !editingCell && !isFillDragging"
                class="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-primary border border-background cursor-crosshair z-20"
                @mousedown.stop="startFillDrag"
              ></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Find Dialog -->
    <FindDialog 
      v-if="showFindDialog"
      :is-visible="showFindDialog"
      :search-engine="searchEngine"
      @close="showFindDialog = false"
      @select-match="onMatchSelected"
    />

    <!-- Formula Preview Modal -->
    <div 
      v-if="showFormulaPreviewModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      @click.self="showFormulaPreviewModal = false"
    >
      <div class="w-full max-w-2xl bg-popover border border-border rounded-lg shadow-xl p-6">
        <div class="flex items-start gap-3 mb-4">
          <Sparkles class="w-6 h-6 text-primary flex-shrink-0 mt-1" />
          <div class="flex-1">
            <h2 class="text-lg font-semibold mb-1">Formula Preview</h2>
            <p class="text-sm text-muted-foreground">
              Review the generated formula before applying to all rows
            </p>
          </div>
          <button @click="showFormulaPreviewModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        
        <!-- AI Reasoning -->
        <div class="mb-4 p-3 bg-muted/50 rounded-md">
          <p class="text-sm font-medium mb-1">AI Analysis:</p>
          <p class="text-sm text-muted-foreground">
            {{ formulaPreviewData.reasoning }}
          </p>
        </div>
        
        <!-- Generated Formula -->
        <div class="mb-4">
          <p class="text-sm font-medium mb-2">Generated Formula:</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-sm bg-background border border-border p-3 rounded font-mono">
              {{ formulaPreviewData.formula }}
            </code>
            <!-- Copy button could be added here -->
          </div>
        </div>
        
        <!-- Example Result -->
        <div class="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <p class="text-sm font-medium mb-2">Example (Cell {{ formulaPreviewData.exampleCell }}):</p>
          <div class="flex items-baseline gap-2">
            <span class="text-xs text-muted-foreground">Result:</span>
            <span class="text-lg font-semibold text-blue-600 dark:text-blue-400">
              {{ formulaPreviewData.exampleResult }}
            </span>
          </div>
        </div>
        
        <!-- Actions -->
        <div class="flex gap-3">
          <button 
            @click="applyFormulaToAll(formulaPreviewData.formula, formulaPreviewData.targetColumn, formulaPreviewData.columnHeader, formulaPreviewData.userRequest)"
            class="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
          >
            Apply to All Rows
          </button>
          <button 
            @click="showFormulaPreviewModal = false"
            class="px-4 py-2 border border-border rounded-md hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Ambiguity Clarification Modal -->
    <div 
      v-if="showAmbiguityModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div class="w-full max-w-md bg-popover border border-border rounded-lg shadow-xl p-6">
        <div class="flex items-start gap-3 mb-4">
          <HelpCircle class="w-6 h-6 text-orange-500 flex-shrink-0 mt-1" />
          <div class="flex-1">
            <h2 class="text-lg font-semibold mb-1">Need Clarification</h2>
            <p class="text-sm text-muted-foreground">
              {{ ambiguityData.question }}
            </p>
          </div>
        </div>
        
        <div class="space-y-2 mb-4">
          <button
            v-for="option in ambiguityData.options"
            :key="option"
            @click="ambiguityData.onSelect(option)"
            class="w-full px-4 py-3 text-left border border-border rounded-md hover:bg-accent transition-colors"
          >
            <p class="text-sm">{{ option }}</p>
          </button>
        </div>
        
        <button 
          @click="ambiguityData.onCancel"
          class="w-full px-4 py-2 border border-border rounded-md hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Data Modification Warning Modal -->
    <div 
      v-if="showModificationWarningModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div class="w-full max-w-md bg-popover border border-border rounded-lg shadow-xl p-6">
        <div class="flex items-start gap-3 mb-4">
          <AlertTriangle class="w-6 h-6 text-orange-500 flex-shrink-0 mt-1" />
          <div class="flex-1">
            <h2 class="text-lg font-semibold mb-1">Modify Existing Data?</h2>
            <p class="text-sm text-muted-foreground">
              This operation will modify existing cells in your spreadsheet.
            </p>
          </div>
        </div>
        
        <div class="mb-4 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md">
          <p class="text-sm font-medium mb-1">Affected cells:</p>
          <p class="text-sm text-muted-foreground">
            {{ modificationWarningData.affectedCells }}
          </p>
        </div>
        
        <div class="flex gap-3">
          <button 
            @click="modificationWarningData.onConfirm"
            class="flex-1 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium"
          >
            Continue
          </button>
          <button 
            @click="modificationWarningData.onCancel"
            class="px-4 py-2 border border-border rounded-md hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Formula Error Analysis Popover -->
    <div 
      v-if="showFormulaErrorPopover"
      class="absolute z-50 w-96 bg-popover border border-border rounded-lg shadow-xl p-4"
      :style="{ top: `${popoverPosition.y}px`, left: `${popoverPosition.x}px` }"
    >
      <div class="flex items-start gap-2 mb-3">
        <AlertCircle class="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
        <div class="flex-1">
          <h3 class="font-semibold text-sm mb-1">Formula Issue Detected</h3>
          <p class="text-xs text-muted-foreground">
            Cell: {{ formulaErrorData.cellPosition }}
          </p>
        </div>
        <button @click="showFormulaErrorPopover = false">
          <X class="w-4 h-4" />
        </button>
      </div>
      
      <div class="space-y-3">
        <div>
          <p class="text-sm font-medium mb-1">Explanation:</p>
          <p class="text-sm text-muted-foreground">
            {{ formulaErrorData.explanation }}
          </p>
        </div>
        
        <div v-if="formulaErrorData.suggestedFix">
          <p class="text-sm font-medium mb-1">Suggested Fix:</p>
          <code class="block text-xs bg-muted p-2 rounded font-mono">
            {{ formulaErrorData.suggestedFix }}
          </code>
        </div>
        
        <div class="flex gap-2">
          <button 
            @click="applyFormulaFix"
            class="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Apply Fix
          </button>
          <button 
            @click="showFormulaErrorPopover = false"
            class="px-3 py-1.5 text-sm border rounded hover:bg-accent"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>

  </div>
  
  <ContextMenu
    :visible="showContextMenu"
    :x="contextMenuPos.x"
    :y="contextMenuPos.y"
    :options="contextMenuOptions"
    @close="showContextMenu = false"
    @select="handleContextMenuAction"
  />
    
    <!-- Note Popover -->
    <div 
      v-if="activeNoteCell"
      class="fixed z-50 transform translate-x-2 -translate-y-4"
      :style="{ top: `${activeNotePos.y}px`, left: `${activeNotePos.x}px` }"
    >
        <NoteThread 
            :notes="engine.getNotes(activeNoteKey!)"
            :title="`Notes on ${activeNoteLabel}`"
            @add="(content) => handleAddNote(activeNoteKey!, content)"
            @resolve="(id, resolved) => engine.resolveNote(activeNoteKey!, id, resolved)"
            @delete="(id) => engine.deleteNote(activeNoteKey!, id)"
            @close="closeNotePopover"
        />
    </div>
</template>
```
