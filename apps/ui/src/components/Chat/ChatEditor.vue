<template>
  <div class="flex-1 flex flex-col overflow-hidden relative bg-background min-h-[300px]">
    <!-- Technical Grid Background -->
    <div class="absolute inset-0 pointer-events-none z-0 opacity-[0.03] dark:opacity-[0.05]" 
         style="background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 32px 32px;">
    </div>
    <div class="absolute inset-0 pointer-events-none z-0 bg-gradient-to-b from-transparent via-background/10 to-background"></div>

    <!-- Message Thread -->
    <div 
      ref="historyContainer"
      class="flex-1 overflow-y-auto px-6 sm:px-12 py-8 space-y-10 scroll-smooth scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent relative z-10"
      @scroll="handleScroll"
    >
      <!-- Load more indicator -->
      <div 
        v-if="hasMore" 
        ref="loadMoreTrigger"
        class="text-center pb-8"
      >
        <div v-if="isLoadingMore" class="flex items-center justify-center space-x-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <Loader2 class="w-3 h-3 animate-spin" />
          <span>Restoring older context...</span>
        </div>
      </div>

      <!-- Linear Message Thread -->
      <TransitionGroup name="message-fade">
        <div 
          v-for="(msg, idx) in displayedMessages" 
          :key="msg.timestamp + idx"
          class="flex w-full gap-5 group animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <!-- Avatar Section -->
          <div class="flex-shrink-0 pt-1">
             <div 
              :class="[
                'w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold border transition-all duration-300',
                msg.role === 'user' 
                  ? 'bg-muted/50 border-border text-muted-foreground' 
                  : 'bg-violet-500/10 border-violet-500/20 text-violet-500 shadow-[0_0_20px_-5px_theme(colors.violet.500/0.2)]'
              ]"
            >
              <img 
                v-if="msg.role === 'user' && user?.profilePictureUrl" 
                :src="user.profilePictureUrl" 
                class="w-full h-full object-cover rounded-xl" 
              />
              <User v-else-if="msg.role === 'user'" class="w-4 h-4" />
              <div v-else class="w-full h-full p-2">
                 <img :src="pegasusLogo" class="w-full h-full object-contain" alt="Pegasus" />
              </div>
            </div>
          </div>
          
          <!-- Content Section -->
          <div class="flex-1 min-w-0 flex flex-col pt-0.5">
            <!-- Header: Name & Time -->
            <div class="flex items-center gap-3 mb-1.5 min-w-0">
               <span class="text-xs font-black uppercase tracking-widest truncate" :class="msg.role === 'user' ? 'text-muted-foreground' : 'text-violet-500 dark:text-violet-400'">
                 {{ msg.role === 'user' ? getUserLabel() : 'Pegasus' }}
               </span>
               <span class="text-[10px] font-mono text-muted-foreground/30 uppercase flex-shrink-0">
                  {{ formatTime(msg.timestamp) }}
               </span>
               <div v-if="(msg as any).meta?.isStreaming" class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse flex-shrink-0"></div>
            </div>

            <!-- Content Area -->
            <div class="relative min-w-0">
              <!-- Chart Rendering -->
              <div v-if="msg.role === 'assistant' && isChartContent(msg.content)" class="w-full max-w-3xl my-4">
                <div class="text-xs font-bold uppercase tracking-widest text-foreground/50 mb-3">{{ parseChartConfig(msg.content).title }}</div>
                <div class="rounded-2xl border border-border/50 bg-muted/20 p-6 shadow-sm backdrop-blur-sm group-hover:border-violet-500/20 transition-all">
                  <ChartRenderer 
                    :type="parseChartConfig(msg.content).type" 
                    :data="parseChartConfig(msg.content).data"
                    :options="{ responsive: true, maintainAspectRatio: true }"
                    class="h-[320px]"
                  />
                  <div class="mt-4 flex justify-end">
                    <button 
                      @click="$emit('add-to-dashboard', parseChartConfig(msg.content))"
                      class="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 dark:text-violet-400 text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      <LayoutDashboard class="w-3.5 h-3.5" />
                      <span>Pin to Workspace</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Regular Text/Content -->
              <div 
                v-else
                class="text-foreground/90 leading-relaxed text-[15px] font-normal selection:bg-violet-500/20"
              >
                  <ChatMessage 
                    :content="msg.content" 
                    :role="msg.role" 
                    :meta="(msg as any).meta"
                    @generate-insights="(p: any) => $emit('generate-insights', { ...p, messageIndex: idx })"
                  />
                  
                  <!-- Typing indicator when streaming -->
                  <span v-if="(msg as any).meta?.isStreaming" class="inline-block w-1.5 h-4 ml-1 bg-violet-500/50 animate-pulse align-middle"></span>
              </div>

              <!-- Action Toolbar -->
              <div 
                class="flex items-center space-x-2 mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300"
              >
                <button 
                  @click="copyToClipboard(msg.content)" 
                  class="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all font-bold uppercase tracking-wider"
                >
                  <component :is="copied === msg.content ? Check : Copy" class="w-3 h-3" />
                  <span>{{ copied === msg.content ? 'Copied' : 'Copy' }}</span>
                </button>

                <button 
                  v-if="msg.role === 'assistant' && (msg as any).meta?.hasResults"
                  @click="$emit('show-results')" 
                  class="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-500 hover:bg-violet-500/20 transition-all font-bold uppercase tracking-wider"
                >
                  <Maximize2 class="w-3 h-3" />
                  <span>Expand Data</span>
                </button>

                 <button 
                  v-if="msg.role === 'user'"
                  @click="handleRetry(msg.content)" 
                  class="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50 text-[10px] text-muted-foreground hover:text-violet-500 hover:border-violet-500/20 transition-all font-bold uppercase tracking-wider"
                >
                  <RefreshCw class="w-3 h-3" />
                  <span>Re-run</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <!-- Thinking State -->
      <div v-if="props.isThinking" class="pl-12 animate-in fade-in duration-500">
         <div class="flex items-center gap-3 text-muted-foreground/50">
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
            <span class="text-[11px] font-bold uppercase tracking-[0.2em] animate-pulse">PEGASUS CORE ANALYZING...</span>
         </div>
      </div>
    </div>


    <!-- Input Container -->
    <div 
      class="flex-shrink-0 relative z-20 pb-8 px-6 sm:px-12 max-w-5xl mx-auto w-full"
    >
      <div class="glass-input p-1.5 rounded-2xl shadow-2xl shadow-violet-500/10 transition-all duration-300 focus-within:shadow-violet-500/20">
        <HaloSearch 
          v-model="localInput"
          :is-thinking="props.isThinking"
          @submit="$emit('submit')"
          placeholder="Ask anything about your data, or mention elements with #, @, !"
        />
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
  ChevronDown,
  ExternalLink,
  Maximize2
} from 'lucide-vue-next'
import HaloSearch from '@/components/halo-search/Halo-Search.vue'
import ChatMessage from './ChatMessage.vue'
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

const emit = defineEmits(['update:input', 'submit', 'add-to-dashboard', 'show-results', 'generate-insights'])

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

const isExpanded = (msg: any) => expandedMessages.value.has(msg.timestamp)

const shouldTruncate = (content: string) => {
  const text = formatContent(content)
  return text.length > 800 || (text.match(/\n/g) || []).length > 12
}

const getTruncatedContent = (content: string) => {
  const text = formatContent(content)
  if (text.length <= 800) return text
  return text.substring(0, 750) + '...'
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
.glass-input {
  background: rgba(var(--background-rgb), 0.7);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow: 
    0 8px 32px 0 rgba(31, 38, 135, 0.07);
}

.dark .glass-input {
  background: rgba(9, 9, 11, 0.7);
  box-shadow: 
    0 8px 32px 0 rgba(0, 0, 0, 0.4);
}

/* Animations */
.message-fade-enter-active,
.message-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.message-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.message-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Markdown Styling */
.markdown-chat :deep(p) {
  margin-bottom: 0.75rem;
  line-height: 1.6;
}

.markdown-chat :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-chat :deep(code) {
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.9em;
}

.markdown-chat :deep(pre) {
  background: rgba(0, 0, 0, 0.03);
  padding: 1rem;
  border-radius: 12px;
  overflow-x: auto;
  margin: 1rem 0;
  border: 1px solid var(--border);
}

.dark .markdown-chat :deep(pre) {
  background: rgba(255, 255, 255, 0.02);
}

.markdown-chat :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: 13px;
}

.markdown-chat :deep(ul), .markdown-chat :deep(ol) {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.markdown-chat :deep(li) {
  margin-bottom: 0.5rem;
}

.markdown-chat :deep(h1), .markdown-chat :deep(h2), .markdown-chat :deep(h3) {
  font-weight: 700;
  margin: 1.5rem 0 0.75rem 0;
  color: var(--foreground);
}

.markdown-chat :deep(h3) { font-size: 1.1rem; }

.markdown-chat :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 13px;
}

.markdown-chat :deep(th), .markdown-chat :deep(td) {
  border: 1px solid var(--border);
  padding: 0.75rem;
  text-align: left;
}

.markdown-chat :deep(th) {
  background: var(--muted);
  font-weight: 600;
}

.markdown-chat :deep(blockquote) {
  border-left: 4px solid #8b5cf6;
  padding-left: 1rem;
  margin: 1rem 0;
  color: var(--muted-foreground);
  font-style: italic;
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
</style>
