<script setup lang="ts">
import { Database, Sparkles } from 'lucide-vue-next'

const props = defineProps<{
  queryHistory?: any[]
}>()

const emit = defineEmits<{
  'load-query': [query: string]
}>()

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
    <div class="px-1">
      <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Query History</h3>
    </div>

    <div class="space-y-2">
      <div v-if="!props.queryHistory?.length" class="py-12 text-center">
        <p class="text-[10px] font-bold uppercase tracking-widest text-stone-600 opacity-50">No recent queries</p>
      </div>

      <div
        v-for="q in props.queryHistory"
        :key="q.id"
        @click="emit('load-query', q.query)"
        class="group cursor-pointer p-3 rounded-xl bg-stone-900/40 border border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/60 transition-all"
      >
        <div class="flex items-center gap-3">
          <div 
            class="w-6 h-6 rounded flex items-center justify-center shrink-0"
            :class="q.source === 'ai' ? 'bg-violet-500/10 text-violet-400' : 'bg-stone-800 text-stone-500'"
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
    </div>
  </div>
</template>
