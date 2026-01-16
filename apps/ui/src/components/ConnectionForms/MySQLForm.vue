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
  <div class="grid gap-4 md:grid-cols-3">
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Host</label>
      <input 
        v-model="connectionForm.mysql.host" 
        placeholder="127.0.0.1" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Port</label>
      <input 
        v-model.number="connectionForm.mysql.port" 
        type="number" 
        placeholder="3306" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database</label>
      <input 
        v-model="connectionForm.mysql.database" 
        placeholder="pegasus" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">User</label>
      <input 
        v-model="connectionForm.mysql.user" 
        placeholder="root" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5 md:col-span-2">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Password</label>
      <input 
        v-model="connectionForm.mysql.password" 
        type="password" 
        placeholder="(optional)" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>

    <!-- Sync Toggle -->
    <div class="col-span-full border p-3 rounded-lg bg-muted/20 space-y-4">
        <div class="flex items-center justify-between space-x-2">
            <div class="space-y-0.5">
                <Label class="text-xs font-medium">Enable Cloud Sync</Label>
                <p class="text-[10px] text-muted-foreground">Sync to Pegasus Cloud for cross-device access.</p>
            </div>
            <Switch :checked="connectionForm.mysql.enableSync" @update:checked="(v) => connectionForm.mysql.enableSync = v" />
        </div>
        
        <div v-if="connectionForm.mysql.enableSync" class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex gap-3 items-start">
            <Info class="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div class="space-y-1">
                <p class="text-xs font-medium text-blue-500">Privacy Notice</p>
                <p class="text-[10px] text-muted-foreground leading-relaxed">
                    Your database will be synced to Pegasus Cloud (SurrealDB). Data is encrypted and secure.
                </p>
            </div>
        </div>
    </div>
  </div>
</template>
