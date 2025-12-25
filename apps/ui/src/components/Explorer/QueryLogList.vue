<script setup lang="ts">
import { ref, computed } from 'vue'
import { Database, Sparkles, Clock, ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  queryHistory?: any[]
}>()

const emit = defineEmits<{
  'load-query': [query: string]
}>()

const displayLimit = ref(20)

const sortedHistory = computed(() => {
  if (!props.queryHistory) return []
  return [...props.queryHistory].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
})

const groupedHistory = computed(() => {
  const groups: Record<string, any[]> = {
    'Today': [],
    'Yesterday': [],
    'Earlier': []
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000

  if (sortedHistory.value) {
    sortedHistory.value.forEach(q => {
      const qDate = new Date(q.timestamp).getTime()
      if (qDate >= today) groups['Today']?.push(q)
      else if (qDate >= yesterday) groups['Yesterday']?.push(q)
      else groups['Earlier']?.push(q)
    })
  }

  return groups
})

function formatTime(timestamp: any) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="px-1 flex items-center justify-between">
      <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Query History</h3>
      <Clock class="w-3 h-3 text-stone-600" />
    </div>

    <div class="space-y-8">
      <div v-if="!props.queryHistory?.length" class="py-12 text-center">
        <p class="text-[10px] font-bold uppercase tracking-widest text-stone-600 opacity-50">No recent queries</p>
      </div>

      <div v-for="(queries, label) in groupedHistory" :key="label">
        <div v-if="queries.length > 0" class="space-y-3">
          <div class="px-1 mb-2">
            <span class="text-[9px] font-bold uppercase tracking-widest text-stone-600">{{ label }}</span>
          </div>
          
          <div class="space-y-2">
            <div
              v-for="q in queries.slice(0, displayLimit)"
              :key="q.id"
              @click="emit('load-query', q.query)"
              class="group cursor-pointer p-3 rounded-xl bg-stone-900/40 border border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/60 transition-all active:scale-[0.98]"
            >
              <div class="flex items-center gap-3">
                <div 
                  class="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors"
                  :class="q.source === 'ai' ? 'bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20' : 'bg-stone-800 text-stone-500 group-hover:bg-stone-700'"
                >
                  <Sparkles v-if="q.source === 'ai'" class="w-3 h-3" />
                  <Database v-else class="w-3 h-3" />
                </div>
                <div class="flex-1 min-w-0 overflow-hidden">
                  <p class="text-xs font-mono truncate text-stone-400 group-hover:text-stone-200 transition-colors">{{ q.query }}</p>
                  <p class="text-[9px] text-stone-600 mt-1 uppercase tracking-tighter font-bold">
                    {{ formatTime(q.timestamp) }}
                  </p>
                </div>
              </div>
            </div>
            
            <button 
              v-if="queries.length > displayLimit"
              @click="displayLimit += 50"
              class="w-full py-2 text-[9px] font-bold uppercase tracking-widest text-stone-600 hover:text-stone-400 transition-colors flex items-center justify-center gap-2"
            >
              Show More
              <ChevronDown class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

