<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted } from 'vue';
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
  chatHistory?: Array<{ role: string; content: string; timestamp: number }>;
  aiMode: boolean;
  autoExecute: boolean;
  privateMode?: boolean;
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
const privateEngines = new Map<string, Engine>(); // Cache for private branches

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
    
    // Clear existing data first to prevent duplication
    engine.clear(); // This also clears localStorage
    
    // Reload into Engine with silent mode to prevent modification tracking
    engine.beginBatch();
    
    // Deduplication Logic: Check if first row of data matches headers
    let dataStartsAtRow = 1;
    let injectHeaders = true;

    if (rows.length > 0) {
        const firstRow = rows[0];
        // Check if values in first row match column names
        const isMatch = headers.every((h: string) => {
             const val = firstRow[h];
             return val === h || val === String(h);
        });
        
        if (isMatch) {
            console.log('[Refresh] Detected headers in data, preventing duplication');
            dataStartsAtRow = 0; // Shift data up to row 0
            injectHeaders = false;
        }
    }

    // Reload headers (if not already in data)
    if (injectHeaders) {
        headers.forEach((header: any, colIndex: any) => {
          engine.setValue({ row: 0, col: colIndex }, header, true);
        });
    }
    
    // Reload data
    rows.forEach((row: any, rowIndex: number) => {
      headers.forEach((header: any, colIndex: any) => {
        const value = row[header];
        engine.setValue({ row: rowIndex + dataStartsAtRow, col: colIndex }, String(value ?? ''), true);
      });
    });
    
    engine.endBatch();
    
    // Update persistence metadata
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
      // Determine if we're using full_replacement strategy
    const isSurrealDB = engine.sourceProvider === 'surrealdb';
    
    // Skip save if no actual modifications exist (except for SurrealDB which uses full_replacement)
    if (!isSurrealDB && !engine.hasPendingModifications()) {
      console.log('[Save] No pending modifications, skipping save');
      engine.saveStatus = 'saved';
      emit('save-status', 'saved');
      return;
    }
    
    try {
      // 1. Determine Save Strategy
      let strategy = engine.getSaveStrategy();
      
      // For SurrealDB, we force full_replacement for now because we don't track record IDs in the engine
      // (we explicitly hid them in openTable). Delta updates require IDs.
      if (isSurrealDB) {
          console.log('[Save] Forcing full_replacement for SurrealDB');
          strategy = 'full_replacement';
      }

     console.log(`[Save] Using strategy: ${strategy}`);
     
     let ops: any[] = [];
     
     if (strategy === 'full_replacement') {
       // Full Replacement: Get all current data and replace table
       const allRows = engine.getAllNonEmptyRows();
       console.log(`[Save] Full replacement with ${allRows.length} rows`);
       console.log(`[Save] Engine source: table=${engine.sourceTable}, provider=${engine.sourceProvider}`);
       console.log(`[Save] Sample rows:`, allRows.slice(0, 2));
       
       // Include schema changes BEFORE full replacement
       const deletedCols = engine.getDeletedColumns();
       const addedCols = engine.getAddedColumns?.() || [];
       
       deletedCols.forEach(col => {
         ops.push({ type: 'drop_column', column: col });
       });
       
       addedCols.forEach(col => {
         ops.push({ type: 'add_column', column: col });
       });
              if (allRows.length === 0 && deletedCols.length === 0 && addedCols.length === 0) {
          // Empty table and no schema changes - just delete all
          ops.push({ type: 'full_replacement', rows: [] });
        } else if (allRows.length > 0 || deletedCols.length === 0) {
          // Full replacement with all data
          // Note: For SurrealDB, column names are now A, B, C... (no normalization needed)
          console.log(`[Save] Full replacement with ${allRows.length} rows`);
          if (allRows.length > 0 && allRows[0]) {
            console.log(`[Save] First row columns:`, Object.keys(allRows[0]));
            console.log(`[Save] First row data:`, allRows[0]);
          }
          
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
    
    // Restore metadata from tab if available
    const tab = tabs.value.find(t => t.id === tabId);
    if (tab?.data?.tableName) {
        console.log('[Workspace] Restoring engine metadata from tab:', tab.data);
        engine.setSource(
            tab.data.tableName,
            tab.data.connection,
            tab.data.headers || [],
            tab.data.provider
        );
        
        // Reload data in background
        console.log('[Workspace] Background reloading data for restored tab');
        fetchTableData(tab.data.tableName, tab.data.connection, tab.data.provider)
            .then(({ rows }) => {
                 if (!rows || rows.length === 0) return;
                 console.log(`[Workspace] Reloaded ${rows.length} rows`);
                 
                 engine.beginBatch();
                 engine.clear(); // Ensure clean state
                 
                 const headers = tab.data.headers || [];
                 let dataStartsAtRow = 1;
                 let injectHeaders = true;

                 // Logic to detect if headers are already in data (dedup)
                 if (rows.length > 0) {
                    const firstRow = rows[0];
                    const isMatch = headers.every((h: string) => {
                         const val = firstRow[h];
                         return val === h || val === String(h);
                    });
                    if (isMatch) {
                        dataStartsAtRow = 0;
                        injectHeaders = false;
                    }
                 }
                 
                 if (injectHeaders) {
                    headers.forEach((header: string, colIndex: number) => {
                         engine.setValue({ row: 0, col: colIndex }, header, true);
                    });
                 }
                 
                 rows.forEach((row: any, rowIndex: number) => {
                     headers.forEach((header: string, colIndex: number) => {
                         const value = row[header];
                         engine.setValue({ row: rowIndex + dataStartsAtRow, col: colIndex }, String(value ?? ''), true);
                     });
                 });
                 
                 engine.endBatch();
                 engine.setOriginalData(rows);
            })
            .catch(e => console.error('[Workspace] Failed to reload restored data:', e));
    }
    
    // Auto-save listener with rate limiting
    let saveTimeout: ReturnType<typeof setTimeout>;
    let lastSaveTime = 0;
    let hasPendingChanges = false;
    const SAVE_INTERVAL = 2000; // Save at most once every 2 seconds
    
    engine.onChange(() => {
        // Set saving status immediately when change happens
        if (engine.saveStatus !== 'saving') {
             engine.saveStatus = 'saving';
             emit('save-status', 'saving');
        }
        
        hasPendingChanges = true;
        
        // Calculate time since last save
        const now = Date.now();
        const timeSinceLastSave = now - lastSaveTime;
        
        // Clear any existing timeout
        if (saveTimeout) clearTimeout(saveTimeout);
        
        // If enough time has passed, save immediately
        if (timeSinceLastSave >= SAVE_INTERVAL) {
            lastSaveTime = now;
            hasPendingChanges = false;
            saveChanges(engine);
        } else {
            // Otherwise, schedule save for when interval is up
            const timeUntilNextSave = SAVE_INTERVAL - timeSinceLastSave;
            saveTimeout = setTimeout(() => {
                if (hasPendingChanges) {
                    lastSaveTime = Date.now();
                    hasPendingChanges = false;
                    saveChanges(engine);
                }
            }, timeUntilNextSave);
        }
    });
    
    engineCache.set(tabId, engine);
  }
  
  // If in private mode and we have a private branch for this tab, return it
  if (props.privateMode && privateEngines.has(tabId)) {
      return privateEngines.get(tabId)!;
  }
  
  return engineCache.get(tabId)!;
};

// Watch for Private Mode toggle
watch(() => props.privateMode, (isPrivate) => {
    const tabId = activeTabId.value;
    const activeTab = tabs.value.find(t => t.id === tabId);
    
    if (activeTab && activeTab.type === 'table') {
        if (isPrivate) {
            // Turning ON Private Mode: Create Branch
            const baseEngine = engineCache.get(tabId);
            if (baseEngine && !privateEngines.has(tabId)) {
                console.log('[Workspace] Creating private branch for tab', tabId);
                const branch = baseEngine.createBranch('private');
                privateEngines.set(tabId, branch);
            }
        } else {
            // Turning OFF Private Mode: Discard Branch (or it was just merged)
            // We just clear the private engine from cache so next render uses base
            console.log('[Workspace] Exiting private mode for tab', tabId);
            privateEngines.delete(tabId);
        }
        // Force re-render of Grid to pick up new engine
        // (Vue might not detect map change automatically if not reactive, but getEngineForTab call in template should re-run if prop changed)
    }
});

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

// Helper: Convert column letter to index (A->0, B->1, Z->25, AA->26)
const labelToColIndex = (label: string): number => {
  let index = 0;
  for (let i = 0; i < label.length; i++) {
    index = index * 26 + (label.charCodeAt(i) - 64);
  }
  return index - 1;
};

// Robust Table Loading (New)
const openTable = async (tableName: string, connection: any, provider: string) => {
    console.log('[Workspace] openTable called:', { tableName, provider });
    
    // Check if exists
    if (findOrCreateSheetTab(tableName)) {
        console.log('[Workspace] Tab already exists, switching to it');
        return;
    }

    try {
        const loadingId = toast.loading(`Loading ${formatTableName(tableName)}...`);
        const baseUrl = import.meta.env.VITE_QUERY_API_URL;

        // 1. Fetch Schema
        console.log('[Workspace] Fetching schema...');
        const schemaRes = await fetch(`${baseUrl}/api/table/${tableName}/schema`, { 
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({ connection, provider })
        });
        const schemaBody = await schemaRes.json();
        if (!schemaRes.ok) throw new Error(schemaBody.error || 'Failed to load schema');

        // 2. Fetch Data
        console.log('[Workspace] Fetching data...');
        const queryRes = await fetch(`${baseUrl}/api/table/${tableName}/query`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({ connection, provider, limit: 2000 })
        });
        const queryBody = await queryRes.json();
        if (!queryRes.ok) throw new Error(queryBody.error || 'Failed to load data');

        const rows = queryBody.rows || [];
        
        // Get column names from schema
        const headers = (schemaBody.columns || [])
           .map((c: any) => c.name)
           .filter((n: string) => n !== '__id' && n !== '_rowid_' && n !== '_row_order');
        
        console.log('[Workspace] Loaded', rows.length, 'rows with', headers.length, 'columns');
        console.log('[Workspace] Headers:', headers);

        // 3. Detect schema mode
        // Check if headers follow A, B, C... pattern (column letters)
        const isColumnLetters = headers.every((name: string, index: number) => {
            const expectedLetter = labelToColIndex(name) === index;
            return expectedLetter || name.match(/^[A-Z]+$/);
        });
        
        const schemaMode = isColumnLetters ? 'column-letters' : 'named-headers';
        console.log('[Workspace] Detected schema mode:', schemaMode);

        // 4. Create Tab
        const newId = String(Date.now());
        const newTab = {
            id: newId,
            label: formatTableName(tableName),
            type: 'table' as const,
            data: {
                tableName,
                connection,
                provider,
                headers,
                schemaMode
            }
        };
        tabs.value.push(newTab);
        activeTabId.value = newId;

        // 5. Load into Engine with unified approach
        const engine = getEngineForTab(newId);
        engine.clear();
        engine.beginBatch();

        // Unified data loading - works for all providers
        if (schemaMode === 'column-letters') {
            // Column letters mode - all rows are data (including row 0)
            rows.forEach((row: any, rowIndex: number) => {
                headers.forEach((colLetter: string, colIndex: number) => {
                    const value = row[colLetter];
                    engine.setValue({ row: rowIndex, col: colIndex }, String(value ?? ''), true);
                });
            });
        } else {
            // Named headers mode - row 0 contains headers, data starts at row 1
            headers.forEach((header: string, colIndex: number) => {
                engine.setValue({ row: 0, col: colIndex }, header, true);
            });
            
            rows.forEach((row: any, rowIndex: number) => {
                headers.forEach((header: string, colIndex: number) => {
                    const value = row[header];
                    engine.setValue({ row: rowIndex + 1, col: colIndex }, String(value ?? ''), true);
                });
            });
        }

        engine.endBatch();
        
        // Set correct rowCount based on actual data
        const actualRowCount = schemaMode === 'column-letters' 
            ? rows.length  // In column-letters mode, all rows are data
            : rows.length + 1;  // In named-headers mode, add 1 for header row
        
        engine.config.rowCount = actualRowCount;
        engine.config.colCount = headers.length;
        
        console.log(`[Workspace] Set rowCount=${actualRowCount}, colCount=${headers.length}`);
        
        // Set source with schema mode
        engine.setSource(tableName, connection, headers, provider, schemaMode);
        engine.setOriginalData(rows);

        console.log('[Workspace] Table loaded successfully with schema mode:', schemaMode);
        toast.dismiss(loadingId);
        emit('update:mode', 'spreadsheet');
    } catch (e: any) {
        console.error('[Workspace] Failed to open table:', e);
        toast.error(`Failed to open table: ${e.message}`);
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

import { CSVExporter, ExcelExporter } from '../TableView/Engine/Exporters';

// ... existing code ...

const exportCurrentTable = (format: 'csv' | 'xlsx') => {
  const activeTab = tabs.value.find(t => t.id === activeTabId.value);
  if (activeTab && activeTab.type === 'table') {
    const engine = getEngineForTab(activeTabId.value);
    const filename = `${activeTab.label || 'export'}.${format}`;
    
    if (format === 'csv') {
      CSVExporter.export(engine, filename);
    } else {
      ExcelExporter.export(engine, filename);
    }
    toast.success(`Exported to ${format.toUpperCase()}`);
  } else {
      toast.error('No table active');
  }
};

// Polling for live data
// DISABLED: This was causing repeated queries to Turso every 5 seconds
// even when no external changes occurred. Re-enable when live data sync
// is actually needed (e.g., collaborative editing, external data sources)
let pollingInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // Polling disabled - uncomment below to re-enable
  // pollingInterval = setInterval(() => {
  //   if (activeTabId.value) {
  //       const currentTab = tabs.value.find(t => t.id === activeTabId.value);
  //       if (currentTab && currentTab.type === 'table') {
  //           const engine = engineCache.get(activeTabId.value);
  //           if (engine && engine.saveStatus === 'saved' && !isRefreshing.value && !engine.isBatching) {
  //                refreshTableData(engine).catch(e => console.error('[Polling] Refresh failed', e));
  //           }
  //       }
  //   }
  // }, 5000);
});

onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval);
});

// Expose method for parent component
defineExpose({
  loadTableData,
  openTable,
  findOrCreateSheetTab,
  setFormulaBarValue,
  createQueryTab,
  getActiveQueryContent,
  refreshCurrentTable,
  exportCurrentTable,
  getEngineForTab,
  activeTabId
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
            :mode="(props.mode === 'spreadsheet' || props.mode === 'chat') ? 'write' : 'read'"
            :is-a-i-mode="props.aiMode"
            :auto-execute-mode="props.autoExecute"
            :private-mode="props.privateMode"
            @save-query="(query, type) => emit('save-query', query, type)"
          />
          
          <!-- Chat/Query Editor -->
          <ChatEditor 
            v-else
            :mode="tab.type === 'query' ? 'write' : 'chat'"
            :input="tab.type === 'query' ? (tab.data?.content || '') : input"
            :history="tab.type === 'chat' ? props.chatHistory : undefined"
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
