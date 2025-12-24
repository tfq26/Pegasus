<template>
  <Teleport to="body">
    <div>
      <AmbiguityDialog
        v-model:open="ambiguityDialogVisible"
        :ambiguity="ambiguity"
        @resolve="$emit('resolve-ambiguity', $event)"
      />

      <ChatHistoryModal
        v-model:open="previewVisible"
        :chat="previewChat"
        :messages="previewMessages"
        @continue="$emit('continue-chat', $event)"
      />

      <DashboardElementPreview
        v-model:open="dashboardPreviewVisible"
        :initial-config="dashboardPreviewConfig"
        :query="lastQuery"
        :results="results"
        @saved="$emit('save-dashboard')"
      />

      <SanitizePreviewDialog 
        v-model:open="sanitizeDialogVisible"
        :issues="sanitizeIssues"
        :table="sanitizeTable"
        :connection-id="connectionId"
        @execute-fix="$emit('execute-sanitize', $event)"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@/composables/useQuery'
import { useChatDialogs } from '@/composables/useChatDialogs'
import AmbiguityDialog from './AmbiguityDialog.vue'
import ChatHistoryModal from './ChatHistoryModal.vue'
import DashboardElementPreview from '../Dashboard/DashboardElementPreview.vue'
import SanitizePreviewDialog from './SanitizePreviewDialog.vue'

const props = defineProps<{
  connectionId: string
  lastQuery: string
  results: any[]
}>()

defineEmits<{
  'resolve-ambiguity': [resolution: any]
  'continue-chat': [chatId: string]
  'save-dashboard': []
  'execute-sanitize': [fix: any]
}>()

// Use composables for state
const { ambiguity, ambiguityDialogVisible } = useQuery()
const {
  previewVisible,
  previewChat,
  previewMessages,
  dashboardPreviewVisible,
  dashboardPreviewConfig,
  sanitizeDialogVisible,
  sanitizeIssues,
  sanitizeTable
} = useChatDialogs()

// Debug Watcher
import { watch, onMounted } from 'vue'
watch(previewVisible, (v) => console.log('[DialogManager] previewVisible changed to:', v))
onMounted(() => console.log('[DialogManager] Mounted'))

</script>
