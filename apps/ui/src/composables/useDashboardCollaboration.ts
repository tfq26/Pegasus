import { ref, watch, computed, type Ref } from 'vue'
import { useThrottleFn, useDraggable } from '@vueuse/core'
import { useCollaboration } from '@/composables/useCollaboration'

export function useDashboardCollaboration(
    currentDashboard: Ref<any>,
    dashboardStore: any,
    activePage: Ref<any>
) {
    const {
        joinDashboard,
        leaveDashboard,
        emitCursorMove,
        sendChatMessage,
        collaborators,
        cursors,
        chatMessages,
        emitPegasusQuery,
        isAIThinking,
        editChatMessage,
        deleteChatMessage,
        typingUsers,
        emitTypingStart,
        emitTypingEnd,
        emitDashboardUpdate,
        socket,
    } = useCollaboration()

    // ----- Chat UI State -----------------------------------------------

    const hasUnreadMessages = ref(false)
    const showChat = ref(false)
    const showActivityFeed = ref(false)
    const chatSidebarRef = ref<HTMLElement | null>(null)
    const chatToggleRef = ref<HTMLElement | null>(null)
    const dashboardChatRef = ref<any>(null)
    const isChatDetached = ref(false)
    const { style } = useDraggable(chatSidebarRef as any, {
        initialValue: { x: window.innerWidth - 400, y: 100 },
        disabled: () => !isChatDetached.value
    })

    // Clear unread on chat open
    watch(showChat, (val) => {
        if (val) hasUnreadMessages.value = false
    })

    // Wire socket events once socket is available
    watch(() => socket.value, (s) => {
        if (!s) return

        s.on('new_message', () => {
            if (!showChat.value) hasUnreadMessages.value = true
        })

        s.on('dashboard_updated', async (data: any) => {
            if (data.dashboardId !== currentDashboard.value?.id) return
            if (data.type === 'layout' && data.layout) {
                if (activePage.value) activePage.value.layout = data.layout
            } else {
                await dashboardStore.selectDashboard(currentDashboard.value.id)
            }
        })

        s.on('element_updated', (data: any) => {
            if (data.dashboardId !== currentDashboard.value?.id) return
            currentDashboard.value.data.pages?.forEach((page: any) => {
                const el = page.elements.find((e: any) => e.id === data.elementId)
                if (el) {
                    Object.assign(el, data.changes)
                    dashboardStore.addActivityLog({
                        type: 'update', elementId: data.elementId, elementTitle: el.title,
                        userId: data.userId || 'unknown', userName: data.userName || 'Collaborator',
                        userProfilePicture: data.userProfilePicture, changes: data.changes
                    })
                }
            })
        })

        s.on('element_added', (data: any) => {
            if (data.dashboardId !== currentDashboard.value?.id) return
            const page = currentDashboard.value.data.pages?.find((p: any) => p.id === data.pageId)
            if (page) {
                page.elements.push(data.element)
                page.layout.push(data.layoutItem)
                dashboardStore.addActivityLog({
                    type: 'add', elementId: data.elementId, elementTitle: data.element.title,
                    userId: data.userId || 'unknown', userName: data.userName || 'Collaborator',
                    userProfilePicture: data.userProfilePicture
                })
            }
        })

        s.on('element_removed', (data: any) => {
            if (data.dashboardId !== currentDashboard.value?.id) return
            currentDashboard.value.data.pages?.forEach((page: any) => {
                const el = page.elements.find((e: any) => e.id !== data.elementId)
                if (el) {
                    page.elements = page.elements.filter((e: any) => e.id !== data.elementId)
                    page.layout = page.layout.filter((l: any) => l.i !== data.elementId)
                    dashboardStore.addActivityLog({
                        type: 'remove', elementId: data.elementId, elementTitle: el.title,
                        userId: data.userId || 'unknown', userName: data.userName || 'Collaborator',
                        userProfilePicture: data.userProfilePicture
                    })
                }
            })
        })

        s.on('element_data_refreshed', (data: any) => {
            if (data.dashboardId !== currentDashboard.value?.id) return
            currentDashboard.value.data.pages?.forEach((page: any) => {
                const el = page.elements.find((e: any) => e.id === data.elementId)
                if (el) {
                    if (el.config) el.config.data = data.data
                    el.lastResult = data.newData
                }
            })
        })

        s.on('cell_binding_updated', async (data: any) => {
            if (!currentDashboard.value) return
            const elementsToRefresh: string[] = []
            currentDashboard.value.data.pages?.forEach((page: any) => {
                page.elements.forEach((el: any) => {
                    const usesSpreadsheet = el.connectionId === data.spreadsheetId ||
                        (el.query && el.query.includes(data.spreadsheetId))
                    if (usesSpreadsheet) elementsToRefresh.push(el.id)
                })
            })
            for (const elId of elementsToRefresh) {
                dashboardStore.executeElementQuery(elId, true)
            }
        })
    }, { immediate: true })

    // ----- Cursor Tracking ---------------------------------------------

    const dashboardContainer = ref<HTMLElement | null>(null)

    const onMouseMove = useThrottleFn((e: MouseEvent) => {
        if (!dashboardContainer.value || !currentDashboard.value) return
        const rect = dashboardContainer.value.getBoundingClientRect()
        const x = e.clientX - rect.left + dashboardContainer.value.scrollLeft
        const y = e.clientY - rect.top + dashboardContainer.value.scrollTop
        emitCursorMove(currentDashboard.value.id, x, y)
    }, 250)

    const onMouseLeave = () => { /* optionally signal cursor left */ }

    // ----- Chat Handlers -----------------------------------------------

    const handleSendMessage = (messageData: any) => {
        if (currentDashboard.value) sendChatMessage(currentDashboard.value.id, messageData)
    }

    const handlePegasusQuery = (query: string, messageData: any) => {
        if (!currentDashboard.value) return
        const elements = activePage.value?.elements || []
        const dataSnapshot = elements.map((el: any) => ({
            title: el.title, type: el.type, results: el.lastResult || el.config?.data
        }))
        emitPegasusQuery(currentDashboard.value.id, query, messageData.parentId, dataSnapshot)
    }

    const handleEditMessage = (messageId: string, content: string) => {
        if (currentDashboard.value) editChatMessage(currentDashboard.value.id, messageId, content)
    }

    const handleDeleteMessage = (messageId: string) => {
        if (currentDashboard.value) deleteChatMessage(currentDashboard.value.id, messageId)
    }

    const handleTypingStart = () => {
        if (currentDashboard.value) emitTypingStart(currentDashboard.value.id)
    }

    const handleTypingStop = () => {
        if (currentDashboard.value) emitTypingEnd(currentDashboard.value.id)
    }

    return {
        // Collaboration state
        collaborators,
        cursors,
        chatMessages,
        isAIThinking,
        typingUsers,
        // Chat UI state
        hasUnreadMessages,
        showChat,
        showActivityFeed,
        chatSidebarRef,
        chatToggleRef,
        dashboardChatRef,
        isChatDetached,
        dashboardContainer,
        style,
        // Collaboration actions
        joinDashboard,
        leaveDashboard,
        emitDashboardUpdate,
        emitCursorMove,
        sendChatMessage,
        emitPegasusQuery,
        editChatMessage,
        deleteChatMessage,
        emitTypingStart,
        emitTypingEnd,
        socket,
        // Mouse / cursor
        onMouseMove,
        onMouseLeave,
        // Chat handlers
        handleSendMessage,
        handlePegasusQuery,
        handleEditMessage,
        handleDeleteMessage,
        handleTypingStart,
        handleTypingStop,
    }
}
