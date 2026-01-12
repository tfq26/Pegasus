
<template>
  <div class="flex flex-col h-full border-l border-border bg-card w-auto relative overflow-hidden">
    <!-- Header -->
    <div ref="headerRef" class="chat-drag-handle p-3 border-b border-border flex items-center justify-between z-10 bg-card cursor-move">
      <h3 class="font-semibold text-sm pointer-events-none">Chat</h3>
      <div class="flex items-center gap-1">
        <button 
          @click="$emit('toggle-detach')" 
          class="p-2 hover:bg-muted rounded-md transition-colors text-muted-foreground hidden sm:flex"
          :title="isDetached ? 'Dock to right' : 'Detach to float'"
        >
          <Minimize2 v-if="isDetached" class="w-4 h-4" />
          <Maximize2 v-else class="w-4 h-4" />
        </button>
        <button 
          @click="$emit('close')" 
          class="p-2 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors text-muted-foreground"
          title="Close Chat"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Messages List -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto pl-2 pr-0 py-2 space-y-4 scroll-smooth">
      <div v-if="messages.length === 0" class="text-center text-muted-foreground text-sm py-8">
        No messages yet. Say hello!
      </div>
      
      <div 
        v-for="msg in messages" 
        :key="msg.id" 
        :id="`msg-${msg.id}`"
        class="flex flex-col gap-1 group relative transition-all duration-500 mr-1"
        :class="[
          { 'items-end': isCurrentUser(msg.user.id) },
          { 'pulse-highlight': pulsingMessageId === msg.id }
        ]"
      >
        <!-- Reply chain indicator -->
        <div 
          v-if="msg.parentId" 
          @click="scrollToMessage(msg.parentId)"
          class="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1 ml-4 cursor-pointer hover:text-primary transition-colors" 
          :class="{ 'mr-4 ml-0 flex-row-reverse': isCurrentUser(msg.user.id) }"
        >
           <CornerUpRight class="w-3 h-3" />
           <span>Replying to a message</span>
        </div>

        <div class="flex items-center gap-2" :class="{ 'flex-row-reverse': isCurrentUser(msg.user.id) }">
          <!-- Avatar -->
          <div 
            class="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border border-border overflow-hidden shrink-0"
            :class="msg.isAIResponse ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white' : 'bg-primary/20'"
            :title="msg.user.email"
          >
             <Sparkles v-if="msg.isAIResponse" class="w-3 h-3" />
             <img v-else-if="msg.user.profilePictureUrl" :src="msg.user.profilePictureUrl" class="w-full h-full object-cover">
             <span v-else>{{ getInitials(msg.user) }}</span>
          </div>
          
          <span class="text-xs text-muted-foreground truncate max-w-[120px]">
            {{ msg.isAIResponse ? 'Pegasus' : (msg.user.firstName || (msg.user.email ? msg.user.email.split('@')[0] : 'Unknown')) }}
          </span>
          <span class="text-[10px] text-muted-foreground/60">
            {{ formatTime(msg.timestamp) }}
          </span>
          <span v-if="msg.isEdited" class="text-[9px] text-muted-foreground/40 italic">(edited)</span>
        </div>
        
        <!-- Message Context Menu Trigger Wrapper -->
        <ContextMenu>
          <ContextMenuTrigger>
            <div 
              class="px-3 py-2 rounded-xl text-sm max-w-[240px] break-words relative transition-all duration-200"
              :class="[
                msg.isAIResponse
                  ? 'bg-violet-500/10 border border-violet-500/20 text-foreground'
                  : isCurrentUser(msg.user.id) 
                    ? 'bg-violet-700 text-white shadow-sm hover:bg-violet-800 dark:bg-violet-900 dark:text-white dark:hover:bg-violet-950' 
                    : 'bg-muted text-foreground hover:bg-muted/80'
              ]"
            >
              <!-- Editing Mode -->
              <div v-if="editingMessageId === msg.id" class="flex flex-col gap-2 min-w-[180px]">
                <textarea
                  v-model="editContent"
                  class="w-full bg-background/50 text-foreground text-xs p-2 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary h-16 resize-none"
                  @keydown.enter.prevent="saveEdit(msg.id)"
                  @keydown.esc="cancelEdit"
                  autoFocus
                ></textarea>
                <div class="flex justify-end gap-2">
                  <button @click="cancelEdit" class="text-[10px] hover:underline">Cancel</button>
                  <button @click="saveEdit(msg.id)" class="text-[10px] font-bold hover:underline">Save</button>
                </div>
              </div>

              <!-- Normal Mode -->
              <template v-else>
                <div 
                  class="prose prose-sm dark:prose-invert max-w-none prose-p:leading-normal prose-pre:my-1 prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border"
                  v-html="renderContent(msg.content, msg.mentions)"
                ></div>
                
                <!-- Images -->
                <div v-if="msg.images?.length" class="mt-2 space-y-2">
                  <img 
                    v-for="(img, idx) in msg.images" 
                    :key="idx"
                    :src="img.data || img.url"
                    class="max-w-full rounded-md cursor-pointer hover:opacity-90 shadow-sm"
                    @click="openImagePreview(img.data || img.url)"
                  />
                </div>
              </template>
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent class="w-48">
            <ContextMenuItem @click="copyToClipboard(msg.content)" class="gap-2">
              <Copy class="w-3.5 h-3.5" />
              <span>Copy Text</span>
            </ContextMenuItem>
            <ContextMenuItem @click="replyToMessage(msg)" class="gap-2">
              <RotateCcw class="w-3.5 h-3.5" />
              <span>Reply</span>
            </ContextMenuItem>
            
            <template v-if="isCurrentUser(msg.user.id)">
              <ContextMenuSeparator />
              <ContextMenuItem @click="startEdit(msg)" class="gap-2">
                <Edit2 class="w-3.5 h-3.5" />
                <span>Edit Message</span>
              </ContextMenuItem>
              <ContextMenuItem @click="deleteMessage(msg.id)" class="gap-2 text-destructive focus:text-destructive">
                <Trash2 class="w-3.5 h-3.5" />
                <span>Delete Message</span>
              </ContextMenuItem>
            </template>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      
      <!-- AI Thinking Indicator -->
      <div v-if="isAIThinking" class="flex items-center gap-2 text-muted-foreground animate-in fade-in slide-in-from-bottom-2">
        <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Sparkles class="w-3 h-3 text-white animate-pulse" />
        </div>
        <span class="text-xs">Pegasus is thinking...</span>
      </div>
    </div>

    <!-- Reply Preview -->
    <div v-if="replyTo" class="mx-3 mb-0 p-2 bg-muted/50 rounded-t-lg border-t border-x border-border flex items-center justify-between animate-in slide-in-from-bottom-2">
      <div class="flex items-center gap-2 overflow-hidden">
        <CornerDownRight class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <div class="flex flex-col">
          <span class="text-[10px] font-bold truncate">Replying to {{ replyTo.user.firstName || 'User' }}</span>
          <span class="text-[9px] text-muted-foreground truncate">{{ replyTo.content }}</span>
        </div>
      </div>
      <button @click="replyTo = null" class="p-1 hover:bg-muted rounded text-muted-foreground">
        <X class="w-3 h-3" />
      </button>
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
      
      <!-- Typing Indicator -->
      <div v-if="typingUsers?.length" class="absolute -top-6 left-4 text-[10px] text-muted-foreground bg-card/80 backdrop-blur px-2 py-0.5 rounded-t-md animate-in fade-in slide-in-from-bottom-1 flex items-center gap-1.5 border border-b-0 border-border/50">
        <div class="flex items-center gap-0.5">
          <span class="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
          <span class="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
          <span class="w-1 h-1 bg-primary rounded-full animate-bounce"></span>
        </div>
        <span>
          {{ typingUsers.length === 1 
              ? `${typingUsers[0].firstName || 'Someone'} is typing...` 
              : `${typingUsers.length} people are typing...` 
          }}
        </span>
      </div>

      <form @submit.prevent="sendMessage" class="flex gap-2 items-end">
        <!-- Image Upload Button -->
        <label class="p-2 hover:bg-muted rounded-md cursor-pointer text-muted-foreground hover:text-foreground transition-colors shrink-0 mb-0.5">
          <Paperclip class="w-4 h-4" />
          <input 
            type="file" 
            accept="image/*" 
            class="hidden" 
            @change="handleImageUpload"
            multiple
          />
        </label>
        
        <div class="flex-1 flex flex-col relative">
          <textarea
            ref="inputRef"
            v-model="newMessage"
            placeholder="Type @ to mention..."
            class="w-full bg-muted rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-[60px] resize-none overflow-y-auto pt-[10px]"
            @input="handleInput"
            @keydown="handleKeydown"
            @paste="handlePaste"
            rows="1"
          ></textarea>
        </div>

        <button 
          type="submit" 
          :disabled="!canSend"
          class="p-2.5 bg-primary text-primary-foreground rounded-md disabled:opacity-50 hover:bg-primary/90 transition shadow-sm mb-0.5"
        >
          <Send class="w-4 h-4" />
        </button>
      </form>
      
      <!-- Image Previews -->
      <div v-if="pendingImages.length" class="mt-2 flex gap-2 flex-wrap">
        <div v-for="(img, idx) in pendingImages" :key="idx" class="relative group animate-in zoom-in-75">
          <img :src="img" class="w-14 h-14 object-cover rounded-md border border-border" />
          <button 
            @click="removePendingImage(idx)"
            class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
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
import { 
  X, Send, Sparkles, Paperclip, CornerUpRight, RotateCcw, 
  Copy, Edit2, Trash2, CornerDownRight, Maximize2, Minimize2
} from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { toast } from '@/composables/useNotifications'
import MentionPopup from './MentionPopup.vue'
import MarkdownIt from 'markdown-it'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'

interface Mention {
  type: 'pegasus' | 'user'
  id?: string
  name: string
}

const props = defineProps<{
  messages: any[]
  collaborators?: any[]
  isAIThinking?: boolean
  typingUsers?: any[]
  isDetached?: boolean
}>()

const emit = defineEmits(['close', 'send', 'pegasus-query', 'edit', 'delete', 'typing-start', 'typing-stop', 'toggle-detach'])
const { user } = useAuth()
const md = new MarkdownIt({
  breaks: true,
  linkify: true,
  html: false
})

const newMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const pendingImages = ref<string[]>([])
const headerRef = ref<HTMLElement | null>(null)

defineExpose({ headerRef })

// Edit state
const editingMessageId = ref<string | null>(null)
const editContent = ref('')

// Thread state
const replyTo = ref<any | null>(null)
const pulsingMessageId = ref<string | null>(null)

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
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const canSend = computed(() => {
  return newMessage.value.trim() || pendingImages.value.length > 0
})

// Message Actions
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  } catch (err) {
    toast.error('Failed to copy')
  }
}

const startEdit = (msg: any) => {
  editingMessageId.value = msg.id
  editContent.value = msg.content
}

const cancelEdit = () => {
  editingMessageId.value = null
  editContent.value = ''
}

const saveEdit = (messageId: string) => {
  if (!editContent.value.trim()) return
  emit('edit', messageId, editContent.value)
  editingMessageId.value = null
  editContent.value = ''
}

const deleteMessage = (messageId: string) => {
  emit('delete', messageId)
}

const replyToMessage = (msg: any) => {
  replyTo.value = msg
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const scrollToMessage = (messageId: string) => {
  const element = document.getElementById(`msg-${messageId}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    
    // Trigger pulse animation
    pulsingMessageId.value = messageId
    setTimeout(() => {
      pulsingMessageId.value = null
    }, 2000)
  } else {
    toast.info('Parent message not found in history')
  }
}

// Render message content with highlighted mentions
const renderContent = (content: string, msgMentions?: Mention[]) => {
  if (!content) return ''
  
  // First render markdown
  let result = md.render(content)
  
  // Then highlight mentions
  if (msgMentions?.length) {
    msgMentions.forEach(m => {
      const mentionText = `@${m.name}`
      const highlightClass = m.type === 'pegasus' 
        ? 'text-violet-400 font-medium' 
        : 'text-primary font-medium'
      
      // Use a regex with word boundaries to avoid partial replacement
      const regex = new RegExp(`${mentionText}\\b`, 'g')
      result = result.replace(
        regex, 
        `<span class="${highlightClass}">${mentionText}</span>`
      )
    })
  }

  return result
}

/* Auto-expand removed for fixed height scroll */

// Handle @ mention detection
const handleInput = (e: Event) => {
  const input = e.target as HTMLTextAreaElement
  const value = input.value
  const cursorPos = input.selectionStart || 0
  
  // Find @ symbol before cursor
  const beforeCursor = value.substring(0, cursorPos)
  const atIndex = beforeCursor.lastIndexOf('@')
  
  if (atIndex !== -1 && (atIndex === 0 || beforeCursor[atIndex - 1] === ' ' || beforeCursor[atIndex - 1] === '\n')) {
    const query = beforeCursor.substring(atIndex + 1)
    // Only show popup if no space after @
    if (!query.includes(' ') && !query.includes('\n')) {
      mentionStartIndex.value = atIndex
      mentionQuery.value = query
      showMentionPopup.value = true
      
      // Position popup above input
      mentionPopupPosition.value = {
        top: -180,
        left: 0
      }
      return
    }
  }
  
  
  handleTyping()
  closeMentionPopup()
}

// Typing handling
const isTyping = ref(false)
let typingTimeout: NodeJS.Timeout | null = null

const handleTyping = () => {
  if (!isTyping.value) {
    isTyping.value = true
    emit('typing-start')
  }

  if (typingTimeout) clearTimeout(typingTimeout)

  typingTimeout = setTimeout(() => {
    isTyping.value = false
    emit('typing-stop')
  }, 2000)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (showMentionPopup.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      // Let MentionPopup handle these
      return
    }
  }

  // Submit on Enter (Shift+Enter for new line)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const handleMentionSelect = (item: { id: string, type: 'pegasus' | 'user', name: string }) => {
  // Replace the @query with @Name
  const beforeMention = newMessage.value.substring(0, mentionStartIndex.value)
  const afterMention = newMessage.value.substring(mentionStartIndex.value + mentionQuery.value.length + 1)
  
  newMessage.value = `${beforeMention}@${item.name} ${afterMention}`
  
  // Track mentions for backend processing
  if (!mentions.value.some(m => m.id === item.id)) {
    mentions.value.push({
      type: item.type,
      id: item.id,
      name: item.name
    })
  }
  
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
      toast.error(`File ${file.name} is too large (> 5MB)`)
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

const handlePaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return

  Array.from(items).forEach(item => {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile()
      if (file) {
        // Limit size to 5MB
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`Pasted image is too large (> 5MB)`)
          return
        }

        const reader = new FileReader()
        reader.onload = () => {
          pendingImages.value.push(reader.result as string)
        }
        reader.readAsDataURL(file)
      }
      // Prevent pasting the image binary text into textarea
      e.preventDefault() 
    }
  })
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
    images: pendingImages.value.map(data => ({ data })),
    parentId: replyTo.value?.id || null
  }
  
  if (hasPegasusMention) {
    // Extract query after @Pegasus
    const pegasusMatch = newMessage.value.match(/@Pegasus\s+(.+)/i)
    if (pegasusMatch) {
      emit('pegasus-query', pegasusMatch[1], messageData)
    }
  }
  
  emit('send', messageData)
  
  // Cleanup
  newMessage.value = ''
  mentions.value = []
  pendingImages.value = []
  replyTo.value = null
  
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
  }
}

// Auto-scroll to bottom on new messages
watch(() => props.messages.length, (newLen, oldLen) => {
  if (newLen > oldLen) {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
}, { deep: true })
</script>

<style scoped>
/* Custom scrollbar for message list */
div::-webkit-scrollbar {
  width: 4px;
}
div::-webkit-scrollbar-track {
  background: transparent;
}
div::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 10px;
}
div::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}

.scroll-smooth {
  scroll-behavior: smooth;
}

/* Pulse Highlight Animation */
@keyframes pulse-highlight {
  0% { transform: scale(1); background-color: transparent; }
  25% { transform: scale(1.02); background-color: color-mix(in srgb, var(--primary), transparent 85%); }
  50% { transform: scale(1); background-color: transparent; }
  75% { transform: scale(1.02); background-color: color-mix(in srgb, var(--primary), transparent 85%); }
  100% { transform: scale(1); background-color: transparent; }
}

.pulse-highlight {
  animation: pulse-highlight 1.5s ease-in-out;
  border-radius: 12px;
  z-index: 5;
}
</style>
