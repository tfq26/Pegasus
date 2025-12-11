<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import TabsManager from './TabsManager.vue';
import type { Tab } from './TabsManager.vue';
import { Engine } from '../TableView/Engine/Engine';
import Grid from '../TableView/Grid/Grid.vue'; 
import ChatEditor from '@/components/Chat/ChatEditor.vue';
import { toast } from 'vue-sonner';

// Props from parent (Chat.vue)
const props = defineProps<{
  mode: 'chat' | 'write' | 'spreadsheet';
  input: string;
  aiMode: boolean;
  autoExecute: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:mode', mode: 'chat' | 'write' | 'spreadsheet'): void;
  (e: 'update:input', input: string): void;
  (e: 'submit'): void;
  (e: 'save-query', query: string, type: 'formula'): void;
  (e: 'save-status', status: 'saved' | 'saving' | 'error'): void;
}>();

// --- State ---
// --- State ---
const WORKSPACE_STORAGE_KEY = 'pegasus-workspace-tabs';

// Load initial state from storage if available
const loadInitialState = () => {
  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        tabs: parsed.tabs || [{ id: '1', label: 'Query Editor', type: 'chat' }],
        activeTabId: parsed.activeTabId || '1'
      };
    }
  } catch (e) {
    console.error('Failed to load workspace state:', e);
  }
  return {
    tabs: [{ id: '1', label: 'Query Editor', type: 'chat' }],
    activeTabId: '1'
  };
};

const initialState = loadInitialState();
const tabs = ref<Tab[]>(initialState.tabs);
const activeTabId = ref<string>(initialState.activeTabId);

// Persistence watcher
watch([tabs, activeTabId], () => {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
      tabs: tabs.value,
      activeTabId: activeTabId.value
    }));
  } catch (e) {
    console.error('Failed to save workspace state:', e);
  }
}, { deep: true });

// Engine cache for spreadsheet tabs
const engineCache = new Map<string, Engine>();

// Helper to fetch schema + data
const fetchTableData = async (tableName: string, connection: any, provider: string) => {
    const baseUrl = import.meta.env.VITE_QUERY_API_URL;
    // 1. Schema
    const schemaRes = await fetch(`${baseUrl}/api/table/${tableName}/schema`, { 
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         credentials: 'include',
         body: JSON.stringify({ connection, provider })
    });
    const schemaBody = await schemaRes.json();
    if (!schemaRes.ok) throw new Error(schemaBody.error || 'Failed to load schema');
    
    // 2. Data
    const queryRes = await fetch(`${baseUrl}/api/table/${tableName}/query`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         credentials: 'include',
         body: JSON.stringify({ connection, provider, limit: 2000 })
    });
    const queryBody = await queryRes.json();
    if (!queryRes.ok) throw new Error(queryBody.error || 'Failed to load data');
    
    const rows = queryBody.rows || [];
    // Filter out internal columns
    const headers = (schemaBody.columns || [])
       .map((c: any) => c.name)
       .filter((n: string) => n !== '__id' && n !== '_rowid_');
       
    return { headers, rows };
};

// Refresh table data from database
const isRefreshing = ref(false);

const refreshTableData = async (engine: Engine) => {
  if (!engine.sourceTable || !engine.sourceConnection || !engine.sourceProvider) {
    console.warn('[Refresh] Cannot refresh - missing source info');
    return;
  }
  
  try {
    isRefreshing.value = true; // Prevent save during refresh
    console.log('[Refresh] Reloading with new API...');
    const { headers, rows } = await fetchTableData(engine.sourceTable, engine.sourceConnection, engine.sourceProvider);
    
    // Reload into Engine
    engine.beginBatch();
    engine.clear(); // Clear grid
    
    // Reload headers
    headers.forEach((header: any, colIndex: any) => {
      engine.setValue({ row: 0, col: colIndex }, header, true); // silent=true
    });
    
    // Reload data
    rows.forEach((row: any, rowIndex: number) => {
      headers.forEach((header: any, colIndex: any) => {
        const value = row[header];
        engine.setValue({ row: rowIndex + 1, col: colIndex }, String(value ?? ''), true); // silent=true
      });
    });
    
    engine.endBatch();
    
    // Update persistence
    engine.setSource(engine.sourceTable, engine.sourceConnection, headers, engine.sourceProvider);
    engine.setOriginalData(rows);
    
    console.log('[Refresh] Table data reloaded successfully');
  } catch (e) {
    console.error('[Refresh] Failed to refresh table data:', e);
    toast.error('Failed to refresh table data');
  } finally {
    isRefreshing.value = false;
  }
};

// Auto-save logic (Hybrid Strategy: Full Replacement or Delta Operations)
const saveChanges = async (engine: Engine) => {
   // Prevent save during refresh to avoid infinite loop
   if (isRefreshing.value) {
     console.log('[Save] Skipping save during refresh');
     return;
   }
   
   try {
     // 1. Determine Save Strategy
     const strategy = engine.getSaveStrategy();
     console.log(`[Save] Using strategy: ${strategy}`);
     
     let ops: any[] = [];
     
     if (strategy === 'full_replacement') {
       // Full Replacement: Get all current data and replace table
       const allRows = engine.getAllNonEmptyRows();
       console.log(`[Save] Full replacement with ${allRows.length} rows`);
       
       if (allRows.length === 0) {
         // Empty table - just delete all
         ops.push({ type: 'full_replacement', rows: [] });
       } else {
         ops.push({ type: 'full_replacement', rows: allRows });
       }
     } else {
       // Delta Operations: Only send what changed
       ops = engine.getPendingOperations();
       const deletedCols = engine.getDeletedColumns();
       
       deletedCols.forEach(col => {
         ops.push({ type: 'drop_column', column: col });
       });
       
       console.log(`[Save] Delta operations: ${ops.length} changes`);
     }
     
     if (ops.length === 0) {
         engine.saveStatus = 'saved';
         emit('save-status', 'saved');
         return;
     }
     
     console.log('[Save] Operations:', ops);
     engine.saveStatus = 'saving';
     emit('save-status', 'saving');
     
     // 2. Send Request
     const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/api/table/${engine.sourceTable}/operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            connection: engine.sourceConnection,
            provider: engine.sourceProvider,
            operations: ops
          })
     });
     
     const body = await response.json();
     
     if (!response.ok) throw new Error(body.error || 'Save failed');
     
     // 3. Cleanup
     engine.clearModifiedTracking();
     engine.saveStatus = 'saved';
     emit('save-status', 'saved');
     
     // 4. Refresh only if using delta operations
     // For full replacement, data is already in sync (we just sent everything)
     if (strategy === 'delta_operations') {
       console.log('[Save] Refreshing after delta operations');
       await refreshTableData(engine);
     } else {
       console.log('[Save] Skipping refresh after full replacement (already in sync)');
     }
     
     console.log('[Save] Success');
   } catch (e: any) {
     console.error('[Save] Failed:', e);
     engine.saveStatus = 'error';
     emit('save-status', 'error');
     toast.error(`Save failed: ${e.message}`);
   }
};

const getEngineForTab = (tabId: string) => {
  if (!engineCache.has(tabId)) {
    const engine = new Engine(
      { rowCount: 1000, colCount: 26 },
      `spreadsheet-tab-${tabId}`
    );
    
    // Auto-save listener
    let saveTimeout: ReturnType<typeof setTimeout>;
    engine.onChange(() => {
        // Set saving status immediately when change happens
        if (engine.saveStatus !== 'saving') {
             engine.saveStatus = 'saving';
             emit('save-status', 'saving');
        }
        
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveChanges(engine);
        }, 2000);
    });
    
    engineCache.set(tabId, engine);
  }
  return engineCache.get(tabId)!;
};

// --- Handlers ---
const onTabClose = (id: string) => {
  const idx = tabs.value.findIndex(t => t.id === id);
  if (idx === -1) return;
  
  tabs.value.splice(idx, 1);
  if (activeTabId.value === id) {
    activeTabId.value = tabs.value[Math.max(0, idx - 1)]?.id || '';
  }
  
  engineCache.delete(id);
};

const onAddTab = (type: Tab['type']) => {
  const newId = String(Date.now());
  const labelMap = {
    chat: 'Query Editor',
    query: 'SQL Query',
    table: 'Spreadsheet'
  };
  
  const newTab = {
    id: newId,
    label: labelMap[type] || `New ${type}`,
    type
  };
  tabs.value.push(newTab);
  activeTabId.value = newId;
  
  // Update parent mode based on tab type
  if (type === 'table') {
    emit('update:mode', 'spreadsheet');
  } else {
    emit('update:mode', type === 'query' ? 'write' : 'chat');
  }
};

// Watch active tab and update parent mode
// Watch active tab and update parent mode
watch(activeTabId, () => {
  const activeTab = tabs.value.find(t => t.id === activeTabId.value);
  if (activeTab) {
    if (activeTab.type === 'table') {
      emit('update:mode', 'spreadsheet');
    } else {
      emit('update:mode', activeTab.type === 'query' ? 'write' : 'chat');
    }
  }
}, { immediate: true });


// Format table names to hide internal UUIDs
// Converts "data_60643368_3269_4be6_921e_dff7c585cd3c_Sheet1" to "Sheet1"
const formatTableName = (tableName: string): string => {
  // UUID format: 8-4-4-4-12 hex digits with underscores replacing hyphens
  const match = tableName.match(/^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/i);
  return match && match[1] ? match[1] : tableName;
};

// Method to load table data into a new spreadsheet tab (Legacy)
const loadTableData = (tableName: string, data: any[], connection: any = null, provider: string = 'sqlite') => {
  const newId = String(Date.now());
  const newTab = {
    id: newId,
    label: formatTableName(tableName),
    type: 'table' as const
  };
  
  tabs.value.push(newTab);
  activeTabId.value = newId;
  
  const engine = getEngineForTab(newId);
  const hasData = engine.getCell({ row: 0, col: 0 }) !== null;
  
  if (!hasData && data.length > 0) {
    const headers = Object.keys(data[0]).filter(h => h !== '_rowid_' && h !== '__id');
    
    engine.beginBatch();
    headers.forEach((header, colIndex) => {
      engine.setValue({ row: 0, col: colIndex }, header);
    });
    
    data.forEach((row, rowIndex) => {
      headers.forEach((header, colIndex) => {
        const value = row[header];
        engine.setValue({ row: rowIndex + 1, col: colIndex }, String(value ?? ''));
      });
    });
    engine.endBatch();
    
    engine.setSource(tableName, connection, headers, provider);
    engine.setOriginalData(data);
  }
  
  emit('update:mode', 'spreadsheet');
};

// Robust Table Loading (New)
const openTable = async (tableName: string, connection: any, provider: string) => {
    // Check if exists
    if (findOrCreateSheetTab(tableName)) return;

    try {
        const loadingId = toast.loading(`Loading ${formatTableName(tableName)}...`);
        const baseUrl = import.meta.env.VITE_QUERY_API_URL;

        // 1. Fetch Schema
        const schemaRes = await fetch(`${baseUrl}/api/table/${tableName}/schema`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({ connection, provider })
        });
        const schemaBody = await schemaRes.json();
        if (!schemaRes.ok) throw new Error(schemaBody.error || 'Failed to load schema');

        // 2. Fetch Data
        const queryRes = await fetch(`${baseUrl}/api/table/${tableName}/query`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({ connection, provider, limit: 2000 })
        });
        const queryBody = await queryRes.json();
        if (!queryRes.ok) throw new Error(queryBody.error || 'Failed to load data');
        
        const rows = queryBody.rows || [];
        // Use schema for strict column order/visibility
        // Filter out _rowid_ from visible columns
        const headers = (schemaBody.columns || [])
           .map((c: any) => c.name)
           .filter((n: string) => n !== '_rowid_' && n !== '__id');

        // Create Tab
        const newId = String(Date.now());
        const newTab = {
            id: newId,
            label: formatTableName(tableName),
            type: 'table' as const
        };
        tabs.value.push(newTab);
        activeTabId.value = newId;

        const engine = getEngineForTab(newId);
        
        // Populate
        engine.beginBatch();
        // Sets Headers
        headers.forEach((header: string, colIndex: number) => {
             engine.setValue({ row: 0, col: colIndex }, header);
        });
        // Sets Data
        rows.forEach((row: any, rowIndex: number) => {
             headers.forEach((header: string, colIndex: number) => {
                 const value = row[header];
                 engine.setValue({ row: rowIndex + 1, col: colIndex }, String(value ?? ''));
             });
        });
        engine.endBatch();

        // Init Persistence
        engine.setSource(tableName, connection, headers, provider);
        engine.setOriginalData(rows);

        toast.dismiss(loadingId);
        emit('update:mode', 'spreadsheet');
    } catch (e: any) {
        toast.error(`Failed to open table: ${e.message}`);
        console.error(e);
    }
};

// Method to find or create sheet tab (returns true if already exists)
const findOrCreateSheetTab = (tableName: string): boolean => {
  const sheetLabel = formatTableName(tableName);
  const existingTab = tabs.value.find(t => t.label === sheetLabel && t.type === 'table');
  
  if (existingTab) {
    // Tab already exists, just switch to it
    activeTabId.value = existingTab.id;
    emit('update:mode', 'spreadsheet');
    return true;
  }
  
  return false;
};

// GridRefs to access component methods
const gridRefs = ref(new Map<string, any>());

const setGridRef = (el: any, id: string) => {
  if (el) {
    gridRefs.value.set(id, el);
  } else {
    gridRefs.value.delete(id);
  }
};

const setFormulaBarValue = (value: string) => {
  const activeGrid = gridRefs.value.get(activeTabId.value);
  if (activeGrid && activeGrid.formulaBarValue) {
    // formulaBarValue is a ref, so we need to set .value
    activeGrid.formulaBarValue.value = value;
  } else {
    console.warn('Could not set formula bar value - no active grid or formulaBarValue not found');
  }
};

const createQueryTab = (queryContent?: string) => {
  const newId = String(Date.now());
  const newTab = {
    id: newId,
    label: 'SQL Query',
    type: 'query' as const,
    data: { content: queryContent || '' }
  };
  tabs.value.push(newTab);
  activeTabId.value = newId;
  emit('update:mode', 'write');
  return newId;
};

const getActiveQueryContent = () => {
  const tab = tabs.value.find(t => t.id === activeTabId.value);
  if (tab && tab.type === 'query') {
    return tab.data?.content || '';
  }
  return '';
};

// Method to manually refresh the current table
const refreshCurrentTable = async () => {
  const activeTab = tabs.value.find(t => t.id === activeTabId.value);
  if (activeTab && activeTab.type === 'table') {
    const engine = getEngineForTab(activeTabId.value);
    await refreshTableData(engine);
    toast.success('Table data refreshed');
  }
};

// Expose method for parent component
defineExpose({
  loadTableData,
  openTable,
  findOrCreateSheetTab,
  setFormulaBarValue,
  createQueryTab,
  getActiveQueryContent,
  refreshCurrentTable,
});

</script>

<template>
  <div class="flex flex-col h-full w-full">
    <!-- Tabs -->
    <TabsManager 
      :tabs="tabs" 
      v-model:activeTabId="activeTabId"
      @close="onTabClose"
      @add="onAddTab"
    />
    
    <!-- Editor Content Area -->
    <div class="flex-1 overflow-hidden">
      <template v-for="tab in tabs" :key="tab.id">
        <div 
          v-if="tab.id === activeTabId"
          class="w-full h-full flex flex-col"
        >
          <Grid 
            v-if="tab.type === 'table'"
            :ref="(el: any) => setGridRef(el, tab.id)"
            :engine="getEngineForTab(tab.id)"
            :mode="props.mode === 'spreadsheet' ? 'write' : props.mode"
            :is-a-i-mode="props.aiMode"
            :auto-execute-mode="props.autoExecute"
            @save-query="(query, type) => emit('save-query', query, type)"
          />
          
          <!-- Chat/Query Editor -->
          <ChatEditor 
            v-else
            :mode="tab.type === 'query' ? 'write' : 'chat'"
            :input="tab.type === 'query' ? (tab.data?.content || '') : input"
            @update:input="(val) => {
              if (tab.type === 'query') {
                // Update tab-specific content
                if (!tab.data) tab.data = {};
                tab.data.content = val;
              } else {
                // Update global input for chat mode
                emit('update:input', val);
              }
            }"
            @submit="emit('submit')"
          />
        </div>
      </template>
    </div>
  </div>
</template>
```
