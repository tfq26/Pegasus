<script setup lang="ts">
import { MessageSquare, Table, Terminal, X, RotateCcw, Archive, Trash } from 'lucide-vue-next'
import { computed } from 'vue'
import type { Tab } from '@/stores/workspace'

const props = defineProps<{
  tabs: Tab[]
  inactiveTabs?: Tab[]
  activeTabId: string | null
}>()

const emit = defineEmits<{
  'select': [id: string]
  'close': [id: string]
  'restore': [id: string]
  'delete-permanently': [id: string]
}>()

const allTabs = computed(() => {
  const active = props.tabs.map(t => ({ ...t, isActive: true }))
  const inactive = (props.inactiveTabs || []).map(t => ({ ...t, isActive: false }))
  // Sort: Active first, then most recently closed
  return [
    ...active,
    ...inactive.sort((a, b) => {
      const dateA = a.closedAt ? new Date(a.closedAt).getTime() : 0
      const dateB = b.closedAt ? new Date(b.closedAt).getTime() : 0
      return dateB - dateA
    })
  ]
})

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
  <div class="mt-4 pt-4 border-t border-stone-800/50 flex flex-col min-h-0">
    <div class="space-y-1 max-h-[500px] overflow-y-auto pr-1 scrollbar-hide">
      <div 
        v-for="tab in allTabs" 
        :key="tab.id"
        class="flex items-center justify-between p-2 rounded-lg group transition-all w-full cursor-pointer border border-transparent"
        :class="[
          tab.isActive && activeTabId === tab.id 
            ? 'bg-purple-500/10 border-purple-500/20 text-purple-200' 
            : tab.isActive 
              ? 'hover:bg-purple-500/5 hover:border-purple-500/10 text-stone-400 hover:text-stone-200'
              : 'text-stone-500/60 hover:text-stone-400 hover:bg-stone-900/40 opacity-70 hover:opacity-100'
        ]"
        @click="tab.isActive ? emit('select', tab.id) : emit('restore', tab.id)"
      >
        <div class="flex items-center gap-2 overflow-hidden flex-1">
          <div class="relative shrink-0">
            <div v-if="tab.type === 'table' || tab.type === 'spreadsheet'" class="relative w-3.5 h-3.5 shrink-0 opacity-70">
              <img src="/icons/table/table-rows-svgrepo-com.svg" class="w-full h-full block dark:hidden" alt="Table" />
              <img src="/icons/table/table-rows-svgrepo-com-white.svg" class="w-full h-full hidden dark:block" alt="Table" />
            </div>
            <component v-else :is="getIcon(tab.type)" class="w-3.5 h-3.5 opacity-70" />
            <div 
              v-if="!tab.isActive" 
              class="absolute -top-1 -right-1 bg-background rounded-full p-0.5"
            >
              <Archive class="w-2 h-2 text-amber-500/80" />
            </div>
          </div>
          
          <div class="flex flex-col min-w-0">
            <span class="truncate text-xs font-medium" :class="{ 'italic opacity-60': !tab.isActive }">
              {{ tab.label }}
            </span>
            <span v-if="!tab.isActive && tab.closedAt" class="text-[8px] opacity-40 tabular-nums">
              Closed {{ new Date(tab.closedAt).toLocaleDateString() }}
            </span>
          </div>
        </div>
        
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button 
            v-if="tab.isActive"
            @click.stop="emit('close', tab.id)" 
            class="p-1 hover:text-rose-400 text-stone-500 transition-all"
            title="Close Tab"
          >
            <X class="w-3 h-3" />
          </button>
          
          <template v-else>
            <button 
              @click.stop="emit('restore', tab.id)" 
              class="p-1 hover:text-emerald-400 text-stone-500 transition-all"
              title="Restore"
            >
              <RotateCcw class="w-3 h-3" />
            </button>
            <button 
              @click.stop="emit('delete-permanently', tab.id)" 
              class="p-1 hover:text-rose-400 text-stone-500 transition-all"
              title="Delete Permanently"
            >
              <Trash class="w-2.5 h-2.5" />
            </button>
          </template>
        </div>
      </div>
      
      <div v-if="allTabs.length === 0" class="py-12 text-center">
        <div class="w-10 h-10 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-center mx-auto mb-3 opacity-20">
          <Archive class="w-5 h-5" />
        </div>
        <p class="text-[10px] text-stone-600 uppercase tracking-widest font-bold">No tabs found</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
