
<template>
  <div class="flex flex-col h-full border-l border-border bg-card w-[320px]">
    <!-- Header -->
    <div class="p-3 border-b border-border flex items-center justify-between">
      <h3 class="font-semibold text-sm">Chat</h3>
      <button 
        @click="$emit('close')" 
        class="p-2 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors text-muted-foreground"
        title="Close Chat"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Messages List -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
      <div v-if="messages.length === 0" class="text-center text-muted-foreground text-sm py-8">
        No messages yet. Say hello!
      </div>
      
      <div 
        v-for="msg in messages" 
        :key="msg.id" 
        class="flex flex-col gap-1"
        :class="{ 'items-end': isCurrentUser(msg.user.id) }"
      >
        <div class="flex items-center gap-2" :class="{ 'flex-row-reverse': isCurrentUser(msg.user.id) }">
          <!-- Avatar -->
          <div 
            class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold border border-border overflow-hidden"
            :title="msg.user.email"
          >
             <img v-if="msg.user.profilePictureUrl" :src="msg.user.profilePictureUrl" class="w-full h-full object-cover">
             <span v-else>{{ getInitials(msg.user) }}</span>
          </div>
          
          <span class="text-xs text-muted-foreground">
            {{ msg.user.firstName || (msg.user.email ? msg.user.email.split('@')[0] : 'Unknown') }}
          </span>
          <span class="text-[10px] text-muted-foreground/60">
            {{ formatTime(msg.timestamp) }}
          </span>
        </div>
        
        <div 
          class="px-3 py-2 rounded-sm text-sm max-w-[85%] break-words"
          :class="[
            isCurrentUser(msg.user.id) 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-foreground'
          ]"
        >
          {{ msg.content }}
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="p-3 border-t border-border bg-background/50">
      <form @submit.prevent="sendMessage" class="flex gap-2">
        <input 
          v-model="newMessage" 
          type="text" 
          placeholder="Type a message..." 
          class="flex-1 bg-muted rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
        <button 
          type="submit" 
          :disabled="!newMessage.trim()"
          class="p-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:bg-primary/90"
        >
          <Send class="w-4 h-4" />
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { X, Send } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'

const props = defineProps<{
  messages: any[]
}>()

const emit = defineEmits(['close', 'send'])
const { user } = useAuth()
const newMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const isCurrentUser = (userId: string) => {
  const u = user.value as any
  return u?.id === userId || u?.sub === userId
}

const getInitials = (u: any) => {
  if (u.firstName && u.lastName) return (u.firstName[0] + u.lastName[0]).toUpperCase()
  if (u.email) return u.email.substring(0, 2).toUpperCase()
  return '??'
}

const formatTime = (ts: string) => {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const sendMessage = () => {
  if (!newMessage.value.trim()) return
  emit('send', newMessage.value)
  newMessage.value = ''
}

// Auto-scroll to bottom on new messages
watch(() => props.messages.length, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
})
</script>
