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
  'open-spreadsheet': []
  'sanitize': []
  'cancel': []
}>()

const size = ref(320) // Default size in pixels
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
        <!-- Modern Pill Tabs -->
        <div class="flex p-0.5 bg-stone-950/50 rounded-lg border border-stone-800/50 relative overflow-hidden">
          <button
            v-for="tab in (['results', 'messages', 'history'] as const)"
            :key="tab"
            @click="activeTab = tab"
            class="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all relative z-10"
            :class="
              activeTab === tab
                ? 'bg-stone-800 text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-300'
            "
          >
             {{ tab === 'results' ? 'Output' : (tab === 'messages' ? 'Console' : 'Log') }}
          </button>
        </div>

        <!-- View Mode (Table/JSON) -->
        <div v-if="activeTab === 'results' && Array.isArray(result)" class="flex items-center gap-1.5 pl-4 border-l border-stone-800/50">
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
          v-if="activeTab === 'results' && resultCount !== null"
          class="flex items-center gap-2 px-2 py-0.5 bg-stone-950 border border-stone-800/50 rounded-full"
        >
          <div class="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]"></div>
          <span class="text-[10px] font-mono text-stone-400">
            {{ resultCount.toLocaleString() }} records
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
        <!-- Results View -->
        <div v-if="activeTab === 'results'" class="h-full flex flex-col">
          <div v-if="error" class="m-6 p-6 rounded-2xl border border-rose-500/20 bg-rose-500/5 relative group animate-in fade-in slide-in-from-top-4 duration-500">
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
            <!-- Analysis Insight -->


            <!-- Toolbar (Visualize / Sanitize) -->
            <div v-if="Array.isArray(result) && result.length > 0" class="flex items-center gap-3">
               <button @click="emit('create-dashboard-element')" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-950 hover:bg-white text-[9px] font-black uppercase tracking-widest transition-all shadow-xl shadow-stone-950/20">
                  <LayoutDashboard class="w-3 h-3" />
                  <span>Visualize</span>
               </button>
               <button @click="emit('open-spreadsheet')" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 hover:text-stone-100 hover:border-stone-600 text-[9px] font-black uppercase tracking-widest transition-all">
                  <Table class="w-3 h-3" />
                  <span>Spreadsheet</span>
               </button>
               <button @click="emit('sanitize')" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-100 hover:border-stone-700 text-[9px] font-black uppercase tracking-widest transition-all">
                  <Sparkles class="w-3 h-3" />
                  <span>Optimize</span>
               </button>
            </div>

            <!-- Data Output -->
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

          <!-- Empty State -->
          <div v-else class="h-full flex flex-col items-center justify-center p-12 space-y-6">
             <div class="relative">
                <div class="absolute inset-0 bg-stone-800/20 blur-3xl rounded-full"></div>
                <div class="relative w-16 h-16 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center transform rotate-12">
                   <PanelBottom class="w-8 h-8 text-stone-700" />
                </div>
             </div>
             <div class="text-center space-y-2">
                <h4 class="text-sm font-black uppercase tracking-[0.2em] text-stone-400">System Ready</h4>
                <p class="text-xs text-stone-600 max-w-[200px] leading-relaxed">Execute a protocol to view analytical output in this workspace.</p>
             </div>
          </div>
        </div>

        <!-- Console / History Tab Content (Simplified for now) -->
        <div v-else-if="activeTab === 'messages'" class="p-8 h-full">
           <!-- Console experience -->
           <div class="h-full flex flex-col font-mono text-[11px] text-stone-500 space-y-2">
              <div class="flex gap-2">
                 <span class="text-emerald-500">[INFO]</span>
                 <span>Pegasus Session Started</span>
              </div>
              <div class="flex gap-2">
                 <span class="text-emerald-500">[INFO]</span>
                 <span>Awaiting instruction input...</span>
              </div>
           </div>
        </div>

        <div v-else class="p-6 space-y-4">
           <h4 class="text-[10px] font-black uppercase tracking-widest text-stone-500 px-2">Operation Logs</h4>
           <div v-if="!history || history.length === 0" class="py-12 text-center text-xs text-stone-600 italic">No historical data found.</div>
           <div v-for="item in history" :key="item.id" class="p-4 rounded-xl border border-stone-900 bg-stone-900/20 hover:border-stone-800 transition-all cursor-pointer group">
              <div class="flex items-center justify-between mb-2">
                 <span class="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-stone-900 text-stone-500 group-hover:text-stone-300">
                    {{ item.source }}
                 </span>
                 <span class="text-[10px] font-mono text-stone-700">
                    {{ new Date(item.timestamp).toLocaleTimeString() }}
                 </span>
              </div>
              <pre class="text-[12px] font-mono text-stone-400 whitespace-pre-wrap line-clamp-2 leading-relaxed">{{ item.query }}</pre>
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
