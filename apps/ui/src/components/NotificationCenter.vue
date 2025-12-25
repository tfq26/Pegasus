<template>
  <div class="relative" ref="containerRef">
    <button 
      @click="toggleOpen"
      class="relative p-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
      :class="{ 'bg-muted/50 text-foreground': isOpen }"
    >
      <Bell class="w-5 h-5" />
      <span 
        v-if="unreadCount > 0" 
        class="absolute top-1.5 right-1.5 w-2 h-2 bg-purple-500 rounded-full border border-background"
      />
    </button>

    <Transition
      enter-active-class="transition ease-out duration-200 origin-top-right"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150 origin-top-right"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div 
        v-if="isOpen"
        class="absolute right-0 mt-2 w-80 md:w-96 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div class="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-sm">Notifications</h3>
            <span v-if="unreadCount > 0" class="text-xs bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded-full font-medium">
              {{ unreadCount }} new
            </span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Filter Controls -->
            <div class="flex items-center bg-muted/50 rounded-md p-0.5 gap-0.5">
              <button 
                @click="filterType = 'all'"
                class="p-1 rounded transition-all"
                :class="filterType === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="All Notifications"
              >
                <List class="w-3.5 h-3.5" />
              </button>
              <button 
                @click="filterType = 'warning'"
                class="p-1 rounded transition-all"
                :class="filterType === 'warning' ? 'bg-background shadow-sm text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'"
                title="Warnings Only"
              >
                <AlertTriangle class="w-3.5 h-3.5" />
              </button>
              <button 
                @click="filterType = 'error'"
                class="p-1 rounded transition-all"
                :class="filterType === 'error' ? 'bg-background shadow-sm text-red-500' : 'text-muted-foreground hover:text-red-500'"
                title="Errors Only"
              >
                <AlertCircle class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="w-px h-4 bg-border mx-1"></div>

            <button 
              v-if="unreadCount > 0"
              @click="markAllRead"
              class="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors whitespace-nowrap"
            >
              Mark read
            </button>
            <button 
              @click="clearAll"
              class="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
              title="Clear all"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div class="overflow-y-auto custom-scrollbar flex-1">
          <div v-if="filteredNotifications.length === 0" class="p-8 text-center text-muted-foreground flex flex-col items-center gap-3">
            <BellOff class="w-8 h-8 opacity-20" />
            <p class="text-sm">
              {{ filterType === 'all' ? 'No notifications yet' : `No ${filterType}s found` }}
            </p>
          </div>

          <div v-else class="divide-y divide-border/50">
            <div 
              v-for="notification in filteredNotifications" 
              :key="notification.id"
              class="p-4 hover:bg-muted/30 transition-colors relative group cursor-default"
              :class="{ 'bg-muted/10': !notification.read }"
              @mouseenter="!notification.read && markRead(notification.id)"
            >
              <div class="flex gap-3">
                <div class="mt-0.5 shrink-0">
                  <div 
                    class="w-8 h-8 rounded-full flex items-center justify-center border"
                    :class="getIconStyles(notification.type)"
                  >
                    <component :is="getIcon(notification.type)" class="w-4 h-4" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium leading-none mb-1.5" :class="{ 'text-foreground': !notification.read, 'text-muted-foreground': notification.read }">
                    {{ notification.title }}
                  </p>
                  <p v-if="notification.description" class="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {{ notification.description }}
                  </p>
                  <p class="text-[10px] text-muted-foreground/50 mt-2">
                    {{ formatTime(notification.timestamp) }}
                  </p>
                </div>
                <div v-if="!notification.read" class="shrink-0 mt-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-purple-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Bell, BellOff, Check, AlertCircle, Info, AlertTriangle, Trash2, X, List } from 'lucide-vue-next'
import { useNotifications } from '@/composables/useNotifications'

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const filterType = ref<'all' | 'error' | 'warning'>('all')
const { notifications, unreadCount, markRead, markAllRead, clearAll, formatTime } = useNotifications()

const filteredNotifications = computed(() => {
  if (filterType.value === 'all') return notifications.value
  return notifications.value.filter(n => n.type === filterType.value)
})

const toggleOpen = () => {
  isOpen.value = !isOpen.value
}

const handleClickOutside = (event: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

const getIcon = (type: string) => {
  switch (type) {
    case 'success': return Check
    case 'error': return AlertCircle
    case 'warning': return AlertTriangle
    case 'info': return Info
    default: return Bell
  }
}

const getIconStyles = (type: string) => {
  switch (type) {
    case 'success': return 'bg-green-500/10 border-green-500/20 text-green-500'
    case 'error': return 'bg-red-500/10 border-red-500/20 text-red-500'
    case 'warning': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
    case 'info': return 'bg-blue-500/10 border-blue-500/20 text-blue-500'
    default: return 'bg-muted border-border text-muted-foreground'
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.4);
}
</style>
