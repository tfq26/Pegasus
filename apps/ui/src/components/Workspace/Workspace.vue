<script setup lang="ts">
import { ref, watch, onMounted, computed, unref, defineAsyncComponent } from 'vue';
import TabsManager from './TabsManager.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import type { Tab } from '@/stores/workspace';
// import Grid from '../TableView/Grid/Grid.vue';
const DataView = defineAsyncComponent(() => import('../TableView/DataView/DataView.vue'));
import ChatEditor from '@/components/Chat/ChatEditor.vue';
const QueryEditorView = defineAsyncComponent(() => import('./QueryEditorView.vue'));
import { toast } from '@/composables/useNotifications';
import { useSettingsStore } from '@/stores/settings';
import { useDataViewStore } from '@/stores/dataView';
import { useSpaceStore } from '@/stores/space';
import { Plus, MessageSquare, Layout, FileCode, StickyNote, FileText, Sparkles } from 'lucide-vue-next';
const RichTextEditor = defineAsyncComponent(() => import('./RichTextEditor.vue'));
const FileViewer = defineAsyncComponent(() => import('./FileViewer.vue'));
import Toolbar from './Toolbar.vue';
import { showProgressToast } from '@/lib/toastProgress';

// Composables
import { useWorkspaceEngine } from '@/composables/useWorkspaceEngine';
import { useWorkspaceTabActions } from '@/composables/useWorkspaceTabActions';
import { useWorkspaceSpreadsheet } from '@/composables/useWorkspaceSpreadsheet';
import { useWorkspaceNotes } from '@/composables/useWorkspaceNotes';
import { useWorkspaceAI } from '@/composables/useWorkspaceAI';

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
  alias?: string;
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
  (e: 'optimize-query', payload: { query: string; connection: any; provider: string }): void;
  (e: 'show-results'): void;
  (e: 'share'): void;
  (e: 'ai-respond', response: any): void;
  (e: 'generate-insights', payload: { query: string; results: any; messageIndex?: number }): void;
  (e: 'update:alias', alias: string): void;
}>();

// Stores
const workspaceStore = useWorkspaceStore();
const settingsStore = useSettingsStore();
const dataViewStore = useDataViewStore();
const spaceStore = useSpaceStore();

const tabs = computed(() => workspaceStore.tabs) as any;
const activeTabId = computed(() => workspaceStore.activeTabId) as any;
const activeTab = computed(() => workspaceStore.activeTab) as any;
const settings = settingsStore.settings;

// -------- Composables -----------------------------------------------

// 1. Engine management
const engineResult = useWorkspaceEngine(
  tabs,
  activeTabId,
  workspaceStore,
  props,
  emit as any,
  () => updateUndoRedoState()
);

const {
  engineCache,
  privateEngines,
  loadingTabIds,
  loadingTables,
  isRefreshing,
  isDataLoading,
  dataLoadedTabs,
  getEngineForTab,
  refreshTableData,
  saveChanges,
  loadTabDataLazy,
  preloadAllTabs
} = engineResult;

// 2. Spreadsheet UI
const spreadsheetResult = useWorkspaceSpreadsheet(
  tabs,
  activeTabId,
  engineCache,
  privateEngines,
  props
);

const {
  gridRefs,
  zoomLevel,
  canUndo,
  canRedo,
  activeEngine,
  setGridRef,
  setFormulaBarValue,
  updateUndoRedoState,
  handleUndo,
  handleRedo,
  handleFormat,
  activeTabVersions,
  activeTabVersion,
  activeTabTextWrap,
  activeTabShowGridlines,
  hasUncommittedChanges,
  isAIMode,
  gridStyle,
  handleZoomChange,
  toggleTextWrap,
  toggleGridlines,
  exportCurrentTable
} = spreadsheetResult;

// 3. Tab actions
const tabActionsResult = useWorkspaceTabActions(
  tabs,
  activeTabId,
  activeTab,
  workspaceStore,
  loadingTables,
  loadingTabIds,
  dataLoadedTabs,
  emit as any,
  getEngineForTab,
  refreshTableData,
  engineResult.formatTableName
);

const {
  onTabClose,
  onAddTab,
  openTable,
  handleForkTable,
  handlePersistTable,
  handleVersionChange,
  createQueryTab,
  openNote,
  loadTableData,
  findOrCreateDataViewTab
} = tabActionsResult;

// 4. Notes & file handlers
const notesResult = useWorkspaceNotes(activeTab, workspaceStore, emit as any);

const {
  noteEditorRef,
  handleNoteFormat,
  handleNotePrivacyChange,
  handleNoteFileTypeChange,
  handleNoteShare,
  handleNoteDownload,
  handleNoteSave,
  handleFileDownload,
  handleExportChat,
  handleDeleteChat
} = notesResult;

// 5. AI
const aiResult = useWorkspaceAI(tabs, activeTab, workspaceStore, settings, emit as any, getEngineForTab);

const {
  availableModels,
  aiOptions,
  handleAIResponse
} = aiResult;

// 6. Data Studio State (Bridge to Toolbar)
const studioRef = ref<any>(null);
const studioAICommand = ref('');
const studioIsSavedView = ref(false);
const studioStagedCount = ref(0);
const studioIsCompact = ref(false); // New Compact Mode state
const studioIsAIProcessing = ref(false);

const handleStudioAICommand = () => {
  studioRef.value?.handleAICommand?.();
};

const handleStudioSaveView = () => {
  console.log('[Workspace] handleStudioSaveView called, studioRef:', studioRef.value);
  if (!studioRef.value) {
    console.warn('[Workspace] studioRef is null!');
    return;
  }
  studioRef.value.saveView();
};

const handleStudioSave = async (payload: { name: string, data: any }) => {
  const tabId = activeTabId.value as string;
  if (!tabId) return;

  try {
    const progress = showProgressToast('Saving Data View...', 30);
    const view = await dataViewStore.saveDataView({
      name: payload.name,
      data: payload.data,
      spaceId: unref(spaceStore.currentSpaceId) || null
    });

    workspaceStore.updateTabData(tabId, { viewId: view.id, isLocalView: true, label: view.name, isSavedView: true });
    progress.success('Data View saved');
  } catch (e: any) {
    toast.error('Failed to save Data View', { description: e.message });
  }
};

const handleStudioToggleStaging = () => {
  if (studioRef.value) studioRef.value.showStaging = !studioRef.value.showStaging;
};

const handleStudioAddRow = () => {
  if (studioRef.value) studioRef.value.addRow();
};

const handleStudioAddColumn = () => {
  if (studioRef.value) studioRef.value.addColumn();
};

const handleStudioProfileTable = () => {
  if (studioRef.value) studioRef.value.profileTable();
};

// -------- Sync chat history prop to active tab data -----------------
watch(() => props.chatHistory, (newHistory) => {
  const currentTab = activeTab.value as any;
  if (newHistory && currentTab?.type === 'chat') {
    workspaceStore.updateActiveTabData({ chatHistory: newHistory });
  }
}, { deep: true });

// -------- Toolbar mode ----------------------------------------------
const toolbarMode = computed(() => {
  const currentTab = (activeTab as any).value;
  if (!currentTab) return 'chat';
  if (currentTab.type === 'note' || currentTab.type === 'file') return currentTab.type;
  if (currentTab.type === 'query') return 'write';
  if (currentTab.type === 'table' || currentTab.type === 'spreadsheet' || currentTab.type === 'datastudio' || currentTab.type === 'dataview') return 'dataview';
  return 'chat';
});

const isDataView = computed(() => {
  const t = (activeTab as any).value;
  return ['spreadsheet', 'dataview', 'table', 'datastudio'].includes(t?.type) || t?.data?.viewId || t?.data?.isSavedView;
});

// -------- Toolbar handlers ------------------------------------------
const handleToolbarRun = () => emit('submit');

const handleToolbarClear = () => {
  const currentTab = (activeTab as any).value;
  if (currentTab) workspaceStore.updateTabData(currentTab.id, { content: '' });
};

// -------- Tab input update ------------------------------------------
const handleTabInputUpdate = (tabId: string, tabType: string, val: string) => {
  if (tabType === 'query') workspaceStore.updateTabData(tabId, { content: val });
  else emit('update:input', val);
};

// -------- Data View save ------------------------------------------------
const handleSaveDataViewLocal = async () => {
  const tabId = activeTabId.value as unknown as string;
  if (!tabId) return;
  const engineInst = engineCache.get(tabId);
  if (!engineInst) return;
  try {
    const state = engineInst.getState();
    const currentTab = (activeTab as any).value;
    const viewId = currentTab?.data?.viewId || currentTab?.data?.sheetId;
    if (viewId) {
      const progress = showProgressToast('Updating Data View...', 30);
      await dataViewStore.saveDataView({
        id: viewId,
        data: state,
        name: currentTab.label,
        updatedAt: new Date().toISOString(),
        spaceId: currentTab?.data?.spaceId || spaceStore.currentSpaceId || null,
      });
      progress.success('Data View updated');
    } else {
      const progress = showProgressToast('Saving as New Data View...', 30);
      const newDataView = await dataViewStore.saveDataView({
        name: currentTab?.label || 'New Data View',
        data: state,
        spaceId: unref(spaceStore.currentSpaceId) || null,
      });
      workspaceStore.updateTabData(tabId, { viewId: newDataView.id, isLocalView: true, isSavedView: true });
      progress.success('Saved to explorer');
    }
  } catch (e: any) {
    toast.error('Failed to save data view', { description: e.message });
  }
};

// -------- Toggle AI mode (grid) ------------------------------------
const handleToggleAIModeLocal = () => {
  const tabId = activeTabId.value as unknown as string;
  if (!tabId) return;
  const grid = gridRefs.value.get(tabId);
  grid?.toggleAIMode?.();
};

// -------- Save current tab ------------------------------------------
const handleSaveCurrentTab = async () => {
  const tabId = activeTabId.value as unknown as string;
  if (!tabId) return;

  const currentTab = activeTab.value as unknown as Tab | null;

  if (currentTab?.type === 'note') {
    const content = currentTab.data?.content || '';
    await handleNoteSave(tabId, content);
    toast.success('Note saved');
    return;
  }

  const grid = gridRefs.value.get(tabId);
  if (grid?.hasUncommittedChanges) {
    await grid.commitChanges();
    return;
  }

  const engineInst = engineCache.get(tabId);
  if (engineInst) {
    if (engineInst.hasPendingModifications()) {
      await saveChanges(engineInst);
    } else {
      toast.info('No changes to save');
    }
  }
};

// -------- Refresh table ---------------------------------------------
const handleRefreshTableLocal = async () => {
  const currentId = activeTabId.value as unknown as string;
  const engineInst = engineCache.get(currentId);
  if (engineInst) await refreshTableData(engineInst);
};

const refreshCurrentTableLocal = async () => {
  const tabId = activeTabId.value as unknown as string;
  if (!tabId) return;
  const tab = (tabs.value as Tab[]).find((t: Tab) => t.id === tabId);
  if (tab?.type === 'table') {
    const engineInst = getEngineForTab(tabId);
    await refreshTableData(engineInst);
    toast.success('Table data refreshed');
  }
};

// -------- Active query helpers --------------------------------------
const getActiveQueryContent = (): string => {
  const currentId = activeTabId.value as unknown as string;
  const tab = (tabs.value as Tab[]).find((t: Tab) => t.id === currentId);
  return tab?.data?.content || '';
};

const getActiveTable = (): string | null => {
  const currentId = activeTabId.value as unknown as string;
  if (!currentId) return null;
  const tab = (tabs.value as Tab[]).find((t: Tab) => t.id === currentId);
  return (tab?.type === 'table' && tab.data?.tableName) ? tab.data.tableName : null;
};

// -------- Lifecycle: preload tabs -----------------------------------
onMounted(() => {
  preloadAllTabs();
});

// Watch for new tabs
watch(() => (tabs.value as Tab[]).map((t: Tab) => t.id).join(','), () => {
  preloadAllTabs();
});

// Lazy-load data when switching tabs
watch(() => activeTabId.value, (newId) => {
  if (newId) {
    const tabId = newId as unknown as string;
    const tab = (tabs.value as Tab[]).find(t => t.id === tabId);
    if (tab && ['table', 'spreadsheet', 'dataview', 'datastudio'].includes(tab.type)) {
      if (!engineCache.has(tabId)) getEngineForTab(tabId);
      loadTabDataLazy(tabId);
    }
  }
});

// Update undo/redo when active engine changes
watch(activeEngine, () => updateUndoRedoState());

// -------- Expose public API -----------------------------------------
defineExpose({
  isDataLoading,
  loadTableData,
  openTable,
  findOrCreateDataViewTab,
  setFormulaBarValue: setFormulaBarValue,
  createQueryTab,
  getActiveQueryContent,
  refreshCurrentTable: refreshCurrentTableLocal,
  exportCurrentTable,
  getEngineForTab,
  getActiveTable,
  handleAIResponse,
  saveCurrentTab: handleSaveCurrentTab,
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
  handleVersionChange,
  handleRefreshTable: handleRefreshTableLocal,
  openNote,
  hasUncommittedChanges,
  getNoteEditorRef: () => noteEditorRef.value,
});
</script>

<template>
  <div class="flex flex-col h-full w-full">
    <!-- Tabs -->
    <TabsManager 
      :tabs="workspaceStore.tabs as any" 
      :active-tab-id="workspaceStore.activeTabId as any"
      @update:active-tab-id="workspaceStore.setActiveTab"
      @close="(id: string) => onTabClose(id, engineCache)"
      @add="onAddTab"
    />

    <!-- Toolbar -->
    <Toolbar
      v-if="(tabs as any).length > 0 && toolbarMode !== 'note'"
      :mode="toolbarMode"
      :connections="[]"
      :selected-connection-id="''"
      :is-executing="false"
      v-model:ai-options="aiOptions"
      :available-models="availableModels"
      :query-options="{ timeout: 30000, limit: 1000, autoCommit: true }"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :save-status="'saved'"
      :versions="activeTabVersions as any"
      :current-version="activeTabVersion"
      :text-wrap="activeTabTextWrap"
      :show-gridlines="activeTabShowGridlines"
      :has-uncommitted-changes="hasUncommittedChanges"
      :note-file-type="(activeTab as any)?.data?.file_type || 'md'"
      :note-is-private="(activeTab as any)?.data?.isPrivate || false"
      :ai-mode="isAIMode"
      :zoom-level="zoomLevel"
      :chat-name="(activeTab as any)?.label || 'New Chat'"
      @toggle-ai-mode="handleToggleAIModeLocal"
      @run="handleToolbarRun"
      @clear="handleToolbarClear"
      @format="handleFormat"
      @undo="handleUndo"
      @redo="handleRedo"
      @save="handleSaveCurrentTab"
      @save-data-view="handleSaveDataViewLocal"
      :is-data-view="isDataView"
      @export="(f) => exportCurrentTable(f)"
      @version-change="(v: number) => handleVersionChange(activeTabId as any, v)"
      @update:text-wrap="(v: boolean) => toggleTextWrap(v)"
      @update:show-gridlines="(v: boolean) => toggleGridlines(v)"
      @note-format="handleNoteFormat"
      @update:note-is-private="handleNotePrivacyChange"
      @update:note-file-type="handleNoteFileTypeChange"
      @update:zoom-level="handleZoomChange"
      @note-share="handleNoteShare"
      @note-download="handleNoteDownload"
      @delete-chat="() => handleDeleteChat(workspaceStore, activeTab)"
      @export-chat="(f: any) => handleExportChat(f)"
      
      :studio-title="(activeTab as any)?.label || 'Data View'"
      :is-excel-source="true"
      :is-saved-view="studioIsSavedView"
      :staged-count="studioStagedCount"
      :ai-command="studioAICommand"
      :is-a-i-processing="studioIsAIProcessing"
      :is-compact="studioIsCompact"
      @update:ai-command="(v) => studioAICommand = v"
      @update:is-compact="(v) => studioIsCompact = v"
      @submit-ai-command="handleStudioAICommand"
      @save-view="handleStudioSaveView"
      @toggle-staging="handleStudioToggleStaging"
      @add-row="handleStudioAddRow"
      @add-column="handleStudioAddColumn"
      @profile-table="handleStudioProfileTable"
    />

    <!-- Editor Content Area -->
    <div class="flex-1 overflow-hidden relative">
      <!-- Empty State -->
      <div 
        v-if="(tabs as any).length === 0" 
        class="absolute inset-0 flex flex-col items-center justify-center p-6 animate-in fade-in duration-700"
      >
        <div class="max-w-sm w-full text-center space-y-6">
          <div class="relative inline-flex items-center justify-center mb-2">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-border flex items-center justify-center">
              <Layout class="w-8 h-8 text-muted-foreground/40" />
            </div>
          </div>

          <div class="space-y-1">
            <h2 class="text-3xl font-semibold tracking-tight text-foreground">Welcome to Pegasus</h2>
            <p class="text-sm text-muted-foreground max-w-xs mx-auto">
              Create a new workspace tool to begin your data journey.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 px-4">
            <button @click="onAddTab('chat')" class="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-purple-500/40 transition-all text-left group">
              <div class="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0"><MessageSquare class="w-5 h-5 text-purple-500" /></div>
              <div class="space-y-0.5"><div class="text-sm font-semibold">AI Chat</div><div class="text-[10px] text-muted-foreground">Natural language data analysis</div></div>
            </button>

            <button @click="onAddTab('query')" class="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-blue-500/40 transition-all text-left group">
              <div class="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0"><FileCode class="w-5 h-5 text-blue-500" /></div>
              <div class="space-y-0.5"><div class="text-sm font-semibold">SQL Console</div><div class="text-[10px] text-muted-foreground">Raw query and playground</div></div>
            </button>

            <button @click="onAddTab('dataview')" class="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-emerald-500/40 transition-all text-left group">
              <div class="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0"><Plus class="w-5 h-5 text-emerald-500" /></div>
              <div class="space-y-0.5"><div class="text-sm font-semibold">Data View</div><div class="text-[10px] text-muted-foreground">Interactive grid and formulas</div></div>
            </button>

            <button @click="onAddTab('note')" class="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-orange-500/40 transition-all text-left group">
              <div class="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0"><StickyNote class="w-5 h-5 text-orange-500" /></div>
              <div class="space-y-0.5"><div class="text-sm font-semibold">New Note</div><div class="text-[10px] text-muted-foreground">Documentation and drafts</div></div>
            </button>
          </div>

          <div class="text-[10px] text-muted-foreground/30 font-medium uppercase tracking-[0.2em] pt-8">Drop CSV to import</div>
        </div>
      </div>

      <template v-for="tab in (tabs as any)" :key="tab.id">
        <div v-if="tab.id === activeTabId" class="w-full h-full flex flex-col overflow-hidden">

          <!-- Data View (Universal) -->
          <DataView 
            v-if="['dataview', 'table', 'spreadsheet', 'datastudio'].includes(tab.type)"
            :ref="(el) => { if (tab.id === activeTabId) studioRef = el }"
            :engine="getEngineForTab(tab.id)"
            :loading="loadingTabIds.has(tab.id)"
            :view-id="tab.data?.viewId"
            :is-excel-source="tab.data?.isExcelSource"
            :is-saved-view="tab.data?.isSavedView"
            :is-compact="studioIsCompact"
            :ai-command="studioAICommand"
            @update:staged-count="(v) => studioStagedCount = v"
            @update:is-saved-view="(v) => studioIsSavedView = v"
            @update:is-a-i-processing="(v) => studioIsAIProcessing = v"
            @save="handleStudioSave"
          />

          <!-- Spreadsheet Grid (Legacy - Commented out) -->
          <!-- 
          <Grid 
            v-else-if="false"
            :ref="(el: any) => setGridRef(el, tab.id)"
            :engine="getEngineForTab(tab.id)"
            ...
          /> 
          -->

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
            @generate-insights="(payload) => emit('generate-insights', payload)"
          />

          <!-- SQL Console -->
          <QueryEditorView
            v-else-if="tab.type === 'query'"
            :model-value="tab.data?.content || ''"
            :is-thinking="props.isThinking"
            :label="tab.label"
            :alias="props.alias"
            @update:model-value="(val) => handleTabInputUpdate(tab.id, tab.type, val)"
            @update:alias="(val: string) => emit('update:alias', val)"
            @submit="emit('submit')"
            @save="() => { /* handled by auto-save */ }"
            @explain-query="(q) => emit('explain-query', q)"
            @optimize-query="(q) => emit('optimize-query', { query: q, connection: tab.data?.connection, provider: tab.data?.provider })"
          />

          <!-- Note Editor -->
          <RichTextEditor
            :ref="(el: any) => { noteEditorRef = el }"
            v-else-if="tab.type === 'note'"
            :content="tab.data?.content || ''"
            :file-type="tab.data?.file_type || 'md'"
            :file-name="tab.data?.title"
            :auto-save="true"
            :is-private="tab.data?.isPrivate || false"
            @update:content="(val) => workspaceStore.updateTabData(tab.id, { content: val })"
            @save="(val) => handleNoteSave(tab.id, val)"
            @share="emit('share')"
            @download="handleNoteDownload"
            @update:is-private="(val) => handleNotePrivacyChange(val)"
          />

          <!-- File Viewer -->
          <FileViewer
            v-else-if="tab.type === 'file'"
            :file="{
              filename: tab.data?.filename || '',
              file_type: tab.data?.file_type || '',
              storage_path: tab.data?.storage_path,
              content: tab.data?.content,
              id: tab.data?.itemId || tab.data?.id
            }"
            @download="handleFileDownload(tab.data)"
          />

          <!-- No duplicate needed here -->

          <!-- Default New Tab Picker -->
          <div 
            v-else-if="tab.type === 'default'"
            class="w-full h-full flex flex-col items-center justify-center p-8 bg-background/40 backdrop-blur-sm animate-in fade-in duration-500"
          >
            <div class="max-w-2xl w-full text-center space-y-8">
              <div class="space-y-3">
                <div class="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/5 border border-primary/10 mb-2">
                  <Layout class="w-8 h-8 text-primary/60" />
                </div>
                <h2 class="text-3xl font-semibold tracking-tight text-foreground">Where do you want to fly today?</h2>
                <p class="text-base text-muted-foreground/80 max-w-sm mx-auto">Select a starting point for your new tab.</p>
              </div>

              <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <button @click="workspaceStore.updateTab(tab.id, { type: 'chat', label: 'AI Chat' })" class="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-purple-500/40 transition-all group lg:aspect-square justify-center">
                  <div class="w-10 h-10 rounded-full bg-purple-500/10 cursor-pointer flex items-center justify-center group-hover:scale-110 transition-transform"><MessageSquare class="w-5 h-5 text-purple-500" /></div>
                  <span class="text-xs font-semibold">AI Chat</span>
                </button>
                <button @click="workspaceStore.updateTab(tab.id, { type: 'query', label: 'SQL Query' })" class="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-blue-500/40 transition-all group lg:aspect-square justify-center">
                  <div class="w-10 h-10 rounded-full bg-blue-500/10 cursor-pointer flex items-center justify-center group-hover:scale-110 transition-transform"><FileCode class="w-5 h-5 text-blue-500" /></div>
                  <span class="text-xs font-semibold">SQL</span>
                </button>
                <button @click="workspaceStore.updateTab(tab.id, { type: 'dataview', label: 'Data View' })" class="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-emerald-500/40 transition-all group lg:aspect-square justify-center">
                  <div class="w-10 h-10 rounded-full bg-emerald-500/10 cursor-pointer flex items-center justify-center group-hover:scale-110 transition-transform"><Sparkles class="w-5 h-5 text-emerald-500" /></div>
                  <span class="text-xs font-semibold">Data View</span>
                </button>
                <button @click="workspaceStore.updateTab(tab.id, { type: 'note', label: 'New Note' })" class="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-orange-500/40 transition-all group lg:aspect-square justify-center">
                  <div class="w-10 h-10 rounded-full bg-orange-500/10 cursor-pointer flex items-center justify-center group-hover:scale-110 transition-transform"><StickyNote class="w-5 h-5 text-orange-500" /></div>
                  <span class="text-xs font-semibold">Note</span>
                </button>
                <button @click="workspaceStore.updateTab(tab.id, { type: 'file', label: 'New File' })" class="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card/50 hover:bg-muted/80 hover:border-indigo-500/40 transition-all group lg:aspect-square justify-center">
                  <div class="w-10 h-10 rounded-full bg-indigo-500/10 cursor-pointer flex items-center justify-center group-hover:scale-110 transition-transform"><FileText class="w-5 h-5 text-indigo-500" /></div>
                  <span class="text-xs font-semibold">File</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      </template>
    </div>
  </div>
</template>
