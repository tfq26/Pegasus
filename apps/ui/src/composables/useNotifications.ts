import { ref, computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { toast as sonnerToast } from 'vue-sonner'

export interface Notification {
    id: string
    title: string
    description?: string
    type: 'success' | 'error' | 'info' | 'warning' | 'default'
    timestamp: number
    read: boolean
}

// Persistent store
const notifications = useStorage<Notification[]>('pegasus-notifications', [])

// Sort by newest first
const sortedNotifications = computed(() => {
    return [...notifications.value].sort((a, b) => b.timestamp - a.timestamp)
})

const unreadCount = computed(() => {
    return notifications.value.filter(n => !n.read).length
})

const addNotification = (
    title: string,
    type: Notification['type'] = 'default',
    options?: any
) => {
    const description = typeof options === 'string' ? options : options?.description

    notifications.value.push({
        id: crypto.randomUUID(),
        title,
        description,
        type,
        timestamp: Date.now(),
        read: false
    })
}

// Wrapper for toast to verify compatibility
export const toast = {
    success: (message: string, options?: any) => {
        addNotification(message, 'success', options)
        return sonnerToast.success(message, options)
    },
    error: (message: string, options?: any) => {
        addNotification(message, 'error', options)
        return sonnerToast.error(message, options)
    },
    info: (message: string, options?: any) => {
        addNotification(message, 'info', options)
        return sonnerToast.info(message, options)
    },
    warning: (message: string, options?: any) => {
        addNotification(message, 'warning', options)
        return sonnerToast.warning(message, options)
    },
    message: (message: string, options?: any) => {
        addNotification(message, 'default', options)
        return sonnerToast.message(message, options)
    },
    // Proxy other methods if needed
    dismiss: sonnerToast.dismiss,
    promise: sonnerToast.promise,
    loading: (message: string, options?: any) => {
        // Don't add loading to persistent notifications (they're transient)
        return sonnerToast.loading(message, options)
    }
}

export const useNotifications = () => {
    const markRead = (id: string) => {
        const n = notifications.value.find(n => n.id === id)
        if (n) n.read = true
    }

    const markAllRead = () => {
        notifications.value.forEach(n => n.read = true)
    }

    const clearAll = () => {
        notifications.value = []
    }

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp)
        const now = new Date()
        const diff = now.getTime() - date.getTime()

        // Less than a minute
        if (diff < 60000) return 'Just now'

        // Less than an hour
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`

        // Less than a day
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`

        return date.toLocaleDateString()
    }

    return {
        notifications: sortedNotifications,
        unreadCount,
        markRead,
        markAllRead,
        clearAll,
        formatTime
    }
}
