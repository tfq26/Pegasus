<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronRight, Link2 } from 'lucide-vue-next'
import { fetchConnectionSchema, QUERY_API_URL, getAuthHeaders } from '@/lib/api'
import type { ConnectionFormState } from '@/views/settings/types'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const showAdvancedKusto = ref(false)

const importKustoCreds = async () => {
  try {
    const settingsRes = await fetch(`${QUERY_API_URL}/settings`, { headers: getAuthHeaders() })
    const data = await settingsRes.json()
    if (data.settings?.azureCredentials) {
      props.connectionForm.kusto.tenantId = data.settings.azureCredentials.tenantId
      props.connectionForm.kusto.clientId = data.settings.azureCredentials.clientId
      props.connectionForm.kusto.clientSecret = data.settings.azureCredentials.clientSecret
      showAdvancedKusto.value = true
    }
  } catch (e) {
    console.error('Failed to import kusto creds', e)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Cluster URL</label>
      <input 
        v-model="connectionForm.kusto.cluster" 
        placeholder="https://<cluster>.<region>.kusto.windows.net" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Database Name</label>
      <input 
        v-model="connectionForm.kusto.database" 
        placeholder="e.g. MyDatabase" 
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
      />
    </div>

    <!-- Advanced Auth Toggle -->
    <div class="flex items-center justify-between pt-2">
      <button 
        type="button" 
        @click="showAdvancedKusto = !showAdvancedKusto"
        class="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium select-none"
      >
        <component :is="showAdvancedKusto ? ChevronDown : ChevronRight" class="w-3.5 h-3.5" />
        Advanced Authentication (Service Principal)
      </button>
      <button 
        type="button"
        @click="importKustoCreds"
        class="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
      >
        <Link2 class="w-3 h-3" /> Use Linked Account
      </button>
    </div>

    <div v-if="showAdvancedKusto" class="space-y-4 pl-3 border-l-2 border-border ml-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Tenant ID</label>
        <input 
          v-model="connectionForm.kusto.tenantId" 
          placeholder="Azure Tenant ID" 
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Client ID</label>
        <input 
          v-model="connectionForm.kusto.clientId" 
          placeholder="Azure Client ID (App ID)" 
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Client Secret</label>
        <input 
          v-model="connectionForm.kusto.clientSecret" 
          type="password"
          placeholder="Azure Client Secret" 
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
        />
      </div>
    </div>
  </div>
</template>
