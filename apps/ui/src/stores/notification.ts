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

export const useNotificationStore = defineStore('notifications', {
    state: () => ({
        notifications: [] as Notification[]
    }),
    getters: {
        unreadCount: (state) => state.notifications.filter(n => !n.read).length
    },
    actions: {
        addNotification(notification: Omit<Notification, 'id' | 'read' | 'timestamp'> & { timestamp?: string }) {
            this.notifications.unshift({
                ...notification,
                id: crypto.randomUUID(),
                read: false,
                timestamp: notification.timestamp || new Date().toISOString()
            })

            if (this.notifications.length > 50) {
                this.notifications = this.notifications.slice(0, 50)
            }
        },
        markAsRead(id: string) {
            const notification = this.notifications.find(n => n.id === id)
            if (notification) {
                notification.read = true
            }
        },
        markAllAsRead() {
            this.notifications.forEach(n => n.read = true)
        },
        clearNotifications() {
            this.notifications = []
        }
    }
})
