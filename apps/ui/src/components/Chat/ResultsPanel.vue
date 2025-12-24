<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Maximize2, Minimize2, PanelBottom, PanelRight, LayoutDashboard, Table } from 'lucide-vue-next'
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
  analysis?: {
    prediction?: {
      value: string
      confidence: number
      reasoning: string
    }
  }
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
  'open-spreadsheet': []
  'sanitize': []
  'cancel': []
}>()

const size = ref(320) // Default size in pixels
const isResizing = ref(false)
const isMaximized = ref(false)
const activeTab = ref<'output' | 'insights' | 'problems' | 'execution' | 'versioning'>('output')
import { defineAsyncComponent, unref } from 'vue'
const ExcelEditor = defineAsyncComponent(() => import('@/components/Excel/ExcelEditor.vue'))
import { AlertCircle, Activity, GitBranch, Terminal as TerminalIcon, History, Command, Info, Gauge, Brain, Sparkles } from 'lucide-vue-next'

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

const executionMetrics = computed(() => {
  // Placeholder for real metrics from Engine
  return {
    time: '42ms',
    rows: resultCount.value || 0,
    cost: '$0.001',
    status: props.error ? 'failed' : 'success'
  }
})

const problemsCount = computed(() => {
  return props.error ? 1 : 0
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
    class="bg-[#0a0a0b] border-stone-800/50 flex flex-col relative transition-all duration-300 shrink-0"
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
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      display: visible ? 'flex' : 'none'
    }"
  >
    <!-- Technical Grid Background -->
    <div class="absolute inset-0 pointer-events-none z-0 opacity-[0.02]" 
         style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 24px 24px;">
    </div>

    <!-- Thinking Progress Bar -->
    <div v-if="props.loading" class="absolute top-0 left-0 right-0 h-[2px] bg-stone-900 z-[60] overflow-hidden">
       <div class="h-full bg-violet-500 animate-[progress_1.5s_infinite_linear] shadow-[0_0_8px_theme(colors.violet.500)]" style="width: 30%"></div>
    </div>

    <!-- Resize handle -->
    <div
      class="absolute z-50 hover:bg-violet-500/20 transition-all duration-300"
      :class="{
        'top-0 left-0 right-0 h-1.5 cursor-ns-resize': position === 'bottom',
        'top-0 bottom-0 left-0 w-1.5 cursor-ew-resize': position === 'right',
      }"
      @mousedown="startResize"
    />

    <!-- Header / Tab Bar -->
    <div class="flex items-center justify-between px-4 py-1.5 bg-stone-900/40 backdrop-blur-md border-b border-stone-800/50 shrink-0 z-10">
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-1 bg-stone-950/30 p-0.5 rounded-lg border border-stone-800/30">
          <button
            v-for="tab in ([
              { id: 'output', label: 'Output', icon: Table, count: ref(0) },
              { id: 'insights', label: 'Insights', icon: Brain, count: computed(() => props.analysis?.prediction ? 1 : 0) },
              { id: 'problems', label: 'Problems', icon: AlertCircle, count: problemsCount },
              { id: 'execution', label: 'Execution', icon: Gauge, count: ref(0) },
              { id: 'versioning', label: 'Versioning', icon: GitBranch, count: ref(0) }
            ] as const)"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex items-center gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all relative group"
            :class="
              activeTab === tab.id
                ? 'bg-stone-800 text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-300'
            "
          >
             <component :is="tab.icon" class="w-3 h-3" :class="activeTab === tab.id ? 'text-violet-400' : 'text-stone-600 group-hover:text-stone-400'" />
             <span>{{ tab.label }}</span>
             <span v-if="unref(tab.count) > 0" class="flex items-center justify-center min-w-[14px] h-[14px] px-1 bg-rose-500 text-white text-[8px] font-black rounded-full ml-1">
               {{ unref(tab.count) }}
             </span>
          </button>
        </div>

        <!-- View Mode (Table/JSON) -->
        <div v-if="activeTab === 'output' && Array.isArray(result)" class="flex items-center gap-1.5 pl-4 border-l border-stone-800/50">
          <button
            @click="viewMode = 'table'"
            class="p-1 px-2 rounded transition-all text-[10px] font-bold uppercase tracking-tighter"
            :class="viewMode === 'table' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_10px_-4px_theme(colors.violet.500)]' : 'text-stone-500 hover:text-stone-300'"
          >
            Tabular
          </button>
          <button
            @click="viewMode = 'json'"
            class="p-1 px-2 rounded transition-all text-[10px] font-bold uppercase tracking-tighter"
            :class="viewMode === 'json' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_10px_-4px_theme(colors.violet.500)]' : 'text-stone-500 hover:text-stone-300'"
          >
            Object
          </button>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Result count badge -->
        <div
          v-if="activeTab === 'output' && resultCount !== null"
          class="flex items-center gap-2 px-2 py-0.5 bg-stone-950 border border-stone-800/50 rounded-full"
        >
          <div class="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]"></div>
          <span class="text-[10px] font-mono text-stone-400">
            {{ resultCount.toLocaleString() }} records
          </span>
        </div>
        
        <!-- Status Indicator (Pulsing Dot) -->
        <div class="flex items-center gap-1.5 px-2 py-0.5 bg-stone-900/50 border border-stone-800/50 rounded-md">
           <div :class="`w-1.5 h-1.5 rounded-full ${props.error ? 'bg-rose-500 shadow-[0_0_8px_theme(colors.rose.500)]' : (props.loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]')}`"></div>
           <span class="text-[9px] font-black uppercase tracking-tighter text-stone-500">
             {{ props.error ? 'Protocol Failure' : (props.loading ? 'Processing' : 'System Secure') }}
           </span>
        </div>

        <div class="h-4 w-px bg-stone-800 mx-1"></div>

        <!-- Utility Group -->
        <div class="flex items-center gap-1">
          <button
            @click="togglePosition"
            class="p-1.5 rounded-lg text-stone-500 hover:text-violet-400 hover:bg-stone-800/50 transition-all"
            :title="`Dock to ${position === 'bottom' ? 'right' : 'bottom'}`"
          >
            <PanelBottom v-if="position === 'right'" class="w-3.5 h-3.5" />
            <PanelRight v-else class="w-3.5 h-3.5" />
          </button>

          <button
            @click="toggleMaximize"
            class="p-1.5 rounded-lg text-stone-500 hover:text-violet-400 hover:bg-stone-800/50 transition-all"
          >
            <Minimize2 v-if="isMaximized" class="w-3.5 h-3.5" />
            <Maximize2 v-else class="w-3.5 h-3.5" />
          </button>

          <button
            @click="emit('close')"
            class="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Panel Content -->
    <div class="flex-1 overflow-hidden relative z-10 flex flex-col">
      <!-- Loading Overlay -->
      <Transition name="fade">
        <div v-if="loading" class="absolute inset-0 bg-[#0a0a0b]/60 backdrop-blur-[2px] z-[50] flex flex-col items-center justify-center space-y-4">
           <div class="flex items-center gap-3 px-4 py-2 bg-stone-900 border border-stone-800 rounded-full shadow-2xl">
              <Loader2 class="w-4 h-4 text-violet-400 animate-spin" />
              <span class="text-[11px] font-black uppercase tracking-[0.2em] text-stone-200">Executing Data Protocol</span>
           </div>
           <button @click="emit('cancel')" class="text-[9px] font-bold uppercase tracking-widest text-stone-500 hover:text-rose-400 underline decoration-rose-400/30">
              Abort Operation
           </button>
        </div>
      </Transition>

      <div class="flex-1 overflow-auto">
        <!-- Output View -->
        <div v-if="activeTab === 'output'" class="h-full flex flex-col">
          <div v-if="error" class="m-6 p-6 rounded-2xl border border-rose-500/20 bg-rose-500/5 relative group animate-in fade-in slide-in-from-top-4 duration-500">
             <!-- Error content remains the same ... -->
             <div class="flex items-start gap-4">
               <div class="w-10 h-10 shrink-0 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                  <X class="w-5 h-5" />
               </div>
               <div class="flex-1 min-w-0">
                  <h4 class="text-xs font-black uppercase tracking-widest text-rose-500 mb-2">Protocol Failure</h4>
                  <p class="text-[13px] font-mono text-stone-300 break-words leading-relaxed">{{ error }}</p>
               </div>
             </div>
             
             <button 
                @click="copyToClipboard(error)"
                class="absolute top-4 right-4 p-2 rounded-lg bg-stone-900 border border-stone-800 text-stone-500 hover:text-stone-100 opacity-0 group-hover:opacity-100 transition-all"
              >
                <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" />
              </button>
          </div>

          <div v-else-if="result" class="h-full flex flex-col p-3 space-y-3">
             <!-- Results table content remains the same ... -->
             <div v-if="Array.isArray(result) && result.length > 0" class="flex items-center gap-3">
               <button @click="emit('create-dashboard-element')" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-950 hover:bg-white text-[9px] font-black uppercase tracking-widest transition-all shadow-xl shadow-stone-950/20">
                  <LayoutDashboard class="w-3 h-3" />
                  <span>Visualize</span>
               </button>
               <button @click="emit('open-spreadsheet')" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 hover:text-stone-100 hover:border-stone-600 text-[9px] font-black uppercase tracking-widest transition-all">
                  <Table class="w-3 h-3" />
                  <span>Spreadsheet</span>
               </button>
            </div>

            <div class="flex-1 min-h-0 min-w-0 rounded-xl border border-stone-800/50 bg-stone-950/30 overflow-hidden shadow-inner">
               <ResultsTable 
                  v-if="viewMode === 'table' && Array.isArray(result)" 
                  :data="result" 
                  :settings="settings"
                  class="h-full"
                />
                <JsonViewer 
                  v-else 
                  :data="result" 
                  :max-depth="10" 
                  class="h-full overflow-auto p-4"
                />
            </div>
          </div>

          <div v-else class="h-full flex flex-col items-center justify-center p-12 space-y-6 opacity-30 grayscale">
             <div class="relative">
                <div class="absolute inset-0 bg-stone-800/20 blur-3xl rounded-full"></div>
                <div class="relative w-16 h-16 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center transform rotate-12">
                   <PanelBottom class="w-8 h-8 text-stone-700" />
                </div>
             </div>
             <div class="text-center space-y-2">
                <h4 class="text-sm font-black uppercase tracking-[0.2em] text-stone-400">Idle Output</h4>
                <p class="text-xs text-stone-600 max-w-[200px] leading-relaxed">No active protocol stream detected.</p>
             </div>
          </div>
        </div>

        <!-- Problems Tab -->
        <div v-else-if="activeTab === 'problems'" class="h-full flex flex-col p-4">
           <div v-if="!error" class="flex-1 flex flex-col items-center justify-center space-y-4 opacity-40">
              <Check class="w-8 h-8 text-emerald-500" />
              <div class="text-center">
                 <h4 class="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">No Problems Detected</h4>
                 <p class="text-[9px] text-stone-500 font-mono">Clean scan of current operation stream.</p>
              </div>
           </div>
           <div v-else class="space-y-2">
              <div class="p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg flex gap-3 group hover:bg-rose-500/10 transition-all cursor-pointer">
                 <AlertCircle class="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                 <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                       <span class="text-[10px] font-black uppercase tracking-widest text-rose-500">Execution Error</span>
                       <span class="text-[9px] font-mono text-stone-600">Row 1, Col 1</span>
                    </div>
                    <p class="text-[11px] font-mono text-stone-300 break-words leading-relaxed">{{ error }}</p>
                 </div>
              </div>
           </div>
        </div>

        <!-- Insights Tab -->
        <div v-else-if="activeTab === 'insights'" class="h-full flex flex-col p-6 space-y-6 overflow-auto">
          <div v-if="props.analysis?.prediction" class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <!-- Confidence Score -->
            <div class="flex items-center justify-between p-4 bg-stone-950 border border-stone-800 rounded-2xl relative overflow-hidden group">
               <div class="absolute inset-0 bg-violet-500/5 opacity-0 group-hover:opacity-100 transition-all"></div>
               <div class="space-y-1">
                 <h5 class="text-[10px] font-black uppercase tracking-widest text-stone-500">Prediction Confidence</h5>
                 <div class="text-2xl font-mono text-stone-100 flex items-baseline gap-1">
                    <span>{{ (props.analysis.prediction.confidence * 100).toFixed(0) }}</span>
                    <span class="text-sm text-stone-500">%</span>
                 </div>
               </div>
               <!-- Circular progress or similar -->
               <div class="relative w-12 h-12 flex items-center justify-center">
                  <svg class="w-full h-full -rotate-90">
                    <circle cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" stroke-width="4" class="text-stone-900" />
                    <circle cx="24" cy="24" r="20" fill="transparent" stroke="currentColor" stroke-width="4" 
                      id="confidence-circle"
                      class="text-violet-500" 
                      :stroke-dasharray="2 * Math.PI * 20"
                      :stroke-dashoffset="2 * Math.PI * 20 * (1 - props.analysis.prediction.confidence)"
                    />
                  </svg>
                  <Sparkles class="w-3 h-3 absolute text-violet-400" />
               </div>
            </div>

            <!-- Predicted Value -->
            <div class="p-5 bg-stone-900/40 border border-stone-800/50 rounded-2xl">
              <h5 class="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-3">Predicted Result</h5>
              <div class="text-[15px] font-medium text-stone-200 leading-relaxed">{{ props.analysis.prediction.value }}</div>
            </div>

            <!-- Reasoning -->
            <div class="space-y-3">
              <h5 class="text-[10px] font-black uppercase tracking-widest text-stone-500">Logic & Reasoning</h5>
              <div class="p-5 bg-stone-950 border border-stone-800 rounded-2xl border-l-4 border-l-violet-500">
                <div class="text-[13px] text-stone-300 leading-[1.6] whitespace-pre-wrap select-text selection:bg-violet-500/30">
                  {{ props.analysis.prediction.reasoning }}
                </div>
              </div>
            </div>
            
            <div class="flex items-center gap-2 p-3 bg-stone-900/30 rounded-lg border border-stone-800/50">
               <Info class="w-3.5 h-3.5 text-stone-500" />
               <p class="text-[10px] text-stone-600 italic">Predictions are generated using AI-driven extrapolation. Always verify before making business decisions.</p>
            </div>
          </div>

          <div v-else class="flex-1 flex flex-col items-center justify-center space-y-6 opacity-30 grayscale">
             <div class="relative">
                <div class="absolute inset-0 bg-stone-800/20 blur-3xl rounded-full"></div>
                <div class="relative w-16 h-16 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center transform rotate-12 transition-transform hover:rotate-0">
                   <Brain class="w-8 h-8 text-stone-700" />
                </div>
             </div>
             <div class="text-center space-y-2">
                <h4 class="text-sm font-black uppercase tracking-[0.2em] text-stone-400">Quiet Mind</h4>
                <p class="text-xs text-stone-600 max-w-[240px] leading-relaxed">No deep prediction intelligence available for the current result set.</p>
             </div>
          </div>
        </div>

        <!-- Execution Tab -->
        <div v-else-if="activeTab === 'execution'" class="h-full flex flex-col p-6 space-y-8">
           <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div v-for="(val, label) in executionMetrics" :key="label" class="p-4 bg-stone-950 border border-stone-800/50 rounded-xl relative overflow-hidden group">
                 <div class="absolute top-0 left-0 w-1 h-full" :class="label === 'status' ? (val === 'success' ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-stone-800 group-hover:bg-violet-500 transition-colors'"></div>
                 <h5 class="text-[9px] font-black uppercase tracking-widest text-stone-600 mb-2">{{ label }}</h5>
                 <div class="text-lg font-mono text-stone-200 uppercase">{{ val }}</div>
              </div>
           </div>
           
           <div class="flex-1 bg-stone-950 border border-stone-800/50 rounded-xl p-4 flex flex-col">
              <div class="flex items-center justify-between mb-4 pb-4 border-b border-stone-900">
                 <h5 class="text-[9px] font-black uppercase tracking-widest text-stone-400">Performance Timeline</h5>
                 <div class="flex gap-2">
                    <div class="w-2 h-2 rounded-full bg-violet-500/50"></div>
                    <div class="w-2 h-2 rounded-full bg-stone-800"></div>
                 </div>
              </div>
              <div class="flex-1 flex items-end gap-1.5 h-32">
                 <div v-for="i in 20" :key="i" 
                      class="flex-1 bg-stone-900 rounded-t-sm hover:bg-violet-500/40 transition-all cursor-pointer"
                      :style="{ height: `${Math.random() * 80 + 10}%` }">
                 </div>
              </div>
           </div>
        </div>

        <!-- Versioning Tab -->
        <div v-else-if="activeTab === 'versioning'" class="h-full flex flex-col items-center justify-center p-12 space-y-6">
           <div class="w-16 h-16 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center relative overflow-hidden group">
              <div class="absolute inset-0 bg-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <GitBranch class="w-8 h-8 text-stone-700 group-hover:text-violet-500 transition-colors" />
           </div>
           <div class="text-center space-y-3 max-w-[280px]">
              <h4 class="text-xs font-black uppercase tracking-[0.2em] text-stone-300">Sandbox Branching</h4>
              <p class="text-[10px] text-stone-600 leading-relaxed italic">Database branching is coming soon. Soon you'll be able to create private database clones for no-risk manipulation.</p>
              <button class="px-4 py-2 bg-stone-800 text-stone-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-stone-700 cursor-not-allowed">
                 Initialize Local Branch
              </button>
           </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

@keyframes progress {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(0); }
  100% { transform: translateX(100%); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

:deep(.prose p) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
:deep(.prose ul), :deep(.prose ol) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
:deep(.prose li) {
  margin-top: 0.125rem;
  margin-bottom: 0.125rem;
}
</style>
```
