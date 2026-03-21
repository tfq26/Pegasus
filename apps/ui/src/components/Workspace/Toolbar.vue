<script setup lang="ts">
import { ref, computed } from 'vue'
import ToolbarChat from './Toolbars/ToolbarChat.vue'
import ToolbarQuery from './Toolbars/ToolbarQuery.vue'
import ToolbarDataView from './Toolbars/ToolbarDataView.vue'

const props = defineProps<{
  mode: 'chat' | 'write' | 'spreadsheet' | 'note' | 'file' | 'dataview'
  connections: any[]
  selectedConnectionId: string
  isExecuting: boolean
  aiOptions: { model: string | null; temperature: number }
  queryOptions: { timeout: number; limit: number; autoCommit: boolean }
  availableModels?: any[]
  saveStatus?: 'saved' | 'saving' | 'error'
  aiMode?: boolean
  autoExecute?: boolean
  privateMode?: boolean
  liveMode?: boolean  // NEW: Collaboration mode
  collaboratorCount?: number  // NEW
  canUndo?: boolean
  canRedo?: boolean
  queryHistory?: any[]
  isSyncing?: boolean
  versions?: any[]
  currentVersion?: number
  textWrap?: boolean
  showGridlines?: boolean
  hasUncommittedChanges?: boolean
  noteIsPrivate?: boolean
  noteFileType?: 'txt' | 'md' | 'docx' | 'pdf'
  noteFormatState?: { bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean }
  noteSaving?: boolean
  zoomLevel?: number
  isDataView?: boolean
  chatName?: string
  
  // Data Studio Specific
  studioTitle?: string
  isExcelSource?: boolean
  isSavedView?: boolean
  stagedCount?: number
  aiCommand?: string
  isAIProcessing?: boolean
}>()

const emit = defineEmits<{
  'update:mode': [value: 'chat' | 'write' | 'spreadsheet']
  'update:selectedConnectionId': [value: string]
  'update:aiOptions': [value: { model: string | null; temperature: number }]
  'update:queryOptions': [value: { timeout: number; limit: number; autoCommit: boolean }]
  'update:auto-execute': [value: boolean]
  'update:private-mode': [value: boolean]
  'update:live-mode': [value: boolean]  // NEW
  'share': []  // NEW
  'merge': []
  'run': []
  'stop': []
  'ai-generate': []
  'clear': []
  'format': [type: string, value?: any]
  'toggle-ai-mode': []
  'visualize': []
  'sanitize': []
  'load-table-to-view': []
  'export': [format: 'csv' | 'xlsx' | 'pdf']
  'refresh-table': []
  'undo': []
  'redo': []
  'toggle-find': []
  'format-sql': []
  'translate': []
  'explain-query': []
  'load-query': [query: string]
  'export-chat': [format: 'json' | 'text']
  'delete-chat': []
  'save': []
  'version-change': [version: number]
  'update:text-wrap': [value: boolean]
  'update:show-gridlines': [value: boolean]
  'note-format': [command: string, value?: string]
  'update:note-is-private': [value: boolean]
  'update:note-file-type': [value: 'txt' | 'md' | 'docx' | 'pdf']
  'note-share': []
  'note-download': []
  'update:zoom-level': [value: number]
  'save-data-view': []
  'update:aiCommand': [value: string]
  'submit-ai-command': []
  'toggle-staging': []
  'delete': []
  'add-row': []
  'add-column': []
  'profile-table': []
}>()

const expanded = ref(false)

// Fallback models if none provided
const defaultModels = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-pro', name: 'Gemini Pro' },
]

const models = computed(() => {
  return props.availableModels && props.availableModels.length > 0 
    ? props.availableModels 
    : defaultModels
})
</script>

<template>
  <div class="border-b border-border/60 bg-background/74 px-3 py-1.5 backdrop-blur-xl">
    <div class="flex items-center justify-between gap-3 rounded-[20px] border border-border/60 bg-card/55 px-2.5 py-1.5 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.5)]">
      <div class="flex w-full items-center gap-2.5">
        
        <!-- Chat Mode -->
        <ToolbarChat
          v-if="mode === 'chat'"
          :ai-options="aiOptions"
          :available-models="models"
          :is-executing="isExecuting"
          @update:ai-options="emit('update:aiOptions', $event)"
          @run="emit('run')"
          @delete-chat="emit('delete-chat')"
          @export-chat="(f) => emit('export-chat', f)"
          :chat-name="chatName"
        />

        <!-- Query Mode -->
        <ToolbarQuery
          v-if="mode === 'write'"
          :query-options="queryOptions"
          :is-executing="isExecuting"
          :query-history="queryHistory"
          @update:query-options="emit('update:queryOptions', $event)"
          @run="emit('run')"
          @stop="emit('stop')"
          @clear="emit('clear')"
          @format-sql="emit('format-sql')"
          @translate="emit('translate')"
          @explain-query="emit('explain-query')"
          @load-query="emit('load-query', $event)"
          @save="emit('save')"
        />

        <!-- Data View Mode -->
        <ToolbarDataView
          v-if="mode === 'dataview'"
          :ai-options="aiOptions"
          :available-models="models"
          :is-executing="isExecuting"
          :title="studioTitle || 'Data View'"
          :is-excel-source="isExcelSource || false"
          :is-data-view="isDataView"
          :is-saved-view="isSavedView || false"
          :staged-count="stagedCount || 0"
          :ai-command="aiCommand || ''"
          :is-a-i-processing="isAIProcessing || false"
          :versions="versions"
          :current-version="currentVersion"
          @update:ai-options="emit('update:aiOptions', $event)"
          @update:ai-command="emit('update:aiCommand', $event)"
          @submit-ai-command="emit('submit-ai-command')"
          @toggle-staging="emit('toggle-staging')"
          @delete="emit('delete')"
          @export="emit('export', 'xlsx')"
          @add-row="emit('add-row')"
          @add-column="emit('add-column')"
          @profile-table="emit('profile-table')"
          @version-change="emit('version-change', $event)"
        />

        <!-- Note/File Mode - formatting handled by embedded toolbar in RichTextEditor -->
      </div>
    </div>
    <div
      v-if="expanded"
      class="mt-2 flex flex-col gap-3 rounded-[20px] border border-border/60 bg-muted/30 px-4 py-3"
    >
      <div class="text-xs text-muted-foreground italic">
        Additional options coming soon...
      </div>
    </div>
  </div>
</template>
