<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronRight, Link2, Info } from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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

    <!-- Live Cache Toggle -->
    <div class="mt-4 border p-3 rounded-lg bg-muted/20 space-y-4">
        <div class="flex items-center justify-between space-x-2">
            <div class="space-y-0.5">
                <Label class="text-xs font-medium">Enable Live Cache</Label>
                <p class="text-[10px] text-muted-foreground">Polls database periodically for live dashboard data.</p>
            </div>
            <Switch :checked="connectionForm.kusto.enableLiveCache" @update:checked="(v) => connectionForm.kusto.enableLiveCache = v" />
        </div>
        
        <div v-if="connectionForm.kusto.enableLiveCache" class="space-y-3">
             <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Polling Interval (seconds)</label>
                <input 
                    v-model.number="connectionForm.kusto.pollingInterval" 
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
                        Data will be cached in Pegasus Cloud (SurrealDB). Dashboards will stream updates in real-time.
                    </p>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>
