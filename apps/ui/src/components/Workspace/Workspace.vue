<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import TabsManager from './TabsManager.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import type { Tab } from '@/stores/workspace';
import { Engine } from '../TableView/Engine/Engine';
import Grid from '../TableView/Grid/Grid.vue'; 
import ChatEditor from '@/components/Chat/ChatEditor.vue';
import QueryEditorView from './QueryEditorView.vue';
import { toast } from '@/composables/useNotifications';
import { CSVExporter, ExcelExporter, PDFExporter } from '../TableView/Engine/Exporters';
import { fetchTableSchema, fetchTableQuery, saveTableData } from '@/lib/api';
import { buildConnectionPayload } from '@/lib/db-connections';
import { Plus, MessageSquare, Layout, Sparkles, Database, FileCode } from 'lucide-vue-next';

// Interface for version history
interface TableVersion {
    version: number;
    table: string;
    created_at: string;
    reason?: string;
}

// Props from parent (Chat.vue)
const props = defineProps<{
  mode: 'chat' | 'write' | 'spreadsheet';
  input: string;
  chatHistory?: Array<{ role: string; content: string; timestamp: number }>;
  aiMode: boolean;
  autoExecute: boolean;
  privateMode?: boolean;
  isThinking?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:mode', mode: 'chat' | 'write' | 'spreadsheet'): void;
  (e: 'update:input', input: string): void;
  (e: 'submit'): void;
  (e: 'save-query', query: string, type: 'formula'): void;
  (e: 'save-status', status: 'saved' | 'saving' | 'error'): void;
  (e: 'create-chat'): void;
  (e: 'add-to-dashboard', config: any): void;
  (e: 'explain-query', query: string): void;
  (e: 'optimize-query', query: string): void;
  (e: 'show-results'): void;
}>();

// --- Pinia Store ---
const workspaceStore = useWorkspaceStore();
const { tabs, activeTabId, activeTab } = storeToRefs(workspaceStore);

// Load tabs from storage on mount
// Load tabs handled by Chat.vue via store
onMounted(() => {
  // workspaceStore.loadWorkspace('temp'); // Handled by parent
});

// Sync chatHistory prop to active chat tab's data
watch(() => props.chatHistory, (newHistory) => {
  const currentTab = activeTab.value as any;
  if (newHistory && currentTab?.type === 'chat') {
    workspaceStore.updateActiveTabData({ chatHistory: newHistory });
  }
}, { deep: true });

// Engine cache for spreadsheet tabs
const engineCache = new Map<string, Engine>();
const privateEngines = new Map<string, Engine>(); // Cache for private branches
const loadingTabIds = ref(new Set<string>());
const isDataLoading = computed(() => loadingTabIds.value.size > 0);

// Queue for background preloading to prevent UI from freezing when many tabs exist
const preloadQueue = ref<string[]>([]);
let isPreloadingBackground = false;

const processPreloadQueue = async () => {
    if (isPreloadingBackground || preloadQueue.value.length === 0) return;
    isPreloadingBackground = true;
    
    while (preloadQueue.value.length > 0) {
        const nextTabId = preloadQueue.value.shift();
        if (nextTabId && !engineCache.has(nextTabId)) {
            console.log(`[Workspace] Background preloading tab: ${nextTabId} (${preloadQueue.value.length} left)`);
            getEngineForTab(nextTabId);
            // Wait a bit between tabs to let the UI breathe
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    isPreloadingBackground = false;
};

// Helper to fetch schema + data
const fetchTableData = async (tableName: string, connection: any, provider: string) => {
    const baseUrl = import.meta.env.VITE_QUERY_API_URL;
    
    // NEW: Use combined load endpoint for 2x speedup
    const res = await fetch(`${baseUrl}/api/table/${tableName}/load`, { 
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({ 
                 connection: buildConnectionPayload(connection), 
                 provider, 
                 limit: 2000 
             })
    });

    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Failed to load table');
    
    const rows = body.rows || [];
    // Filter out internal columns
    const headers = (body.columns || [])
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
    // Clear values but keep styles during a data-only refresh. Use silent mode to prevent triggering save/sync.
    engine.clear({ keepStyles: true, silent: true }); 
    
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
          engine.setValue({ row: 0, col: colIndex }, header, true, 'remote');
        });
    }
    
    // Reload data
    rows.forEach((row: any, rowIndex: number) => {
      headers.forEach((header: any, colIndex: any) => {
        const value = row[header];
        engine.setValue({ row: rowIndex + dataStartsAtRow, col: colIndex }, String(value ?? ''), true, 'remote');
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
   // Prevent save during refresh
   if (isRefreshing.value) {
     console.log('[Save] Skipping save during refresh');
     return;
   }
   
    try {
      if (!engine.hasPendingModifications()) {
        engine.saveStatus = 'saved';
        emit('save-status', 'saved');
        return;
      }

      console.log('[Save] Committing changes via Engine...');
      engine.saveStatus = 'saving';
      emit('save-status', 'saving');
      
      await engine.commit();
      
      engine.saveStatus = 'saved';
      emit('save-status', 'saved');
      console.log('[Save] Success');

      // Refresh data to ensure UI is in sync with server-calculated results (e.g. sequence IDs, defaults)
      // Only refresh if we have a source to refresh from
      if (engine.sourceTable) {
        // Refresh data to ensure UI is in sync with server-calculated results (e.g. rowIDs)
        // This is critical for data persistence and subsequent delta updates
        console.log('[Save] Refreshing table data to ensure sync...');
        await refreshTableData(engine);
      }
    } catch (e: any) {
      console.error('[Save] Failed:', e);
      engine.saveStatus = 'error';
      emit('save-status', 'error');
      toast.error(`Save failed: ${e.message}`);
    }
};

const getEngineForTab = (tabId: string) => {
  const isCreation = !engineCache.has(tabId);
  if (!isCreation) return engineCache.get(tabId)!;

  const engine = new Engine(
    { rowCount: 1000, colCount: 26 },
    `spreadsheet-tab-${tabId}`
  );

  // Set in cache immediately to prevent re-entrant calls
  engineCache.set(tabId, engine);
    
    // Restore metadata from tab if available
    const tab = (tabs.value as unknown as Tab[])?.find((t: Tab) => t.id === tabId);

    // NEW SYNC LOGIC: If we have persisted engine state in Pinia, load it!
    if (tab?.data?.engineState) {
        console.log('[Workspace] Restoring engine state from Pinia store (Cross-device sync enabled)');
        engine.loadState(tab.data.engineState);
    }
    if (tab?.data?.tableName) {
        console.log('[Workspace] Restoring engine metadata from tab:', tab.data);
        engine.setSource(
            tab.data.tableName,
            tab.data.connection,
            tab.data.headers || [],
            tab.data.provider
        );
        
        // Initial load logic
        if (loadingTabIds.value.has(tabId)) {
            console.log('[Workspace] Already loading data for tab:', tabId);
        } else {
            loadingTabIds.value.add(tabId);
            fetchTableData(tab.data.tableName as string, tab.data.connection, tab.data.provider as string)
                .then(({ rows }) => {
                     if (!rows) return;
                     console.log(`[Workspace] Loaded ${rows.length} rows for tab ${tabId}`);
                     
                     engine.beginBatch();
                     // Preserving styles during reload. Use silent mode to avoid redundant sync during initial load.
                     engine.clear({ keepStyles: true, silent: true });
                     
                     const headers = tab?.data?.headers || [];
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
                .catch(e => console.error('[Workspace] Failed to load data:', e))
                .finally(() => {
                    loadingTabIds.value.delete(tabId);
                });
        }
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
        
        // Update dirty state in workspace store
        workspaceStore.setTabDirty(tabId, engine.hasPendingModifications());

        // Debounce Pinia sync to prevent UI hangs with large datasets
        const syncToPinia = () => {
             workspaceStore.updateTabData(tabId, { engineState: engine.getState() });
        };
        
        // Use a separate timeout for Pinia sync, or just rely on the save one
        // For now, let's just make it slightly more efficient
        if (!(window as any).syncTimeouts) (window as any).syncTimeouts = {};
        if ((window as any).syncTimeouts[tabId]) clearTimeout((window as any).syncTimeouts[tabId]);
        (window as any).syncTimeouts[tabId] = setTimeout(syncToPinia, 1000);
        
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
    
    // Set up change listener for undo/redo state
    engine.onChange(() => {
        updateUndoRedoState()
    })
    
    updateUndoRedoState()
  // If in private mode and we have a private branch for this tab, return it
  if (props.privateMode && privateEngines.has(tabId)) {
      return privateEngines.get(tabId)!;
  }
  
  return engineCache.get(tabId)!;
};

watch(() => props.privateMode, (isPrivate) => {
    const tabId = (activeTabId.value as unknown as string);
    if (!tabId) return;

    const currentTab = (tabs.value as unknown as Tab[]).find((t: Tab) => t.id === tabId);
    
    if (currentTab && currentTab.type === 'table') {
        const currentTabId = (activeTabId.value as unknown as string);
        if (isPrivate && currentTabId) {
            // Turning ON Private Mode: Create Branch
            const baseEngine = engineCache.get(currentTabId);
            if (baseEngine && !privateEngines.has(currentTabId)) {
                console.log('[Workspace] Creating private branch for tab', currentTabId);
                const branch = baseEngine.createBranch('private');
                privateEngines.set(currentTabId, branch);
            }
        } else if (!isPrivate && currentTabId) {
            // Turning OFF Private Mode: Discard Branch (or it was just merged)
            console.log('[Workspace] Exiting private mode for tab', currentTabId);
            privateEngines.delete(currentTabId);
        }
    }
});

// --- Handlers ---
const onTabClose = (id: string) => {
  engineCache.delete(id);
  workspaceStore.closeTab(id);
};

const onAddTab = (type: Tab['type']) => {
  // If chat, let parent handle creation/reuse to avoid duplicate
  if (type === 'chat') {
    emit('create-chat');
    return;
  }

  const data = {};
  workspaceStore.createTab(type, data);
  
  // Update parent mode based on tab type
  if (type === 'table') {
    emit('update:mode', 'spreadsheet');
  } else {
    emit('update:mode', type === 'query' ? 'write' : 'chat');
  }
};

// Watch active tab and update parent mode (only on actual tab switch, not initial mount)
// Watch active tab and update parent mode (Disabled to prevent recursion loops and because new views manage their own routing)
/*
watch(() => workspaceStore.activeTabId?.value, (newActiveTabId, oldActiveTabId) => {
  // Skip if this is the initial mount or if there's no old value
  if (!oldActiveTabId || !newActiveTabId) return;
  
  const currentTab = (tabs.value as any[])?.find((t: Tab) => t.id === newActiveTabId);
  if (currentTab) {
    if (currentTab.type === 'table') {
      emit('update:mode', 'spreadsheet');
    } else {
      emit('update:mode', currentTab.type === 'query' ? 'write' : 'chat');
    }
  }
});
*/


// Format table names to hide internal UUIDs
// Converts "data_60643368_3269_4be6_921e_dff7c585cd3c_Sheet1" to "Sheet1"
const formatTableName = (tableName: string): string => {
  // Pattern 1: data_UUID_actualName (no dashes in hex)
  const pattern1 = /^data_[a-f0-9]{32}_(.+)$/
  const match1 = tableName.match(pattern1)
  if (match1 && match1[1]) return match1[1]

  // Pattern 2: data_UUID_with_dashes_actualName
  const match2 = tableName.match(/^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/i);
  return match2 && match2[1] ? match2[1] : tableName;
};

// Method to load table data into a new spreadsheet tab (Legacy)
const loadTableData = (tableName: string, data: any[], connection: any = null, provider: string = 'sqlite') => {
  // Use store action to create tab
  const createdTab = workspaceStore.createTab('table', {});
  const newId = createdTab.id;
  
  // Update the tab label after creation
  const tab = (tabs.value as unknown as Tab[])?.find((t: Tab) => t.id === newId);
  if (tab) {
    tab.label = formatTableName(tableName);
    workspaceStore.saveWorkspace();
  }
  
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

    // Sync metadata back to tab to ensure persistence on refresh
    if (tab) {
        tab.data = {
            ...tab.data,
            tableName,
            connection,
            provider,
            headers
        };
        workspaceStore.saveWorkspace();
    }
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

        // 1. Fetch Schema and Data in parallel (OPTIMIZATION)
        console.log('[Workspace] Fetching schema and data in parallel...');
        
        // Use API client to ensure correct headers and auth
        const [schemaBody, queryBody] = await Promise.all([
             fetchTableSchema(connection, tableName) as Promise<any>,
             fetchTableQuery(connection, tableName, 2000) as Promise<any>
        ]);

        // Helpers will throw if error, or return body
        if (schemaBody.error) throw new Error(schemaBody.error);
        if (queryBody.error) throw new Error(queryBody.error);

        const rows = queryBody.rows || [];
        
        // Get column names from schema OR from first row of data as fallback
        let headers = [];
        
        // Try to get headers from schema first
        if (schemaBody.columns && Array.isArray(schemaBody.columns) && schemaBody.columns.length > 0) {
            headers = schemaBody.columns
               .map((c: any) => c.name)
               .filter((n: string) => n && n !== '__id' && n !== '_rowid_' && n !== '_row_order' && n !== 'id');
        }
        
        // Fallback: Extract headers from first row of data
        if (headers.length === 0 && rows.length > 0) {
            headers = Object.keys(rows[0])
                .filter((n: string) => n && n !== '__id' && n !== '_rowid_' && n !== '_row_order' && n !== 'id');
        }
        
        console.log('[Workspace] Loaded', rows.length, 'rows with', headers.length, 'columns');

        // 2. Clear toast
        toast.dismiss(loadingId);
        
        // Check for specific columns
        const isColumnLetters = headers.every((h: string) => /^[A-Z]+$/.test(h));
        
        const schemaMode = isColumnLetters ? 'column-letters' : 'named-headers';
        console.log('[Workspace] Schema mode:', schemaMode);

        // 3. Fetch version history in background (non-blocking)
        let uiVersions: any[] = [];
        let currentUiVersion = 0;
        
        // Don't block initial load on version history
        fetch(`${baseUrl}/api/table/${tableName}/versions`, { credentials: 'include' })
            .then(vRes => vRes.ok ? vRes.json() : null)
            .then(history => {
                if (!history) return;
                
                const versions = [];
                if (history.original_table) {
                    versions.push({ 
                        version: 0, 
                        table: history.original_table, 
                        created_at: new Date().toISOString(),
                        reason: 'Original Upload'
                    });
                }
                if (history.versions && Array.isArray(history.versions)) {
                    versions.push(...history.versions);
                }
                
                // Update tab data with versions
                const tab = (tabs.value as unknown as Tab[]).find((t: Tab) => t.id === newId);
                if (tab) {
                    tab.data = { ...tab.data, versions, currentVersion: currentUiVersion };
                }
            })
            .catch(e => console.warn('[Workspace] Version history fetch failed:', e));

        // Prepare label
        const sheetLabel = formatTableName(tableName)

        // Use store action to create tab
        const createdTab = workspaceStore.createTab('table', { 
            tableName, 
            data: rows, 
            label: sheetLabel,
            connection,
            provider,
            headers,
            schemaMode
        });
        
        const newId = createdTab.id;

        // 4. Load into Engine (OPTIMIZED)
        const engine = getEngineForTab(newId);
        engine.clear();
        engine.beginBatch();

        // Pre-convert all values to strings once (avoid repeated String() calls)
        const stringifyValue = (v: any) => (v === null || v === undefined) ? '' : String(v);

        if (schemaMode === 'column-letters') {
            // Column letters mode - all rows are data
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                    const value = stringifyValue(row[headers[colIndex]]);
                    engine.setValue({ row: rowIndex, col: colIndex }, value, true);
                }
            }
        } else {
            // Named headers mode - set headers first
            for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                engine.setValue({ row: 0, col: colIndex }, headers[colIndex], true);
            }
            
            // Then set data rows (optimized loop)
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                for (let colIndex = 0; colIndex < headers.length; colIndex++) {
                    const value = stringifyValue(row[headers[colIndex]]);
                    engine.setValue({ row: rowIndex + 1, col: colIndex }, value, true);
                }
            }
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

const handleAIResponse = (response: any) => {
    // Handle AI responses from Grid component
    if (response.type === 'generated_table' && response.openInNewTab) {
        console.log('[Workspace] Handling generated table:', response);
        
        // Create a new tab with the generated data
        const tableName = response.tableName || `Generated Table ${new Date().toLocaleTimeString()}`;
        
        // Create tab structure - pass data for potential future use but we populate engine manually below
        const createdTab = workspaceStore.createTab('table', { 
            tableName,
            label: tableName,
            // Use active connection/provider if available, or default to local
            connection: (activeTab.value as any)?.data?.connection || { id: 'local', provider: 'local' },
            provider: (activeTab.value as any)?.data?.provider || 'local',
            headers: response.headers,
            schemaMode: 'named-headers' 
        });
        
        // Initialize engine for this new tab
        const engine = getEngineForTab(createdTab.id);
        
        if (engine) {
            engine.beginBatch();
            
            // Set Headers (Row 0)
            if (response.headers && Array.isArray(response.headers)) {
                response.headers.forEach((header: string, colIndex: number) => {
                    engine.setValue({ row: 0, col: colIndex }, header, true);
                });
            }
            
            // Set Rows (Row 1+)
            if (response.rows && Array.isArray(response.rows)) {
                response.rows.forEach((row: any[], rowIndex: number) => {
                    // Handle both array of arrays and array of objects
                    if (Array.isArray(row)) {
                         row.forEach((value: any, colIndex: number) => {
                            engine.setValue({ row: rowIndex + 1, col: colIndex }, String(value ?? ''), true);
                        });
                    } else if (typeof row === 'object' && row !== null) {
                         // Fallback if rows are objects
                         response.headers.forEach((header: string, colIndex: number) => {
                             engine.setValue({ row: rowIndex + 1, col: colIndex }, String(row[header] ?? ''), true);
                         });
                    }
                });
            }
            
            engine.endBatch();
            
            // Set source info for persistence
            if ((createdTab as any).data) {
                engine.setSource(
                    tableName,
                    (createdTab as any).data.connection,
                    response.headers || [],
                    (createdTab as any).data.provider || 'local'
                );
            }
            
            console.log(`[Workspace] Engine initialized for generated table: ${tableName}`);
        }
        
        // Switch to new tab
        workspaceStore.setActiveTab(createdTab.id);
        toast.success(`Created new table "${tableName}"`);
    } else if (response.type === 'processed_data') {
        // Handle processed data (e.g. show in dialog)
        console.log('[Workspace] Received processed data:', response);
        if (response.content && response.content.length < 200) {
             toast.success(response.content);
        }
    }
};

const handleVersionChange = async (tabId: string, version: number) => {
    const tab = (tabs.value as unknown as Tab[])?.find((t: Tab) => t.id === tabId);
    if (!tab || !tab.data || !tab.data.versions) return;

    const targetVersion = tab.data.versions.find((v: any) => v.version === version);
    if (!targetVersion) {
        toast.error('Version not found');
        return;
    }

    const newTableName = targetVersion.table;
    if (newTableName === tab.data.tableName) return; // No change

    console.log(`[Workspace] Switching tab ${tabId} to v${version} (${newTableName})`);
    
    // Update local state
    tab.data.currentVersion = version;
    tab.data.tableName = newTableName;
    tab.label = formatTableName(newTableName); // Optional: update label if we want vN in name
    
    const engine = getEngineForTab(tabId);
    
    // We need to update engine source. But we also need correct headers for the new table.
    // Version switching implies schema might be same, but auto-sanitization might have renamed columns!
    // So we MUST reload schema too.
    // The `refreshTableData` function calls fetchTableData which gets schema + query.
    // But `refreshTableData` uses `engine.sourceTable`.
    
    // Explicitly cast strings to correct type union or generic string if needed
    engine.setSource(
        newTableName, 
        tab.data.connection, 
        [], 
        tab.data.provider, 
        (tab.data.schemaMode as 'named-headers' | 'column-letters' | undefined)
    ); 
    
    // Force refresh
    await refreshTableData(engine);
    
    // Update tab headers from engine (since refreshTableData fetches them)
    // Actually refreshTableData updates engine source with new headers.
    // We should update tab.data.headers too for consistency.
    tab.data.headers = engine.columnNames; 
    
    toast.success(`Switched to version ${version === 0 ? 'Original' : 'v' + version}`);
};

// ... existing findOrCreateSheetTab ...


// Method to find or create sheet tab (returns true if already exists)
const findOrCreateSheetTab = (tableName: string): boolean => {
  // Match by tableName, not label (more reliable)
  const existingTab = (tabs.value as unknown as Tab[]).find((t: Tab) => 
    t.type === 'table' && t.data?.tableName === tableName
  );
  
  if (existingTab) {
    // CRITICAL: Ensure tab is properly activated
    console.log('[Workspace] Found existing tab, activating:', existingTab.id);
    workspaceStore.setActiveTab(existingTab.id);
    emit('update:mode', 'spreadsheet');
    
    // Optionally refresh data in existing tab
    const engine = getEngineForTab(existingTab.id);
    if (engine && engine.sourceTable) {
      console.log('[Workspace] Refreshing existing tab data');
      refreshTableData(engine).catch(e => console.error('[Workspace] Refresh failed:', e));
    }
    
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
  const tabId = (activeTabId.value as unknown as string);
  if (!tabId) return;
  
  const activeGrid = gridRefs.value.get(tabId);
  if (activeGrid && activeGrid.formulaBarValue) {
    // formulaBarValue is a ref, so we need to set .value
    activeGrid.formulaBarValue.value = value;
  } else {
    console.warn('Could not set formula bar value - no active grid or formulaBarValue not found');
  }
};

const createQueryTab = (queryContent?: string) => {
  // Use store action to create tab
  const createdTab = workspaceStore.createTab('query', { content: queryContent || '' });
  
  emit('update:mode', 'write');
  return createdTab.id;
};

// Handle input updates from ChatEditor without direct store mutation
const handleTabInputUpdate = (tabId: string, tabType: string, val: string) => {
  if (tabType === 'query') {
    // Use store action to update tab-specific content
    workspaceStore.updateTabData(tabId, { content: val });
  } else {
    // Update global input for chat mode
    emit('update:input', val);
  }
};

// Helper to get active query content
const getActiveQueryContent = (): string => {
  const currentId = (activeTabId.value as unknown as string);
  const tab = (tabs.value as unknown as Tab[]).find((t: Tab) => t.id === currentId);
  return tab?.data?.content || '';
};

// Helper to get current active table name
const getActiveTable = (): string | null => {
  const currentId = (activeTabId.value as unknown as string);
  if (!currentId) return null;
  const tab = (tabs.value as unknown as Tab[]).find((t: Tab) => t.id === currentId);
  if (tab && tab.type === 'table' && tab.data?.tableName) {
    return tab.data.tableName;
  }
  return null;
};

// Refresh current active table if in spreadsheet mode
const refreshCurrentTable = async () => {
    const tabId = (activeTabId.value as unknown as string);
    if (!tabId) return;
    const tab = (tabs.value as unknown as Tab[]).find((t: Tab) => t.id === tabId);
    if (tab?.type === 'table') {
        const engine = getEngineForTab(tabId);
        await refreshTableData(engine);
        toast.success('Table data refreshed');
    }
};

const handleRenameTable = async (newName: string) => {
    // Logic for renaming table...
    console.log('Renaming table to', newName);
};


const canUndo = ref(false)
const canRedo = ref(false)

const activeEngine = computed(() => {
    const currentId = (activeTabId.value as unknown as string);
    if (!currentId) return null;
    // Check for private mode engine first
    if (props.privateMode && privateEngines.has(currentId)) {
        return privateEngines.get(currentId);
    }
    return engineCache.get(currentId);
})

// Update undo/redo state when active engine changes (tab switch)
watch(activeEngine, () => {
    updateUndoRedoState()
})

const updateUndoRedoState = () => {
  if (!activeEngine.value) {
    canUndo.value = false
    canRedo.value = false
    return
  }
  canUndo.value = activeEngine.value.undoManager.canUndo()
  canRedo.value = activeEngine.value.undoManager.canRedo()
}

// spreadsheet state proxies
const activeTabVersions = computed(() => (activeTab.value as any)?.data?.versions || []);
const activeTabVersion = computed(() => (activeTab.value as any)?.data?.currentVersion);
const activeTabTextWrap = computed(() => {
    const grid = gridRefs.value.get((activeTabId as any).value);
    return grid?.textWrap ?? false;
});
const activeTabShowGridlines = computed(() => {
    const grid = gridRefs.value.get((activeTabId as any).value);
    return grid?.showGridlines ?? true;
});

const handleFormat = (type: string, value?: any) => {
    const grid = gridRefs.value.get((activeTabId as any).value);
    if (grid?.handleFormat) {
        grid.handleFormat(type, value);
    }
};

const toggleTextWrap = (val: boolean) => {
    const grid = gridRefs.value.get((activeTabId as any).value);
    if (grid) grid.textWrap = val;
};

const toggleGridlines = (val: boolean) => {
    const grid = gridRefs.value.get((activeTabId as any).value);
    if (grid) grid.showGridlines = val;
};

const handleUndo = () => {
  if (activeEngine.value?.undoManager.undo()) {
    activeEngine.value.notifyChange() // Ensure UI updates
    updateUndoRedoState()
  }
}

const handleRedo = () => {
    if (activeEngine.value?.undoManager.redo()) {
        activeEngine.value.notifyChange() // Ensure UI updates
        updateUndoRedoState()
    }
}

const exportCurrentTable = async (format: 'csv' | 'xlsx' | 'pdf') => {
  const currentTabIdValue = (activeTabId.value as unknown as string);
  if (!currentTabIdValue) return;
  const activeTabObj = (tabs.value as unknown as Tab[]).find((t: Tab) => t.id === currentTabIdValue);
  if (activeTabObj && activeTabObj.type === 'table') {
    const engine = getEngineForTab(currentTabIdValue);
    const filename = `${activeTabObj.label || 'export'}.${format}`;
    
    if (format === 'csv') {
      await CSVExporter.export(engine, filename);
    } else if (format === 'xlsx') {
      await ExcelExporter.export(engine, filename);
    } else if (format === 'pdf') {
      await PDFExporter.export(engine, filename);
    }
    
    if (format !== 'pdf') {
        toast.success(`Exported to ${format.toUpperCase()}`);
    }
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
  //   if (workspaceStore.activeTabId.value) {
  //       const currentTab = workspaceStore.tabs.value.find(t => t.id === workspaceStore.activeTabId.value);
  //       if (currentTab && currentTab.type === 'table') {
  //           const engine = engineCache.get(workspaceStore.activeTabId.value);
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

// Pre-load all spreadsheet tabs in parallel
const preloadAllTabs = async () => {
    const tableTabs = (tabs.value as unknown as Tab[]).filter(t => t.type === 'table' || t.type === 'spreadsheet');
    if (tableTabs.length === 0) return;
    
    // Clear existing queue to prioritize new connection's tabs
    preloadQueue.value = [];
    
    const activeId = activeTabId.value as unknown as string;
    
    // 1. Immediately prioritize and load the active tab
    if (activeId) {
        const isActiveTable = tableTabs.some(t => t.id === activeId);
        if (isActiveTable) {
            console.log(`[Workspace] Prioritizing active tab load: ${activeId}`);
            getEngineForTab(activeId);
        }
    }
    
    // 2. Queue the rest for background loading
    const otherTabs = tableTabs.filter(t => t.id !== activeId && !engineCache.has(t.id));
    if (otherTabs.length > 0) {
        console.log(`[Workspace] Queuing ${otherTabs.length} background tabs for lazy load...`);
        preloadQueue.value.push(...otherTabs.map(t => t.id));
        processPreloadQueue();
    }
};

onMounted(() => {
    preloadAllTabs();
});

// Watch for new tabs to ensure engines are created.
watch(() => (tabs.value as unknown as Tab[]).map((t: Tab) => t.id).join(','), () => {
    preloadAllTabs(); // Re-use the prioritized loading logic
});

// Also prioritize load when switching active tab
watch(() => activeTabId.value, (newId) => {
    if (newId) {
        const tabId = newId as unknown as string;
        const tab = (tabs.value as unknown as Tab[]).find(t => t.id === tabId);
        if (tab && (tab.type === 'table' || tab.type === 'spreadsheet')) {
            if (!engineCache.has(tabId)) {
                getEngineForTab(tabId);
            }
        }
    }
});

// Save functionality exposed to parent
const saveCurrentTab = async () => {
  const tabId = activeTabId.value;
  if (!tabId) return;
  
  const engine = engineCache.get(tabId as any);
  if (engine) {
    if (engine.hasPendingModifications()) {
      await saveChanges(engine);
    } else {
      toast.info('No changes to save');
    }
  }
};

// Expose methods to parent
defineExpose({
  isDataLoading,
  loadTableData,
  openTable,
  findOrCreateSheetTab,
  setFormulaBarValue,
  createQueryTab,
  getActiveQueryContent,
  refreshCurrentTable,
  exportCurrentTable,
  getEngineForTab,
  getActiveTable,
  handleAIResponse,
  saveCurrentTab,
  handleFormat,
  handleUndo,
  handleRedo,
  activeTabVersions,
  activeTabVersion,
  activeTabTextWrap,
  activeTabShowGridlines,
  toggleTextWrap,
  toggleGridlines,
  canUndo,
  canRedo,
  activeTabId,
  handleVersionChange
});


</script>

<template>
  <div class="flex flex-col h-full w-full">
    <!-- Tabs -->
    <TabsManager 
      :tabs="workspaceStore.tabs as any" 
      :active-tab-id="workspaceStore.activeTabId as any"
      @update:active-tab-id="workspaceStore.setActiveTab"
      @close="onTabClose"
      @add="onAddTab"
    />
    

    <!-- Editor Content Area -->
    <div class="flex-1 overflow-hidden relative">
      <!-- Empty State (Minimal Version) -->
      <div 
        v-if="(tabs as any).length === 0" 
        class="absolute inset-0 flex flex-col items-center justify-center p-6 animate-in fade-in duration-700"
      >
        <div class="max-w-sm w-full text-center space-y-6">
          <!-- Subtle Brand Identity -->
          <div class="relative inline-flex items-center justify-center mb-2">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-border flex items-center justify-center group-hover:border-purple-500/20 transition-colors">
              <Layout class="w-8 h-8 text-muted-foreground/40" />
            </div>
          </div>

          <div class="space-y-1">
            <h2 class="text-xl font-medium tracking-tight text-foreground">Let's get started</h2>
            <p class="text-sm text-muted-foreground">
              Create a new tab to begin.
            </p>
          </div>

          <!-- Minimal Actions Row -->
          <div class="flex items-center justify-center gap-3 pt-2">
            <button 
              @click="onAddTab('chat')"
              class="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card hover:bg-muted hover:border-purple-500/30 transition-all text-xs font-semibold text-foreground shadow-sm"
            >
              <MessageSquare class="w-3.5 h-3.5 text-purple-500" />
              AI Chat
            </button>

            <button 
              @click="onAddTab('query')"
              class="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card hover:bg-muted hover:border-blue-500/30 transition-all text-xs font-semibold text-foreground shadow-sm"
            >
              <FileCode class="w-3.5 h-3.5 text-blue-500" />
              SQL
            </button>

            <button 
              @click="onAddTab('table')"
              class="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card hover:bg-muted hover:border-emerald-500/30 transition-all text-xs font-semibold text-foreground shadow-sm"
            >
              <Plus class="w-3.5 h-3.5 text-emerald-500" />
              Sheet
            </button>
          </div>

          <!-- Discrete Hint -->
          <div class="text-[10px] text-muted-foreground/30 font-medium uppercase tracking-[0.2em] pt-8">
            Drop CSV to import
          </div>
        </div>
      </div>

      <template v-for="tab in (tabs as any)" :key="tab.id">
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
            :versions="(tab.data?.versions as TableVersion[])"
            :current-version="tab.data?.currentVersion"
            @save-query="(query, type) => emit('save-query', query, type)"
            @version-change="(v) => handleVersionChange(tab.id, v)"
            @ai-response="handleAIResponse"
          />
          
          <!-- Chat Interface -->
          <ChatEditor 
            v-else-if="tab.type === 'chat'"
            mode="chat"
            :input="props.input"
            :history="tab.data?.chatHistory || []"
            :is-thinking="props.isThinking"
            @update:input="(val) => handleTabInputUpdate(tab.id, tab.type, val)"
            @submit="emit('submit')"
            @show-results="emit('show-results')"
            @add-to-dashboard="(config) => emit('add-to-dashboard', config)"
          />

          <!-- Dedicated Query Console -->
          <QueryEditorView
            v-else-if="tab.type === 'query'"
            :model-value="tab.data?.content || ''"
            :is-thinking="props.isThinking"
            :label="tab.label"
            @update:model-value="(val) => handleTabInputUpdate(tab.id, tab.type, val)"
            @submit="emit('submit')"
            @save="() => { /* handled by auto-save */ }"
            @explain-query="(q) => emit('explain-query', q)"
            @optimize-query="(q) => emit('optimize-query', q)"
          />
        </div>
      </template>
    </div>
  </div>
</template>

