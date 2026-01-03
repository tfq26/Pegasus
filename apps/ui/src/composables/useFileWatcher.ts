import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { ref, onUnmounted } from 'vue'
import { isTauri } from '@/composables/usePlatform'

export interface FileEvent {
    kind: string
    paths: string[]
}

export function useFileWatcher() {
    const isWatching = ref(false)
    const lastEvent = ref<FileEvent | null>(null)
    const currentPath = ref<string | null>(null)
    let unlisten: UnlistenFn | null = null

    const startWatching = async (path: string, onEvent?: (event: FileEvent) => void) => {
        if (!isTauri.value) {
            console.warn('FileWatcher: Not running in Tauri')
            return false
        }

        try {
            // Start the backend watcher
            await invoke('watch_folder', { path })
            isWatching.value = true
            currentPath.value = path

            // Listen for events
            if (unlisten) unlisten()
            unlisten = await listen<FileEvent>('fs://file-event', (event) => {
                lastEvent.value = event.payload
                if (onEvent) onEvent(event.payload)
            })

            return true
        } catch (e) {
            console.error('Failed to start file watcher', e)
            isWatching.value = false
            return false
        }
    }

    const stopWatching = async () => {
        // Unsubscribe from frontend events
        if (unlisten) {
            unlisten()
            unlisten = null
        }

        // Tell backend to stop watching
        if (currentPath.value && isTauri.value) {
            try {
                await invoke('stop_watch_folder', { path: currentPath.value })
            } catch (e) {
                console.warn('Failed to stop backend watcher:', e)
            }
        }

        isWatching.value = false
        currentPath.value = null
    }

    onUnmounted(() => {
        stopWatching()
    })

    return {
        isWatching,
        lastEvent,
        currentPath,
        startWatching,
        stopWatching
    }
}

