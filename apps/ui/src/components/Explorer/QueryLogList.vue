<script setup lang="ts">
import { ref, computed } from 'vue'
import { Database, Sparkles, Clock, ChevronDown, Trash, Copy, Share2 } from 'lucide-vue-next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { toast } from '@/composables/useNotifications'

const props = defineProps<{
  queryHistory?: any[]
}>()

const emit = defineEmits<{
  'load-query': [query: string, connectionId?: string]
  'delete-query': [id: string]
  'share-query': [query: any]
  'clear-history': []
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

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  toast.success('Query copied to clipboard')
}
</script>

<template>
  <div class="space-y-6">
    <div class="px-1 flex items-center justify-between">
      <h3 class="text-[10px] font-bold  tracking-[0.2em] text-muted-foreground">Query History</h3>
      <div class="flex items-center gap-2">
        <button 
          v-if="props.queryHistory?.length"
          @click="emit('clear-history')"
          class="p-1 rounded text-muted-foreground hover:bg-muted/80 hover:text-rose-500 transition-colors"
          title="Clear History"
        >
          <Trash class="w-3 h-3" />
        </button>
        <Clock class="w-3 h-3 text-muted-foreground" />
      </div>
    </div>

    <div class="space-y-8">
      <div v-if="!props.queryHistory?.length" class="py-12 text-center">
        <p class="text-[10px] font-bold  tracking-widest text-muted-foreground opacity-50">No recent queries</p>
      </div>

      <div v-for="(queries, label) in groupedHistory" :key="label">
        <div v-if="queries.length > 0" class="space-y-3">
          <div class="px-1 mb-2">
            <span class="text-[9px] font-bold  tracking-widest text-muted-foreground">{{ label }}</span>
          </div>
          
          <div class="space-y-2">
            <template v-for="q in queries.slice(0, displayLimit)" :key="q.id">
              <ContextMenu>
                <ContextMenuTrigger>
                  <div
                    @click="emit('load-query', q.query, q.connection_id || q.connectionId)"
                    class="group cursor-pointer p-3 rounded-xl bg-card/40 border border-border/80 hover:border-border hover:bg-muted/60 transition-all active:scale-[0.98]"
                  >
                    <div class="flex items-center gap-3">
                      <div 
                        class="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors"
                        :class="q.source === 'ai' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:bg-purple-500/20' : 'bg-muted text-muted-foreground group-hover:bg-muted/80'"
                      >
                        <Sparkles v-if="q.source === 'ai'" class="w-3 h-3" />
                        <Database v-else class="w-3 h-3" />
                      </div>
                      <div class="flex-1 min-w-0 overflow-hidden">
                        <p class="text-xs font-mono truncate text-muted-foreground group-hover:text-foreground transition-colors">{{ q.query }}</p>
                        <p class="text-[9px] text-muted-foreground mt-1  tracking-tighter font-bold">
                          {{ formatTime(q.timestamp) }}
                        </p>
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem @click="copyToClipboard(q.query)">
                    <Copy class="w-4 h-4 mr-2" />
                    Copy Query
                  </ContextMenuItem>
                  <ContextMenuItem @click="emit('share-query', q)">
                    <Share2 class="w-4 h-4 mr-2" />
                    Share Query
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem class="text-rose-500 focus:text-rose-500" @click="emit('delete-query', q.id)">
                    <Trash class="w-4 h-4 mr-2" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </template>
            
            <button 
              v-if="queries.length > displayLimit"
              @click="displayLimit += 50"
              class="w-full py-2 text-[9px] font-bold  tracking-widest text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
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

