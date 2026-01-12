import { isTauri } from '@/composables/usePlatform'
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification'

export async function sendDesktopNotification(title: string, body?: string) {
    if (!isTauri.value) return

    let granted = await isPermissionGranted()
    if (!granted) {
        const permission = await requestPermission()
        granted = permission === 'granted'
    }

    if (granted) {
        sendNotification({ title, body })
    }
}
