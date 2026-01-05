import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Notification {
    id: string
    type: 'mention' | 'share' | 'comment'
    dashboardId: string
    dashboardTitle?: string
    senderName: string
    preview: string
    read: boolean
    timestamp: string
}

export const useNotificationStore = defineStore('notifications', () => {
    const notifications = ref<Notification[]>([])

    const unreadCount = computed(() =>
        notifications.value.filter(n => !n.read).length
    )

    const addNotification = (notification: Omit<Notification, 'id' | 'read'>) => {
        notifications.value.unshift({
            ...notification,
            id: crypto.randomUUID(),
            read: false
        })

        // Keep only last 50 notifications
        if (notifications.value.length > 50) {
            notifications.value = notifications.value.slice(0, 50)
        }
    }

    const markAsRead = (id: string) => {
        const notification = notifications.value.find(n => n.id === id)
        if (notification) {
            notification.read = true
        }
    }

    const markAllAsRead = () => {
        notifications.value.forEach(n => n.read = true)
    }

    const clearAll = () => {
        notifications.value = []
    }

    return {
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll
    }
})
