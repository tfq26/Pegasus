<template>
  <div class="flex-1 flex flex-col overflow-hidden relative bg-background min-h-[300px]">
    <!-- Technical Grid Background -->
    <div class="absolute inset-0 pointer-events-none z-0 opacity-[0.03] dark:opacity-[0.05]" 
         style="background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 32px 32px;">
    </div>
    <div class="absolute inset-0 pointer-events-none z-0 bg-gradient-to-b from-transparent via-background/10 to-background"></div>

    <!-- Analytical Feed -->
    <div 
      v-if="props.mode === 'chat'" 
      ref="historyContainer"
      class="flex-1 overflow-y-auto px-6 sm:px-8 py-4 space-y-4 scroll-smooth scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent relative z-10"
      @scroll="handleScroll"
    >
      <!-- Load more indicator -->
      <div 
        v-if="hasMore" 
        ref="loadMoreTrigger"
        class="text-center pb-8 border-b border-border"
      >
        <div v-if="isLoadingMore" class="flex items-center justify-center space-x-2 text-[10px] font-bold  tracking-[0.2em] text-muted-foreground">
          <Loader2 class="w-3 h-3 animate-spin" />
          <span>Restoring older context...</span>
        </div>
      </div>

      <!-- Linear Message Thread -->
      <TransitionGroup name="message-fade">
        <div 
          v-for="(msg, idx) in displayedMessages" 
          :key="msg.timestamp + idx"
          class="flex w-full flex-col group animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <!-- Metadata Header -->
          <div class="flex items-center gap-3 mb-1">
             <div 
              :class="[
                'w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border transition-all duration-300',
                msg.role === 'user' 
                  ? 'bg-muted border-border text-muted-foreground' 
                  : msg.role === 'clarification'
                    ? 'bg-violet-500/20 border-violet-400/40 text-violet-400 shadow-[0_0_14px_-2px_theme(colors.violet.400)]'
                    : 'bg-violet-500/10 border-violet-500/20 text-violet-500 dark:text-violet-400 shadow-[0_0_10px_-2px_theme(colors.violet.500)]'
              ]"
            >

              <img 
                v-if="msg.role === 'user' && user?.profilePictureUrl" 
                :src="user.profilePictureUrl" 
                class="w-full h-full object-cover rounded" 
              />
              <User v-else-if="msg.role === 'user'" class="w-3 h-3" />
              <span v-else-if="msg.role === 'clarification'" class="text-violet-400 font-black text-[11px]">?</span>
              <div v-else class="w-full h-full p-1">
                 <img :src="pegasusLogo" class="w-full h-full object-contain" alt="Pegasus" />
              </div>
            </div>
            <span class="text-[10px] font-black tracking-[0.2em]" :class="{
              'text-muted-foreground': msg.role === 'user',
              'text-violet-400 dark:text-violet-300 animate-pulse': msg.role === 'clarification',
              'text-violet-500 dark:text-violet-400': msg.role !== 'user' && msg.role !== 'clarification'
            }">
              {{ msg.role === 'user' ? getUserLabel() : msg.role === 'clarification' ? 'Pegasus is asking...' : 'Pegasus' }}
            </span>
            <div class="h-px flex-1 bg-border"></div>
            <span class="text-[9px] font-mono text-muted-foreground/50 ">
               {{ formatTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Content (No bubbles, just clean breaks) -->
          <div class="pl-7 space-y-1">
            <!-- Chart Rendering for AI responses with chart data -->
            <div v-if="msg.role === 'assistant' && isChartContent(msg.content)" class="w-full max-w-2xl space-y-3">
              <div class="text-sm font-medium text-muted-foreground mb-2">{{ parseChartConfig(msg.content).title }}</div>
              <ChartRenderer 
                :type="parseChartConfig(msg.content).type" 
                :data="parseChartConfig(msg.content).data"
                :options="{ responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true } } }"
                class="rounded-lg border border-border bg-muted/30 p-4 h-[300px]"
              />
              <button 
                @click="$emit('add-to-dashboard', parseChartConfig(msg.content))"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold  tracking-wide hover:bg-violet-500/20 transition-all"
              >
                <LayoutDashboard class="w-3 h-3" />
                <span>Add to Dashboard</span>
              </button>
            </div>
            <!-- Clarification question bubble -->
            <div 
              v-if="msg.role === 'clarification'"
              class="rounded-2xl border border-violet-500/30 bg-violet-500/5 px-4 py-3 space-y-3"
            >
              <!-- Header row: interpretation + confidence badge -->
              <div class="flex items-center gap-2 flex-wrap">
                <p v-if="(msg as any).meta?.interpretation" class="text-[10px] text-violet-400/60 font-medium tracking-wide flex-1">
                  {{ (msg as any).meta.interpretation }}
                </p>
                <span 
                  v-if="(msg as any).meta?.confidence != null"
                  :class="[
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0',
                    (msg as any).meta.confidence >= 60
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  ]"
                  title="AI confidence before asking this question"
                >
                  {{ (msg as any).meta.confidence }}% confidence
                </span>
              </div>

              <!-- Question text -->
              <p class="text-[13px] text-violet-300 leading-relaxed font-medium">
                {{ msg.content }}
              </p>

              <!-- Data hints — editable threshold fields per column -->
              <div 
                v-if="(msg as any).meta?.hints?.length > 0"
                class="rounded-xl border border-violet-500/20 bg-background/40 overflow-hidden"
              >
                <div class="px-3 py-1.5 border-b border-violet-500/20 flex items-center justify-between">
                  <span class="text-[9px] font-black tracking-[0.15em] text-violet-400/60">DATA REFERENCE — type your values below</span>
                </div>
                <div class="divide-y divide-violet-500/10">
                  <div 
                    v-for="hint in (msg as any).meta.hints" 
                    :key="hint.column"
                    class="px-3 py-2.5 grid grid-cols-[100px_1fr] gap-3 items-start"
                  >
                    <!-- Column name + type -->
                    <div class="space-y-0.5 min-w-0 pt-1">
                      <span class="text-[11px] font-mono font-bold text-violet-300 block truncate">{{ hint.column }}</span>
                      <span class="text-[9px] text-muted-foreground block">{{ hint.dataType }}</span>
                      <span v-if="hint.range" class="text-[9px] text-violet-400/40 block leading-tight">{{ hint.range }}</span>
                    </div>

                    <!-- String type: multi-select chip picker -->
                    <div
                      v-if="isStringHint(hint) && (hint.examples || []).length > 0"
                      class="space-y-1.5"
                    >
                      <!-- Chip options -->
                      <div class="flex flex-wrap gap-1.5">
                        <button
                          v-for="(ex, i) in hint.examples" 
                          :key="i"
                          @click="toggleHintSelection(msg.timestamp, hint.column, ex)"
                          :class="[
                            'text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-all cursor-pointer select-none',
                            isHintSelected(msg.timestamp, hint.column, ex)
                              ? 'bg-violet-500/25 border-violet-400/50 text-violet-200 shadow-[0_0_8px_-2px_theme(colors.violet.500)]'
                              : 'bg-muted/40 border-border/50 text-muted-foreground hover:border-violet-500/30 hover:text-violet-300 hover:bg-violet-500/10'
                          ]"
                        >
                          <span v-if="isHintSelected(msg.timestamp, hint.column, ex)" class="mr-1 text-violet-400">✓</span>
                          {{ ex }}
                        </button>
                      </div>
                      <!-- Selected summary -->
                      <p v-if="getHintSelections(msg.timestamp, hint.column).size > 0" class="text-[10px] text-violet-400/60">
                        Selected: {{ [...getHintSelections(msg.timestamp, hint.column)].join(', ') }}
                      </p>
                      <p v-else class="text-[10px] text-muted-foreground/40">
                        Pick one or more options above
                      </p>
                    </div>

                    <!-- Numeric type with range: dual-handle range slider -->
                    <div
                      v-else-if="isNumericHint(hint) && parseHintRange(hint.range).hasRange"
                      class="space-y-3 py-1"
                    >
                      <!-- Value labels -->
                      <div class="flex items-center justify-between">
                        <span class="text-[11px] font-mono font-semibold text-violet-300">
                          {{ formatRangeVal(getHintRange(msg.timestamp, hint.column, hint.range).low) }}
                        </span>
                        <span class="text-[9px] text-muted-foreground/50">to</span>
                        <span class="text-[11px] font-mono font-semibold text-violet-300">
                          {{ formatRangeVal(getHintRange(msg.timestamp, hint.column, hint.range).high) }}
                        </span>
                      </div>

                      <!-- Dual range track -->
                      <div class="relative h-6 flex items-center">
                        <!-- Track background -->
                        <div class="absolute w-full h-1.5 bg-muted rounded-full"></div>
                        <!-- Fill between handles -->
                        <div
                          class="absolute h-1.5 bg-violet-500/60 rounded-full pointer-events-none"
                          :style="rangeTrackStyle(msg.timestamp, hint.column, hint.range)"
                        ></div>
                        <!-- Low handle -->
                        <input
                          type="range"
                          :min="parseHintRange(hint.range).min"
                          :max="parseHintRange(hint.range).max"
                          :step="parseHintRange(hint.range).step"
                          :value="getHintRange(msg.timestamp, hint.column, hint.range).low"
                          @input="setRangeLow(msg.timestamp, hint.column, hint.range, Number(($event.target as HTMLInputElement).value))"
                          class="dual-range-input"
                        />
                        <!-- High handle -->
                        <input
                          type="range"
                          :min="parseHintRange(hint.range).min"
                          :max="parseHintRange(hint.range).max"
                          :step="parseHintRange(hint.range).step"
                          :value="getHintRange(msg.timestamp, hint.column, hint.range).high"
                          @input="setRangeHigh(msg.timestamp, hint.column, hint.range, Number(($event.target as HTMLInputElement).value))"
                          class="dual-range-input"
                        />
                      </div>

                      <!-- Min/max labels -->
                      <div class="flex justify-between">
                        <span class="text-[9px] text-muted-foreground/40 font-mono">{{ formatRangeVal(parseHintRange(hint.range).min) }}</span>
                        <span class="text-[9px] text-muted-foreground/40 font-mono">{{ formatRangeVal(parseHintRange(hint.range).max) }}</span>
                      </div>
                    </div>

                    <!-- Datetime or string without examples: free-text input -->
                    <input
                      v-else
                      :value="getHintValue(msg.timestamp, hint.column)"
                      @input="fillHintValue(msg.timestamp, hint.column, ($event.target as HTMLInputElement).value)"
                      @keydown.enter.prevent="submitHintValues(msg)"
                      :placeholder="isStringHint(hint) ? 'e.g. online' : hint.dataType.includes('datetime') ? 'e.g. 2024-01-01' : 'e.g. > 80'"
                      class="h-7 w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-2 text-[11px] font-mono text-violet-200 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/40 focus:border-violet-500/40 transition"
                    />
                  </div>
                </div>

                <!-- Submit filled values --->
                <div class="px-3 py-2 border-t border-violet-500/20 flex items-center justify-between gap-2">
                  <span class="text-[10px] text-muted-foreground">
                    Fill in your thresholds above, then click to answer.
                  </span>
                  <button
                    @click="submitHintValues(msg)"
                    :disabled="!hasAnyHintValue(msg.timestamp, (msg as any).meta.hints)"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[11px] font-bold hover:bg-violet-500/30 transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <ArrowUp class="w-3 h-3" />
                    Use these values
                  </button>
                </div>
              </div>
            </div>


            <!-- Regular Text Content -->
            <div 
              v-else
              class="text-foreground/90 leading-[1.5] text-[13px] font-normal selection:bg-violet-500/30 selection:text-white"
            >
                <div class="break-words">
                  <ChatMessage
      :content="msg.content"
      :role="msg.role"
      :meta="(msg as any).meta"
      :is-truncated="shouldTruncate(msg.content) && !isExpanded(msg)"
      @add-to-dashboard="(config) => emit('add-to-dashboard', config)"
      @generate-insights="(payload) => emit('generate-insights', payload)"
    />
                </div>
                
                <button 
                  v-if="shouldTruncate(msg.content) && !isExpanded(msg)"
                  @click="handleReadMore(msg)"
                  class="mt-2 text-violet-400 hover:text-violet-300 text-[11px] font-bold flex items-center gap-1 transition-all"
                >
                  <Sparkles class="w-3 h-3" />
                  <span class="cursor-pointer">Read Full Report</span>
                </button>
            </div>

            <!-- Action Toolbar (Pinned below content) -->
            <div 
              class="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 duration-300"
            >
              <!-- Copy Button (All messages) -->
              <button 
                @click="copyToClipboard(msg.content)" 
                class="flex items-center space-x-2 px-2 py-1 rounded bg-muted/50 border border-border/50 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                <component :is="copied === msg.content ? Check : Copy" class="w-3 h-3" />
                <span>{{ copied === msg.content ? 'Copied' : 'Copy' }}</span>
              </button>

              <!-- Generate Insights Button (Assistant messages with results) -->
              <button 
                v-if="msg.role === 'assistant' && (msg as any).meta?.canGenerateInsights"
                @click="$emit('generate-insights', { query: (msg as any).meta.query, results: (msg as any).meta.resultPreview, messageIndex: idx })" 
                class="flex items-center space-x-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-all"
                title="Generate AI insights for these results"
              >
                <Sparkles class="w-3 h-3" />
                <span>Generate Insights</span>
              </button>

              <!-- Show in Results (Assistant only - if results exist) -->
              <button 
                v-if="msg.role === 'assistant' && (msg as any).meta?.hasResults"
                @click="$emit('show-results')" 
                class="flex items-center space-x-2 px-2 py-1 rounded bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-400 hover:bg-violet-500/20 transition-all"
                title="Open results in data panel"
              >
                <Maximize2 class="w-3 h-3" />
                <span>Inspect Data</span>
              </button>

              <!-- Retry Button (User messages only) -->
               <button 
                v-if="msg.role === 'user'"
                @click="handleRetry(msg.content)" 
                class="flex items-center space-x-2 px-2 py-1 rounded bg-muted/50 border border-border/50 text-[10px] text-muted-foreground hover:text-violet-500 hover:border-violet-500/30 transition-all"
              >
                <RefreshCw class="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>

       <!-- Minimal Thinking State -->
      <div v-if="props.isThinking" class="pl-9 animate-in fade-in duration-500">
         <div class="flex items-center gap-3 text-violet-400">
            <!-- Handled by Halo Search ring now, but we can keep a small subtle indicator if desired -->
            <span class="text-xs font-medium animate-pulse">Analyzing...</span>
         </div>
      </div>
    </div>


    <!-- Input Laboratory Container -->
    <div 
      class="flex-shrink-0 relative z-20 pb-4 px-6 sm:px-8 max-w-4xl mx-auto w-full"
    >
      <HaloSearch 
        v-model="localInput"
        :is-thinking="props.isThinking"
        @submit="$emit('submit')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, nextTick, defineAsyncComponent } from 'vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import ChatMessage from '@/components/Chat/ChatMessage.vue'
import { toast } from '@/composables/useNotifications'
import ChartRenderer from '@/components/Dashboard/ChartRenderer.vue'
import { 
  Bot, 
  User, 
  Copy, 
  Check, 
  Sparkles, 
  ArrowUp, 
  Loader2,
  Table,
  LineChart,
  Brain,
  Zap,
  RefreshCw,
  LayoutDashboard,
  ChevronDown,
  ExternalLink,
  Maximize2
} from 'lucide-vue-next'
import HaloSearch from '@/components/halo-search/Halo-Search.vue'
import MarkdownIt from 'markdown-it'
import { useAuth } from '@/composables/useAuth'
import { useColorMode, usePreferredDark } from '@vueuse/core'

const { user } = useAuth()
const mode = useColorMode({
  emitAuto: true,
  selector: 'html',
  attribute: 'class',
  storageKey: 'pegasus-theme',
})
const preferredDark = usePreferredDark()

const pegasusLogo = computed(() => {
  const isDark = mode.value === 'dark' || (mode.value === 'auto' && preferredDark.value)
  return isDark ? '/logo_new_white.svg' : '/logo_new.svg'
})

const getUserLabel = () => {
  if (user.value?.firstName) return user.value.firstName
  if (user.value?.email) return user.value.email.split('@')[0]
  return 'User'
}

const CodeEditor = defineAsyncComponent(() => import('./CodeEditor.vue'))

const props = defineProps<{ 
  mode: 'chat'
  input: string
  history?: Array<{ role: string; content: string; timestamp: number }>
  isThinking?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:input', value: string): void
  (e: 'submit'): void
  (e: 'add-to-dashboard', config: any): void
  (e: 'show-results'): void
  (e: 'generate-insights', payload: { query: string; results: any; messageIndex?: number }): void
}>()

const localInput = ref(props.input)
const isInputFocused = ref(false)
const historyContainer = ref<HTMLElement | null>(null)
const loadMoreTrigger = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isLoadingMore = ref(false)
const displayCount = ref(20)
const observer = ref<IntersectionObserver | null>(null)
const copied = ref('')
const expandedMessages = ref(new Set<number>())

// Per-clarification-message hint value store: Map<`${timestamp}-${column}`, value>
const hintValues = ref(new Map<string, string>())
// Multi-select state for string columns: Map<key, Set<string>>
const hintSelections = ref(new Map<string, Set<string>>())

const hintKey = (timestamp: number, column: string) => `${timestamp}-${column}`

const isStringHint = (hint: any): boolean =>
  (hint.dataType || '').toLowerCase().includes('string') ||
  (hint.dataType || '').toLowerCase().includes('text') ||
  (hint.dataType || '').toLowerCase().includes('varchar') ||
  (hint.dataType || '').toLowerCase().includes('enum')

const getHintValue = (timestamp: number, column: string): string =>
  hintValues.value.get(hintKey(timestamp, column)) || ''

const fillHintValue = (timestamp: number, column: string, value: string) => {
  const key = hintKey(timestamp, column)
  hintValues.value = new Map(hintValues.value).set(key, value)
}

// Multi-select helpers
const getHintSelections = (timestamp: number, column: string): Set<string> =>
  hintSelections.value.get(hintKey(timestamp, column)) || new Set()

const isHintSelected = (timestamp: number, column: string, value: string): boolean =>
  getHintSelections(timestamp, column).has(value)

const toggleHintSelection = (timestamp: number, column: string, value: string) => {
  const key = hintKey(timestamp, column)
  const existing = new Set(hintSelections.value.get(key) || [])
  if (existing.has(value)) {
    existing.delete(value)
  } else {
    existing.add(value)
  }
  hintSelections.value = new Map(hintSelections.value).set(key, existing)
}

const hasAnyHintValue = (timestamp: number, hints: any[]): boolean =>
  (hints || []).some(h => {
    if (isStringHint(h) && (h.examples || []).length > 0) {
      return getHintSelections(timestamp, h.column).size > 0
    }
    if (isNumericHint(h) && parseHintRange(h.range).hasRange) {
      // Range slider always has a value (user just needs to have moved it, or it starts at min/max)
      return true
    }
    return !!getHintValue(timestamp, h.column)?.trim()
  })

const submitHintValues = (msg: any) => {
  const hints: any[] = msg.meta?.hints || []
  const parts: string[] = []

  for (const h of hints) {
    if (isStringHint(h) && (h.examples || []).length > 0) {
      const selections = getHintSelections(msg.timestamp, h.column)
      if (selections.size > 0) {
        const vals = [...selections].map(v => `'${v}'`).join(', ')
        parts.push(selections.size === 1
          ? `${h.column} = ${vals}`
          : `${h.column} in (${vals})`
        )
      }
    } else if (isNumericHint(h) && parseHintRange(h.range).hasRange) {
      const { low, high } = getHintRange(msg.timestamp, h.column, h.range)
      parts.push(`${h.column} between ${formatRangeVal(low)} and ${formatRangeVal(high)}`)
    } else {
      const val = getHintValue(msg.timestamp, h.column)?.trim()
      if (val) parts.push(`${h.column} = ${val}`)
    }
  }

  if (parts.length === 0) return

  const reply = parts.length === 1
    ? `Use ${parts[0]}`
    : `Use ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

  localInput.value = reply
  nextTick(() => emit('submit'))
}

// ── Numeric range slider helpers ────────────────────────────────────────────

const isNumericHint = (hint: any): boolean =>
  !isStringHint(hint) &&
  ((hint.dataType || '').toLowerCase().includes('number') ||
   (hint.dataType || '').toLowerCase().includes('int') ||
   (hint.dataType || '').toLowerCase().includes('float') ||
   (hint.dataType || '').toLowerCase().includes('decimal') ||
   (hint.dataType || '').toLowerCase().includes('double') ||
   (hint.dataType || '').toLowerCase().includes('numeric'))

interface ParsedRange { min: number; max: number; step: number; hasRange: boolean }

const parseHintRange = (rangeStr: string | undefined): ParsedRange => {
  if (!rangeStr) return { min: 0, max: 100, step: 1, hasRange: false }
  const minMatch = rangeStr.match(/min:\s*([\d.\-]+)/i)
  const maxMatch = rangeStr.match(/max:\s*([\d.\-]+)/i)
  if (!minMatch || !maxMatch) return { min: 0, max: 100, step: 1, hasRange: false }
  const min = parseFloat(minMatch[1]!)
  const max = parseFloat(maxMatch[1]!)
  if (isNaN(min) || isNaN(max) || min >= max) return { min: 0, max: 100, step: 1, hasRange: false }
  // Auto step: 1 decimal for small ranges, 0.01 for very fine ranges
  const range = max - min
  const step = range <= 1 ? 0.01 : range <= 10 ? 0.1 : range <= 100 ? 1 : Math.round(range / 100)
  return { min, max, step, hasRange: true }
}

const formatRangeVal = (val: number): string =>
  Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/\.?0+$/, '')

// Map<`${timestamp}-${column}`, { low, high }>
const hintRanges = ref(new Map<string, { low: number; high: number }>())

const getHintRange = (timestamp: number, column: string, rangeStr: string): { low: number; high: number } => {
  const key = hintKey(timestamp, column)
  if (hintRanges.value.has(key)) return hintRanges.value.get(key)!
  const { min, max } = parseHintRange(rangeStr)
  return { low: min, high: max }
}

const setRangeLow = (timestamp: number, column: string, rangeStr: string, val: number) => {
  const key = hintKey(timestamp, column)
  const current = getHintRange(timestamp, column, rangeStr)
  const { max } = parseHintRange(rangeStr)
  hintRanges.value = new Map(hintRanges.value).set(key, {
    low: Math.min(val, current.high - parseHintRange(rangeStr).step),
    high: Math.min(current.high, max)
  })
}

const setRangeHigh = (timestamp: number, column: string, rangeStr: string, val: number) => {
  const key = hintKey(timestamp, column)
  const current = getHintRange(timestamp, column, rangeStr)
  const { min } = parseHintRange(rangeStr)
  hintRanges.value = new Map(hintRanges.value).set(key, {
    low: Math.max(current.low, min),
    high: Math.max(val, current.low + parseHintRange(rangeStr).step)
  })
}

const rangeTrackStyle = (timestamp: number, column: string, rangeStr: string) => {
  const { min, max } = parseHintRange(rangeStr)
  const { low, high } = getHintRange(timestamp, column, rangeStr)
  const total = max - min
  const leftPct = ((low - min) / total) * 100
  const widthPct = ((high - low) / total) * 100
  return { left: `${leftPct}%`, width: `${widthPct}%` }
}

const isExpanded = (msg: any) => expandedMessages.value.has(msg.timestamp)

const shouldTruncate = (content: string) => {
  const text = formatContent(content)
  return text.length > 800 || (text.match(/\n/g) || []).length > 12
}

const handleReadMore = (msg: any) => {
  // Always expand in-place as requested, avoiding flow-breaking dialogs
  expandedMessages.value.add(msg.timestamp)
}


const displayedMessages = computed(() => {
  if (!props.history) return []
  // Filter out system messages (raw results) to keep the thread conversational
  const filtered = props.history.filter(m => m.role !== 'system')
  const total = filtered.length
  const start = Math.max(0, total - displayCount.value)
  return filtered.slice(start)
})

const hasMore = computed(() => {
  return props.history && props.history.length > displayCount.value
})

const adjustTextareaHeight = (e?: any) => {
  const target = e?.target || textareaRef.value
  if (!target) return
  target.style.height = 'auto'
  target.style.height = Math.min(target.scrollHeight, 300) + 'px'
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => {
      if (copied.value === text) copied.value = ''
    }, 2000)
    toast.success('Copied to clipboard')
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

const handleRetry = (content: string) => {
  localInput.value = content
  isInputFocused.value = true
  // Wait for localInput to propagate to parent via emit('update:input') which happens in the watcher
  nextTick(() => {
    emit('submit')
  })
}


const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatContent = (content: string) => {
  if (typeof content !== 'string') return content
  let formatted = content
  if (formatted.startsWith('"') && formatted.endsWith('"')) {
    try { formatted = JSON.parse(formatted) } catch (e) { formatted = formatted.slice(1, -1) }
  }
  
  // Handle structured AI response
  if (formatted.startsWith('{') && formatted.endsWith('}')) {
      try {
          const parsed = JSON.parse(formatted)
          if (parsed.answer) return parsed.answer.replace(/\\n/g, '\n')
      } catch (e) {}
  }

  return formatted.replace(/\\n/g, '\n')
}

const isChartContent = (content: string): boolean => {
  if (typeof content !== 'string') return false
  try {
    const parsed = JSON.parse(content)
    return parsed && parsed.chart_type && parsed.data && (parsed.data.labels || parsed.data.datasets)
  } catch {
    return false
  }
}

const parseChartConfig = (content: string): any => {
  try {
    const parsed = JSON.parse(content)
    return {
      type: parsed.chart_type,
      title: parsed.title || '',
      labels: parsed.data?.labels || [],
      datasets: parsed.data?.datasets || [],
      data: parsed.data,
      query: parsed.query, // Preserved from backend injection
      ...parsed // Spread other fields just in case
    }
  } catch {
    return { type: 'bar', labels: [], datasets: [] }
  }
}

const loadMore = async () => {
  if (isLoadingMore.value || !hasMore.value) return
  isLoadingMore.value = true
  const scrollHeightBefore = historyContainer.value?.scrollHeight || 0
  await new Promise(resolve => setTimeout(resolve, 800))
  displayCount.value += 20
  isLoadingMore.value = false
  await nextTick()
  if (historyContainer.value) {
    const scrollHeightAfter = historyContainer.value.scrollHeight
    historyContainer.value.scrollTop = scrollHeightAfter - scrollHeightBefore
  }
}

const handleScroll = () => {
  if (!historyContainer.value) return
  if (historyContainer.value.scrollTop < 50 && hasMore.value) {
    loadMore()
  }
}

onMounted(() => {
  if (loadMoreTrigger.value) {
    observer.value = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore.value) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )
    observer.value.observe(loadMoreTrigger.value)
  }
  nextTick(() => {
    if (historyContainer.value) {
      historyContainer.value.scrollTop = historyContainer.value.scrollHeight
    }
  })
})

watch(() => props.input, (val) => {
  if (val !== localInput.value) {
    localInput.value = val
  }
})

watch(localInput, (val) => {
  if (val !== props.input) {
    emit('update:input', val)
  }
  nextTick(() => adjustTextareaHeight())
})

watch(() => props.history?.length, async () => {
  await nextTick()
  if (historyContainer.value) {
    const isNearBottom = historyContainer.value.scrollHeight - historyContainer.value.scrollTop - historyContainer.value.clientHeight < 200
    if (isNearBottom) {
      historyContainer.value.scrollTop = historyContainer.value.scrollHeight
    }
  }
})
</script>

<style scoped>
@keyframes progress {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(0); }
  100% { transform: translateX(100%); }
}

/* Dual range slider */
.dual-range-input {
  position: absolute;
  width: 100%;
  height: 0;
  background: transparent;
  outline: none;
  pointer-events: none;
  appearance: none;
  -webkit-appearance: none;
}
.dual-range-input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgb(139 92 246);
  border: 2px solid rgb(167 139 250 / 0.5);
  cursor: grab;
  box-shadow: 0 0 0 0 rgb(139 92 246 / 0);
  transition: box-shadow 0.2s, transform 0.1s;
}
.dual-range-input::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 6px rgb(139 92 246 / 0.2);
  transform: scale(1.1);
}
.dual-range-input::-webkit-slider-thumb:active {
  cursor: grabbing;
  box-shadow: 0 0 0 8px rgb(139 92 246 / 0.25);
}
.dual-range-input::-moz-range-thumb {
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgb(139 92 246);
  border: 2px solid rgb(167 139 250 / 0.5);
  cursor: grab;
}

.glass-card {
  background: var(--background);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.message-fade-move,
.message-fade-enter-active,
.message-fade-leave-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.message-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) translateX(-5px);
}

.message-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* Custom Scrollbar */
.scrollbar-thin::-webkit-scrollbar {
  width: 5px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 20px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}

.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Markdown Chat Styling */
.markdown-chat :deep(p) { margin-bottom: 0.75rem; }
.markdown-chat :deep(p:last-child) { margin-bottom: 0; }
.markdown-chat :deep(strong) { color: var(--foreground); font-weight: 700; }
.markdown-chat :deep(ul) { list-style: disc; padding-left: 1.25rem; margin-bottom: 0.75rem; }
.markdown-chat :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin-bottom: 0.75rem; }
.markdown-chat :deep(li) { margin-bottom: 0.25rem; }
.markdown-chat :deep(code) { 
  background: rgba(139, 92, 246, 0.1); 
  padding: 0.125rem 0.25rem; 
  border-radius: 0.25rem; 
  font-family: monospace; 
  font-size: 0.85em; 
  color: var(--violet-500);
}
.markdown-chat :deep(pre) { 
  background: var(--muted); 
  padding: 0.75rem; 
  border-radius: 0.5rem; 
  margin: 0.75rem 0; 
  overflow-x: auto; 
  border: 1px solid var(--border);
}
.markdown-chat :deep(table) { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 12px; }
.markdown-chat :deep(th), .markdown-chat :deep(td) { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.markdown-chat :deep(th) { background: var(--muted); font-weight: bold; }
</style>
