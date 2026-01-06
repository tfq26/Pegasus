import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'
import { computed, unref } from 'vue'

export function useConfirm() {
    const settingsStore = useSettingsStore()
    const settings = computed(() => unref(settingsStore.settings))

    const confirmDestructive = (message: string, onConfirm: () => void) => {
        // Check if confirmation is enabled in settings
        if (settings.value.confirmDestructive) {
            // Use native confirm for now
            if (window.confirm(message)) {
                onConfirm()
            }
        } else {
            // Execute immediately if setting is disabled
            onConfirm()
        }
    }

    return { confirmDestructive }
}
