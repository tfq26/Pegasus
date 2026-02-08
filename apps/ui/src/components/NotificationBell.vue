<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Bell } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useNotificationStore, type Notification } from '@/stores/notification'

const router = useRouter()
const notificationStore = useNotificationStore()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const closeDropdown = () => {
  isOpen.value = false
}

const handleNotificationClick = (notification: Notification) => {
  notificationStore.markAsRead(notification.id)
  if (notification.dashboardId) {
    router.push(`/dashboard/${notification.dashboardId}`)
  }
  closeDropdown()
}

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
}

// Click outside to close
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeDropdown()
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
  <div class="relative" ref="dropdownRef">
    <button 
      @click="toggleDropdown"
      class="p-2 rounded-full hover:bg-muted transition-colors relative"
      aria-label="Notifications"
    >
      <Bell class="w-5 h-5" />
      <span 
        v-if="notificationStore.unreadCount > 0"
        class="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-background"
      ></span>
    </button>

    <!-- Dropdown -->
    <div 
      v-if="isOpen"
      class="absolute right-0 mt-2 w-80 bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <div class="flex flex-col">
        <div class="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <h3 class="font-semibold text-sm">Notifications</h3>
          <button 
            v-if="notificationStore.notifications.length > 0"
            @click="notificationStore.markAllAsRead"
            class="text-xs text-primary hover:underline font-medium"
          >
            Mark all as read
          </button>
        </div>
        
        <!-- Notification List -->
        <div class="max-h-40 overflow-y-auto">
          <div v-if="notificationStore.notifications.length === 0" class="p-6 text-center text-muted-foreground text-sm">
            No notifications yet
          </div>
          <div v-else class="flex flex-col">
            <button
              v-for="notification in notificationStore.notifications"
              :key="notification.id"
              @click="handleNotificationClick(notification)"
              class="flex flex-col gap-1 p-4 text-left border-b border-border last:border-0 hover:bg-muted/50 transition-colors relative group"
              :class="{ 'bg-primary/5': !notification.read }"
            >
              <div class="flex items-start justify-between gap-2">
                <span class="font-bold text-xs">{{ notification.senderName }}</span>
                <span class="text-[10px] text-muted-foreground shrink-0">{{ formatTime(notification.timestamp) }}</span>
              </div>
              <p class="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {{ notification.preview }}
              </p>
              <div v-if="notification.dashboardTitle" class="mt-1">
                <span class="text-[10px] bg-muted px-1.5 py-0.5 rounded-md font-medium text-muted-foreground group-hover:bg-background transition-colors">
                  {{ notification.dashboardTitle }}
                </span>
              </div>
              <div v-if="!notification.read" class="absolute left-1 top-4 w-1 h-8 bg-primary rounded-full px-0.5 ml-0.5 pointer-events-none"></div>
            </button>
          </div>
        </div>

        <div v-if="notificationStore.notifications.length > 0" class="p-3 border-t border-border bg-muted/10">
          <button 
            @click="notificationStore.clearNotifications"
            class="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
