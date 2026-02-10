<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent, unref } from 'vue'
import { X, Maximize2, Minimize2, PanelBottom, PanelRight, LayoutDashboard, Table, Loader2, Sparkles, Brain, GitBranch, Check, AlertCircle, Copy, Info, Database, ArrowRight, Clock } from 'lucide-vue-next'
import JsonViewer from '@/components/JsonViewer.vue'
import ResultsTable from './ResultsTable.vue'
import { toast } from '@/composables/useNotifications'
import { useLocalStorage } from '@vueuse/core'
import MarkdownIt from 'markdown-it'

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
    contextUsed?: any[]
    steps?: { message: string, timestamp: number, progress: number }[]
  }
  isAnalyzing?: boolean
  history?: any[]
  ambiguity?: { message: string; choices: string[]; reasoning?: string }
  hasRecommendation?: boolean
  settings?: SettingsModel
  initialViewMode?: 'table' | 'json' | 'excel'
  lockedPosition?: boolean
  liveSteps?: { message: string, timestamp: number, progress: number }[]
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

const size = ref(400) // Slightly wider default
const isResizing = ref(false)
const isMaximized = ref(false)
const activeTab = ref<'output' | 'thinking' | 'insights' | 'problems' | 'versioning'>('output')

const hiddenItems = useLocalStorage<string[]>('results-panel-hidden-items', [])
const viewMode = ref<'table' | 'json' | 'excel'>('table')

const displaySteps = computed(() => {
    if (props.loading && props.liveSteps?.length) return props.liveSteps
    return props.analysis?.steps || []
})

watch(() => props.initialViewMode, (val) => {
  if (val) viewMode.value = val
}, { immediate: true })

// Auto-switch to reasoning if loading, or output if done
watch(() => props.loading, (isLoading) => {
    if (isLoading) activeTab.value = 'thinking'
    else if (props.result && activeTab.value !== 'thinking') activeTab.value = 'output'
})

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
    size.value = Math.max(150, Math.min(newSize, window.innerHeight - 100))
  } else {
    const newSize = window.innerWidth - e.clientX
    size.value = Math.max(300, Math.min(newSize, window.innerWidth - 100))
  }
}

const toggleMaximize = () => {
  if (isMaximized.value) {
    size.value = 400
  } else {
    size.value = props.position === 'bottom' 
      ? window.innerHeight - 60 
      : window.innerWidth - 60
  }
  isMaximized.value = !isMaximized.value
}

const togglePosition = () => {
  emit('update:position', props.position === 'bottom' ? 'right' : 'bottom')
  size.value = 400
  isMaximized.value = false
}

const executionMetrics = computed(() => {
  // Real metrics would come from backend, mocking for now or using steps duration
  const steps = displaySteps.value
  let duration = '0ms'
  if (steps.length > 0) {
      const start = steps[0]?.timestamp
      const end = steps[steps.length - 1]?.timestamp
      if (start && end) duration = `${end - start}ms`
  }
  
  return {
    time: duration,
    rows: Array.isArray(props.result) ? props.result.length : 0,
    status: props.error ? 'failed' : 'success'
  }
})

// Add event listeners for resizing
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', resize)
  window.addEventListener('mouseup', stopResize)
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const copied = ref(false)
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
    toast.success('Copied')
  } catch (e) {
    toast.error('Failed to copy')
  }
}
</script>

<template>
  <div
    class="bg-background/95 backdrop-blur-xl flex flex-col relative transition-all duration-500 ease-out shadow-[0_0_50px_-12px_rgba(0,0,0,0.2)] dark:shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] z-40"
    :class="{
      'rounded-t-[32px] border-t border-white/10 dark:border-white/5': position === 'bottom' && visible,
      'rounded-l-[32px] border-l border-white/10 dark:border-white/5': position === 'right' && visible,
    }"
    :style="{
      [position === 'bottom' ? 'height' : 'width']: visible 
        ? (isMaximized ? '100%' : `${size}px`) 
        : '0px',
      minHeight: visible && position === 'bottom' ? '150px' : '0px',
      minWidth: visible && position === 'right' ? '300px' : '0px',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      transform: visible ? 'translate(0, 0)' : (position === 'bottom' ? 'translateY(100%)' : 'translateX(100%)')
    }"
  >
    <!-- Resize handle -->
    <div
      class="absolute z-50 hover:bg-violet-500/50 transition-all duration-300 active:bg-violet-500"
      :class="{
        'top-0 left-1/2 -translate-x-1/2 w-32 h-1.5 cursor-ns-resize rounded-full bg-border/50 mt-2': position === 'bottom',
        'top-1/2 -translate-y-1/2 left-0 h-32 w-1.5 cursor-ew-resize rounded-full bg-border/50 ml-2': position === 'right',
      }"
      @mousedown="startResize"
    />

    <!-- Header / Tab Bar -->
    <div 
      class="flex items-center justify-between px-4 py-2 shrink-0 z-10"
      :class="{ 'flex-col items-start gap-4': position === 'right' && !isMaximized }"
    >
        <div class="flex items-center gap-6">
            <!-- Toggles (Softer Pill Design) -->
            <div class="flex items-center p-1 rounded-full bg-muted/40 border border-border/40">
                 <button 
                    @click="activeTab = 'output'"
                    class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all flex items-center gap-2"
                    :class="activeTab === 'output' ? 'bg-background shadow-md text-foreground scale-105' : 'text-muted-foreground hover:text-foreground'"
                 >
                    <Table class="w-3.5 h-3.5" />
                    <span>Data</span>
                    <span v-if="Array.isArray(props.result) && props.result.length > 0" class="ml-1.5 px-1.5 py-0.5 rounded-md bg-foreground/5 text-[9px] font-mono text-muted-foreground border border-border/50">
                      {{ props.result.length.toLocaleString() }}
                    </span>
                 </button>
                 <button 
                    @click="activeTab = 'thinking'"
                    class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all flex items-center gap-2"
                    :class="activeTab === 'thinking' ? 'bg-background shadow-md text-violet-500 scale-105' : 'text-muted-foreground hover:text-foreground'"
                 >
                    <div class="relative">
                        <Brain class="w-3.5 h-3.5" />
                        <span v-if="props.loading" class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-violet-500 rounded-full animate-ping"></span>
                    </div>
                    <span>Thinking</span>
                 </button>
                 <button 
                    v-if="props.analysis?.prediction"
                    @click="activeTab = 'insights'"
                    class="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-full transition-all flex items-center gap-2"
                    :class="activeTab === 'insights' ? 'bg-background shadow-md text-emerald-500 scale-105' : 'text-muted-foreground hover:text-foreground'"
                 >
                    <Sparkles class="w-3.5 h-3.5" />
                    <span>Insights</span>
                 </button>
            </div>
        </div>

        <!-- Right Side Controls -->
        <div class="flex items-center gap-4">
             <div class="flex items-center gap-2">
               <button
                 v-if="Array.isArray(props.result) && props.result.length > 0"
                 @click="emit('create-dashboard-element')"
                 class="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-sm"
                 title="Visualize Data"
               >
                 <LayoutDashboard class="w-3.5 h-3.5" />
               </button>

               <button
                 v-if="!lockedPosition"
                 @click="togglePosition"
                 class="w-7 h-7 flex items-center justify-center rounded-full bg-muted/30 text-muted-foreground hover:text-violet-500 hover:bg-violet-500/10 transition-all"
               >
                 <PanelBottom v-if="position === 'right'" class="w-3.5 h-3.5" />
                 <PanelRight v-else class="w-3.5 h-3.5" />
               </button>

               <button
                 @click="toggleMaximize"
                 class="w-7 h-7 flex items-center justify-center rounded-full bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
               >
                 <Minimize2 v-if="isMaximized" class="w-3.5 h-3.5" />
                 <Maximize2 v-else class="w-3.5 h-3.5" />
               </button>
               
               <button
                 @click="emit('close')"
                 class="w-7 h-7 flex items-center justify-center rounded-full bg-muted/30 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all"
               >
                 <X class="w-3.5 h-3.5" />
               </button>
             </div>
        </div>
    </div>

    <!-- Panel Content -->
    <div class="flex-1 overflow-hidden relative z-10 flex flex-col">
      <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
        
        <!-- Output Tab -->
        <Transition name="fade" mode="out-in">
        <div v-if="activeTab === 'output'" class="h-full flex flex-col space-y-3">
          <div v-if="error" class="p-6 rounded-[36px] border border-rose-500/20 bg-rose-500/5 flex items-start gap-4">
             <div class="w-10 h-10 shrink-0 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                <AlertCircle class="w-5 h-5" />
             </div>
             <div class="flex-1">
                <h4 class="text-xs font-bold uppercase tracking-wider text-rose-500 mb-2">Execution Error</h4>
                <p class="text-sm font-mono text-foreground/80 leading-relaxed">{{ error }}</p>
             </div>
             <button @click="copyToClipboard(error)" class="text-muted-foreground hover:text-foreground"><Copy class="w-4 h-4" /></button>
          </div>

          <div v-else-if="result" class="h-full flex flex-col space-y-4">

            <div class="flex-1 min-h-0 rounded-xl border border-border/50 bg-muted/20 overflow-hidden shadow-inner">
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
                  class="h-full overflow-auto p-6"
                />
            </div>
          </div>
          
          <!-- Empty State -->
          <div v-else class="h-full flex flex-col items-center justify-center opacity-40">
             <div class="w-20 h-20 rounded-[32px] bg-muted/50 flex items-center justify-center mb-4">
                 <Database class="w-8 h-8 text-muted-foreground" />
             </div>
             <p class="text-sm font-medium text-muted-foreground">No data available</p>
          </div>
        </div>

        <!-- Thinking Tab -->
        <div v-else-if="activeTab === 'thinking'" class="h-full max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            

            <!-- Execution Timeline -->
            <div class="space-y-4">
                <h4 class="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Brain class="w-3.5 h-3.5" />
                    Thinking Process
                </h4>
                
                <div class="relative pl-4 space-y-6 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                    <div v-for="(step, idx) in displaySteps" :key="idx" class="relative pl-6 group">
                        <!-- Connector Dot -->
                        <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-background"
                             :class="idx === (displaySteps.length || 0) - 1 && props.loading ? 'bg-violet-500 shadow-[0_0_10px_theme(colors.violet.500)] animate-pulse' : 'bg-muted-foreground/30'">
                        </div>
                        
                        <div class="space-y-1">
                            <div class="text-sm font-medium text-foreground/90">{{ step.message }}</div>
                            <div class="text-[10px] font-mono text-muted-foreground flex items-center gap-2">
                                <Clock class="w-3 h-3" />
                                <span>{{ new Date(step.timestamp).toLocaleTimeString() }}</span>
                                <span v-if="step.progress" class="px-1.5 py-0.5 rounded bg-muted text-[9px]">{{ Math.round(step.progress) }}%</span>
                            </div>
                        </div>
                    </div>

                    <!-- Live Indicator if loading -->
                    <div v-if="props.loading" class="relative pl-6">
                         <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-background animate-ping"></div>
                         <div class="text-sm font-medium text-violet-500 animate-pulse">Processing...</div>
                    </div>
                </div>
            </div>

            <!-- SQL Query (Simplified) -->
            <div v-if="props.lastQuery" class="space-y-4">
                <h4 class="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <ArrowRight class="w-3.5 h-3.5" />
                    Generated Query
                </h4>
                <div class="p-5 rounded-[24px] bg-stone-950 text-stone-300 font-mono text-xs overflow-x-auto relative group">
                    <pre>{{ props.lastQuery }}</pre>
                    <button 
                        @click="copyToClipboard(props.lastQuery)"
                        class="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                    >
                        <Copy class="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>

        <!-- Insights Tab contents... (similar to before but styled softly) -->
        <div v-else-if="activeTab === 'insights'" class="h-full max-w-4xl mx-auto space-y-6">
             <div v-if="props.analysis?.prediction" class="space-y-6">
                <!-- Confidence Card -->
                <div class="p-6 rounded-[32px] bg-gradient-to-br from-stone-900 to-stone-950 border border-white/5 relative overflow-hidden">
                    <div class="relative z-10 flex items-center justify-between">
                        <div>
                            <div class="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-2">Confidence Score</div>
                            <div class="text-4xl font-light text-white tracking-tight">
                                {{ (props.analysis.prediction.confidence * 100).toFixed(0) }}<span class="text-lg text-stone-600">%</span>
                            </div>
                        </div>
                        <div class="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-500 shadow-[0_0_30px_-5px_theme(colors.violet.500)]">
                            <Sparkles class="w-8 h-8" />
                        </div>
                    </div>
                </div>

                <!-- Prediction & Reasoning -->
                <div class="space-y-4">
                     <div class="p-6 rounded-[24px] bg-muted/30 border border-border/50">
                        <div class="text-sm font-medium leading-relaxed">{{ props.analysis.prediction.reasoning }}</div>
                     </div>
                     <div class="flex items-center gap-2 px-4">
                        <Info class="w-3.5 h-3.5 text-muted-foreground" />
                        <span class="text-[10px] text-muted-foreground">AI predictions may vary. Verify efficiently.</span>
                     </div>
                </div>
             </div>
        </div>

        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 20px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
