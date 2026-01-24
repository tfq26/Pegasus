<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Database } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/apiClient'
import type { ConnectionFormState } from '@/views/settings/types'
import { useAuth } from '@/composables/useAuth'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const { user } = useAuth()

// Get userId from token
const getUserIdFromToken = (): string => {
  const token = localStorage.getItem('auth_token')
  if (!token) return 'anonymous'
  
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return 'anonymous'
    const payload = JSON.parse(atob(parts[1]!))
    return payload.sub || 'anonymous'
  } catch {
    return 'anonymous'
  }
}

const userId = computed(() => user.value?.id || getUserIdFromToken())

// Auth state
const isAuthenticated = ref(false)
const checkingAuth = ref(true)
const isConnecting = ref(false)

// Resource selection state
const subscriptions = ref<any[]>([])
const selectedSubscription = ref<string>('')
const loadingSubscriptions = ref(false)

const resourceGroups = ref<any[]>([])
const selectedResourceGroup = ref<string>('')
const loadingResourceGroups = ref(false)

const kustoClusters = ref<any[]>([])
const selectedCluster = ref<string>('')
const loadingClusters = ref(false)

const databases = ref<any[]>([])
const selectedDatabase = ref<string>('')
const loadingDatabases = ref(false)

// Check if user is already authenticated with Azure
const checkAuthStatus = async () => {
  checkingAuth.value = true
  try {
    const data = await api.get<{ connected: boolean; expired?: boolean }>(
      `/api/cloud-auth/azure/status`,
      {
        headers: {
          'x-user-id': userId.value
        }
      }
    )
    
    isAuthenticated.value = data?.connected || false
    
    if (isAuthenticated.value) {
      // Auto-load subscriptions if authenticated
      await fetchSubscriptions()
    }
  } catch (error) {
    console.error('[KustoOAuthForm] Error checking auth status:', error)
    isAuthenticated.value = false
  } finally {
    checkingAuth.value = false
  }
}

// Trigger OAuth flow
const handleConnect = () => {
  isConnecting.value = true
  
  const width = 600
  const height = 700
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2
  
  const popup = window.open(
    `http://localhost:3000/api/cloud-auth/azure/init?user_id=${userId.value}`,
    'oauth-popup',
    `width=${width},height=${height},left=${left},top=${top}`
  )
  
  // Listen for OAuth success
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'azure-oauth-success') {
      console.log('[KustoOAuthForm] OAuth success')
      isConnecting.value = false
      isAuthenticated.value = true
      
      window.removeEventListener('message', handleMessage)
      if (popup) popup.close()
      
      // Load subscriptions
      fetchSubscriptions()
    }
  }
  
  window.addEventListener('message', handleMessage)
  
  // Cleanup if popup closed manually
  const checkPopup = setInterval(() => {
    if (popup?.closed) {
      clearInterval(checkPopup)
      window.removeEventListener('message', handleMessage)
      isConnecting.value = false
    }
  }, 500)
}

// Fetch subscriptions
const fetchSubscriptions = async () => {
  loadingSubscriptions.value = true
  try {
    const data = await api.get<any>(
      `/api/cloud-provision/azure/subscriptions?user_id=${userId.value}`
    )
    
    subscriptions.value = data.subscriptions || []
    
    // Auto-select if only one
    if (subscriptions.value.length === 1) {
      selectedSubscription.value = subscriptions.value[0].id
    }
  } catch (error) {
    console.error('[KustoOAuthForm] Error fetching subscriptions:', error)
  } finally {
    loadingSubscriptions.value = false
  }
}

// Fetch resource groups
const fetchResourceGroups = async () => {
  if (!selectedSubscription.value) return
  
  loadingResourceGroups.value = true
  try {
    const data = await api.get<any[]>(
      `/api/cloud-provision/azure/resource-groups?user_id=${userId.value}&subscription_id=${selectedSubscription.value}`
    )
    
    resourceGroups.value = data || []
  } catch (error) {
    console.error('[KustoOAuthForm] Error fetching resource groups:', error)
  } finally {
    loadingResourceGroups.value = false
  }
}

// Fetch Kusto clusters
const fetchKustoClusters = async () => {
  if (!selectedSubscription.value || !selectedResourceGroup.value) return
  
  loadingClusters.value = true
  try {
    const data = await api.get<any[]>(
      `/api/cloud-provision/azure/resources?user_id=${userId.value}&subscription_id=${selectedSubscription.value}&resource_group_name=${selectedResourceGroup.value}`
    )
    
    // Filter for Kusto clusters only
    kustoClusters.value = (data || []).filter(r => r.type.includes('Kusto'))
  } catch (error) {
    console.error('[KustoOAuthForm] Error fetching Kusto clusters:', error)
  } finally {
    loadingClusters.value = false
  }
}

// Fetch databases from selected cluster
const fetchDatabases = async () => {
  if (!selectedCluster.value) return
  
  loadingDatabases.value = true
  try {
    // This would need a backend endpoint to list databases in a Kusto cluster
    // For now, we'll allow manual entry
    databases.value = []
  } catch (error) {
    console.error('[KustoOAuthForm] Error fetching databases:', error)
  } finally {
    loadingDatabases.value = false
  }
}

// Watch for subscription changes
watch(selectedSubscription, (newVal) => {
  if (newVal) {
    fetchResourceGroups()
    selectedResourceGroup.value = ''
    selectedCluster.value = ''
  }
})

// Watch for resource group changes
watch(selectedResourceGroup, (newVal) => {
  if (newVal) {
    fetchKustoClusters()
    selectedCluster.value = ''
  }
})

// Watch for cluster changes
watch(selectedCluster, (newVal) => {
  if (newVal) {
    const cluster = kustoClusters.value.find(c => c.id === newVal)
    if (cluster) {
      // Extract cluster URL from the resource
      // Format: https://{clustername}.{region}.kusto.windows.net
      const clusterName = cluster.name
      const location = cluster.location
      props.connectionForm.kusto.cluster = `https://${clusterName}.${location}.kusto.windows.net`
      
      fetchDatabases()
    }
  }
})

// Watch for database input
watch(() => props.connectionForm.kusto.database, (newVal) => {
  selectedDatabase.value = newVal
})

onMounted(() => {
  checkAuthStatus()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Loading State -->
    <div v-if="checkingAuth" class="flex items-center justify-center py-8">
      <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">Checking authentication...</span>
    </div>

    <!-- Not Authenticated - Show OAuth Button -->
    <div v-else-if="!isAuthenticated" class="space-y-4">
      <div class="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-4">
        <div class="p-4 rounded-full bg-primary/10">
          <img src="/icons/microsoft/Azure/azure-2.svg" class="w-12 h-12" />
        </div>
        <div class="text-center">
          <h4 class="font-semibold text-lg">Connect to Azure</h4>
          <p class="text-sm text-muted-foreground mt-1">
            Sign in with your Microsoft account to access your Kusto clusters
          </p>
        </div>
        <Button 
          @click="handleConnect" 
          :disabled="isConnecting"
          class="gap-2"
        >
          <Loader2 v-if="isConnecting" class="w-4 h-4 animate-spin" />
          <span v-else>Sign in with Microsoft</span>
        </Button>
      </div>
    </div>

    <!-- Authenticated - Show Resource Selection -->
    <div v-else class="space-y-4">
      <!-- Success indicator -->
      <div class="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-lg">
        <CheckCircle2 class="w-4 h-4" />
        <span>Connected to Azure</span>
      </div>

      <!-- Subscription Selection -->
      <div class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription</label>
        <Select v-model="selectedSubscription" :disabled="loadingSubscriptions">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select subscription" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="sub in subscriptions" :key="sub.id" :value="sub.id">
              {{ sub.displayName }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Resource Group Selection -->
      <div v-if="selectedSubscription" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resource Group</label>
        <Select v-model="selectedResourceGroup" :disabled="loadingResourceGroups">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select resource group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="rg in resourceGroups" :key="rg.id" :value="rg.name">
              {{ rg.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Kusto Cluster Selection -->
      <div v-if="selectedResourceGroup" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kusto Cluster</label>
        <div v-if="loadingClusters" class="flex items-center justify-center py-4">
          <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="kustoClusters.length === 0" class="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          No Kusto clusters found in this resource group
        </div>
        <Select v-else v-model="selectedCluster">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select Kusto cluster" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="cluster in kustoClusters" :key="cluster.id" :value="cluster.id">
              <div class="flex items-center gap-2">
                <Database class="w-4 h-4" />
                {{ cluster.name }}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Database Name (Manual Entry) -->
      <div v-if="selectedCluster" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Database Name</label>
        <input
          v-model="props.connectionForm.kusto.database"
          type="text"
          placeholder="e.g., pegasus-kql"
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors"
        />
        <p class="text-[10px] text-muted-foreground">Enter the database name within the cluster</p>
      </div>

      <!-- Cluster URL (Read-only, auto-populated) -->
      <div v-if="selectedCluster" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cluster URL</label>
        <input
          :value="props.connectionForm.kusto.cluster"
          type="text"
          readonly
          class="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm font-mono cursor-not-allowed"
        />
      </div>
    </div>
  </div>
</template>
