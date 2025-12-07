<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { 
  Play, 
  Square, 
  ChevronDown, 
  ChevronUp, 
  Database, 
  Sparkles,
  Settings,
  Zap,
  Eraser,
  Send,
  Bold, 
  Italic, 
  Underline, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Save,
  FunctionSquare,
  BarChart
} from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { ConnectionEntry } from '@/lib/db-connections'

const props = defineProps<{
  mode: 'chat' | 'write' | 'spreadsheet'
  connections: any[]
  selectedConnectionId: string
  isExecuting: boolean
  aiOptions: { model: string; temperature: number }
  queryOptions: { timeout: number; limit: number; autoCommit: boolean }
  availableModels?: any[]
  saveStatus?: 'saved' | 'saving' | 'error'
  aiMode?: boolean
  autoExecute?: boolean
}>()

const emit = defineEmits<{
  'update:mode': [value: 'chat' | 'write' | 'spreadsheet']
  'update:selectedConnectionId': [value: string]
  'update:aiOptions': [value: { model: string; temperature: number }]
  'update:queryOptions': [value: { timeout: number; limit: number; autoCommit: boolean }]
  'update:auto-execute': [value: boolean]
  'run': []
  'stop': []
  'ai-generate': []
  'clear': []
  'open-excel-editor': []
  'format': [type: string, value?: any]
  'toggle-ai-mode': []
  'visualize': []
  'sanitize': []
  'load-table-to-sheet': []
}>()

const expanded = ref(false)
const activeToolbarTab = ref<'query' | 'ai' | 'settings'>('query')

// Fallback models if none provided
const defaultModels = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-pro', label: 'Gemini Pro' },
]

const aiModels = computed(() => {
  if (props.availableModels && props.availableModels.length > 0) {
    return props.availableModels.map(m => ({
      value: m.id, // Use ID as value (e.g. gemini-1.5-flash)
      label: m.name
    }))
  }
  return defaultModels
})

const selectedConnection = computed(() => 
  props.connections.find(c => c.id === props.selectedConnectionId)
)

const updateAiOption = (key: keyof typeof props.aiOptions, value: any) => {
  emit('update:aiOptions', { ...props.aiOptions, [key]: value })
}

const updateQueryOption = (key: keyof typeof props.queryOptions, value: any) => {
  emit('update:queryOptions', { ...props.queryOptions, [key]: value })
}

watchEffect(() => {
  // If no model selected OR selected model is not in the list of available models
  const currentModelExists = aiModels.value.some(m => m.value === props.aiOptions.model)
  
  if ((!props.aiOptions.model || !currentModelExists) && aiModels.value.length > 0) {
    emit('update:aiOptions', { ...props.aiOptions, model: aiModels.value[0]!.value })
  }
})
</script>

<template>

  <div class="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <!-- Compact Toolbar -->
    <div class="flex items-center justify-between px-4 py-2 gap-4">
      <!-- Left: Mode Toggle & Primary Actions -->
      <div class="flex items-center gap-3 shrink-0">




        <!-- Chat Mode Controls -->
        <div v-if="mode === 'chat'" class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Model</span>
            <Select 
              :model-value="aiOptions.model"
              @update:model-value="updateAiOption('model', $event)"
            >
              <SelectTrigger class="w-[180px] h-8 text-xs text-muted-foreground bg-background border-border focus:ring-primary focus:border-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="model in aiModels"
                  :key="model.value"
                  :value="model.value"
                >
                  {{ model.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div class="flex items-center gap-2">
             <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Temp</span>
             <input
              :value="aiOptions.temperature"
              @input="updateAiOption('temperature', Number(($event.target as HTMLInputElement).value))"
              type="range"
              min="0"
              max="1"
              step="0.1"
              class="w-24 h-2 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer accent-primary"
              :title="`Temperature: ${aiOptions.temperature}`"
            />
          </div>

          <!-- Send Button -->
          <button
            @click="emit('run')"
            :disabled="isExecuting"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-wait ml-2"
          >
            <Send v-if="!isExecuting" class="w-3.5 h-3.5" />
            <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isExecuting ? 'Sending...' : 'Send' }}
          </button>
          
          <!-- Clear Button -->
          <button
            @click="emit('clear')"
            class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Clear chat"
          >
            <Eraser class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Write Mode Controls -->
        <div v-if="mode === 'write'" class="flex items-center gap-3">
          <!-- Run Button -->
          <button
            @click="emit('run')"
            :disabled="isExecuting"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-wait"
            title="Execute query (Ctrl+Enter)"
          >
            <Play v-if="!isExecuting" class="w-3.5 h-3.5 fill-current" />
            <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isExecuting ? 'Running...' : 'Run' }}
          </button>

          <!-- Clear Button -->
          <button
            @click="emit('stop')" 
            v-if="isExecuting"
            class="p-1.5 rounded-md text-destructive hover:bg-muted hover:text-destructive/80 transition-colors"
            title="Stop execution"
          >
            <Square class="w-3.5 h-3.5 fill-current" />
          </button>

          <!-- AI Generate Button
          <button
            @click="emit('ai-generate')"
            :disabled="isExecuting"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-md hover:shadow-lg hover:shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-wait"
            title="Generate query from natural language"
          >
            <Sparkles v-if="!isExecuting" class="w-3.5 h-3.5" />
            <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isExecuting ? 'Generating...' : 'Generate SQL' }}
          </button> -->

          <!-- Clear Button -->
          <button
            @click="emit('clear')"
            class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Clear editor"
          >
            <Eraser class="w-3.5 h-3.5" />
          </button>

          <!-- Inline Query Options -->
          <div class="flex items-center gap-3">
             <div class="flex items-center gap-2" title="Query Timeout (seconds)">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Timeout</span>
                <input
                  :value="queryOptions.timeout"
                  @input="updateQueryOption('timeout', Number(($event.target as HTMLInputElement).value))"
                  type="number"
                  min="1"
                  max="300"
                  class="w-16 px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                />
             </div>

             <div class="flex items-center gap-2" title="Max Rows">
                <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Limit</span>
                <input
                  :value="queryOptions.limit"
                  @input="updateQueryOption('limit', Number(($event.target as HTMLInputElement).value))"
                  type="number"
                  min="1"
                  max="100000"
                  class="w-20 px-2 py-1 text-xs rounded-md border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                />
             </div>

             <div class="flex items-center gap-2" title="Auto-commit Transaction">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    :checked="queryOptions.autoCommit"
                    @change="updateQueryOption('autoCommit', ($event.target as HTMLInputElement).checked)"
                    type="checkbox"
                    class="rounded border-border bg-background text-primary focus:ring-primary w-4 h-4"
                  />
                  <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Auto-commit</span>
                </label>
             </div>
          </div>
        </div>

        <!-- Spreadsheet Mode Controls -->
        <div v-if="mode === 'spreadsheet'" class="flex items-center gap-3">
          <!-- AI Mode Toggle -->
          <div class="flex items-center gap-1 border-r border-border pr-3 mr-1">
            <button
              @click="emit('toggle-ai-mode')"
              class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all"
              :class="props.aiMode 
                ? 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20' 
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
              :title="props.aiMode ? 'Switch to Formula Mode' : 'Switch to AI Mode'"
            >
              <Sparkles v-if="props.aiMode" class="w-3.5 h-3.5" />
              <FunctionSquare v-else class="w-3.5 h-3.5" />
              <span v-if="props.aiMode">AI Mode</span>
              <span v-else>Formula</span>
            </button>
          </div>

          <!-- Formatting Tools -->
          <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'bold')"
              title="Bold (Ctrl+B)"
            >
              <Bold class="w-3.5 h-3.5" />
            </button>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'italic')"
              title="Italic (Ctrl+I)"
            >
              <Italic class="w-3.5 h-3.5" />
            </button>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'underline')"
              title="Underline (Ctrl+U)"
            >
              <Underline class="w-3.5 h-3.5" />
            </button>
          </div>

          <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'align', 'left')"
              title="Align Left"
            >
              <AlignLeft class="w-3.5 h-3.5" />
            </button>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'align', 'center')"
              title="Align Center"
            >
              <AlignCenter class="w-3.5 h-3.5" />
            </button>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'align', 'right')"
              title="Align Right"
            >
              <AlignRight class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Visualize Button -->
          <button
            @click="emit('visualize')"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all mr-2"
            title="Create Visualization"
          >
            <BarChart class="w-3.5 h-3.5" />
            <span>Visualize</span>
          </button>

          <!-- Sanitize Button -->
          <button
            @click="emit('sanitize')"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-all mr-2"
            title="Sanitize Data"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>Sanitize</span>
          </button>

          </div>
      </div>

      <!-- Right: Expand Button -->
      <div class="flex items-center gap-2">
         <!-- Save Status Indicator -->
          <div class="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30 text-xs font-medium">
            <template v-if="saveStatus === 'saving'">
              <span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
              <span class="text-muted-foreground">Saving...</span>
            </template>
            <template v-else-if="saveStatus === 'error'">
              <span class="w-2 h-2 rounded-full bg-destructive"></span>
              <span class="text-destructive">Error</span>
            </template>
            <template v-else>
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
              <span class="text-muted-foreground">Saved</span>
            </template>
          </div>

        <button
          @click="expanded = !expanded"
          class="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          title="Toggle advanced options"
        >
          <ChevronDown v-if="!expanded" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Expanded Toolbar Options -->
    <div
      v-if="expanded"
      class="border-t border-border px-4 py-3 bg-muted/50 flex flex-col gap-3"
    >
      <div v-if="mode === 'spreadsheet' && aiMode" class="flex items-center gap-2">
        <Switch
          :checked="autoExecute"
          @update:checked="emit('update:auto-execute', $event)"
          id="auto-exec-mode"
        />
        <label for="auto-exec-mode" class="text-sm font-medium text-foreground cursor-pointer select-none">
          Auto-Execute (AI Formuas)
        </label>
      </div>
      <div v-else class="text-xs text-muted-foreground italic">
        More advanced options will appear here depending on context...
      </div>
    </div>

    <!-- Connection Info Bar (when connection selected) -->
    <div
      v-if="selectedConnection"
      class="border-t border-border px-4 py-1.5 bg-muted/30 flex items-center justify-between text-[10px]"
    >
      <div class="flex items-center gap-4 text-muted-foreground">
        <span>
          <span class="text-muted-foreground/70">Connected:</span>
          <span class="text-foreground ml-1">{{ selectedConnection.nickname }}</span>
        </span>
        <span v-if="selectedConnection.description" class="text-muted-foreground/70">
          {{ selectedConnection.description }}
        </span>
      </div>
      <div class="text-muted-foreground">
        Ready
      </div>
    </div>
  </div>
</template>
