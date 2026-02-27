import { ref, type Ref } from 'vue'
import { toast } from '@/composables/useNotifications'
import { updateDashboardPrivacy, api } from '@/lib/api'
import { useCollaboration } from '@/composables/useCollaboration'
import { identityService } from '@/services/identityService'
import { useRouter } from 'vue-router'
import type { Router } from 'vue-router'
import { exportElementAsImage } from '@/lib/exportImage'

export function useDashboardModals(
    currentDashboard: Ref<any>,
    dashboards: Ref<any[]>,
    activePage: Ref<any>,
    store: any,
    handleSave: () => Promise<void>,
    router: Router,
    isShared: Ref<boolean>
) {
    const handleDashboardChange = (id: string) => {
        router.push(isShared.value ? `/shared/dashboard/${id}` : `/dashboard/${id}`)
    }

    const handleCreateDashboard = async () => {
        try {
            const newDashboard = await store.createNewDashboard()
            if (newDashboard) {
                router.push(`/dashboard/${newDashboard.id}`)
                toast.success('New dashboard created')
            }
        } catch (e) {
            toast.error('Failed to create dashboard')
        }
    }

    // ----- Rename -------------------------------------------------------
    const showRenameModal = ref(false)
    const renameTitle = ref('')

    const handleRename = () => {
        if (!currentDashboard.value) return
        renameTitle.value = currentDashboard.value.title
        showRenameModal.value = true
    }

    const confirmRename = async () => {
        if (!renameTitle.value.trim() || !currentDashboard.value) return
        currentDashboard.value.title = renameTitle.value.trim()
        await handleSave()
        toast.success('Dashboard renamed successfully')
        showRenameModal.value = false
    }

    // ----- Delete -------------------------------------------------------
    const showDeleteModal = ref(false)

    const handleDeleteDashboard = async (settings: any) => {
        if (!currentDashboard.value) return
        if (settings?.confirmDestructive) {
            showDeleteModal.value = true
        } else {
            await confirmDelete()
        }
    }

    const confirmDelete = async () => {
        if (!currentDashboard.value) return
        try {
            await store.removeDashboard(currentDashboard.value.id)
            toast.success('Dashboard deleted successfully')
            showDeleteModal.value = false
            if (dashboards.value.length > 0) {
                router.push(`/dashboard/${dashboards.value[0]!.id}`)
            } else {
                router.push('/dashboard')
            }
        } catch (e) {
            toast.error('Failed to delete dashboard')
        }
    }

    // ----- Privacy -------------------------------------------------------
    const showPrivacyDialog = ref(false)

    const confirmPrivacyChange = async () => {
        if (!currentDashboard.value) return
        try {
            const makingPrivate = currentDashboard.value.is_public
            await updateDashboardPrivacy(currentDashboard.value.id, !currentDashboard.value.is_public)
            currentDashboard.value.is_public = !currentDashboard.value.is_public
            if (makingPrivate) currentDashboard.value.share_token = null
            toast.success(makingPrivate ? 'Dashboard is now private' : 'Dashboard is now public')
            showPrivacyDialog.value = false
        } catch (e) {
            toast.error('Failed to update privacy settings')
        }
    }

    // ----- Share --------------------------------------------------------
    const showShareModal = ref(false)
    const shareUrl = ref('')
    const copied = ref(false)

    const handleShare = async () => {
        if (!currentDashboard.value) return
        try {
            const token = await store.generateShareLink(currentDashboard.value.id)
            shareUrl.value = `${window.location.origin}/shared/dashboard/${token}`
            showShareModal.value = true
            copied.value = false
        } catch (e) {
            toast.error('Failed to generate share link')
        }
    }

    const copyShareLink = () => {
        navigator.clipboard.writeText(shareUrl.value)
        copied.value = true
        setTimeout(() => (copied.value = false), 2000)
    }

    // ----- Query Modal --------------------------------------------------
    const showQueryModal = ref(false)
    const showAddElementDialog = ref(false)
    const showTextDialog = ref(false)
    const showFileDialog = ref(false)
    const editingElement = ref<any>(null)
    const editingQuery = ref('')

    const handleViewQuery = (element: any) => {
        editingElement.value = element
        editingQuery.value = element.query || ''
        showQueryModal.value = true
    }

    const handleEditQuery = (element: any) => {
        if (!element.query) return
        router.push({ path: '/query', query: { loadQuery: element.query, mode: 'write', connectionId: element.config.connectionId } })
    }

    const saveQueryChanges = async () => {
        if (!editingElement.value || !activePage.value) return
        const el = activePage.value.elements.find((e: any) => e.id === editingElement.value.id)
        if (!el) return

        el.query = editingQuery.value
        const { emitElementUpdate } = useCollaboration()
        if (currentDashboard.value) {
            emitElementUpdate(currentDashboard.value.id, el.id, { query: el.query })
            store.addActivityLog({
                type: 'update', elementId: el.id, elementTitle: el.title,
                userId: identityService.user?.id || 'me', userName: identityService.user?.firstName || 'Me',
                userProfilePicture: identityService.user?.profilePictureUrl, changes: { query: el.query }
            })
        }
        showQueryModal.value = false
        await handleSave()
        toast.success('Query updated and saved.')
    }

    // ----- Element Editor -----------------------------------------------
    const showEditModal = ref(false)
    const editingElementForModal = ref<any>(null)

    const handleEditElement = (element: any) => {
        editingElementForModal.value = element
        showEditModal.value = true
    }

    const handleSaveElement = async (updatedElement: any) => {
        if (!activePage.value || !currentDashboard.value) return
        const el = activePage.value.elements.find((e: any) => e.id === updatedElement.id)
        if (el) {
            Object.assign(el, updatedElement)
            const { emitElementUpdate } = useCollaboration()
            emitElementUpdate(currentDashboard.value.id, el.id, updatedElement)
        }
        showEditModal.value = false
        await handleSave()
    }

    // ----- Add Element / Widget -----------------------------------------
    const handleAddElementSelect = (type: 'visualization' | 'table' | 'text' | 'file') => {
        if (type === 'visualization' || type === 'table') {
            router.push({ path: '/query', query: { mode: 'write', dashboardId: currentDashboard.value?.id } })
        } else if (type === 'text') {
            showTextDialog.value = true
        } else if (type === 'file') {
            showFileDialog.value = true
        }
    }

    const handleAddWidget = async (widgetType: string, config: any) => {
        if (!currentDashboard.value) return
        try {
            await api.post(`/dashboards/${currentDashboard.value.id}/elements/widget`, { widgetType, config })
            await store.selectDashboard(currentDashboard.value.id)
            toast.success('Widget added successfully')
        } catch (e: any) {
            toast.error(e.message || 'Failed to add widget')
        }
    }

    const handleAddTextElement = async (data: { title: string; content: string }) => {
        if (!currentDashboard.value) return
        try {
            await store.addElementToDashboard(currentDashboard.value.id, {
                type: 'text', title: data.title, config: { content: data.content }, w: 6, h: 4
            })
            toast.success('Text block added')
        } catch (e) {
            toast.error('Failed to add text block')
        }
    }

    const handleAddFileElement = async (data: { file: File; title: string }) => {
        if (!currentDashboard.value) return
        try {
            const formData = new FormData()
            formData.append('file', data.file)
            formData.append('title', data.title)
            formData.append('dashboardId', currentDashboard.value.id)
            await api.post('/dashboards/upload-file', formData)
            await store.selectDashboard(currentDashboard.value.id)
            toast.success('File added to dashboard')
        } catch (e: any) {
            toast.error(e.message || 'Failed to add file')
        }
    }

    // ----- Export & Fullscreen -----------------------------------------
    const handleExportImage = async (element: any) => {
        if (!element) return
        try {
            await exportElementAsImage(element.id, element.title)
            toast.success('Exporting image...')
        } catch (e) {
            toast.error('Failed to export image')
        }
    }

    const openFullscreen = () => {
        if (!currentDashboard.value) return
        const url = `${window.location.origin}${isShared.value ? '/shared' : ''}/dashboard/${currentDashboard.value.id}?fullscreen=true`
        window.open(url, '_blank')
    }

    // ----- Remove Element -----------------------------------------------

    const removeElement = async (id: string) => {
        if (!activePage.value || !currentDashboard.value) return
        const dashboardId = currentDashboard.value.id
        const el = activePage.value.elements.find((e: any) => e.id === id)
        const elTitle = el?.title || 'Unknown Element'

        store.pushToHistory()
        activePage.value.elements = activePage.value.elements.filter((e: any) => e.id !== id)
        activePage.value.layout = activePage.value.layout.filter((item: any) => item.i !== id)

        const { emitElementRemove } = useCollaboration()
        emitElementRemove(dashboardId, id)

        store.addActivityLog({
            type: 'remove', elementId: id, elementTitle: elTitle,
            userId: identityService.user?.id || 'me', userName: identityService.user?.firstName || 'Me',
            userProfilePicture: identityService.user?.profilePictureUrl
        })

        await handleSave()
    }

    return {
        // Rename
        showRenameModal, renameTitle, handleRename, confirmRename,
        // Delete
        showDeleteModal, handleDeleteDashboard, confirmDelete,
        // Privacy
        showPrivacyDialog, confirmPrivacyChange,
        // Share
        showShareModal, shareUrl, copied, handleShare, copyShareLink,
        // Query modal
        showQueryModal, showAddElementDialog, showTextDialog, showFileDialog,
        editingElement, editingQuery, handleViewQuery, handleEditQuery, saveQueryChanges,
        // Element editor
        showEditModal, editingElementForModal, handleEditElement, handleSaveElement,
        // Add element
        handleAddElementSelect, handleAddWidget, handleAddTextElement, handleAddFileElement,
        // Actions
        handleDashboardChange, handleCreateDashboard, handleExportImage, openFullscreen, handleSave,
        // Remove
        removeElement,
    }
}
