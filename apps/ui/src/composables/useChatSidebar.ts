import { ref, computed, type Ref } from 'vue'
import { toast } from '@/composables/useNotifications'

export function useChatSidebar() {
    const sidebarOpen = ref(true)
    const sidebarSide = ref<'left' | 'right'>('left')
    const isHoverRevealed = ref(false)
    const hoverTimer = ref<any>(null)

    const effectiveSidebarOpen = computed(() => sidebarOpen.value || isHoverRevealed.value)

    const onHoverZoneEnter = () => {
        isHoverRevealed.value = true
        if (hoverTimer.value) clearTimeout(hoverTimer.value)
    }

    const startHoverTimer = () => {
        if (!sidebarOpen.value && isHoverRevealed.value) {
            hoverTimer.value = setTimeout(() => {
                isHoverRevealed.value = false
            }, 500)
        }
    }

    const clearHoverTimer = () => {
        if (hoverTimer.value) clearTimeout(hoverTimer.value)
    }

    const toggleSidebar = () => {
        sidebarOpen.value = !sidebarOpen.value
        // If pinning, reset hover state
        if (sidebarOpen.value) {
            isHoverRevealed.value = false
            clearHoverTimer()
        }
    }

    return {
        sidebarOpen,
        sidebarSide,
        isHoverRevealed,
        effectiveSidebarOpen,
        onHoverZoneEnter,
        startHoverTimer,
        clearHoverTimer,
        toggleSidebar,
    }
}
