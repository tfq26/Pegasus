<script setup lang="ts">
import type { ConnectionFormState } from '@/views/settings/types'

defineProps<{
  connectionForm: ConnectionFormState
}>()
</script>

<template>
  <div class="grid gap-4 md:grid-cols-3">
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Host</label>
      <input 
        v-model="connectionForm.postgres.host" 
        placeholder="127.0.0.1" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Port</label>
      <input 
        v-model.number="connectionForm.postgres.port" 
        type="number" 
        placeholder="5432" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database</label>
      <input 
        v-model="connectionForm.postgres.database" 
        placeholder="postgres" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">User</label>
      <input 
        v-model="connectionForm.postgres.user" 
        placeholder="postgres" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5 md:col-span-2">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Password</label>
      <input 
        v-model="connectionForm.postgres.password" 
        type="password" 
        placeholder="(optional)" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5 md:col-span-3">
      <label class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
        <input 
          type="checkbox" 
          v-model="connectionForm.postgres.ssl" 
          class="rounded border-input bg-background text-primary focus:ring-primary" 
        />
        Enable SSL (Required for most cloud databases)
      </label>
    </div>
  </div>
</template>
