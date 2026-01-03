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
  </div>
</template>
