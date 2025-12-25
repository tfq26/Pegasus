<template>
  <transition name="sidebar-slide">
    <aside 
      v-if="visible" 
      class="shrink-0 border-r border-border overflow-y-auto relative bg-background"
      :class="{ 'transition-all duration-75 ease-out': !isResizing }"
      :style="{ width: `${sidebarWidth}px` }"
    >
      <div class="h-full">
        <Explorer 
          :connections="connections"
          :selected-connection-id="selectedConnectionId"
          :chats="chats"
          :selected-chat-id="selectedChatId"
          :query-history="queryHistory"
          @update:selected-connection-id="$emit('update:selectedConnectionId', $event)"
          @edit-table="(conn, table) => $emit('edit-table', conn, table)"
          @create-chat="$emit('create-chat')"
          @select-chat="$emit('select-chat', $event)"
          @load-query="(q) => { console.log('ChatSidebar: emitting load-query', q); $emit('load-query', q) }"
          @sanitize-table="(conn, table) => $emit('sanitize-table', conn, table)"
        />
      </div>

      <!-- Resize Handle - Enhanced for better visibility and interaction -->
      <div
        class="absolute top-0 right-0 w-2 h-full cursor-col-resize z-20 group flex items-center justify-center"
        :class="isResizing ? 'bg-primary/30' : 'hover:bg-primary/20'"
        @mousedown="startResize"
        @dblclick="$emit('toggle')"
        title="Drag to resize • Double-click to close"
      >
        <!-- Visual divider line -->
        <div 
          class="w-[2px] h-full transition-colors"
          :class="isResizing ? 'bg-primary' : 'bg-border group-hover:bg-primary/60'"
        />
      </div>
    </aside>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Explorer from '../Explorer.vue'
import type { ConnectionEntry } from '@/lib/db-connections'

const props = withDefaults(defineProps<{ 
  visible?: boolean
  side?: 'left' | 'right'
  connections: ConnectionEntry[]
  selectedConnectionId: string
  chats?: any[]
  selectedChatId?: string
  queryHistory?: any[]
}>(), { 
  visible: true,
  side: 'left',
  chats: () => [],
  queryHistory: () => []
})

defineEmits<{
  'toggle': []
  'update:selectedConnectionId': [value: string]
  'edit-table': [connection: ConnectionEntry, table: string]
  'create-chat': []
  'select-chat': [id: string]
  'load-query': [query: string]
  'sanitize-table': [connection: ConnectionEntry, table: string]
}>()

// Resizing Logic
const sidebarWidth = ref(300)
const isResizing = ref(false)

const startResize = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  document.addEventListener('mousemove', doResize)
  document.addEventListener('mouseup', stopResize)
  // Prevent text selection and set cursor while resizing
  document.body.style.userSelect = 'none'
  document.body.style.webkitUserSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

let rafId: number | null = null

const doResize = (e: MouseEvent) => {
  if (!isResizing.value) return
  e.preventDefault()
  
  if (rafId) return
  
  rafId = requestAnimationFrame(() => {
    // Calculate new width based on mouse position
    let newWidth = e.clientX
    
    // Constrain width
    if (newWidth < 200) newWidth = 200
    if (newWidth > 600) newWidth = 600
    
    sidebarWidth.value = newWidth
    rafId = null
  })
}

const stopResize = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', doResize)
  document.removeEventListener('mouseup', stopResize)
  
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  // Restore selection and cursor
  document.body.style.userSelect = ''
  document.body.style.webkitUserSelect = ''
  document.body.style.cursor = ''
  
  // Save preference
  localStorage.setItem('pegasus-sidebar-width', String(sidebarWidth.value))
}

onMounted(() => {
  const saved = localStorage.getItem('pegasus-sidebar-width')
  if (saved) {
    sidebarWidth.value = Number(saved)
  }
})
</script>

<style scoped>
/* Sidebar slide transition */
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s;
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
.sidebar-slide-enter-to,
.sidebar-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}
</style>
