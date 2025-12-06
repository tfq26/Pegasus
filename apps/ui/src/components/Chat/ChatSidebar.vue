<template>
  <transition name="sidebar-slide">
    <aside 
      v-if="visible" 
      class="shrink-0 border-r border-border overflow-y-auto relative bg-background transition-all duration-75 ease-out"
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

      <!-- Resize Handle -->
      <div
        class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-20"
        @mousedown="startResize"
        @dblclick="$emit('toggle')"
        title="Double-click to close sidebar"
      ></div>
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
  isResizing.value = true
  document.addEventListener('mousemove', doResize)
  document.addEventListener('mouseup', stopResize)
  // Prevent text selection while resizing
  document.body.style.userSelect = 'none'
}

const doResize = (e: MouseEvent) => {
  if (!isResizing.value) return
  
  // Calculate new width based on mouse position
  // Assuming sidebar is on the left
  let newWidth = e.clientX
  
  // Constrain width
  if (newWidth < 200) newWidth = 200
  if (newWidth > 600) newWidth = 600
  
  sidebarWidth.value = newWidth
}

const stopResize = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', doResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
  
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
