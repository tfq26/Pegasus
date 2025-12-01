<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Maximize2, Minimize2, PanelBottom, PanelRight } from 'lucide-vue-next'
import JsonViewer from '@/components/JsonViewer.vue'
import ResultsTable from './ResultsTable.vue'

const props = defineProps<{
  visible: boolean
  position: 'bottom' | 'right'
  result: unknown
  error: string
  lastQuery: string
  loading: boolean
  analysis?: string
  isAnalyzing?: boolean
  history?: any[]
  ambiguity?: { message: string; choices: string[] }
}>()

const emit = defineEmits<{
  'update:position': [value: 'bottom' | 'right']
  'close': []
  'analyze': []
  'resolve-ambiguity': [choice: string]
}>()

const size = ref(300) // Default size in pixels
const isResizing = ref(false)
const isMaximized = ref(false)
const activeTab = ref<'results' | 'messages' | 'history'>('results')
const viewMode = ref<'table' | 'json'>('table')

const startResize = (e: MouseEvent) => {
  isResizing.value = true
  e.preventDefault()
}

const stopResize = () => {
  isResizing.value = false
}

const resize = (e: MouseEvent) => {
  if (!isResizing.value) return
  
  if (props.position === 'bottom') {
    const newSize = window.innerHeight - e.clientY
    size.value = Math.max(150, Math.min(newSize, window.innerHeight - 200))
  } else {
    const newSize = window.innerWidth - e.clientX
    size.value = Math.max(200, Math.min(newSize, window.innerWidth - 300))
  }
}

const toggleMaximize = () => {
  if (isMaximized.value) {
    size.value = 300
  } else {
    size.value = props.position === 'bottom' 
      ? window.innerHeight - 100 
      : window.innerWidth - 100
  }
  isMaximized.value = !isMaximized.value
}

const togglePosition = () => {
  emit('update:position', props.position === 'bottom' ? 'right' : 'bottom')
  size.value = 300 // Reset size when changing position
  isMaximized.value = false
}

const resultType = computed(() => {
  if (!props.result) return null
  if (Array.isArray(props.result)) return 'array'
  if (typeof props.result === 'object') return 'object'
  return 'primitive'
})

const resultCount = computed(() => {
  if (Array.isArray(props.result)) return props.result.length
  return null
})

// Add event listeners for resizing
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', resize)
  window.addEventListener('mouseup', stopResize)
}
</script>

<template>
  <div
    v-if="visible"
    class="bg-stone-950 border-stone-800 flex flex-col relative"
    :class="{
      'border-t': position === 'bottom',
      'border-l': position === 'right',
    }"
    :style="{
      [position === 'bottom' ? 'height' : 'width']: `${size}px`,
      minHeight: position === 'bottom' ? '150px' : undefined,
      minWidth: position === 'right' ? '200px' : undefined,
    }"
  >
    <!-- Resize handle -->
    <div
      class="absolute z-50 hover:bg-violet-500/50 transition-colors"
      :class="{
        'top-0 left-0 right-0 h-1 cursor-ns-resize': position === 'bottom',
        'top-0 bottom-0 left-0 w-1 cursor-ew-resize': position === 'right',
      }"
      @mousedown="startResize"
    />

    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-stone-800 bg-stone-900/50">
      <div class="flex items-center gap-2">
        <!-- Tabs -->
        <button
          v-for="tab in (['results', 'messages', 'history'] as const)"
          :key="tab"
          @click="activeTab = tab"
          class="px-3 py-1 text-xs font-medium rounded transition-colors capitalize"
          :class="
            activeTab === tab
              ? 'bg-violet-600 text-white'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
          "
        >
          {{ tab }}
        </button>
      </div>

      <div class="flex items-center gap-1">
        <!-- Result count badge -->
        <span
          v-if="activeTab === 'results' && resultCount !== null"
          class="px-2 py-1 text-[10px] font-mono bg-violet-500/20 text-violet-300 rounded"
        >
          {{ resultCount }} {{ resultCount === 1 ? 'row' : 'rows' }}
        </span>

        <!-- Position toggle -->
        <button
          @click="togglePosition"
          class="p-1.5 rounded hover:bg-stone-800 text-stone-400 hover:text-violet-400 transition-colors"
          :title="`Move to ${position === 'bottom' ? 'right' : 'bottom'}`"
        >
          <PanelBottom v-if="position === 'right'" class="w-4 h-4" />
          <PanelRight v-else class="w-4 h-4" />
        </button>

        <!-- Maximize toggle -->
        <button
          @click="toggleMaximize"
          class="p-1.5 rounded hover:bg-stone-800 text-stone-400 hover:text-violet-400 transition-colors"
          title="Toggle maximize"
        >
          <Minimize2 v-if="isMaximized" class="w-4 h-4" />
          <Maximize2 v-else class="w-4 h-4" />
        </button>

        <!-- Close -->
        <button
          @click="emit('close')"
          class="p-1.5 rounded hover:bg-stone-800 text-stone-400 hover:text-rose-400 transition-colors"
          title="Close panel"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-4">
      <!-- Results Tab -->
      <div v-if="activeTab === 'results'" class="space-y-3">
        <div v-if="loading" class="flex items-center justify-center py-8 text-stone-500">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-sm">Executing query...</span>
          </div>
        </div>

        <div v-else-if="error" class="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4">
          <div class="flex items-start gap-2">
            <div class="text-rose-400 text-sm font-mono">{{ error }}</div>
          </div>
        </div>

        <div v-else-if="ambiguity" class="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <div class="flex items-start gap-3">
            <div class="p-2 bg-amber-500/20 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-amber-300 font-medium mb-1">Clarification Needed</h3>
              <p class="text-stone-300 text-sm mb-4">{{ ambiguity.message }}</p>
              
              <div class="space-y-2">
                <button
                  v-for="(choice, index) in ambiguity.choices"
                  :key="index"
                  @click="emit('resolve-ambiguity', choice)"
                  class="w-full text-left px-4 py-3 rounded bg-stone-900/50 border border-stone-700 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all group"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-stone-200 group-hover:text-amber-200">{{ choice }}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-stone-500 group-hover:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="result" class="space-y-3">
          <div v-if="lastQuery" class="rounded-lg border border-stone-800 bg-stone-900/50 p-3">
            <div class="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Last Query</div>
            <pre class="text-xs font-mono text-stone-300 whitespace-pre-wrap">{{ lastQuery }}</pre>
          </div>

          <!-- Analysis Section -->
          <div v-if="analysis" class="rounded-lg border border-violet-500/30 bg-violet-500/10 p-4">
            <div class="flex items-center justify-between mb-2">
              <div class="text-[10px] uppercase tracking-wider text-violet-300">AI Analysis</div>
              <button 
                @click="emit('analyze')" 
                class="text-[10px] text-violet-400 hover:text-violet-300 underline"
                :disabled="isAnalyzing"
              >
                {{ isAnalyzing ? 'Regenerating...' : 'Regenerate' }}
              </button>
            </div>
            <div class="text-sm text-stone-200 leading-relaxed whitespace-pre-wrap">{{ analysis }}</div>
          </div>

          <div v-else class="flex justify-end">
            <button
              @click="emit('analyze')"
              :disabled="isAnalyzing"
              class="flex items-center gap-2 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div v-if="isAnalyzing" class="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
              <span>{{ isAnalyzing ? 'Analyzing...' : 'Analyze with AI' }}</span>
            </button>
          </div>

          <div class="rounded-lg border border-stone-800 bg-stone-900/50 p-4 flex flex-col min-h-0">
            <div class="flex items-center justify-between mb-3">
              <div class="text-[10px] uppercase tracking-wider text-stone-500">Query Results</div>
              
              <!-- View Toggle -->
              <div class="flex items-center gap-1 bg-stone-950 rounded p-0.5 border border-stone-800" v-if="Array.isArray(result)">
                <button
                  @click="viewMode = 'table'"
                  class="px-2 py-0.5 text-[10px] font-medium rounded transition-colors"
                  :class="viewMode === 'table' ? 'bg-violet-600 text-white' : 'text-stone-400 hover:text-stone-200'"
                >
                  Table
                </button>
                <button
                  @click="viewMode = 'json'"
                  class="px-2 py-0.5 text-[10px] font-medium rounded transition-colors"
                  :class="viewMode === 'json' ? 'bg-violet-600 text-white' : 'text-stone-400 hover:text-stone-200'"
                >
                  JSON
                </button>
              </div>
            </div>
            
            <div class="flex-1 overflow-hidden min-h-0">
              <ResultsTable 
                v-if="viewMode === 'table' && Array.isArray(result)" 
                :data="result" 
                class="h-full"
              />
              <JsonViewer 
                v-else 
                :data="result" 
                :max-depth="10" 
                class="h-full overflow-auto"
              />
            </div>
          </div>
        </div>

        <div v-else class="flex items-center justify-center py-12 text-stone-600">
          <div class="text-center">
            <div class="text-sm">No results yet</div>
            <div class="text-xs mt-1">Execute a query to see results here</div>
          </div>
        </div>
      </div>

      <!-- Messages Tab -->
      <div v-else-if="activeTab === 'messages'" class="text-stone-500 text-sm">
        <div class="text-center py-12">
          <div>Messages panel</div>
          <div class="text-xs mt-1">Query execution messages will appear here</div>
        </div>
      </div>

      <!-- History Tab -->
      <div v-else class="space-y-3">
        <div v-if="!history || history.length === 0" class="text-center py-12 text-stone-500 text-sm">
          <div>Query history</div>
          <div class="text-xs mt-1">Recent queries will appear here</div>
        </div>
        <div v-else class="space-y-2">
          <div 
            v-for="item in history" 
            :key="item.id"
            class="p-3 rounded-lg border border-stone-800 bg-stone-900/50 hover:border-stone-700 transition-colors"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span 
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                  :class="item.source === 'ai' 
                    ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' 
                    : 'bg-blue-500/10 text-blue-300 border-blue-500/20'"
                >
                  {{ item.source === 'ai' ? 'AI Generated' : 'Manual' }}
                </span>
                <span class="text-[10px] text-stone-500">
                  {{ new Date(item.timestamp).toLocaleTimeString() }}
                </span>
              </div>
              <span 
                v-if="item.status === 'error'"
                class="text-[10px] text-rose-400"
              >
                Failed
              </span>
            </div>
            <pre class="text-xs font-mono text-stone-300 whitespace-pre-wrap overflow-hidden text-ellipsis max-h-20">{{ item.query }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
