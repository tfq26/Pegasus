<script setup lang="ts">
import { ref, computed } from 'vue'
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
  Send
} from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ConnectionEntry } from '@/lib/db-connections'

const props = defineProps<{
  mode: 'chat' | 'write'
  connections: ConnectionEntry[]
  selectedConnectionId: string
  isExecuting: boolean
  aiOptions: { model: string; temperature: number }
  queryOptions: { timeout: number; limit: number; autoCommit: boolean }
  availableModels?: any[]
}>()

const emit = defineEmits<{
  'update:mode': [value: 'chat' | 'write']
  'update:selectedConnectionId': [value: string]
  'update:aiOptions': [value: { model: string; temperature: number }]
  'update:queryOptions': [value: { timeout: number; limit: number; autoCommit: boolean }]
  'run': []
  'stop': []
  'ai-generate': []
  'clear': []
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
</script>

<template>
  <div class="border-b border-stone-800 bg-stone-900/90">
    <!-- Compact Toolbar -->
    <div class="flex items-center justify-between px-4 py-2 gap-4">
      <!-- Left: Mode Toggle & Primary Actions -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- Mode Toggle -->
        <div class="flex items-center gap-1 bg-stone-950 rounded-lg p-1">
          <button
            @click="emit('update:mode', 'chat')"
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            :class="mode === 'chat'
              ? 'bg-violet-600 text-white shadow-lg'
              : 'text-stone-400 hover:text-violet-300'"
          >
            <Sparkles class="w-3.5 h-3.5 inline mr-1" />
            Chat
          </button>
          <button
            @click="emit('update:mode', 'write')"
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            :class="mode === 'write'
              ? 'bg-violet-600 text-white shadow-lg'
              : 'text-stone-400 hover:text-violet-300'"
          >
            <Zap class="w-3.5 h-3.5 inline mr-1" />
            Write
          </button>
        </div>

        <div class="h-6 w-px bg-stone-700"></div>

        <!-- Chat Mode Controls -->
        <div v-if="mode === 'chat'" class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Model</span>
            <Select 
              :model-value="aiOptions.model"
              @update:model-value="updateAiOption('model', $event)"
            >
              <SelectTrigger class="w-[180px] h-8 text-xs bg-stone-950 border-stone-800">
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
             <span class="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Temp</span>
             <input
              :value="aiOptions.temperature"
              @input="updateAiOption('temperature', Number(($event.target as HTMLInputElement).value))"
              type="range"
              min="0"
              max="1"
              step="0.1"
              class="w-24 h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-violet-600"
              :title="`Temperature: ${aiOptions.temperature}`"
            />
          </div>

          <!-- Send Button -->
          <button
            @click="emit('run')"
            :disabled="isExecuting"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-wait ml-2"
          >
            <Send v-if="!isExecuting" class="w-3.5 h-3.5" />
            <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isExecuting ? 'Sending...' : 'Send' }}
          </button>
          
          <!-- Clear Button -->
          <button
            @click="emit('clear')"
            class="p-1.5 rounded-md text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-colors"
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
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-wait"
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
            class="p-1.5 rounded-md text-red-400 hover:bg-stone-800 hover:text-red-300 transition-colors"
            title="Stop execution"
          >
            <Square class="w-3.5 h-3.5 fill-current" />
          </button>

          <!-- AI Generate Button -->
          <button
            @click="emit('ai-generate')"
            :disabled="isExecuting"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-wait"
            title="Generate query from natural language"
          >
            <Sparkles v-if="!isExecuting" class="w-3.5 h-3.5" />
            <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isExecuting ? 'Generating...' : 'Generate SQL' }}
          </button>

          <!-- Clear Button -->
          <button
            @click="emit('clear')"
            class="p-1.5 rounded-md text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-colors"
            title="Clear editor"
          >
            <Eraser class="w-3.5 h-3.5" />
          </button>

          <!-- Inline Query Options -->
          <div class="flex items-center gap-3">
             <div class="flex items-center gap-2" title="Query Timeout (seconds)">
                <span class="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Timeout</span>
                <input
                  :value="queryOptions.timeout"
                  @input="updateQueryOption('timeout', Number(($event.target as HTMLInputElement).value))"
                  type="number"
                  min="1"
                  max="300"
                  class="w-16 px-2 py-1 text-xs rounded-md border border-stone-800 bg-stone-950 text-stone-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
             </div>

             <div class="flex items-center gap-2" title="Max Rows">
                <span class="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Limit</span>
                <input
                  :value="queryOptions.limit"
                  @input="updateQueryOption('limit', Number(($event.target as HTMLInputElement).value))"
                  type="number"
                  min="1"
                  max="100000"
                  class="w-20 px-2 py-1 text-xs rounded-md border border-stone-800 bg-stone-950 text-stone-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
             </div>

             <div class="flex items-center gap-2" title="Auto-commit Transaction">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    :checked="queryOptions.autoCommit"
                    @change="updateQueryOption('autoCommit', ($event.target as HTMLInputElement).checked)"
                    type="checkbox"
                    class="rounded border-stone-700 bg-stone-950 text-violet-600 focus:ring-violet-500 w-4 h-4"
                  />
                  <span class="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Auto-commit</span>
                </label>
             </div>
          </div>
        </div>
      </div>

      <!-- Right: Expand Button -->
      <div class="flex items-center gap-2">
        <button
          @click="expanded = !expanded"
          class="p-1.5 rounded-md text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-colors"
          title="Toggle advanced options"
        >
          <ChevronDown v-if="!expanded" class="w-4 h-4" />
          <ChevronUp v-else class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Expanded Toolbar Options (Future Use) -->
    <div
      v-if="expanded"
      class="border-t border-stone-800 px-4 py-3 bg-stone-950/50"
    >
      <div class="text-xs text-stone-500 italic">
        More advanced options will appear here...
      </div>
    </div>

    <!-- Connection Info Bar (when connection selected) -->
    <div
      v-if="selectedConnection"
      class="border-t border-stone-800 px-4 py-1.5 bg-stone-950/30 flex items-center justify-between text-[10px]"
    >
      <div class="flex items-center gap-4 text-stone-500">
        <span>
          <span class="text-stone-600">Connected:</span>
          <span class="text-stone-400 ml-1">{{ selectedConnection.nickname }}</span>
        </span>
        <span v-if="selectedConnection.description" class="text-stone-600">
          {{ selectedConnection.description }}
        </span>
      </div>
      <div class="text-stone-600">
        Ready
      </div>
    </div>
  </div>
</template>
