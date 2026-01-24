<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  ChevronDown, 
  ChevronUp, 
} from 'lucide-vue-next'
import ToolbarChat from './Toolbars/ToolbarChat.vue'
import ToolbarQuery from './Toolbars/ToolbarQuery.vue'
import ToolbarSpreadsheet from './Toolbars/ToolbarSpreadsheet.vue'

const props = defineProps<{
  mode: 'chat' | 'write' | 'spreadsheet' | 'note' | 'file'
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
  isSheet?: boolean
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
  'load-table-to-sheet': []
  'export': [format: 'csv' | 'xlsx' | 'pdf']
  'refresh-table': []
  'undo': []
  'redo': []
  'toggle-find': []
  'format-sql': []
  'translate': []
  'explain-query': []
  'load-query': [query: string]
  'export-chat': []
  'save': []
  'toggle-wrangler': []
  'version-change': [version: number]
  'update:text-wrap': [value: boolean]
  'update:show-gridlines': [value: boolean]
  'note-format': [command: string, value?: string]
  'update:note-is-private': [value: boolean]
  'update:note-file-type': [value: 'txt' | 'md' | 'docx' | 'pdf']
  'note-share': []
  'note-download': []
  'update:zoom-level': [value: number]
  'save-sheet': []
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
  <div class="border-b border-border bg-background">
    <!-- Compact Toolbar -->
    <div class="flex items-center justify-between px-2 py-1 gap-2">
      <!-- Left: Mode Controls -->
      <div class="flex items-center gap-3 w-full">
        
        <!-- Chat Mode -->
        <ToolbarChat
          v-if="mode === 'chat'"
          :ai-options="aiOptions"
          :available-models="models"
          :is-executing="isExecuting"
          @update:ai-options="emit('update:aiOptions', $event)"
          @run="emit('run')"
          @clear="emit('clear')"
          @export-chat="emit('export-chat')"
          @toggle-wrangler="emit('toggle-wrangler')"
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

        <!-- Spreadsheet Mode -->
        <ToolbarSpreadsheet
          v-if="mode === 'spreadsheet'"
          :ai-mode="aiMode || false"
          :private-mode="privateMode || false"
          :live-mode="liveMode || false"
          :collaborator-count="collaboratorCount"
          :save-status="saveStatus"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :is-syncing="isSyncing"
          :versions="versions"
          :current-version="currentVersion"
          :text-wrap="textWrap"
          :show-gridlines="showGridlines"
          :has-uncommitted-changes="hasUncommittedChanges"
          :available-models="availableModels"
          :zoom-level="zoomLevel"
          :is-sheet="isSheet"
          @toggle-ai-mode="emit('toggle-ai-mode')"
          @format="(t, v) => emit('format', t, v)"
          @visualize="emit('visualize')"
          @sanitize="emit('sanitize')"
          @update:private-mode="emit('update:private-mode', $event)"
          @update:live-mode="emit('update:live-mode', $event)"
          @share="emit('share')"
          @merge="emit('merge')"
          @export="(f) => emit('export', f)"
          @refresh-table="emit('refresh-table')"
          @undo="emit('undo')"
          @redo="emit('redo')"
          @toggle-find="emit('toggle-find')"
          @commit="emit('save')"
          @save-sheet="emit('save-sheet')"
          @version-change="(v) => emit('version-change', v)"
          @update:text-wrap="(v) => emit('update:text-wrap', v)"
          @update:show-gridlines="(v) => emit('update:show-gridlines', v)"
          @auto-fit="emit('format', 'auto-fit')"
          @update:ai-options="emit('update:aiOptions', $event)"
          @update:zoom-level="emit('update:zoom-level', $event)"
        />

        <!-- Note/File Mode - formatting handled by embedded toolbar in RichTextEditor -->

      </div>

      <!-- Right: Expand Button -->
      <!-- <div class="flex items-center gap-2 shrink-0 border-l border-border pl-2 ml-2">
        <button
          @click="expanded = !expanded"
          class="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          title="Toggle advanced options"
        >
          <ChevronDown v-if="!expanded" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>
      </div> -->
    </div>

    <!-- Expanded Options (Placeholder for now) -->
    <div
      v-if="expanded"
      class="border-t border-border px-4 py-3 bg-muted/50 flex flex-col gap-3"
    >
      <div class="text-xs text-muted-foreground italic">
        Additional options coming soon...
      </div>
    </div>

  </div>
</template>
