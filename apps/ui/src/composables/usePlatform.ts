import { computed, ref, onMounted, onUnmounted } from 'vue'

/**
 * Centralized platform detection composable.
 * Use this instead of checking __TAURI__ or __TAURI_INTERNALS__ directly.
 * Also handles responsive breakpoints (merged from useMobileDetection).
 */

// Static checks (evaluated once at module load)
const _isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Reactive online status
const _isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

// Responsive breakpoints
const _windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)

// Update online status reactively
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { _isOnline.value = true })
    window.addEventListener('offline', () => { _isOnline.value = false })
    window.addEventListener('resize', () => { _windowWidth.value = window.innerWidth })
}

/**
 * Check if running in Tauri desktop environment
 */
export const isTauri = computed(() => _isTauri)

/**
 * Check if running in web browser (not Tauri)
 */
export const isWeb = computed(() => !_isTauri)

/**
 * Check if device is online
 */
export const isOnline = computed(() => _isOnline.value)

/**
 * Check if running on mobile device (via user agent)
 */
export const isMobile = computed(() => {
    if (typeof navigator === 'undefined') return false
    // Exclude iPad from isMobile to ensure it gets the desktop/tablet layout
    return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
})

/**
 * Check if running on macOS
 */
export const isMac = computed(() => {
    if (typeof navigator === 'undefined') return false
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0
})

/**
 * Responsive breakpoints (based on window width)
 */
export const isPhone = computed(() => _windowWidth.value < 640)
export const isTablet = computed(() => _windowWidth.value >= 640 && _windowWidth.value < 1024)
export const isDesktopSize = computed(() => _windowWidth.value >= 1024)

/**
 * Composable for platform detection
 */
export function usePlatform() {
    return {
        // Platform
        isTauri,
        isWeb,
        isOnline,
        isMobile,
        isMac,
        // Responsive
        isPhone,
        isTablet,
        isDesktopSize
    }
}
