<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { computed } from 'vue'
import { MessageSquare, User, Bot, Calendar } from 'lucide-vue-next'
import ChatMessage from './ChatMessage.vue'

const props = defineProps<{
  open: boolean
  chat: { id: string; title: string; updated_at: number } | null
  messages: { role: string; content: string; timestamp: number }[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'continue': [chatId: string]
  'delete': [chatId: string]
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[800px] max-h-[85vh] flex flex-col bg-background border-border text-foreground">
      <DialogHeader class="shrink-0">
        <DialogTitle class="flex items-center gap-2 text-primary">
          <MessageSquare class="w-5 h-5" />
          {{ chat?.title || 'Chat History' }}
        </DialogTitle>
        <DialogDescription v-if="chat" class="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar class="w-3 h-3" />
          Last updated: {{ formatTime(chat.updated_at * 1000) }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto py-4 space-y-6 pr-2">
        <div v-if="messages.length === 0" class="text-center text-muted-foreground py-8">
          No messages in this conversation.
        </div>
        
        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="flex gap-3"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''"
        >
          <!-- Avatar -->
          <div 
            class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border mt-1"
            :class="msg.role === 'user' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted border-border text-muted-foreground'"
          >
            <User v-if="msg.role === 'user'" class="w-4 h-4" />
            <Bot v-else class="w-4 h-4" />
          </div>

          <!-- Bubble -->
          <div 
            class="max-w-[85%] rounded-lg px-4 py-3 text-sm shadow-sm"
            :class="msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'"
          >
            <ChatMessage :content="msg.content" :role="msg.role" />
            <div 
              class="text-[10px] mt-2 opacity-70 text-right"
              :class="msg.role === 'user' ? 'text-primary-foreground' : 'text-muted-foreground'"
            >
              {{ formatTime(msg.timestamp) }}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="shrink-0 gap-6 sm:gap-4">
        <button
          v-if="chat"
          @click="emit('delete', chat.id)"
          class="px-4 py-2 rounded-md text-sm font-medium text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
        >
          Delete Chat
        </button>
        <button
          v-if="chat"
          @click="emit('continue', chat.id)"
          class="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          Continue Chatting
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
