<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import ConnectionDialog from '@/components/ConnectionDialog.vue'
import UpgradeModal from '@/components/UpgradeModal.vue'
import { defaultConnectionForm } from '@/views/settings/types'
import type { ConnectionFormState } from '@/views/settings/types'
import { useConnectionStore } from '@/stores/connection'
import { useSpaceStore } from '@/stores/space'
import { useEntitlements } from '@/composables/useEntitlements'
import { toast } from '@/composables/useNotifications'

const connectionStore = useConnectionStore()
const spaceStore = useSpaceStore()
const { canCreateConnection: tierAllowsConnection, connectionUsage, handleLimitError, fetchEntitlements } = useEntitlements()

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'connection-added': []
}>()

const showUpgradeModal = ref(false)
const upgradeTier = ref<'free' | 'pro' | 'pro_plus'>('free')

// Deep copy to avoid shared state
const getFreshForm = (): ConnectionFormState => JSON.parse(JSON.stringify(defaultConnectionForm))

const form = ref<ConnectionFormState>(getFreshForm())
const isSaving = ref(false)

// Reset form when dialog opens and check tier limits
watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    form.value = getFreshForm()
    // Set the current space ID
    form.value.spaceId = spaceStore.currentSpaceId as any // Using currentSpaceId directly as it's a getter in spaceStore usually
  }
})

onMounted(async () => {
    // Refresh limits when opening
    await fetchEntitlements()
})

const canAddConnection = computed(() => {
  if (isSaving.value) return false
  const f = form.value
  if (!f.alias || !f.provider) return false
  if (f.provider === 'mysql') return !!(f.mysql.host && f.mysql.user && f.mysql.database)
  if (f.provider === 'postgres') return !!(f.postgres.host && f.postgres.user && f.postgres.database)
  if (f.provider === 'mongodb') return !!f.mongodb.url
  if (f.provider === 'kusto') return !!(f.kusto.cluster && f.kusto.database)
  if (f.provider === 'cosmosdb') return !!(f.cosmosdb.endpoint && f.cosmosdb.key && f.cosmosdb.database)
  if (f.provider === 'dynamodb') return !!(f.dynamodb.region && f.dynamodb.accessKeyId)
  if (f.provider === 'bigquery') return !!f.bigquery.projectId
  if (f.provider === 'sqlite') return !!f.sqlite.path
  if (f.provider === 'file') return !!f.sqlite.path
  if (f.provider === 'ai_provider') return !!f.ai_provider?.apiKey
  if (f.provider === 'cloud_storage') {
      const cs = f.cloud_storage
      if (!cs?.bucket) return false
      if (cs.service === 'azure_blob') return !!cs.connectionString
      if (cs.service === 's3') return !!(cs.accessKey && cs.secretKey)
      if (cs.service === 'gcs') return !!cs.secretKey // JSON key
      return false
  }
  return false
})

const handleSave = async () => {
  isSaving.value = true
  try {
    // Use connection store instead of direct API call
    form.value.nickname = form.value.alias
    
    // Ensure spaceId is set for the connection
    const connectionData = {
      ...form.value,
      space: form.value.spaceId,
      spaceId: form.value.spaceId
    }
    
    console.log('[AddConnectionModal] Saving connection with spaceId:', form.value.spaceId, 'Current space:', spaceStore.currentSpaceId)
    await connectionStore.saveConnection(connectionData as any)
    toast.success('Connection added')
    emit('update:open', false)
    emit('connection-added')
    // Dispatch event for backwards compatibility
    window.dispatchEvent(new CustomEvent('pegasus:connections-updated'))
  } catch (e: any) {
    console.error(e)
    
    // Check if this is a tier limit error
    const limitError = handleLimitError(e)
    if (limitError) {
      // Show upgrade modal instead of error toast
      upgradeTier.value = limitError.tier as any || 'free'
      showUpgradeModal.value = true
      emit('update:open', false) // Close connection dialog
    } else {
      toast.error('Failed to add connection')
    }
  } finally {
    isSaving.value = false
  }
}

// Separate handler for file upload success
// Keep dialog open so user can edit name/description before saving
const handleUploadSuccess = () => {
  toast.success('File uploaded - review and save connection')
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
    @upload-success="handleUploadSuccess"
  />
  
  <UpgradeModal
    v-model:open="showUpgradeModal"
    limit-type="connections"
    :current-tier="upgradeTier"
    :current-usage="connectionUsage?.current"
    :limit="connectionUsage?.limit"
  />
</template>
