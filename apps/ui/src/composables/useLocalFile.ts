import { ref } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { useWorkspaceStore } from '@/stores/workspace'
import { useConnectionStore } from '@/stores/connection'
import { v4 as uuidv4 } from 'uuid'
import { toast } from '@/composables/useNotifications'
import type { ConnectionEntry, Provider } from '@/lib/db-connections'

export function useLocalFile() {
    const workspaceStore = useWorkspaceStore()
    const processing = ref(false)

    const openLocalFile = async () => {
        try {
            processing.value = true
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Supported Files',
                    extensions: ['db', 'sqlite', 'sqlite3', 'csv', 'json', 'xlsx']
                }]
            })

            if (!selected) return

            const path = selected as string // Single file selection
            const filename = path.split(/[\\/]/).pop() || 'file'
            const ext = filename.split('.').pop()?.toLowerCase()

            let provider: Provider = 'sqlite'
            let config: any = {}

            if (['db', 'sqlite', 'sqlite3'].includes(ext || '')) {
                provider = 'sqlite'
                config = { path }
            } else {
                provider = 'file'
                config = { path, type: ext }
            }

            // Check if already exists
            const existing = useConnectionStore().connections.find(c => {
                if (c.provider === 'sqlite') return c.sqlite?.path === path
                if (c.provider === 'file') return (c as any).file?.path === path
                return false
            })

            if (existing) {
                toast.info('File already opened', { description: `Switched to ${existing.nickname}` })
                // TODO: Switch focus to this connection
                return
            }

            const newConnection: ConnectionEntry = {
                id: `local:${uuidv4()}`,
                nickname: filename,
                provider,
                description: `Local file: ${path}`,
                // Allow dynamic props for 'file' provider until we strict type it
                [provider === 'sqlite' ? 'sqlite' : 'file']: config
            }

            useConnectionStore().addEphemeralConnection(newConnection)
            useConnectionStore().selectConnection(newConnection.id)

            toast.success('File Opened', { description: filename })

        } catch (err: any) {
            console.error('Failed to open file:', err)
            toast.error('Failed to open file', { description: err.message })
        } finally {
            processing.value = false
        }
    }

    return {
        openLocalFile,
        processing
    }
}
