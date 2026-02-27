<script setup lang="ts">
import type { ConnectionFormState } from '@/views/settings/types'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Info } from 'lucide-vue-next'

defineProps<{
  connectionForm: ConnectionFormState
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label class="text-[10px]  tracking-wide text-muted-foreground">Database Path or URL</label>
      <input 
        v-model="connectionForm.sqlite.path" 
        placeholder="/path/to/db.sqlite or https://...turso.io" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors font-mono" 
      />
      <p class="text-[10px] text-muted-foreground">Absolute path to local file, ":memory:", or Turso Database URL</p>
    </div>

    <div class="space-y-1.5">
      <label class="text-[10px]  tracking-wide text-muted-foreground">Auth Token (Optional)</label>
      <input 
        v-model="connectionForm.sqlite.authToken" 
        type="password"
        placeholder="Turso Auth Token" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors font-mono" 
      />
      <p class="text-[10px] text-muted-foreground">Required for remote Turso connections</p>
    </div>

    <div class="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-muted/20">
      <div class="space-y-0.5">
        <Label class="text-xs font-medium">Enable Cloud Sync</Label>
        <p class="text-[10px] text-muted-foreground">
          Sync to Pegasus Cloud for cross-device access.
        </p>
      </div>
      <Switch :checked="connectionForm.sqlite.enableSync" @update:checked="(v) => connectionForm.sqlite.enableSync = v" />
    </div>

    <div v-if="connectionForm.sqlite.enableSync" class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex gap-3 items-start transition-all duration-300">
        <Info class="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div class="space-y-1">
            <p class="text-xs font-medium text-blue-500">Privacy Notice</p>
            <p class="text-[10px] text-muted-foreground leading-relaxed">
                Your local database will be uploaded to our secure cloud (SurrealDB) to enable synchronization. Data is encrypted and accessible only by you.
            </p>
        </div>
    </div>

    <!-- Live Cache Toggle -->
    <div class="border p-3 rounded-lg bg-muted/20 space-y-4">
        <div class="flex items-center justify-between space-x-2">
            <div class="space-y-0.5">
                <div class="text-xs font-medium">Enable Live Cache</div>
                <p class="text-[10px] text-muted-foreground">Polls database periodically for live dashboard data.</p>
            </div>
            <Switch :checked="connectionForm.sqlite.enableLiveCache" @update:checked="(v) => connectionForm.sqlite.enableLiveCache = v" />
        </div>
        
        <div v-if="connectionForm.sqlite.enableLiveCache" class="space-y-3">
              <div class="space-y-1.5">
                <label class="text-[10px]  tracking-wide text-muted-foreground">Polling Interval (seconds)</label>
                <input 
                    v-model.number="connectionForm.sqlite.pollingInterval" 
                    type="number"
                    min="10"
                    placeholder="300" 
                    class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
                />
                <p class="text-[10px] text-muted-foreground">Minimum 10 seconds. Default 300 (5 mins).</p>
              </div>

              <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex gap-3 items-start">
                <Info class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div class="space-y-1">
                    <p class="text-xs font-medium text-green-500">Live Dashboard Ready</p>
                    <p class="text-[10px] text-muted-foreground leading-relaxed">
                        Data will be cached in Pegasus Cloud. Dashboards will stream updates in real-time.
                    </p>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>
