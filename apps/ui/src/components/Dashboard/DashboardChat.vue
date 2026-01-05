
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
            class="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border border-border overflow-hidden"
            :class="msg.isAIResponse ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white' : 'bg-primary/20'"
            :title="msg.user.email"
          >
             <Sparkles v-if="msg.isAIResponse" class="w-3 h-3" />
             <img v-else-if="msg.user.profilePictureUrl" :src="msg.user.profilePictureUrl" class="w-full h-full object-cover">
             <span v-else>{{ getInitials(msg.user) }}</span>
          </div>
          
          <span class="text-xs text-muted-foreground">
            {{ msg.isAIResponse ? 'Pegasus' : (msg.user.firstName || (msg.user.email ? msg.user.email.split('@')[0] : 'Unknown')) }}
          </span>
          <span class="text-[10px] text-muted-foreground/60">
            {{ formatTime(msg.timestamp) }}
          </span>
        </div>
        
        <div 
          class="px-3 py-2 rounded-sm text-sm max-w-[85%] break-words"
          :class="[
            msg.isAIResponse
              ? 'bg-violet-500/10 border border-violet-500/20 text-foreground'
              : isCurrentUser(msg.user.id) 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-foreground'
          ]"
        >
          <!-- Render content with mentions highlighted -->
          <span v-html="renderContent(msg.content, msg.mentions)"></span>
          
          <!-- Images -->
          <div v-if="msg.images?.length" class="mt-2 space-y-2">
            <img 
              v-for="(img, idx) in msg.images" 
              :key="idx"
              :src="img.data || img.url"
              class="max-w-full rounded-md cursor-pointer hover:opacity-90"
              @click="openImagePreview(img.data || img.url)"
            />
          </div>
        </div>
      </div>
      
      <!-- AI Thinking Indicator -->
      <div v-if="isAIThinking" class="flex items-center gap-2 text-muted-foreground">
        <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Sparkles class="w-3 h-3 text-white animate-pulse" />
        </div>
        <span class="text-xs">Pegasus is thinking...</span>
      </div>
    </div>

    <!-- Input Area -->
    <div class="p-3 border-t border-border bg-background/50 relative">
      <!-- Mention Popup -->
      <MentionPopup
        v-if="showMentionPopup"
        :query="mentionQuery"
        :collaborators="collaborators"
        :position="mentionPopupPosition"
        @select="handleMentionSelect"
        @close="closeMentionPopup"
      />
      
      <form @submit.prevent="sendMessage" class="flex gap-2">
        <!-- Image Upload Button -->
        <label class="p-2 hover:bg-muted rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
          <Paperclip class="w-4 h-4" />
          <input 
            type="file" 
            accept="image/*" 
            class="hidden" 
            @change="handleImageUpload"
            multiple
          />
        </label>
        
        <input 
          ref="inputRef"
          v-model="newMessage" 
          type="text" 
          placeholder="Type @ to mention..." 
          class="flex-1 bg-muted rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          @input="handleInput"
          @keydown="handleKeydown"
        >
        <button 
          type="submit" 
          :disabled="!canSend"
          class="p-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:bg-primary/90"
        >
          <Send class="w-4 h-4" />
        </button>
      </form>
      
      <!-- Image Previews -->
      <div v-if="pendingImages.length" class="mt-2 flex gap-2 flex-wrap">
        <div v-for="(img, idx) in pendingImages" :key="idx" class="relative group">
          <img :src="img" class="w-16 h-16 object-cover rounded-md border border-border" />
          <button 
            @click="removePendingImage(idx)"
            class="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { X, Send, Sparkles, Paperclip } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import MentionPopup from './MentionPopup.vue'

interface Mention {
  type: 'pegasus' | 'user'
  id?: string
  name: string
}

const props = defineProps<{
  messages: any[]
  collaborators?: any[]
  isAIThinking?: boolean
}>()

const emit = defineEmits(['close', 'send', 'pegasus-query'])
const { user } = useAuth()

const newMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const pendingImages = ref<string[]>([])

// Mention state
const showMentionPopup = ref(false)
const mentionQuery = ref('')
const mentionStartIndex = ref(-1)
const mentionPopupPosition = ref({ top: 0, left: 0 })
const mentions = ref<Mention[]>([])

const collaborators = computed(() => props.collaborators || [])

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

const canSend = computed(() => {
  return newMessage.value.trim() || pendingImages.value.length > 0
})

// Render message content with highlighted mentions
const renderContent = (content: string, msgMentions?: Mention[]) => {
  if (!msgMentions?.length) return escapeHtml(content)
  
  let result = escapeHtml(content)
  msgMentions.forEach(m => {
    const mentionText = `@${m.name}`
    const highlightClass = m.type === 'pegasus' 
      ? 'text-violet-400 font-medium' 
      : 'text-primary font-medium'
    result = result.replace(
      mentionText, 
      `<span class="${highlightClass}">${mentionText}</span>`
    )
  })
  return result
}

const escapeHtml = (str: string) => {
  return str.replace(/[&<>"']/g, (m) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[m] || m
  })
}

// Handle @ mention detection
const handleInput = (e: Event) => {
  const input = e.target as HTMLInputElement
  const value = input.value
  const cursorPos = input.selectionStart || 0
  
  // Find @ symbol before cursor
  const beforeCursor = value.substring(0, cursorPos)
  const atIndex = beforeCursor.lastIndexOf('@')
  
  if (atIndex !== -1 && (atIndex === 0 || beforeCursor[atIndex - 1] === ' ')) {
    const query = beforeCursor.substring(atIndex + 1)
    // Only show popup if no space after @
    if (!query.includes(' ')) {
      mentionStartIndex.value = atIndex
      mentionQuery.value = query
      showMentionPopup.value = true
      
      // Position popup above input
      if (inputRef.value) {
        const rect = inputRef.value.getBoundingClientRect()
        mentionPopupPosition.value = {
          top: -220,
          left: 0
        }
      }
      return
    }
  }
  
  closeMentionPopup()
}

const handleKeydown = (e: KeyboardEvent) => {
  if (showMentionPopup.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      // Let MentionPopup handle these
      return
    }
  }
}

const handleMentionSelect = (item: { id: string, type: 'pegasus' | 'user', name: string }) => {
  // Replace the @query with @Name
  const beforeMention = newMessage.value.substring(0, mentionStartIndex.value)
  const afterMention = newMessage.value.substring(mentionStartIndex.value + mentionQuery.value.length + 1)
  
  newMessage.value = `${beforeMention}@${item.name} ${afterMention}`
  
  mentions.value.push({
    type: item.type,
    id: item.id,
    name: item.name
  })
  
  closeMentionPopup()
  inputRef.value?.focus()
}

const closeMentionPopup = () => {
  showMentionPopup.value = false
  mentionQuery.value = ''
  mentionStartIndex.value = -1
}

// Image handling
const handleImageUpload = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files) return
  
  Array.from(files).forEach(file => {
    if (file.size > 5 * 1024 * 1024) {
      // Skip files over 5MB
      return
    }
    
    const reader = new FileReader()
    reader.onload = () => {
      pendingImages.value.push(reader.result as string)
    }
    reader.readAsDataURL(file)
  })
  
  input.value = ''
}

const removePendingImage = (idx: number) => {
  pendingImages.value.splice(idx, 1)
}

const openImagePreview = (url: string) => {
  window.open(url, '_blank')
}

const sendMessage = () => {
  if (!canSend.value) return
  
  const hasPegasusMention = mentions.value.some(m => m.type === 'pegasus')
  
  const messageData = {
    content: newMessage.value,
    mentions: [...mentions.value],
    images: pendingImages.value.map(data => ({ data }))
  }
  
  if (hasPegasusMention) {
    // Extract query after @Pegasus
    const pegasusMatch = newMessage.value.match(/@Pegasus\s+(.+)/i)
    if (pegasusMatch) {
      emit('pegasus-query', pegasusMatch[1], messageData)
    }
  }
  
  emit('send', messageData)
  
  newMessage.value = ''
  mentions.value = []
  pendingImages.value = []
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
