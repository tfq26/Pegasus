<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue'
import { 
  FileText, 
  Table, 
  StickyNote, 
  Database,
  Loader2
} from 'lucide-vue-next'

export interface MentionItem {
  id: string
  label: string
  type: 'file' | 'table' | 'note'
  icon?: any
  value?: string
  meta?: any
}

const props = defineProps<{
  visible: boolean
  items: MentionItem[]
  loading?: boolean
  query?: string
}>()

const emit = defineEmits<{
  (e: 'select', item: MentionItem): void
  (e: 'close'): void
}>()

const selectedIndex = ref(0)
const containerRef = ref<HTMLElement | null>(null)

const filteredItems = computed(() => {
  if (!props.query) return props.items.slice(0, 10)
  
  const q = props.query.toLowerCase()
  return props.items
    .filter(item => item.label.toLowerCase().includes(q))
    .slice(0, 10)
})

watch(() => props.query, () => {
  selectedIndex.value = 0
})

watch(() => props.visible, (val) => {
  if (val) {
    selectedIndex.value = 0
  }
})

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.visible) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % filteredItems.value.length
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + filteredItems.value.length) % filteredItems.value.length
    scrollToSelected()
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    if (filteredItems.value[selectedIndex.value]) {
       emit('select', filteredItems.value[selectedIndex.value])
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

const scrollToSelected = () => {
  nextTick(() => {
    if (!containerRef.value) return
    const el = containerRef.value.children[selectedIndex.value] as HTMLElement
    if (el) {
       el.scrollIntoView({ block: 'nearest' })
    }
  })
}

// Expose key handler to parent
defineExpose({ handleKeyDown })

</script>

<template>
  <Transition name="fade-slide">
    <div 
      v-if="visible"
      class="absolute bottom-full mb-2 left-0 w-64 bg-background/80 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
    >
      <div 
        v-if="loading" 
        class="p-3 text-xs text-muted-foreground flex items-center justify-center gap-2"
      >
        <Loader2 class="w-3 h-3 animate-spin" />
        <span>Loading...</span>
      </div>
      
      <div 
        v-else-if="filteredItems.length === 0"
        class="p-3 text-xs text-muted-foreground text-center"
      >
        No results found
      </div>

      <div 
        v-else
        ref="containerRef"
        class="max-h-60 overflow-y-auto scrollbar-thin py-1"
      >
        <button
          v-for="(item, index) in filteredItems"
          :key="item.id"
          @click="emit('select', item)"
          @mousemove="selectedIndex = index"
          class="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors text-sm"
          :class="index === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground'"
        >
          <div 
            class="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            :class="{
               'bg-blue-500/10 text-blue-500': item.type === 'file',
               'bg-green-500/10 text-green-500': item.type === 'table',
               'bg-yellow-500/10 text-yellow-500': item.type === 'note'
            }"
          >
             <component :is="item.icon || FileText" class="w-3.5 h-3.5" />
          </div>
          <span class="truncate font-medium">{{ item.label }}</span>
        </button>
      </div>
      
      <div class="px-3 py-1.5 bg-muted/30 border-t border-border/30 text-[10px] text-muted-foreground flex justify-between">
         <span>Select to mention</span>
         <span class="font-mono">TAB</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}
</style>
