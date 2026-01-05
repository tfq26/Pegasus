<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Bell } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useNotificationStore, type Notification } from '@/stores/notification'

const router = useRouter()
const notificationStore = useNotificationStore()

const notifications = computed(() => notificationStore.notifications)
const unreadCount = computed(() => notificationStore.unreadCount)

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const handleNotificationClick = (notification: Notification) => {
  notificationStore.markAsRead(notification.id)
  isOpen.value = false
  
  // Navigate to dashboard
  if (notification.dashboardId) {
    router.push(`/dashboard/${notification.dashboardId}`)
  }
}


const formatTime = (ts: string) => {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
}

// Close dropdown when clicking outside
const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- Bell Button -->
    <button
      @click.stop="toggleDropdown"
      class="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      <Bell class="w-5 h-5" />
      
      <!-- Unread Badge -->
      <span
        v-if="unreadCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>
    
    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden"
      >
        <!-- Header -->
        <div class="p-3 border-b border-border flex items-center justify-between">
          <span class="font-semibold text-sm">Notifications</span>
          <button
            v-if="notifications.length > 0"
            @click="notificationStore.markAllAsRead"
            class="text-xs text-primary hover:underline"
          >
            Mark all as read
          </button>
        </div>
        
        <!-- Notification List -->
        <div class="max-h-80 overflow-y-auto">
          <div v-if="notifications.length === 0" class="p-6 text-center text-muted-foreground text-sm">
            No notifications yet
          </div>
          
          <button
            v-for="notification in notifications"
            :key="notification.id"
            @click="handleNotificationClick(notification)"
            class="w-full p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0"
            :class="{ 'bg-primary/5': !notification.read }"
          >
            <!-- Unread indicator -->
            <div class="pt-1.5">
              <div
                class="w-2 h-2 rounded-full"
                :class="notification.read ? 'bg-transparent' : 'bg-primary'"
              />
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm">{{ notification.senderName }}</span>
                <span class="text-[10px] text-muted-foreground">{{ formatTime(notification.timestamp) }}</span>
              </div>
              <p class="text-sm text-muted-foreground truncate mt-0.5">
                {{ notification.preview }}
              </p>
              <p v-if="notification.dashboardTitle" class="text-xs text-primary/70 mt-1">
                in {{ notification.dashboardTitle }}
              </p>
            </div>
          </button>
        </div>
        
        <!-- Footer -->
        <div v-if="notifications.length > 0" class="p-2 border-t border-border">
          <button
            @click="notificationStore.clearAll"
            class="w-full p-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            Clear all notifications
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
