// Desktop Menu Event Composable
// Listens for native menu bar events from Tauri and handles navigation/actions

import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

import { isTauri } from '@/composables/usePlatform'

export function useDesktopMenu() {
    const router = useRouter()
    let unlisten: (() => void) | null = null

    const setupMenuListeners = async () => {
        if (!isTauri.value) return

        try {
            const { listen } = await import('@tauri-apps/api/event')

            // Listen for navigation events from native menu
            const unlistenNav = await listen<string>('menu:navigate', (event) => {
                console.log('[DesktopMenu] Navigate to:', event.payload)
                router.push(event.payload)
            })

            // Listen for new query action
            const unlistenNewQuery = await listen('menu:new-query', () => {
                console.log('[DesktopMenu] New query')
                // Navigate to query page and emit event for new tab
                router.push('/query')
                window.dispatchEvent(new CustomEvent('menu:new-query'))
            })

            // Listen for open connection action
            const unlistenOpenConn = await listen('menu:open-connection', () => {
                console.log('[DesktopMenu] Open connection')
                window.dispatchEvent(new CustomEvent('menu:open-connection'))
            })

            // Listen for save action
            const unlistenSave = await listen('menu:save', () => {
                console.log('[DesktopMenu] Save')
                window.dispatchEvent(new CustomEvent('menu:save'))
            })

            // Listen for export action
            const unlistenExport = await listen('menu:export', () => {
                console.log('[DesktopMenu] Export')
                window.dispatchEvent(new CustomEvent('menu:export'))
            })

            // Listen for toggle sidebar action
            const unlistenSidebar = await listen('menu:toggle-sidebar', () => {
                console.log('[DesktopMenu] Toggle sidebar')
                window.dispatchEvent(new CustomEvent('menu:toggle-sidebar'))
            })

            // Listen for check updates action
            const unlistenUpdates = await listen('menu:check-updates', () => {
                console.log('[DesktopMenu] Check for updates')
                window.dispatchEvent(new CustomEvent('menu:check-updates'))
            })

            // Store cleanup function
            unlisten = () => {
                unlistenNav()
                unlistenNewQuery()
                unlistenOpenConn()
                unlistenSave()
                unlistenExport()
                unlistenSidebar()
                unlistenUpdates()
            }

        } catch (e) {
            console.error('[DesktopMenu] Failed to setup menu listeners:', e)
        }
    }

    onMounted(() => {
        setupMenuListeners()
    })

    onUnmounted(() => {
        if (unlisten) {
            unlisten()
        }
    })

    return {
        setupMenuListeners
    }
}
