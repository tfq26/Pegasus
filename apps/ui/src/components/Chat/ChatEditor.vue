<template>
  <div class="flex-1 flex flex-col overflow-hidden relative bg-background min-h-[300px]">
    <!-- Chat History (only in chat mode) -->
    <div 
      v-if="props.mode === 'chat' && props.history && props.history.length > 0" 
      ref="historyContainer"
      class="flex-1 overflow-y-auto px-4 py-3 space-y-3 border-b border-border/30"
      @scroll="handleScroll"
    >
      <!-- Load more indicator -->
      <div 
        v-if="hasMore" 
        ref="loadMoreTrigger"
        class="text-center py-2"
      >
        <div v-if="isLoadingMore" class="text-xs text-muted-foreground">
          Loading older messages...
        </div>
        <div v-else class="text-xs text-muted-foreground/50">
          Scroll up for older messages
        </div>
      </div>

      <!-- Messages -->
      <div 
        v-for="(msg, idx) in displayedMessages" 
        :key="idx"
        :class="[
          'flex',
          msg.role === 'user' ? 'justify-end' : 'justify-start'
        ]"
      >
        <div 
          :class="[
            'max-w-[80%] rounded-lg px-3 py-2 text-sm',
            msg.role === 'user' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-foreground'
          ]"
        >
          <div class="whitespace-pre-wrap break-words">{{ formatContent(msg.content) }}</div>
          <div class="text-[10px] mt-1 opacity-70">
            {{ formatTime(msg.timestamp) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="flex-shrink-0">
      <CodeEditor
        v-if="props.mode === 'write'"
        :key="'write-mode'"
        v-model="localInput"
        language="sql"
        class="w-full h-full bg-transparent text-foreground p-4 resize-none focus:outline-none font-sans text-base placeholder:text-muted-foreground"
      />
      <textarea
        v-else
        :key="'chat-mode'"
        v-model="localInput"
        placeholder="Ask Pegasus..."
        class="w-full min-h-[100px] bg-transparent text-foreground p-4 resize-none focus:outline-none font-sans text-base placeholder:text-muted-foreground"
        @keydown.enter.exact.prevent="$emit('submit')"
      ></textarea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, nextTick } from 'vue'
// @ts-ignore: ignore missing .vue module declaration
import CodeEditor from './CodeEditor.vue'

const props = defineProps<{ 
  mode: 'chat' | 'write'
  input: string
  history?: Array<{ role: string; content: string; timestamp: number }>
}>()
const emit = defineEmits(['update:input', 'submit'])

const localInput = ref(props.input)
const historyContainer = ref<HTMLElement | null>(null)
const loadMoreTrigger = ref<HTMLElement | null>(null)
const isLoadingMore = ref(false)
const displayCount = ref(20) // Start with 20 most recent messages
const observer = ref<IntersectionObserver | null>(null)

const displayedMessages = computed(() => {
  console.log('[ChatEditor] Computing displayed messages. History:', props.history?.length, 'Mode:', props.mode)
  if (!props.history) return []
  const total = props.history.length
  const start = Math.max(0, total - displayCount.value)
  const messages = props.history.slice(start)
  console.log('[ChatEditor] Displaying', messages.length, 'messages')
  return messages
})

const hasMore = computed(() => {
  return props.history && props.history.length > displayCount.value
})

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
}

const formatContent = (content: string) => {
  if (typeof content !== 'string') return content
  
  let formatted = content

  // Try to parse if it looks like a JSON string (starts and ends with quotes)
  if (formatted.startsWith('"') && formatted.endsWith('"')) {
    try {
      formatted = JSON.parse(formatted)
    } catch (e) {
      // If parse fails, just strip quotes manually
      formatted = formatted.slice(1, -1)
    }
  }

  // Convert literal \n strings to actual newlines (if any remain)
  return formatted.replace(/\\n/g, '\n')
}

const loadMore = async () => {
  if (isLoadingMore.value || !hasMore.value) return
  
  isLoadingMore.value = true
  await new Promise(resolve => setTimeout(resolve, 300)) // Simulate loading
  displayCount.value += 20
  isLoadingMore.value = false
  
  // Maintain scroll position
  await nextTick()
  if (historyContainer.value) {
    historyContainer.value.scrollTop = 100
  }
}

const handleScroll = () => {
  if (!historyContainer.value) return
  if (historyContainer.value.scrollTop < 50 && hasMore.value) {
    loadMore()
  }
}

onMounted(() => {
  // Set up intersection observer for lazy loading
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

  // Scroll to bottom on mount
  nextTick(() => {
    if (historyContainer.value) {
      historyContainer.value.scrollTop = historyContainer.value.scrollHeight
    }
  })
})

watch(() => props.input, (val) => {
  localInput.value = val
})

watch(localInput, (val) => {
  emit('update:input', val)
})

// Auto-scroll to bottom when new messages arrive
watch(() => props.history?.length, async () => {
  await nextTick()
  if (historyContainer.value) {
    const isNearBottom = historyContainer.value.scrollHeight - historyContainer.value.scrollTop - historyContainer.value.clientHeight < 100
    if (isNearBottom) {
      historyContainer.value.scrollTop = historyContainer.value.scrollHeight
    }
  }
})
</script>
