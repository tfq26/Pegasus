<script setup lang="ts">
import { ref, watch } from 'vue';
import TabsManager from './TabsManager.vue';
import type { Tab } from './TabsManager.vue';
import { Engine } from '../TableView/Engine/Engine';
import Grid from '../TableView/Grid/Grid.vue'; 
import ChatEditor from '@/components/Chat/ChatEditor.vue';

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

// Auto-save logic
const saveChanges = async (engine: Engine) => {
   const modified = engine.getModifiedRows();
   if (modified.size === 0 || !engine.sourceTable) return;
   
   // Convert Map to clear array for JSON serialization
   // modified maps row index -> object with all column values
   // We also need the ORIGINAL values to identify the row if we don't have a PK.
   // But Engine only gives us the current values.
   // For now, let's just send the current values of the modified rows. 
   // WARN: This implies the backend needs to figure out WHAT to update. 
   // Without PKs, this is tricky. We'll send the row index too if that helps?
   // Actually, let's just send the data.
   
   const updates = Array.from(modified.entries()).map(([row, data]) => ({
      row,
      data
   }));
   
   // Network Request
   try {
      const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/api/save-table-data`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           tableName: engine.sourceTable,
           updates,
           connection: engine.sourceConnection,
           provider: engine.sourceProvider
         })
      });
      
      if (!response.ok) throw new Error('Save failed');
      
      engine.clearModifiedTracking();
      engine.saveStatus = 'saved';
      emit('save-status', 'saved');
      
      // Console log for debug, maybe add small indicator later
      console.log('Auto-saved changes to', engine.sourceTable);
   } catch (e) {
      console.error('Auto-save failed:', e);
      engine.saveStatus = 'error';
      emit('save-status', 'error');
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

// Method to load table data into a new spreadsheet tab
const loadTableData = (tableName: string, data: any[], connection: any = null, provider: string = 'sqlite') => {
  const newId = String(Date.now());
  const newTab = {
    id: newId,
    label: `${tableName} - Sheet View`,
    type: 'table' as const
  };
  
  tabs.value.push(newTab);
  activeTabId.value = newId;
  
  // Get the engine for this tab
  const engine = getEngineForTab(newId);
  
  // Check if engine already has data (cell at 0,0 exists)
  const hasData = engine.getCell({ row: 0, col: 0 }) !== null;
  
  // Only populate if no data exists
  if (!hasData && data.length > 0) {
    const headers = Object.keys(data[0]);
    
    // Initialize database persistence
    engine.setSource(tableName, connection, headers, provider);
    
    // Batch all updates to avoid multiple notifications
    engine.beginBatch();
    
    // Set headers in row 0
    headers.forEach((header, colIndex) => {
      engine.setValue({ row: 0, col: colIndex }, header);
    });
    
    // Set data starting from row 1
    data.forEach((row, rowIndex) => {
      headers.forEach((header, colIndex) => {
        const value = row[header];
        engine.setValue({ row: rowIndex + 1, col: colIndex }, String(value ?? ''));
      });
    });
    
    // End batch - this will trigger a single notification
    engine.endBatch();
    
    // RESET modification tracking so initial load is not saved
    engine.clearModifiedTracking();
  }
  
  emit('update:mode', 'spreadsheet');
};

// Method to find or create sheet tab (returns true if already exists)
const findOrCreateSheetTab = (tableName: string): boolean => {
  const sheetLabel = `${tableName} - Sheet View`;
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

// Expose method for parent component
defineExpose({
  loadTableData,
  findOrCreateSheetTab,
  setFormulaBarValue,
  createQueryTab,
  getActiveQueryContent,
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
