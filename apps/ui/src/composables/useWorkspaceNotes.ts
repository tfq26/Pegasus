import { ref, type Ref } from 'vue'
import type { Tab } from '@/stores/workspace'
import { toast } from '@/composables/useNotifications'
import { QUERY_API_URL, getAuthHeaders } from '@/lib/api'

export function useWorkspaceNotes(
    activeTab: Ref<any>,
    workspaceStore: any,
    emit: (e: string, ...args: any[]) => void
) {
    const noteEditorRef = ref<any>(null)

    // ----- Note Format --------------------------------------------------

    const handleNoteFormat = (command: string, value?: string) => {
        let editor = noteEditorRef.value
        if (Array.isArray(editor)) editor = editor[0]
        if (editor?.execCommand) editor.execCommand(command, value)
    }

    // ----- Note Privacy / File Type -------------------------------------

    const handleNotePrivacyChange = (isPrivate: boolean) => {
        const currentTab = (activeTab as any).value
        if (!currentTab) return
        workspaceStore.updateTabData(currentTab.id, { isPrivate })
        toast.info(isPrivate ? 'Note is now private' : 'Note is now public')
    }

    const handleNoteFileTypeChange = (fileType: 'txt' | 'md' | 'docx' | 'pdf') => {
        const currentTab = (activeTab as any).value
        if (!currentTab) return
        workspaceStore.updateTabData(currentTab.id, { file_type: fileType })
        toast.success(`Changed format to ${fileType.toUpperCase()}`)
    }

    // ----- Note Share / Download ----------------------------------------

    const handleNoteShare = () => emit('share')

    const handleNoteDownload = () => {
        const currentTab = (activeTab as any).value
        if (!currentTab) return

        const content = currentTab.data?.content || ''
        const title = currentTab.data?.title || 'note'
        const fileType = currentTab.data?.file_type || 'md'

        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${title}.${fileType}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Note downloaded')
    }

    // ----- Note Save ----------------------------------------------------

    const handleNoteSave = async (tabId: string, content: string) => {
        const tab = workspaceStore.tabs.find ?
            workspaceStore.tabs.find((t: Tab) => t.id === tabId) :
            null
        if (!tab || !tab.data?.itemId) return

        try {
            workspaceStore.updateTabData(tabId, { content })
        } catch (e: any) {
            console.error('[Workspace] Failed to save note:', e)
            toast.error('Failed to save note')
        }
    }

    // ----- File Download ------------------------------------------------

    const handleFileDownload = async (fileData: any) => {
        if (!fileData?.filename) { toast.error('File name missing'); return }

        let blob: Blob | null = null

        try {
            if (fileData.content !== undefined && fileData.content !== null) {
                blob = fileData.content instanceof Blob ? fileData.content : new Blob([fileData.content])
            } else if (fileData.itemId) {
                const id = fileData.itemId.includes(':') ? fileData.itemId.split(':')[1] : fileData.itemId
                toast.info('Downloading file...')
                const headers = getAuthHeaders() as Record<string, string>
                const res = await fetch(`${QUERY_API_URL}/files/${id}`, { headers })
                if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
                blob = await res.blob()
            } else {
                throw new Error('No content or file ID available')
            }

            if (!blob) throw new Error('Failed to create blob')

            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = fileData.filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            toast.success('File downloaded successfully')
        } catch (e: any) {
            console.error('[Workspace] File download failed:', e)
            toast.error('Failed to download file', { description: e.message })
        }
    }

    // ----- Chat Export --------------------------------------------------

    const handleExportChat = (format: 'json' | 'text') => {
        const currentTab = (activeTab as any).value
        const history: any[] = currentTab?.data?.chatHistory || []
        const chatTitle = currentTab?.label || 'chat'
        const safeTitle = chatTitle.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()

        if (format === 'json') {
            const cleaned = history.map((msg: any) => {
                const entry: any = { role: msg.role, timestamp: msg.timestamp, content: msg.content }
                if (msg.meta) {
                    const { query, connectionId, contextUsed } = msg.meta
                    const schema = contextUsed?.map((ctx: any) => ({
                        name: ctx.name || ctx.filename || ctx.title,
                        type: ctx.type,
                        columns: ctx.columns || ctx.schema || undefined,
                    }))
                    if (query) entry.query = query
                    if (connectionId) entry.connectionId = connectionId
                    if (schema?.length) entry.schema = schema
                }
                return entry
            })
            const json = JSON.stringify({ title: chatTitle, exportedAt: new Date().toISOString(), messages: cleaned }, null, 2)
            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `${safeTitle}.json`
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
            toast.success('Downloaded as JSON')
        } else {
            const lines: string[] = [`# ${chatTitle}`, `Exported: ${new Date().toLocaleString()}`, '']
            for (const msg of history) {
                const label = msg.role === 'user' ? 'You' : msg.role === 'clarification' ? 'Pegasus (asking)' : 'Pegasus'
                lines.push(`[${label}]`, msg.content || '', '')
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `${safeTitle}.txt`
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
            toast.success('Downloaded as plain text')
        }
    }

    // ----- Delete Chat --------------------------------------------------

    const handleDeleteChat = async (workspaceStoreRef: any, activeTabRef: Ref<any>) => {
        const currentTab = (activeTabRef as any).value
        const chatId = currentTab?.data?.chatId
        if (!chatId) {
            if (currentTab) workspaceStoreRef.closeTab(currentTab.id)
            return
        }
        try {
            const { useChatStore } = await import('@/stores/chat')
            const chatStore = useChatStore()
            await chatStore.deleteChat(chatId)
            if (currentTab) workspaceStoreRef.closeTab(currentTab.id)
            toast.success('Chat deleted')
        } catch (e: any) {
            toast.error(`Failed to delete chat: ${e.message}`)
        }
    }

    return {
        noteEditorRef,
        handleNoteFormat,
        handleNotePrivacyChange,
        handleNoteFileTypeChange,
        handleNoteShare,
        handleNoteDownload,
        handleNoteSave,
        handleFileDownload,
        handleExportChat,
        handleDeleteChat,
    }
}
