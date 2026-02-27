import { useColorMode } from '@vueuse/core'

/**
 * Shared theme composable for Pegasus.
 * Ensures consistent storage key and selector across the application.
 */
export function usePegasusTheme() {
    return useColorMode({
        emitAuto: true,
        selector: 'html',
        attribute: 'class',
        storageKey: 'pegasus-theme',
    })
}
