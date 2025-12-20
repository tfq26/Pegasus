<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Maximize2, Minimize2, PanelBottom, PanelRight, LayoutDashboard } from 'lucide-vue-next'
import JsonViewer from '@/components/JsonViewer.vue'
import ResultsTable from './ResultsTable.vue'
import { toast } from 'vue-sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

import type { SettingsModel } from '@/views/settings/types'

const props = defineProps<{
  visible: boolean
  position: 'bottom' | 'right'
  result: unknown
  error: string
  lastQuery: string
  loading: boolean
  analysis?: any
  isAnalyzing?: boolean
  history?: any[]
  ambiguity?: { message: string; choices: string[]; reasoning?: string }
  hasRecommendation?: boolean
  settings?: SettingsModel
  initialViewMode?: 'table' | 'json' | 'excel'
}>()

const emit = defineEmits<{
  'update:position': [value: 'bottom' | 'right']
  'close': []
  'analyze': []
  'resolve-ambiguity': [choice: string]
  'create-dashboard-element': []
  'sanitize': []
  'cancel': []
}>()

const size = ref(400) // Default size in pixels
const isResizing = ref(false)
const isMaximized = ref(false)
const activeTab = ref<'results' | 'messages' | 'history'>('results')
import { defineAsyncComponent } from 'vue'
const ExcelEditor = defineAsyncComponent(() => import('@/components/Excel/ExcelEditor.vue'))

const viewMode = ref<'table' | 'json' | 'excel'>('table')

watch(() => props.initialViewMode, (val) => {
  if (val) viewMode.value = val
}, { immediate: true })

const showReasoningDialog = ref(false)

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
import MarkdownIt from 'markdown-it'
import { Copy, Check } from 'lucide-vue-next'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})

const renderMarkdown = (text: string) => {
  if (typeof text !== 'string') return ''
  
  // Convert unicode bullets (•) to markdown bullets for proper rendering
  let processedText = text.replace(/^[•·]\s+/gm, '- ')
  
  // Also handle bullets that might be in the middle of lines
  processedText = processedText.replace(/\n[•·]\s+/g, '\n- ')
  
  return md.render(processedText)
}

const copied = ref(false)
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
    toast.success('Copied to clipboard')
  } catch (e) {
    toast.error('Failed to copy')
  }
}
</script>

<template>
  <div
    class="bg-background border-border flex flex-col relative transition-all duration-300 shrink-0"
    :class="{
      'border-t': position === 'bottom' && visible,
      'border-l': position === 'right' && visible,
    }"
    :style="{
      [position === 'bottom' ? 'height' : 'width']: visible 
        ? (isMaximized ? '100%' : `${size}px`) 
        : '0px',
      minHeight: visible && position === 'bottom' ? '150px' : '0px',
      minWidth: visible && position === 'right' ? '200px' : '0px',
      maxHeight: visible && position === 'bottom' ? '80vh' : undefined,
      maxWidth: visible && position === 'right' ? '80vw' : undefined,
      overflow: visible ? 'hidden' : 'hidden', // Changed to hidden to let inner content scroll
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      display: visible ? 'flex' : 'none' // Force display none when hidden
    }"
  >
    <!-- Resize handle -->
    <div
      class="absolute z-50 hover:bg-primary/50 transition-colors"
      :class="{
        'top-0 left-0 right-0 h-1 cursor-ns-resize': position === 'bottom',
        'top-0 bottom-0 left-0 w-1 cursor-ew-resize': position === 'right',
      }"
      @mousedown="startResize"
    />

    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between px-3 py-2 border-b border-border bg-muted/30 gap-2 shrink-0">
      <div class="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
        <!-- Tabs -->
        <button
          v-for="tab in (['results', 'messages', 'history'] as const)"
          :key="tab"
          @click="activeTab = tab"
          class="px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize whitespace-nowrap"
          :class="
            activeTab === tab
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          "
        >
          {{ tab }}
        </button>
      </div>

      <!-- View Mode Toggle (Table/JSON/Excel) - Only visible in Results tab -->
      <div v-if="activeTab === 'results' && Array.isArray(result)" class="flex items-center bg-muted/50 rounded-md p-0.5 ml-2 border border-border">
        <button
          @click="viewMode = 'table'"
          class="px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors"
          :class="viewMode === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="Table View"
        >
          Table
        </button>
        <button
          @click="viewMode = 'json'"
          class="px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors"
          :class="viewMode === 'json' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="JSON View"
        >
          JSON
        </button>
        <!-- <button
          @click="viewMode = 'excel'"
          class="px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors flex items-center gap-1"
          :class="viewMode === 'excel' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="Excel Editor"
        >
          <LayoutDashboard class="w-3 h-3" />
          Excel
        </button> -->
      </div>

      <div class="flex items-center gap-1 shrink-0 ml-auto">
        <!-- Result count badge -->
        <span
          v-if="activeTab === 'results' && resultCount !== null"
          class="hidden sm:inline-flex px-2 py-1 text-[10px] font-mono bg-primary/10 text-primary rounded whitespace-nowrap"
        >
          {{ resultCount }} {{ resultCount === 1 ? 'row' : 'rows' }}
        </span>

        <!-- Position toggle -->
        <button
          @click="togglePosition"
          class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
          :title="`Move to ${position === 'bottom' ? 'right' : 'bottom'}`"
        >
          <PanelBottom v-if="position === 'right'" class="w-4 h-4" />
          <PanelRight v-else class="w-4 h-4" />
        </button>

        <!-- Maximize toggle -->
        <button
          @click="toggleMaximize"
          class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
          title="Toggle maximize"
        >
          <Minimize2 v-if="isMaximized" class="w-4 h-4" />
          <Maximize2 v-else class="w-4 h-4" />
        </button>

        <!-- Close -->
        <button
          @click="emit('close')"
          class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
          title="Close panel"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-4 min-h-0">
      <!-- Results Tab -->
      <div v-if="activeTab === 'results'" class="flex flex-col space-y-3">
        <div v-if="loading" class="flex flex-col items-center justify-center py-8 text-muted-foreground gap-3">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span class="text-sm">Executing query...</span>
          </div>
          <button 
            @click="emit('cancel')" 
            class="px-3 py-1 rounded bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors"
          >
            Cancel Operation
          </button>
        </div>

        <div v-else-if="error" class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3 relative group">
          <button 
            @click="copyToClipboard(error)"
            class="absolute top-2 right-2 p-1.5 rounded bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors opacity-0 group-hover:opacity-100"
            title="Copy error"
          >
            <Check v-if="copied" class="w-3 h-3" />
            <Copy v-else class="w-3 h-3" />
          </button>
          <div class="flex items-start gap-2">
            <div class="text-destructive text-sm font-mono whitespace-pre-wrap">{{ error }}</div>
          </div>
          
          <!-- Show reasoning if available in the error context (passed via props or parsed from error) -->
          <div 
            v-if="ambiguity?.reasoning" 
            class="text-xs text-muted-foreground border-t border-destructive/20 pt-2 cursor-pointer hover:text-foreground transition-colors"
            @click="showReasoningDialog = true"
          >
            <span class="font-semibold text-foreground">AI Reasoning:</span> 
            <span class="line-clamp-2">{{ ambiguity.reasoning }}</span>
            <span class="text-[10px] text-primary mt-1 block">Click to view full log</span>
          </div>
        </div>

        <div v-else-if="ambiguity" class="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <div class="flex items-start gap-3">
            <div class="p-2 bg-amber-500/20 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-amber-500 font-medium mb-1">Clarification Needed</h3>
              <p class="text-foreground text-sm mb-4">{{ ambiguity.message }}</p>
              
              <div class="space-y-2">
                <button
                  v-for="(choice, index) in ambiguity.choices"
                  :key="index"
                  @click="emit('resolve-ambiguity', choice)"
                  class="w-full text-left px-4 py-3 rounded bg-muted/50 border border-border hover:border-amber-500/50 hover:bg-amber-500/10 transition-all group"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400">{{ choice }}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground group-hover:text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="result" class="space-y-3">
          <!-- Analysis Section -->
          <div v-if="analysis" class="rounded-lg border border-primary/30 bg-primary/10 p-4">
            <div class="flex items-center justify-between mb-2">
              <div class="text-[10px] uppercase tracking-wider text-primary">AI Analysis</div>
              <button 
                @click="emit('analyze')" 
                class="text-[10px] text-primary hover:text-primary/80 underline"
                :disabled="isAnalyzing"
              >
                {{ isAnalyzing ? 'Regenerating...' : 'Regenerate' }}
              </button>
            </div>
            
            <div v-if="analysis.extractedList && analysis.extractedList.length" class="mb-3">
              <div class="text-xs font-semibold text-primary mb-1">Extracted Answer:</div>
              <div class="flex flex-wrap gap-2">
                <span 
                  v-for="(item, idx) in analysis.extractedList" 
                  :key="idx"
                  class="px-2 py-1 rounded bg-primary/20 text-primary text-xs border border-primary/30"
                >
                  {{ item }}
                </span>
              </div>
            </div>
            
            <div class="text-sm text-foreground leading-relaxed prose prose-invert prose-sm max-w-none dark:prose-invert prose-stone" v-html="renderMarkdown(analysis.answer || analysis.summary || analysis)"></div>
          </div>

          <!-- Check if this is a multi-step result -->
          <template v-if="Array.isArray(result) && result.length > 0 && result[0]?.explanation">
            <!-- Multi-step results -->
            <div v-for="(step, idx) in result" :key="idx" class="space-y-2">
              <div class="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border">
                <div class="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                  {{ idx + 1 }}
                </div>
                <div class="text-sm text-foreground font-medium">{{ step.explanation }}</div>
              </div>
              
              <div v-if="step.error" class="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <div class="text-destructive text-sm font-mono">{{ step.error }}</div>
              </div>
              
              <div v-else-if="step.result" class="rounded-lg border border-border overflow-hidden">
                <!-- Check if this is a scalar result (e.g., from RETURN statement) -->
                <div v-if="step.result.rows !== undefined && typeof step.result.rows === 'number'" 
                     class="p-6 bg-gradient-to-br from-primary/5 to-primary/10">
                  <div class="text-center">
                    <div class="text-4xl font-bold text-primary mb-2">
                      {{ (() => {
                        const val = step.result.rows;
                        const exp = step.explanation.toLowerCase();
                        // Currency formatting for salary/price/cost/revenue
                        if (exp.includes('salary') || exp.includes('price') || exp.includes('cost') || exp.includes('revenue') || exp.includes('amount')) {
                          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
                        }
                        // Percentage formatting
                        if (exp.includes('percent') || exp.includes('rate')) {
                          return `${val.toFixed(1)}%`;
                        }
                        // Default: number with thousand separators
                        return val.toLocaleString('en-US');
                      })() }}
                    </div>
                    <div class="text-xs text-muted-foreground uppercase tracking-wider">
                      {{ step.explanation.toLowerCase().includes('average') ? 'Average' : 
                         step.explanation.toLowerCase().includes('total') || step.explanation.toLowerCase().includes('sum') ? 'Total' :
                         step.explanation.toLowerCase().includes('count') ? 'Count' : 'Result' }}
                    </div>
                  </div>
                </div>
                <!-- Array results (table view) -->
                <ResultsTable 
                  v-else-if="Array.isArray(step.result) && step.result.length > 0" 
                  :data="step.result" 
                  :settings="settings"
                />
                <!-- Other results (JSON view) -->
                <div v-else class="p-4 text-sm text-muted-foreground">
                  <JsonViewer :data="step.result" :max-depth="3" />
                </div>
              </div>
            </div>
          </template>

          <!-- Single-step result (original logic) -->
          <template v-else>
            <div class="flex flex-wrap items-center justify-between mb-3 gap-2">
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Query Results</div>
              
              <div class="flex flex-wrap items-center gap-2">
                <!-- Analyze Button -->
                <button
                  v-if="!analysis"
                  @click="emit('analyze')"
                  :disabled="isAnalyzing"
                  class="flex items-center gap-2 px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <div v-if="isAnalyzing" class="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                  <span>{{ isAnalyzing ? 'Analyzing...' : 'Analyze with AI' }}</span>
                </button>

                <!-- Visualize Button -->
                <button
                  v-if="Array.isArray(result) && result.length > 0"
                  @click="emit('create-dashboard-element')"
                  class="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
                >
                  <LayoutDashboard class="w-3 h-3" />
                  <span>Visualize</span>
                </button>

                <!-- Sanitize Button -->
                <button
                  v-if="Array.isArray(result) && result.length > 0"
                  @click="emit('sanitize')"
                  class="flex items-center gap-2 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
                  title="Clean up data quality issues"
                >
                  <div class="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles w-3 h-3 mr-1"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                    <span>Sanitize</span>
                  </div>
                </button>

                <!-- View Toggle moved to header -->

              </div>
            </div>
            
            <div class="flex-1 overflow-hidden min-h-0">
              <ContextMenu>
                <ContextMenuTrigger class="h-full w-full">
                  <ResultsTable 
                    v-if="viewMode === 'table' && Array.isArray(result)" 
                    :data="result" 
                    :settings="settings"
                    class="h-full"
                  />
                  <ExcelEditor
                    v-else-if="viewMode === 'excel' && Array.isArray(result)"
                    :data="result"
                    class="h-full"
                  />
                  <JsonViewer 
                    v-else 
                    :data="result" 
                    :max-depth="10" 
                    class="h-full overflow-auto"
                  />
                </ContextMenuTrigger>
                <ContextMenuContent class="w-64 bg-popover border-border">
                  <ContextMenuItem @select="emit('create-dashboard-element')" class="text-foreground hover:bg-muted focus:bg-muted">
                    Create Dashboard Element
                  </ContextMenuItem>
                  <ContextMenuItem @select="emit('analyze')" class="text-foreground hover:bg-muted focus:bg-muted">
                    Analyze Results
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          </template>
        </div>
        <div v-else class="flex items-center justify-center py-12 text-muted-foreground">
          <div class="text-center">
            <div class="text-sm">No results yet</div>
            <div class="text-xs mt-1">Execute a query to see results here</div>
          </div>
        </div>
      </div>

      <!-- Messages Tab -->
      <div v-else-if="activeTab === 'messages'" class="text-muted-foreground text-sm">
        <div class="text-center py-12">
          <div>Messages panel</div>
          <div class="text-xs mt-1">Query execution messages will appear here</div>
        </div>
      </div>

      <!-- History Tab -->
      <div v-else class="space-y-3">
        <div v-if="!history || history.length === 0" class="text-center py-12 text-muted-foreground text-sm">
          <div>Query history</div>
          <div class="text-xs mt-1">Recent queries will appear here</div>
        </div>
        <div v-else class="space-y-2">
          <div 
            v-for="item in history" 
            :key="item.id"
            class="p-3 rounded-lg border border-border bg-muted/50 hover:border-muted-foreground/30 transition-colors"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span 
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                  :class="item.source === 'ai' 
                    ? 'bg-primary/10 text-primary border-primary/20' 
                    : 'bg-blue-500/10 text-blue-500 border-blue-500/20'"
                >
                  {{ item.source === 'ai' ? 'AI Generated' : 'Manual' }}
                </span>
                <span class="text-[10px] text-muted-foreground">
                  {{ new Date(item.timestamp).toLocaleTimeString() }}
                </span>
              </div>
              <span 
                v-if="item.status === 'error'"
                class="text-[10px] text-destructive"
              >
                Failed
              </span>
            </div>
            <pre class="text-xs font-mono text-foreground whitespace-pre-wrap overflow-hidden text-ellipsis max-h-20">{{ item.query }}</pre>
          </div>
        </div>
      </div>
    </div>
    <!-- Reasoning Dialog -->
    <div v-if="showReasoningDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" @click.self="showReasoningDialog = false">
      <div class="bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 class="text-sm font-medium text-foreground">AI Reasoning Log</h3>
          <button @click="showReasoningDialog = false" class="text-muted-foreground hover:text-foreground">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="p-4 overflow-auto">
          <pre class="text-xs font-mono text-foreground whitespace-pre-wrap leading-relaxed">{{ ambiguity?.reasoning }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
```
