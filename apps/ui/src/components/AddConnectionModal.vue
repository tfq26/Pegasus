<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ConnectionDialog from '@/components/ConnectionDialog.vue'
import { defaultConnectionForm } from '@/views/settings/types'
import type { ConnectionFormState } from '@/views/settings/types'
import { useConnectionStore } from '@/stores/connection'
import { toast } from '@/composables/useNotifications'

const connectionStore = useConnectionStore()

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'connection-added': []
}>()

// Deep copy to avoid shared state
const getFreshForm = (): ConnectionFormState => JSON.parse(JSON.stringify(defaultConnectionForm))

const form = ref<ConnectionFormState>(getFreshForm())
const isSaving = ref(false)

// Reset form when dialog opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    form.value = getFreshForm()
  }
})

const canAddConnection = computed(() => {
  if (isSaving.value) return false
  const f = form.value
  if (!f.nickname || !f.provider) return false
  if (f.provider === 'mysql') return !!(f.mysql.host && f.mysql.user && f.mysql.database)
  if (f.provider === 'postgres') return !!(f.postgres.host && f.postgres.user && f.postgres.database)
  if (f.provider === 'mongodb') return !!f.mongodb.url
  if (f.provider === 'kusto') return !!(f.kusto.cluster && f.kusto.database)
  if (f.provider === 'sqlite') return !!f.sqlite.path
  if (f.provider === 'file') return !!(f.sqlite.path || f.surrealdb?.uploadId) // File uploads can store in either sqlite.path or surrealdb.uploadId
  if (f.provider === 'surrealdb') return !!f.surrealdb?.uploadId // SurrealDB file uploads
  return false
})

const handleSave = async () => {
  isSaving.value = true
  try {
    // Use connection store instead of direct API call
    await connectionStore.saveConnection(form.value as any)
    toast.success('Connection added')
    emit('update:open', false)
    emit('connection-added')
    // Dispatch event for backwards compatibility
    window.dispatchEvent(new CustomEvent('pegasus:connections-updated'))
  } catch (e) {
    console.error(e)
    toast.error('Failed to add connection')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <ConnectionDialog
    :open="open"
    @update:open="$emit('update:open', $event)"
    :connection-form="form"
    :is-edit-mode="false"
    :can-add-connection="canAddConnection"
    @save="handleSave"
    @upload-success="handleSave"
  />
</template>
