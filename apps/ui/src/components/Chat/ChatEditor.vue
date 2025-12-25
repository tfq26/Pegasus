<template>
  <div class="flex-1 flex flex-col overflow-hidden relative bg-[#0a0a0b] min-h-[300px]">
    <!-- Technical Grid Background -->
    <div class="absolute inset-0 pointer-events-none z-0 opacity-[0.03]" 
         style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 32px 32px;">
    </div>
    <div class="absolute inset-0 pointer-events-none z-0 bg-gradient-to-b from-transparent via-[#0a0a0b]/10 to-[#0a0a0b]"></div>

    <!-- Analytical Feed -->
    <div 
      v-if="props.mode === 'chat'" 
      ref="historyContainer"
      class="flex-1 overflow-y-auto px-6 sm:px-8 py-4 space-y-4 scroll-smooth scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent relative z-10"
      @scroll="handleScroll"
    >
      <!-- Load more indicator -->
      <div 
        v-if="hasMore" 
        ref="loadMoreTrigger"
        class="text-center pb-8 border-b border-stone-900"
      >
        <div v-if="isLoadingMore" class="flex items-center justify-center space-x-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-600">
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
                  ? 'bg-stone-900 border-stone-800 text-stone-500' 
                  : 'bg-violet-500/10 border-violet-500/20 text-violet-400 shadow-[0_0_10px_-2px_theme(colors.violet.500)]'
              ]"
            >

              <img 
                v-if="msg.role === 'user' && user?.profilePictureUrl" 
                :src="user.profilePictureUrl" 
                class="w-full h-full object-cover rounded" 
              />
              <User v-else-if="msg.role === 'user'" class="w-3 h-3" />
              <div v-else class="w-full h-full p-1">
                 <img :src="pegasusLogo" class="w-full h-full object-contain" alt="Pegasus" />
              </div>
            </div>
            <span class="text-[10px] font-black uppercase tracking-[0.2em]" :class="msg.role === 'user' ? 'text-stone-500' : 'text-violet-400'">
              {{ msg.role === 'user' ? getUserLabel() : 'Pegasus' }}
            </span>
            <div class="h-px flex-1 bg-stone-900"></div>
            <span class="text-[9px] font-mono text-stone-700 uppercase">
               {{ formatTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Content (No bubbles, just clean breaks) -->
          <div class="pl-7 space-y-1">
            <!-- Chart Rendering for AI responses with chart data -->
            <div v-if="msg.role === 'assistant' && isChartContent(msg.content)" class="w-full max-w-2xl space-y-3">
              <div class="text-sm font-medium text-stone-400 mb-2">{{ parseChartConfig(msg.content).title }}</div>
              <ChartRenderer 
                :type="parseChartConfig(msg.content).type" 
                :data="parseChartConfig(msg.content).data"
                :options="{ responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true } } }"
                class="rounded-lg border border-stone-800 bg-stone-900/50 p-4 h-[300px]"
              />
              <button 
                @click="$emit('add-to-dashboard', parseChartConfig(msg.content))"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold uppercase tracking-wide hover:bg-violet-500/20 transition-all"
              >
                <LayoutDashboard class="w-3 h-3" />
                <span>Add to Dashboard</span>
              </button>
            </div>
            <!-- Regular Text Content -->
            <div 
              v-else
              class="text-stone-300 leading-[1.5] text-[13px] font-normal selection:bg-violet-500/30 selection:text-white markdown-chat"
            >
                <div class="break-words">
                  <div v-if="shouldTruncate(msg.content) && !isExpanded(msg)" v-html="renderMarkdown(getTruncatedContent(msg.content))"></div>
                  <div v-else v-html="renderMarkdown(formatContent(msg.content))"></div>
                </div>
                
                <button 
                  v-if="shouldTruncate(msg.content) && !isExpanded(msg)"
                  @click="handleReadMore(msg)"
                  class="mt-2 text-violet-400 hover:text-violet-300 text-[11px] font-bold flex items-center gap-1 transition-all"
                >
                  <Sparkles class="w-3 h-3" />
                  <span>Read Full Report</span>
                </button>
            </div>

            <!-- Action Toolbar (Pinned below content) -->
            <div 
              class="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 duration-300"
            >
              <!-- Copy Button (All messages) -->
              <button 
                @click="copyToClipboard(msg.content)" 
                class="flex items-center space-x-2 px-2 py-1 rounded bg-stone-900/50 border border-stone-800/50 text-[10px] text-stone-500 hover:text-stone-200 hover:border-stone-700 transition-all"
              >
                <component :is="copied === msg.content ? Check : Copy" class="w-3 h-3" />
                <span>{{ copied === msg.content ? 'Copied' : 'Copy' }}</span>
              </button>

              <!-- Retry Button (User messages only) -->
               <button 
                v-if="msg.role === 'user'"
                @click="handleRetry(msg.content)" 
                class="flex items-center space-x-2 px-2 py-1 rounded bg-stone-900/50 border border-stone-800/50 text-[10px] text-stone-500 hover:text-violet-400 hover:border-violet-500/30 transition-all"
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
            <Loader2 class="w-4 h-4 animate-spin" />
            <span class="text-[11px] font-bold uppercase tracking-[0.2em] animate-pulse">Synthesizing data...</span>
         </div>
      </div>
    </div>

    <!-- Mode Transition Background (Write Mode) -->
    <div v-if="props.mode === 'write'" class="flex-1 bg-stone-950/80 backdrop-blur-md z-0"></div>

    <!-- Input Laboratory Container -->
    <div 
      class="flex-shrink-0 relative z-20 pb-2 px-6 sm:px-8"
    >
      <div 
        class="max-w-4xl mx-auto rounded-lg overflow-hidden transition-all duration-500 border relative group/input shadow-2xl"
        :class="[
          isInputFocused ? 'border-violet-500/40 bg-stone-800/70' : 'border-stone-800 bg-stone-800/50'
        ]"
      >
        <!-- Thinking Progress Bar -->
        <div v-if="props.isThinking" class="absolute top-0 left-0 right-0 h-[2px] bg-stone-800 overflow-hidden">
           <div class="h-full bg-violet-500 animate-[progress_1.5s_infinite_linear] shadow-[0_0_8px_theme(colors.violet.500)]" style="width: 30%"></div>
        </div>

        <div v-if="props.mode === 'write'" class="h-[320px]">
          <CodeEditor
            v-if="props.mode === 'write'"
            :key="'write-mode'"
            v-model="localInput"
            language="sql"
            class="w-full h-full bg-transparent text-foreground resize-none focus:outline-none font-mono text-sm placeholder:text-stone-600"
          />
        </div>
        <div v-else class="relative">
          <textarea
            v-model="localInput"
            rows="1"
            placeholder="Query your database..."
            class="w-full min-h-[44px] max-h-[300px] bg-transparent text-stone-200 p-3 pr-[140px] resize-none focus:outline-none font-sans text-[14px] placeholder:text-stone-600 leading-normal scrollbar-none transition-all duration-300"
            @focus="isInputFocused = true"
            @blur="isInputFocused = false"
            @keydown.enter.exact.prevent="$emit('submit')"
            @input="adjustTextareaHeight"
            ref="textareaRef"
          ></textarea>
          
          <!-- Input Footer -->
          <div class="absolute bottom-1.5 right-1.5 flex items-center justify-end">
            <button 
              @click="$emit('submit')"
              :disabled="!localInput.trim() || props.isThinking"
              class="flex items-center space-x-2 px-4 py-2 rounded-lg transition-all font-bold uppercase tracking-[0.1em] text-[10px]"
              :class="[
                localInput.trim() && !props.isThinking 
                  ? 'bg-stone-100 text-stone-950 hover:bg-white shadow-lg' 
                  : 'bg-stone-900 text-stone-700 opacity-50 cursor-not-allowed'
              ]"
            >
              <Zap v-if="!props.isThinking" class="w-3.5 h-3.5" />
              <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
              <span>{{ props.isThinking ? 'Running' : 'Run Query' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, nextTick, defineAsyncComponent } from 'vue'
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
  ChevronDown
} from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import { useAuth } from '@/composables/useAuth'
import { useColorMode, usePreferredDark } from '@vueuse/core'
import { useChatDialogs } from '@/composables/useChatDialogs'

const { user } = useAuth()
const mode = useColorMode()
const preferredDark = usePreferredDark()

const md = new MarkdownIt({ 
  html: true, 
  linkify: true, 
  typographer: true,
  breaks: true 
})

const renderMarkdown = (content: string) => {
  if (!content) return ''
  return md.render(content)
}

const pegasusLogo = computed(() => {
  const isDark = mode.value === 'dark' || (mode.value === 'auto' && preferredDark.value)
  return isDark ? '/pegasus-white.svg' : '/pegasus.svg'
})

const getUserLabel = () => {
  if (user.value?.firstName) return user.value.firstName
  if (user.value?.email) return user.value.email.split('@')[0]
  return 'User'
}

const CodeEditor = defineAsyncComponent(() => import('./CodeEditor.vue'))

const props = defineProps<{ 
  mode: 'chat' | 'write'
  input: string
  history?: Array<{ role: string; content: string; timestamp: number }>
  isThinking?: boolean
}>()

const emit = defineEmits(['update:input', 'submit', 'add-to-dashboard'])

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
const { openSummary } = useChatDialogs()

const isExpanded = (msg: any) => expandedMessages.value.has(msg.timestamp)

const shouldTruncate = (content: string) => {
  const text = formatContent(content)
  return text.length > 400 || (text.match(/\n/g) || []).length > 2
}

const getTruncatedContent = (content: string) => {
  const text = formatContent(content)
  if (text.length <= 400) return text
  return text.substring(0, 380) + '...'
}

const handleReadMore = (msg: any) => {
  const fullText = formatContent(msg.content)
  if (fullText.length > 1000) {
    // If extremely long, open in dialog
    openSummary(fullText)
  } else {
    // Otherwise just expand in-place
    expandedMessages.value.add(msg.timestamp)
  }
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

.glass-card {
  background: rgba(10, 10, 11, 0.4);
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
  background: #1c1c1e;
  border-radius: 20px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: #2c2c2e;
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
.markdown-chat :deep(strong) { color: #fff; font-weight: 700; }
.markdown-chat :deep(ul) { list-style: disc; padding-left: 1.25rem; margin-bottom: 0.75rem; }
.markdown-chat :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin-bottom: 0.75rem; }
.markdown-chat :deep(li) { margin-bottom: 0.25rem; }
.markdown-chat :deep(code) { 
  background: rgba(139, 92, 246, 0.1); 
  padding: 0.125rem 0.25rem; 
  border-radius: 0.25rem; 
  font-family: monospace; 
  font-size: 0.85em; 
  color: #a78bfa;
}
.markdown-chat :deep(pre) { 
  background: #000; 
  padding: 0.75rem; 
  border-radius: 0.5rem; 
  margin: 0.75rem 0; 
  overflow-x: auto; 
  border: 1px solid rgba(255,255,255,0.05);
}
.markdown-chat :deep(table) { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 12px; }
.markdown-chat :deep(th), .markdown-chat :deep(td) { border: 1px solid #2d2d2d; padding: 6px 10px; text-align: left; }
.markdown-chat :deep(th) { background: #1a1a1a; font-weight: bold; }
</style>
