<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted } from 'vue';
import { useDataStudioAI } from '../../../composables/useDataStudioAI';
import { inferColumnTypes } from '../../../lib/TypeInference';
import { 
  Database, 
  Grid, 
  Search, 
  Sparkles, 
  History, 
  Check, 
  X, 
  ArrowRight,
  User,
  Hash,
  Type,
  Calendar,
  MoreVertical,
  ChevronRight,
  ArrowUp,
  ArrowDown
} from 'lucide-vue-next';

// --- State ---
const props = defineProps<{
  aiCommand: string
  viewId?: string
  isExcelSource?: boolean
  isSavedView?: boolean
  isCompact?: boolean
  engine?: any
  loading?: boolean
}>();

const emit = defineEmits<{
  'update:stagedCount': [count: number]
  'update:isSavedView': [value: boolean]
  'update:isAIProcessing': [value: boolean]
  'save': [payload: { name: string, data: any }]
}>();

const viewMode = ref<'db' | 'spreadsheet'>('db'); // Defaulting to professional view
const isSavedView = ref(props.isSavedView || false);
const isExcelSource = ref(props.isExcelSource || false); // Simulating an excel upload
const showStaging = ref(true);
const searchQuery = ref('');
const stagedChanges = ref<any[]>([]);
const editingCell = ref<{ rowId: number, col: string } | null>(null);
const editValue = ref('');
const isAIProcessing = ref(false);
const mockData = ref([
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', status: 'active', last_login: '2024-02-25' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user', status: 'pending', last_login: '2024-02-20' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user', status: 'active', last_login: '2024-02-26' },
  { id: 4, name: 'Diana Prince', email: 'diana@example.com', role: 'moderator', status: 'active', last_login: '2024-02-24' },
  { id: 5, name: 'Edward Elric', email: 'ed@example.com', role: 'user', status: 'active', last_login: '2024-01-15' },
]);

const originalMockData = [...mockData.value]; // For clearing filters
const { executeDataStudioCommand } = useDataStudioAI();

// --- Engine Integration ---
const isRealData = computed(() => !!props.engine && (props.engine.sourceTable || props.engine.getNonEmptyRowCount() > 0 || (props.engine.columnNames && props.engine.columnNames.length > 0)));

const displayDataRaw = shallowRef<any[]>([]);
const displayData = ref<any[]>([]);
const currentHeaders = ref<any[]>([]);
const sortState = ref<{ col: string | null, direction: 'asc' | 'desc' }>({ col: null, direction: 'asc' });
const containerRef = ref<HTMLElement | null>(null);

// Virtual Scrolling State
const scrollTop = ref(0);
const viewportHeight = ref(800);
const topSpacerHeight = ref(0);
const bottomSpacerHeight = ref(0);
const rowHeight = computed(() => props.isCompact ? 28 : 45); // Extracted approximate heights

// Pagination State
const currentPage = ref(1);
const pageSize = ref(100);
const hasMorePages = ref(true);
const isServerPaginated = computed(() => !!props.engine?.fetchPageCallback);

// Debouncing tool
let syncTimer: any = null;
const debouncedSync = () => {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncDataFromEngine, 50);
};

const syncDataFromEngine = async () => {
  if (isRealData.value && props.engine) {
    const cols = props.engine.columnNames || [];
    if (isServerPaginated.value && props.engine?.fetchPageCallback) {
      try {
        isAIProcessing.value = true;
        const offset = (currentPage.value - 1) * pageSize.value;
        const { rows } = await props.engine.fetchPageCallback(
            offset, 
            pageSize.value, 
            sortState.value.col || undefined, 
            sortState.value.direction
        );
        
        hasMorePages.value = rows.length === pageSize.value;
        
        displayDataRaw.value = rows.map((r: any, idx: number) => ({
          id: r.id || r.ID || r.__id || (offset + idx + 1),
          ...r
        }));
        
        // Infer column types based on the first page of data
        if (cols.length > 0) {
           currentHeaders.value = inferColumnTypes(cols, displayDataRaw.value);
        } else {
           currentHeaders.value = [
             { name: 'id', type: 'int', icon: Hash },
             { name: 'name', type: 'string', icon: Type },
             { name: 'email', type: 'string', icon: Type },
             { name: 'role', type: 'enum', icon: User },
             { name: 'status', type: 'status', icon: Check },
             { name: 'last_login', type: 'date', icon: Calendar }
           ];
        }
        
        scrollTop.value = 0;
        if (containerRef.value) containerRef.value.scrollTop = 0;
        updateVisibleRows();
      } catch (e) {
        console.error("Failed to fetch server page:", e);
      } finally {
        isAIProcessing.value = false;
      }
    } else {
      // Fallback local sorting for mock/local data
      const rows = props.engine.getAllNonEmptyRows() || [];
      let mapped = rows.map((r: any, idx: number) => ({
        id: r.id || r.ID || r.__id || (idx + 1),
        ...r
      }));
      
      // Sort logic
      if (sortState.value.col) {
        const col = sortState.value.col;
        const dir = sortState.value.direction === 'asc' ? 1 : -1;
        
        mapped.sort((a: any, b: any) => {
          const valA = a[col];
          const valB = b[col];
          
          if (valA === valB) return 0;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;
          
          // Number sorting
          if (!isNaN(valA) && !isNaN(valB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
            return (Number(valA) - Number(valB)) * dir;
          }
          
          // Date sorting heuristic
          const isDateA = valA instanceof Date || (typeof valA === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valA));
          const isDateB = valB instanceof Date || (typeof valB === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valB));
          if (isDateA && isDateB) {
            return (new Date(valA).getTime() - new Date(valB).getTime()) * dir;
          }
          
          // String sorting fallback
          return String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * dir;
        });
      }

      displayDataRaw.value = mapped;
      
      // Infer types for local data if columns exist
      if (cols.length > 0) {
         currentHeaders.value = inferColumnTypes(cols, displayDataRaw.value);
      }
      
      updateVisibleRows();
    }
  } else {
    displayDataRaw.value = [...mockData.value];
    const mockCols = Object.keys(mockData.value[0] || {});
    if (mockCols.length > 0) {
      // Mock data inference
      currentHeaders.value = inferColumnTypes(mockCols, displayDataRaw.value);
    } else {
      currentHeaders.value = [
        { name: 'id', type: 'int', icon: Hash },
        { name: 'name', type: 'string', icon: Type },
        { name: 'email', type: 'string', icon: Type },
        { name: 'role', type: 'enum', icon: User },
        { name: 'status', type: 'status', icon: Check },
        { name: 'last_login', type: 'date', icon: Calendar }
      ];
    }
    updateVisibleRows();
  }
};

const updateVisibleRows = () => {
  const overscan = 15;
  const startRow = Math.max(0, Math.floor(scrollTop.value / rowHeight.value));
  const visibleRowsCount = Math.ceil(viewportHeight.value / rowHeight.value) + (overscan * 2);
  
  const startIndex = Math.max(0, startRow - overscan);
  const endIndex = Math.min(displayDataRaw.value.length, startIndex + visibleRowsCount);
  
  displayData.value = displayDataRaw.value.slice(startIndex, endIndex);
  
  topSpacerHeight.value = startIndex * rowHeight.value;
  bottomSpacerHeight.value = Math.max(0, (displayDataRaw.value.length - endIndex) * rowHeight.value);
};

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  if (!target) return;
  
  scrollTop.value = target.scrollTop;
  viewportHeight.value = target.clientHeight;
  updateVisibleRows();
};

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    syncDataFromEngine();
  }
};

const nextPage = () => {
  if (hasMorePages.value) {
    currentPage.value++;
    syncDataFromEngine();
  }
};

// Handle window resizes
onMounted(() => {
  if (containerRef.value) {
    viewportHeight.value = containerRef.value.clientHeight;
  }
  window.addEventListener('resize', () => {
    if (containerRef.value) viewportHeight.value = containerRef.value.clientHeight;
    updateVisibleRows();
  });
});


const toggleSort = (colName: string) => {
  if (sortState.value.col === colName) {
    if (sortState.value.direction === 'asc') {
      sortState.value.direction = 'desc';
    } else {
      sortState.value.col = null;
      sortState.value.direction = 'asc';
    }
  } else {
    sortState.value.col = colName;
    sortState.value.direction = 'asc';
  }
  syncDataFromEngine();
};

// Initial sync
onMounted(() => {
  syncDataFromEngine();
});

// Watch for engine prop changes (if the entire engine instance is replaced)
watch(() => props.engine, (newEngine, oldEngine) => {
  if (newEngine !== oldEngine) {
    console.log('[DataStudio] Engine instance changed, syncing...');
    syncDataFromEngine();
  }
}, { deep: false });

// --- Methods ---
const saveView = () => {
  console.log('[DataStudio] saveView called');
  let name = "New Data View";
  try {
    const userInput = prompt("Enter a name for this Data View:", "New Data View");
    if (userInput === null) return; // User cancelled
    name = userInput || "Untitled View";
  } catch (e) {
    console.warn('[DataStudio] prompt failed, using default name');
  }
  
  emit('save', {
    name,
    data: {
      isExcelSource: isExcelSource.value,
      isSavedView: true,
      lastSave: new Date().toISOString()
    }
  });
};

const startEdit = (rowId: number, col: string, currentVal: any) => {
  editingCell.value = { rowId, col };
  editValue.value = String(currentVal);
};

const saveEdit = () => {
  if (!editingCell.value) return;
  const { rowId, col } = editingCell.value;
  const rowIdx = mockData.value.findIndex(r => r.id === rowId);
  if (rowIdx === -1) return;

  const oldVal = (mockData.value[rowIdx] as any)[col];
  const newVal = editValue.value;

  if (oldVal !== newVal) {
    // Update data locally in mockup
    (mockData.value[rowIdx] as any)[col] = newVal;

    // Add to staged changes
    const existingIdx = stagedChanges.value.findIndex(c => c.row === rowId && c.col === col);
    if (existingIdx !== -1) {
      stagedChanges.value[existingIdx].new = newVal;
    } else {
      stagedChanges.value.push({
        id: Date.now(),
        row: rowId,
        col: col,
        old: oldVal,
        new: newVal,
        type: 'update'
      });
    }
  }

  editingCell.value = null;
};

const discardChange = (id: number) => {
  const change = stagedChanges.value.find(c => c.id === id);
  if (change) {
    const rowIdx = mockData.value.findIndex(r => r.id === change.row);
    if (rowIdx !== -1) {
      (mockData.value[rowIdx] as any)[change.col] = change.old;
    }
  }
  stagedChanges.value = stagedChanges.value.filter(c => c.id !== id);
};

const commitChanges = () => {
  if (isExcelSource.value) {
    alert(`Replacing source file/data for Data View ${props.viewId || 'Transient'} with ${stagedChanges.value.length} updates...`);
  } else {
    alert(`Committing ${stagedChanges.value.length} changes to the database...`);
  }
  stagedChanges.value = [];
};

const getRowValue = (row: any, header: any) => {
  if (!row) return '';
  const colName = typeof header === 'string' ? header : (header.rawName || header.name);
  
  // Try exact match first
  if (row[colName] !== undefined) return row[colName];
  
  // Try case-insensitive fallback
  const lowerName = String(colName || '').toLowerCase();
  const foundKey = Object.keys(row).find(k => k.toLowerCase() === lowerName);
  return foundKey ? row[foundKey] : '';
};

const handleAICommand = async () => {
  const cmd = props.aiCommand?.trim();
  if (!cmd) return;
  
  if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'reset') {
    mockData.value = [...originalMockData];
    syncDataFromEngine();
    return;
  }
  
  emit('update:isAIProcessing', true);
  isAIProcessing.value = true;
  
  try {
    const columns = currentHeaders.value
      .filter((h: any) => typeof h !== 'string' && h.name !== 'id')
      .map((h: any) => typeof h === 'string' ? h : h.name);
      
    const provider = props.engine?.sourceProvider || 'pegasus';
    
    const result = await executeDataStudioCommand(cmd, '', columns, provider);
    
    if (result.action === 'complex') {
       alert("This task is too complex for the lightweight Data Studio assistant. Please open a new Chat tab to ask this question.");
    } else if (result.action === 'find') {
       const target = (result.findTarget || '').toLowerCase();
       if (target && !isRealData.value) {
          mockData.value = originalMockData.filter(r => 
            Object.values(r).some(v => String(v).toLowerCase().includes(target))
          );
       } else if (target && isRealData.value) {
          // Local filter on current viewport data for real data
          displayDataRaw.value = displayDataRaw.value.filter(r => 
            Object.values(r).some(v => String(v).toLowerCase().includes(target))
          );
       }
       updateVisibleRows();
    } else if (result.action === 'sort') {
       if (result.sortConditions && result.sortConditions.length > 0) {
          const dataToSort = isRealData.value ? displayDataRaw.value : mockData.value;
          
          dataToSort.sort((a, b) => {
             for (const cond of result.sortConditions!) {
                const valA = a[cond.column];
                const valB = b[cond.column];
                const dir = cond.direction === 'asc' ? 1 : -1;
                
                if (valA === valB) continue;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;
                
                if (!isNaN(valA) && !isNaN(valB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
                   return (Number(valA) - Number(valB)) * dir;
                }
                
                const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' }) * dir;
                if (cmp !== 0) return cmp;
             }
             return 0;
          });
          updateVisibleRows();
       }
    } else if (result.action === 'calculate') {
       if (result.calculate) {
           const newCol = result.calculate.newColumnName;
           const logicStr = result.calculate.logic.toLowerCase();
           const isAdd = logicStr.includes('add') || logicStr.includes('+') || logicStr.includes('sum');
           
           if (isAdd) {
               currentHeaders.value.push({ name: newCol, type: 'number', icon: Hash });
               
               const sourceData = isRealData.value ? displayDataRaw.value : mockData.value;
               sourceData.forEach(row => {
                  let sum = 0;
                  for (const targetCol of result.calculate!.targetColumns) {
                      const val = Number(row[targetCol]);
                      if (!isNaN(val)) sum += val;
                  }
                  row[newCol] = sum;
                  
                  stagedChanges.value.push({
                      id: Date.now() + Math.random(),
                      row: row.id,
                      col: newCol,
                      old: '',
                      new: sum,
                      type: 'create'
                  });
               });
               updateVisibleRows();
           } else {
               alert("Only basic addition calculations are supported in this lightweight mode right now. Please use the Chat tab for complex formulas.");
           }
       }
    } else if (result.action === 'update') {
       if (result.update) {
           const targetCol = result.update.targetColumn;
           const newVal = result.update.newValue;
           const condition = result.update.conditionLogic.toLowerCase();
           
           let affected = 0;
           const sourceData = isRealData.value ? displayDataRaw.value : mockData.value;
           
           sourceData.forEach(row => {
               // Fuzzy matching: if condition text contains a value present in the row
               let matchesCondition = true;
               if (condition && condition !== 'none' && condition !== 'all') {
                  matchesCondition = Object.values(row).some(v => 
                      v && typeof v === 'string' && condition.includes(String(v).toLowerCase())
                  );
               }
               
               if (matchesCondition && row[targetCol] !== newVal) {
                   const oldVal = row[targetCol];
                   row[targetCol] = newVal;
                   stagedChanges.value.push({
                      id: Date.now() + Math.random(),
                      row: row.id,
                      col: targetCol,
                      old: oldVal,
                      new: newVal,
                      type: 'update'
                   });
                   affected++;
               }
           });
           updateVisibleRows();
           if (affected === 0) alert("No rows currently in the viewport matched the update condition.");
       }
    } else if (result.action === 'format') {
       if (result.format) {
           const targetCol = result.format.targetColumn;
           const formatType = result.format.formatType;
           
           let affected = 0;
           const sourceData = isRealData.value ? displayDataRaw.value : mockData.value;
           
           sourceData.forEach(row => {
               if (row[targetCol] != null) {
                   const oldVal = row[targetCol];
                   let newVal = oldVal;
                   
                   if (typeof oldVal === 'string') {
                       if (formatType === 'uppercase') newVal = oldVal.toUpperCase();
                       else if (formatType === 'lowercase') newVal = oldVal.toLowerCase();
                       else if (formatType === 'trim') newVal = oldVal.trim();
                   }
                   
                   if (oldVal !== newVal) {
                       row[targetCol] = newVal;
                       stagedChanges.value.push({
                          id: Date.now() + Math.random(),
                          row: row.id,
                          col: targetCol,
                          old: oldVal,
                          new: newVal,
                          type: 'update'
                       });
                       affected++;
                   }
               }
           });
           updateVisibleRows();
           if (affected === 0) alert("No rows were changed by the formatting request.");
       }
    } else if (result.action === 'visibility') {
       if (result.visibility) {
           const cols = result.visibility.targetColumns.map(c => c.toLowerCase());
           const isHide = result.visibility.action === 'hide';
           
           if (isHide) {
               currentHeaders.value = currentHeaders.value.filter(h => {
                   const hName = (typeof h === 'string' ? h : h.name).toLowerCase();
                   return !cols.some(c => hName.includes(c));
               });
           } else {
               // Showing columns requires bringing them back from the original engine list
               // For simplicity in this lightweight mode, we only explicitly hide
               alert("In this lightweight mode, refresh the table to show all columns again.");
           }
       }
    } else if (result.action === 'delete') {
       if (result.delete) {
           const condition = (result.delete.conditionLogic || '').toLowerCase();
           const targetCol = result.delete.targetColumn;
           
           let affected = 0;
           const sourceData = isRealData.value ? displayDataRaw.value : mockData.value;
           
           sourceData.forEach(row => {
               let matchesCondition = true;
               if (condition && condition !== 'none' && condition !== 'all') {
                  const checkVal = targetCol ? row[targetCol] : Object.values(row).join(' ');
                  matchesCondition = checkVal && typeof checkVal === 'string' && checkVal.toLowerCase().includes(condition);
               }
               
               if (matchesCondition) {
                   stagedChanges.value.push({
                      id: Date.now() + Math.random(),
                      row: row.id,
                      col: targetCol || 'row',
                      old: 'row',
                      new: 'deleted',
                      type: 'delete'
                   });
                   affected++;
               }
           });
           updateVisibleRows();
           if (affected === 0) alert("No rows matched the deletion condition.");
       }
    } else if (result.action === 'highlight') {
       if (result.highlight) {
           const condition = (result.highlight.conditionLogic || '').toLowerCase();
           const targetCol = result.highlight.targetColumn;
           const color = result.highlight.color || 'yellow';
           
           let affected = 0;
           const sourceData = isRealData.value ? displayDataRaw.value : mockData.value;
           
           sourceData.forEach(row => {
               let matchesCondition = true;
               if (condition && condition !== 'none' && condition !== 'all') {
                  const checkVal = targetCol ? row[targetCol] : Object.values(row).join(' ');
                  if (condition.includes('>') || condition.includes('<') || condition.includes('=')) {
                      // Basic heuristic for numeric evals
                      try { matchesCondition = eval(`${checkVal} ${condition}`); } catch { matchesCondition = false; }
                  } else {
                      matchesCondition = checkVal && typeof checkVal === 'string' && checkVal.toLowerCase().includes(condition);
                  }
               }
               
               if (matchesCondition) {
                   stagedChanges.value.push({
                      id: Date.now() + Math.random(),
                      row: row.id,
                      col: targetCol || 'row',
                      old: '',
                      new: color,
                      type: 'highlight'
                   });
                   affected++;
               }
           });
           updateVisibleRows();
           if (affected === 0) alert("No rows matched the highlight condition.");
       }
    } else {
       const msg = result.reasoning || "I couldn't quite understand that command. Try rephrasing it (e.g., 'Find...', 'Sort by...') or use the Chat tab for deeper analysis.";
       alert(msg);
    }
  } catch (e) {
    console.error("AI Command Error:", e);
    alert("An error occurred executing the AI command. Please try again or use the Chat tab.");
  } finally {
    isAIProcessing.value = false;
    emit('update:isAIProcessing', false);
    emit('update:stagedCount', stagedChanges.value.length);
  }
};

// --- Lifecycle ---
onMounted(() => {
  debouncedSync();
});

// Expose methods to parent (Workspace.vue)
defineExpose({
  handleAICommand,
  saveView,
  showStaging
});

// Sync staged count to parent
watch(() => stagedChanges.value.length, (count) => {
  emit('update:stagedCount', count);
});

// Simulate loading data for a specific view
watch(() => props.viewId, async (newId) => {
    if (newId) {
        console.log(`[DataStudio] viewId changed: ${newId}`);
        scrollTop.value = 0; 
        if (containerRef.value) containerRef.value.scrollTop = 0;
        syncDataFromEngine();
    }
}, { immediate: true });
</script>

<template>
  <div class="flex h-screen bg-background text-foreground font-sans overflow-hidden">
    <!-- Main Content -->
    <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
      <!-- Loading Overlay -->
      <div v-if="loading || isAIProcessing" class="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
        <div class="flex flex-col items-center gap-4">
          <div class="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
          <span class="text-sm font-medium text-muted-foreground animate-pulse">
            {{ loading ? 'Streaming live data...' : 'Loading...' }}
          </span>
        </div>
      </div>

      <!-- Data View Container (Scrollable) -->
      <div 
        ref="containerRef"
        class="flex-1 overflow-auto bg-muted/5 custom-scrollbar relative"
        @scroll="handleScroll"
      >
        <table :class="[
          'min-w-full border-separate border-spacing-0 bg-background shadow-sm border-b overflow-hidden',
          isCompact ? 'text-[12px]' : 'text-sm'
        ]">
          <thead class="sticky top-0 z-20 bg-background shadow-sm">
            <tr class="bg-muted/10 border-b">
              <th 
                v-for="(header, hIdx) in currentHeaders" 
                :key="typeof header === 'string' ? header : header.name" 
                :class="[
                  'px-4 py-3 border-b border-r text-left transition-all',
                  isCompact ? 'py-1.5 px-2' : 'py-3 px-4',
                  hIdx === 0 ? 'sticky left-0 z-30 bg-muted/20' : ''
                ]"
              >
                <div 
                  @click="toggleSort(typeof header === 'string' ? header : header.name)"
                  class="cursor-pointer group/header select-none"
                >
                  <div v-if="typeof header === 'string'" class="text-xs font-mono text-muted-foreground flex items-center justify-center">
                    {{ header }}
                  </div>
                  <div v-else class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <component v-if="!isCompact" :is="header.icon" class="w-3.5 h-3.5 text-primary/60" />
                      <span :class="['font-semibold tracking-tight group-hover/header:text-primary transition-colors', isCompact ? 'text-[11px] uppercase opacity-70' : 'text-sm']">
                        {{ header.name }}
                      </span>
                      <ArrowUp v-if="sortState.col === header.name && sortState.direction === 'asc'" class="w-3 h-3 text-primary" />
                      <ArrowDown v-if="sortState.col === header.name && sortState.direction === 'desc'" class="w-3 h-3 text-primary" />
                    </div>
                    <span v-if="!isCompact" class="text-[10px] font-mono text-muted-foreground uppercase opacity-60">{{ header.type }}</span>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y border-r">
            <!-- Virtual Scroll Top Spacer -->
            <tr v-if="topSpacerHeight > 0" :style="{ height: `${topSpacerHeight}px` }">
              <td colspan="999" class="p-0 border-none bg-muted/5"></td>
            </tr>

            <tr v-for="row in displayData" :key="row.id" :class="[
              'transition-colors group text-foreground',
              stagedChanges.some(c => c.row === row.id && c.type === 'delete') ? 'bg-red-500/10 hover:bg-red-500/20 opacity-50 line-through' : 'hover:bg-muted/30',
              stagedChanges.some(c => c.row === row.id && c.type === 'highlight') ? 'bg-amber-500/20 hover:bg-amber-500/30' : ''
            ]">
              <td :class="[
                'px-4 py-3 text-sm font-mono text-muted-foreground bg-muted/10 w-16 text-center border-b border-r sticky left-0 z-10 transition-colors',
                isCompact ? 'py-1 px-2 text-[10px]' : 'py-3 px-4',
                stagedChanges.some(c => c.row === row.id && c.type === 'delete') ? 'bg-red-500/20 text-red-700 dark:text-red-400' : ''
              ]">
                {{ row.id }}
              </td>
              <td 
                v-for="header in (currentHeaders.filter((h: any) => typeof h !== 'string' && h.name !== 'id'))" 
                :key="typeof header === 'string' ? header : header.name"
                :class="[
                  'px-4 py-3 border-b border-r transition-all relative group/cell cursor-text',
                  isCompact ? 'py-1 px-2 text-[11px]' : 'py-3 px-4',
                  stagedChanges.some(c => c.row === row.id && c.col === (typeof header === 'string' ? header : header.name)) 
                    ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/50' 
                    : ''
                ]"
                @click="startEdit(row.id, typeof header === 'string' ? header : header.name, (row as any)[typeof header === 'string' ? header : header.name])"
              >
                <!-- Inline Editor -->
                <div v-if="editingCell?.rowId === row.id && editingCell?.col === (typeof header === 'string' ? header : header.name)" class="absolute inset-0 z-10 bg-background p-1">
                  <input 
                    v-model="editValue"
                    autoFocus
                    @blur="saveEdit"
                    @keydown.enter="saveEdit"
                    @keydown.esc="editingCell = null"
                    class="w-full h-full bg-transparent border-2 border-primary rounded px-2 outline-none text-sm text-foreground"
                  />
                </div>

                <!-- Cell Content -->
                <div v-else class="flex items-center justify-between overflow-hidden">
                  <div class="flex items-center gap-2 overflow-hidden">
                    <div v-if="(header.name || '').toLowerCase() === 'status'" :class="['w-1.5 h-1.5 rounded-full shrink-0', String(getRowValue(row, header)).toLowerCase() === 'active' ? 'bg-emerald-500' : 'bg-amber-500']"></div>
                    <span :class="[
                      'truncate',
                      (header.name || '').toLowerCase() === 'email' ? 'text-blue-500 underline decoration-blue-500/30' : '',
                      (header.name || '').toLowerCase() === 'role' ? 'px-2 py-0.5 rounded-full bg-muted border text-[11px] font-medium' : '',
                      (header.name || '').toLowerCase() === 'last_login' ? 'italic text-muted-foreground' : '',
                      isCompact ? 'leading-none' : ''
                    ]">
                      {{ getRowValue(row, header) }}
                    </span>
                  </div>
                  <ChevronRight v-if="(header.name || '').toLowerCase() === 'name'" class="w-3.5 h-3.5 opacity-0 group-hover/cell:opacity-40 transition-opacity" />
                </div>
              </td>
            </tr>

            <!-- Virtual Scroll Bottom Spacer -->
            <tr v-if="bottomSpacerHeight > 0" :style="{ height: `${bottomSpacerHeight}px` }">
              <td colspan="999" class="p-0 border-none bg-muted/5"></td>
            </tr>
          </tbody>
        </table>

      </div>
      
      <!-- Pagination Bar -->
      <div v-if="isServerPaginated" class="h-12 border-t bg-background flex items-center justify-between px-4 shrink-0 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] z-20">
        <div class="text-sm text-muted-foreground font-medium">
          Page <span class="text-foreground">{{ currentPage }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button @click="prevPage" :disabled="currentPage === 1" class="px-3 py-1.5 border rounded text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors">
            Previous
          </button>
          <button @click="nextPage" :disabled="!hasMorePages" class="px-3 py-1.5 border rounded text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors flex items-center gap-1">
            Next
            <ChevronRight class="w-3 h-3" />
          </button>
        </div>
      </div>
      
      <div 
        v-if="stagedChanges.length > 0"
        class="fixed bottom-10 left-1/2 -translate-x-1/2 flex flex-col gap-3 min-w-[450px] max-w-[650px] z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
      >
        <!-- Changes List (Drawer Content) -->
        <div 
          v-if="showStaging"
          class="bg-background/90 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-2xl p-4 max-h-[400px] overflow-hidden flex flex-col ring-1 ring-black/5"
        >
          <div class="flex items-center justify-between mb-4 px-1">
            <div class="flex items-center gap-2 font-bold text-sm tracking-tight text-foreground">
              <History class="w-4 h-4 text-primary" />
              Staged Changes ({{ stagedChanges.length }})
            </div>
            <button @click="showStaging = false" class="p-1.5 hover:bg-muted rounded-full transition-colors text-muted-foreground">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="flex-1 overflow-auto space-y-2 pr-1 custom-scrollbar pb-2">
            <div v-for="change in stagedChanges" :key="change.id" class="p-3 bg-muted/40 border border-border/40 rounded-xl space-y-2 group hover:border-primary/20 transition-all shadow-sm">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border shadow-xs text-foreground">Row {{ change.row }}</span>
                  <span class="text-[10px] font-bold uppercase tracking-widest text-primary/70">{{ change.col }}</span>
                </div>
                <button @click="discardChange(change.id)" class="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-rose-500/10 text-rose-500 transition-all">
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div class="flex items-center gap-2.5 text-xs">
                <span class="text-muted-foreground line-through opacity-40 font-medium">{{ change.old }}</span>
                <ArrowRight class="w-3 h-3 text-muted-foreground/40" />
                <span class="font-bold text-primary underline underline-offset-4 decoration-primary/30 uppercase tracking-tight text-foreground">{{ change.new }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Action Floating Bar -->
        <div class="flex items-center gap-4 px-6 py-3 bg-primary text-primary-foreground rounded-full shadow-[0_15px_30px_rgba(0,0,0,0.2)] border border-white/20 backdrop-blur-xl ring-4 ring-primary/10">
          <div class="flex items-center gap-4 pr-6 border-r border-white/20">
            <button 
              @click="showStaging = !showStaging"
              class="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all group relative shadow-inner"
              title="Review Changes"
            >
              <History :class="['w-4.5 h-4.5 transition-transform duration-500', showStaging ? 'rotate-180' : '']" />
              <span v-if="!showStaging" class="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-primary animate-bounce">
                {{ stagedChanges.length }}
              </span>
            </button>
            <div class="flex flex-col">
              <span class="text-xs font-black tracking-tight leading-none uppercase">{{ stagedChanges.length }} Changes Staged</span>
              <span class="text-[10px] opacity-80 font-medium">Ready to sync with source</span>
            </div>
          </div>
          
          <div class="flex items-center gap-2 pl-2">
            <button 
              @click="commitChanges"
              class="px-6 py-2 bg-white text-primary rounded-full text-xs font-black hover:bg-white/95 active:scale-95 transition-all flex items-center gap-2 shadow-xl shadow-black/10"
            >
              <Check class="w-4 h-4" />
              Commit Now
            </button>
            <button 
              @click="stagedChanges = []"
              class="px-4 py-2 hover:bg-white/10 rounded-full text-xs font-bold transition-all text-white/80 hover:text-white"
            >
              Discard All
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Glassmorphism & Micro-animations */
.backdrop-blur-md {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.ring-inset {
  box-shadow: inset 0 0 0 1px var(--tw-ring-color);
}

@keyframes slide-in-from-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.animate-in {
  animation-fill-mode: both;
}
</style>
