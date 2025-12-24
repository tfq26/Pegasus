<script setup lang="ts">
import { MessageSquare, Table, Terminal, X } from 'lucide-vue-next'
import type { Tab } from '@/stores/workspace'

const props = defineProps<{
  tabs: Tab[]
  activeTabId: string | null
}>()

const emit = defineEmits<{
  'select': [id: string]
  'close': [id: string]
}>()

function getIcon(type: Tab['type']) {
  switch (type) {
    case 'chat': return MessageSquare
    case 'query': return Terminal
    case 'table': 
    case 'spreadsheet': return Table
    default: return Table
  }
}
</script>

<template>
  <div class="mt-4 pt-4 border-t border-stone-800/50 space-y-1 max-h-[400px] overflow-y-auto pr-1">
    <div 
      v-for="tab in tabs" 
      :key="tab.id"
      class="flex items-center justify-between p-2 rounded-lg group transition-all w-full cursor-pointer border border-transparent"
      :class="[
        activeTabId === tab.id 
          ? 'bg-violet-500/10 border-violet-500/20 text-violet-200' 
          : 'hover:bg-violet-500/5 hover:border-violet-500/10 text-stone-400 hover:text-stone-200'
      ]"
      @click="emit('select', tab.id)"
    >
      <div class="flex items-center gap-2 overflow-hidden">
        <component :is="getIcon(tab.type)" class="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span class="truncate text-xs font-medium">
          {{ tab.label }}
        </span>
      </div>
      
      <button 
        @click.stop="emit('close', tab.id)" 
        class="p-1 hover:text-rose-400 text-stone-500 opacity-0 group-hover:opacity-100 transition-all"
        title="Close Tab"
      >
        <X class="w-3 h-3" />
      </button>
    </div>
    
    <div v-if="tabs.length === 0" class="py-4 text-center text-[10px] text-stone-600 uppercase tracking-widest font-bold">
      No open tabs
    </div>
  </div>
</template>
