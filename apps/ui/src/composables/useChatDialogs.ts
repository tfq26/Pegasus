import { ref } from 'vue'

// Shared state (singleton pattern or per-scoped?)
// Given Chat.vue is the main view, per-scope is fine, but if we want DialogManager to share state with Chat.vue without props, we need a shared state or provide/inject.
// Simpler: Just make it a standard composable and let Chat.vue pass the state to DialogManager via props?
// NO, the goal is to reduce template clutter.

// If I make it a store (pinia) or a singleton composable, I don't need props.
// Let's use a singleton state pattern for the UI state of the active chat view.

const previewVisible = ref(false)
const previewChat = ref<any>(null)
const previewMessages = ref<any[]>([])

const dashboardPreviewVisible = ref(false)
const dashboardPreviewConfig = ref<any>(null)

const sanitizeDialogVisible = ref(false)
const sanitizeIssues = ref<any[]>([])
const sanitizeTable = ref('')

const diffViewVisible = ref(false)

export function useChatDialogs() {

    function openChatPreview(chat: any, messages: any[]) {
        console.log('[useChatDialogs] Opening chat preview:', chat.id, 'Messages:', messages.length)
        previewChat.value = chat
        previewMessages.value = messages
        previewVisible.value = true
        console.log('[useChatDialogs] previewVisible set to:', previewVisible.value)
    }

    function closeChatPreview() {
        previewVisible.value = false
        previewChat.value = null
        previewMessages.value = []
    }

    function openDashboardPreview(config: any) {
        dashboardPreviewConfig.value = config
        dashboardPreviewVisible.value = true
    }

    function openSanitizePreview(table: string, issues: any[] = []) {
        sanitizeTable.value = table
        sanitizeIssues.value = issues
        sanitizeDialogVisible.value = true
    }

    return {
        // Chat Preview
        previewVisible,
        previewChat,
        previewMessages,
        openChatPreview,
        closeChatPreview,

        // Dashboard Preview
        dashboardPreviewVisible,
        dashboardPreviewConfig,
        openDashboardPreview,

        // Sanitize Preview
        sanitizeDialogVisible,
        sanitizeIssues,
        sanitizeTable,
        openSanitizePreview,

        // Diff View
        diffViewVisible
    }
}
