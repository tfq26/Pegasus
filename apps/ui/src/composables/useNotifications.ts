import { ref, computed, unref } from 'vue'
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
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'

const shouldShowToast = () => {
    const settingsStore = useSettingsStore()
    // Default to true if settings not loaded or undefined
    const settings = computed(() => unref(settingsStore.settings))
    // We can just use unref directly since this function is called at runtime
    return settings.value?.notifications !== false
}

export const toast = {
    success: (message: string, options?: any) => {
        addNotification(message, 'success', options)
        if (shouldShowToast()) return sonnerToast.success(message, options)
        return null
    },
    error: (message: string, options?: any) => {
        addNotification(message, 'error', options)
        if (shouldShowToast()) return sonnerToast.error(message, options)
        return null
    },
    info: (message: string, options?: any) => {
        addNotification(message, 'info', options)
        if (shouldShowToast()) return sonnerToast.info(message, options)
        return null
    },
    warning: (message: string, options?: any) => {
        addNotification(message, 'warning', options)
        if (shouldShowToast()) return sonnerToast.warning(message, options)
        return null
    },
    message: (message: string, options?: any) => {
        addNotification(message, 'default', options)
        if (shouldShowToast()) return sonnerToast.message(message, options)
        return null
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
