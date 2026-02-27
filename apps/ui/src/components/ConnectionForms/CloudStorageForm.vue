<script setup lang="ts">
import type { ConnectionFormState } from '@/views/settings/types'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

defineProps<{
  connectionForm: ConnectionFormState
}>()

const providers = [
    { label: 'Azure Blob Storage', value: 'azure_blob' },
    { label: 'AWS S3', value: 's3' },
    { label: 'Google Cloud Storage', value: 'gcs' }
]
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <div class="space-y-1.5 md:col-span-2">
      <label class="text-[10px]  tracking-wide text-muted-foreground">Storage Provider</label>
      <Select v-model="connectionForm.cloud_storage.service">
        <SelectTrigger class="w-full h-9 rounded-lg border-input bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
            <SelectItem v-for="p in providers" :key="p.value" :value="p.value">
                {{ p.label }}
            </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- AZURE Configuration -->
    <div v-if="connectionForm.cloud_storage.service === 'azure_blob'" class="contents">
        <div class="space-y-1.5 md:col-span-2">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Connection String</label>
            <textarea 
                v-model="connectionForm.cloud_storage.connectionString" 
                rows="3"
                placeholder="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=..." 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors resize-none" 
            />
        </div>
    </div>

    <!-- AWS S3 Configuration -->
    <div v-if="connectionForm.cloud_storage.service === 's3'" class="contents">
        <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Access Key ID</label>
            <input 
                v-model="connectionForm.cloud_storage.accessKey" 
                placeholder="AKIA..." 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
            />
        </div>
        <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Secret Access Key</label>
            <input 
                v-model="connectionForm.cloud_storage.secretKey" 
                type="password"
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
            />
        </div>
        <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Region</label>
            <input 
                v-model="connectionForm.cloud_storage.region" 
                placeholder="us-east-1" 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
            />
        </div>
    </div>

    <!-- GCS Configuration -->
    <div v-if="connectionForm.cloud_storage.service === 'gcs'" class="contents">
         <div class="space-y-1.5 md:col-span-2">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Service Account Key (JSON)</label>
            <textarea 
                v-model="connectionForm.cloud_storage.secretKey" 
                rows="5"
                placeholder='{ "type": "service_account", ... }' 
                class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors resize-none font-mono text-xs" 
            />
        </div>
    </div>

    <!-- Common Config -->
    <div class="space-y-1.5 md:col-span-2">
        <label class="text-[10px]  tracking-wide text-muted-foreground">Default Bucket / Container</label>
        <input 
            v-model="connectionForm.cloud_storage.bucket" 
            placeholder="my-app-data" 
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
        <p class="text-[10px] text-muted-foreground">
            Snapshots will be saved here.
        </p>
    </div>
  </div>
</template>
