<script setup lang="ts">
import { ref } from 'vue'
import { CheckCircle2, Sparkles, Zap } from 'lucide-vue-next'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import ProvisionModal from '@/components/Provisioning/ProvisionModal.vue'
import type { ConnectionFormState } from '@/views/settings/types'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const showProvisionModal = ref(false)

const onProvisioned = (data: { nickname: string; config: any }) => {
  props.connectionForm.nickname = data.nickname
  props.connectionForm.surrealdb.protocol = data.config.protocol
  props.connectionForm.surrealdb.host = data.config.host
  props.connectionForm.surrealdb.port = data.config.port
  props.connectionForm.surrealdb.namespace = data.config.namespace
  props.connectionForm.surrealdb.database = data.config.database
  props.connectionForm.surrealdb.username = data.config.username
  props.connectionForm.surrealdb.password = data.config.password
  props.connectionForm.surrealdb.url = data.config.url
}
</script>

<template>
  <div class="space-y-4">
    <!-- Managed File Info -->
    <div v-if="connectionForm.surrealdb.uploadId" class="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-emerald-500/10">
         <CheckCircle2 class="w-4 h-4 text-emerald-500" />
      </div>
      <div>
        <p class="text-xs font-bold text-emerald-500  tracking-tight">Managed Data Source</p>
        <p class="text-[10px] text-muted-foreground">This file is indexed in the internal SurrealDB engine for RAG and semantic search.</p>
      </div>
    </div>

    <!-- Technical Connection Fields (Hidden for managed files) -->
    <div v-if="!connectionForm.surrealdb.uploadId" class="space-y-4">
        <!-- Provisioning CTA -->
        <div 
          @click="showProvisionModal = true"
          class="p-4 bg-gradient-to-r from-violet-600/10 to-indigo-600/10 border border-violet-500/20 rounded-xl cursor-pointer hover:from-violet-600/20 hover:to-indigo-600/20 transition-all group"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-violet-600 rounded-lg shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform">
                <Sparkles class="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 class="text-xs font-bold">Don't have an instance?</h4>
                <p class="text-[10px] text-muted-foreground">Provision a managed SurrealDB instance in one click.</p>
              </div>
            </div>
            <button type="button" class="text-[10px] font-bold  tracking-widest text-violet-500 bg-violet-500/10 px-3 py-1.5 rounded-lg hover:bg-violet-500 hover:text-white transition-colors">
              Provision Now
            </button>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Protocol</label>
            <Select v-model="connectionForm.surrealdb.protocol">
              <SelectTrigger class="w-full rounded-lg border-input bg-background h-[38px]">
                <SelectValue placeholder="Protocol" />
              </SelectTrigger>
              <SelectContent class="bg-popover border-border">
                <SelectItem value="ws">ws</SelectItem>
                <SelectItem value="wss">wss</SelectItem>
                <SelectItem value="http">http</SelectItem>
                <SelectItem value="https">https</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">URL (Optional - Overrides Host/Port)</label>
            <input v-model="connectionForm.surrealdb.url" placeholder="ws://localhost:8000/rpc" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors font-mono" />
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <div class="space-y-1.5 md:col-span-2">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Host</label>
            <input v-model="connectionForm.surrealdb.host" placeholder="127.0.0.1" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Port</label>
            <input v-model.number="connectionForm.surrealdb.port" type="number" placeholder="8000" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Namespace</label>
            <input v-model="connectionForm.surrealdb.namespace" placeholder="test" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Database</label>
            <input v-model="connectionForm.surrealdb.database" placeholder="test" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Username</label>
            <input v-model="connectionForm.surrealdb.username" placeholder="root" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[10px]  tracking-wide text-muted-foreground">Password</label>
            <input v-model="connectionForm.surrealdb.password" type="password" placeholder="root" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" />
          </div>
        </div>
    </div>

    <ProvisionModal 
      :open="showProvisionModal"
      @update:open="showProvisionModal = $event"
      @provisioned="onProvisioned"
    />
  </div>
</template>
