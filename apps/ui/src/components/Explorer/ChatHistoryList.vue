<script setup lang="ts">
import { Search, Plus, Trash } from 'lucide-vue-next'

const props = defineProps<{
  chats?: any[]
  selectedChatId?: string
}>()

const emit = defineEmits<{
  'select-chat': [id: string]
  'create-chat': []
  'clear-all': []
  'delete-chat': [chat: any]
}>()

function formatDate(timestamp: any) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between px-1">
      <h3 class="text-[10px] font-bold  tracking-[0.2em] text-muted-foreground">Session History</h3>
      <div class="flex gap-2">
        <button 
          @click="emit('create-chat')"
          class="p-1.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-purple-500 hover:bg-muted/80 transition-all"
          title="New Session"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
        <button 
          v-if="props.chats?.length"
          @click="emit('clear-all')"
          class="p-1.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-rose-400 hover:bg-muted/80 transition-all"
          title="Clear All"
        >
          <Trash class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div class="space-y-2">
      <div v-if="!props.chats?.length" class="py-12 text-center space-y-3">
        <div class="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center mx-auto opacity-50">
          <Search class="w-5 h-5 text-muted-foreground" />
        </div>
        <p class="text-[10px] font-bold  tracking-widest text-muted-foreground">No session history</p>
      </div>

      <div
        v-for="chat in props.chats"
        :key="chat.id"
        @click="emit('select-chat', chat.id)"
        class="group relative cursor-pointer px-4 py-3 rounded-xl border transition-all duration-300"
        :class="[
          props.selectedChatId === chat.id 
            ? 'bg-purple-500/10 border-purple-500/20 text-foreground shadow-sm shadow-purple-500/20' 
            : 'bg-card/40 border-border/80 hover:border-border hover:bg-muted/50 text-muted-foreground'
        ]"
      >
        <div class="flex justify-between items-start gap-3">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate group-hover:text-foreground transition-colors">{{ chat.title }}</p>
            <p class="text-[10px] font-bold  tracking-tighter text-muted-foreground mt-1">{{ formatDate(chat.updated_at) }}</p>
          </div>
          <button 
            @click.stop="emit('delete-chat', chat)"
            class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-400 transition-all"
          >
            <Trash class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
