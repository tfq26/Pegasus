import { ref, computed, nextTick, type Ref } from 'vue'
import { toast } from '@/composables/useNotifications'

export function useDashboardPage(
    currentDashboard: Ref<any>,
    store: any,
    isShared: Ref<boolean>
) {
    const activePageId = computed({
        get: () => store.activePageId as unknown as string | null,
        set: (val) => (store.activePageId as any) = val
    })

    const activePage = computed(() => store.activePage as any)

    const sortedPages = computed(() => {
        if (!currentDashboard.value?.data?.pages) return []
        return [...currentDashboard.value.data.pages].sort((a: any, b: any) => a.order - b.order)
    })

    const activeLayout = computed({
        get: () => activePage.value?.layout || [],
        set: (newLayout: any) => {
            if (activePage.value) activePage.value.layout = newLayout
        }
    })

    // ----- Page CRUD ---------------------------------------------------

    const handleAddPage = async () => {
        await store.addPage(`Page ${sortedPages.value.length + 1}`)
    }

    const switchPage = (pageId: string) => {
        activePageId.value = pageId
    }

    // ----- Delete Page -------------------------------------------------

    const showDeletePageModal = ref(false)
    const pageToDelete = ref<any>(null)

    const confirmDeletePage = (page: any) => {
        pageToDelete.value = page
        showDeletePageModal.value = true
    }

    const processDeletePage = async () => {
        if (!pageToDelete.value) return
        try {
            await store.removePage(pageToDelete.value.id)
            toast.success(`Page "${pageToDelete.value.title}" deleted`)
            showDeletePageModal.value = false
            pageToDelete.value = null
        } catch (e: any) {
            toast.error(e.message || 'Failed to delete page')
        }
    }

    // ----- Rename Page -------------------------------------------------

    const pageToRename = ref<any>(null)
    const newPageTitle = ref('')
    const renamingInput = ref<any>(null)

    const startRenamingPage = (page: any) => {
        if (isShared.value) return
        pageToRename.value = page
        newPageTitle.value = page.title
        nextTick(() => {
            const target = Array.isArray(renamingInput.value) ? renamingInput.value[0] : renamingInput.value
            if (target) {
                target.focus?.()
                target.select?.()
            }
        })
    }

    const cancelRename = () => {
        pageToRename.value = null
        newPageTitle.value = ''
    }

    const processRenamePage = async () => {
        if (!pageToRename.value) return
        const targetPage = pageToRename.value
        const newTitle = newPageTitle.value.trim()
        pageToRename.value = null

        if (newTitle && newTitle !== targetPage.title) {
            try {
                await store.renamePage(targetPage.id, newTitle)
                toast.success(`Page renamed to "${newTitle}"`)
            } catch (e: any) {
                toast.error('Failed to rename page')
            }
        }
    }

    const getElement = (id: string) => {
        return activePage.value?.elements?.find((e: any) => e.id === id) || null
    }

    return {
        activePageId,
        activePage,
        sortedPages,
        activeLayout,
        handleAddPage,
        switchPage,
        showDeletePageModal,
        pageToDelete,
        confirmDeletePage,
        processDeletePage,
        pageToRename,
        newPageTitle,
        renamingInput,
        startRenamingPage,
        cancelRename,
        processRenamePage,
        getElement,
    }
}
