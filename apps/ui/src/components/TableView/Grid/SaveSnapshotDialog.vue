<script setup lang="ts">
import { ref, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Cloud, Upload } from 'lucide-vue-next'
import type { ConnectionEntry } from '@/lib/db-connections'

const props = defineProps<{
  open: boolean,
  connections: ConnectionEntry[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean],
  'confirm': [config: any]
}>()

const selectedConnectionId = ref<string>('internal')
const bucketOverride = ref('')

const selectedConnection = computed(() => 
    props.connections.find(c => c.id === selectedConnectionId.value)
)

const isInternal = computed(() => selectedConnectionId.value === 'internal')

const handleConfirm = () => {
    if (isInternal.value) {
        emit('confirm', { provider: 'internal' })
        emit('update:open', false)
        return
    }

    if (!selectedConnection.value) return;
    
    const config = {
      provider: 'cloud_storage',
      service: selectedConnection.value.cloud_storage?.service,
      bucket: bucketOverride.value || selectedConnection.value.cloud_storage?.bucket,
      // Pass the IDs/references usually. Ideally we pass the connection ID and backend handles resolution.
      // But the current implementation expects storage_config object.
      // Wait, Engine.ts passes `storage_config` object to backend.
      // Backend `table.js` expects:
      // op.storage_config { service, bucket, connectionString/accessKey/secretKey }
      
      // Since we want to resolve secrets on backend using `SecretService`, we should pass the stored config values.
      // The stored `ConnectionEntry` HAS the vault references or encrypted strings.
      // So we just pass those along.
    }
    
    // Construct the payload matching what Backend expects from `storage_config`
    const cc = selectedConnection.value.cloud_storage;
    if (!cc) return;

    Object.assign(config, {
        connectionString: cc.connectionString,
        accessKey: cc.accessKey,
        secretKey: cc.secretKey,
        region: cc.region,
        credentialsJSON: cc.secretKey // GCS uses secretKey field for JSON
    });

    emit('confirm', config)
    emit('update:open', false)
}

</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md bg-background border-border text-foreground">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
            <Cloud class="w-5 h-5 text-primary" />
            Save Cloud Snapshot
        </DialogTitle>
        <DialogDescription>
            Back up the current table state to a cloud storage provider.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <div class="space-y-2">
            <label class="text-xs font-semibold uppercase text-muted-foreground">Select Cloud Connection</label>
            <Select v-model="selectedConnectionId">
                <SelectTrigger>
                    <SelectValue placeholder="Select a provider..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="internal">
                        Pegasus Storage (Internal)
                    </SelectItem>
                    <SelectItem v-for="conn in connections" :key="conn.id" :value="conn.id">
                        {{ conn.nickname }} ({{ conn.cloud_storage?.service }})
                    </SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div v-if="selectedConnection" class="space-y-2">
             <label class="text-xs font-semibold uppercase text-muted-foreground">
                 Target Bucket / Container
             </label>
             <input 
                v-model="bucketOverride" 
                :placeholder="selectedConnection.cloud_storage?.bucket || 'Enter bucket name'"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
             />
             <p class="text-xs text-muted-foreground">
                 Leave blank to use default: {{ selectedConnection.cloud_storage?.bucket }}
             </p>
        </div>
        

        
        <div v-if="props.connections.length === 0 && !isInternal" class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 text-xs">
            No Cloud Storage connections found. Using internal storage.
        </div>
      </div>

      <DialogFooter>
        <button class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" @click="$emit('update:open', false)">Cancel</button>
        <button 
            class="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-50" 
            :disabled="!selectedConnectionId"
            @click="handleConfirm"
        >
            <Upload class="w-4 h-4 inline-block mr-1" />
            {{ isInternal ? 'Save to Pegasus' : 'Upload Snapshot' }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
