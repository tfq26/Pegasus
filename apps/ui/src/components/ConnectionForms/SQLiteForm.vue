<script setup lang="ts">
import type { ConnectionFormState } from '@/views/settings/types'

defineProps<{
  connectionForm: ConnectionFormState
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database Path or URL</label>
      <input 
        v-model="connectionForm.sqlite.path" 
        placeholder="/path/to/db.sqlite or https://...turso.io" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors font-mono" 
      />
      <p class="text-[10px] text-muted-foreground">Absolute path to local file, ":memory:", or Turso Database URL</p>
    </div>

    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Auth Token (Optional)</label>
      <input 
        v-model="connectionForm.sqlite.authToken" 
        type="password"
        placeholder="Turso Auth Token" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors font-mono" 
      />
      <p class="text-[10px] text-muted-foreground">Required for remote Turso connections</p>
    </div>
  </div>
</template>
