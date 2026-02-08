<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Database, Server } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, QUERY_API_URL } from '@/lib/apiClient'
import type { ConnectionFormState } from '@/views/settings/types'
import { useAuth } from '@/composables/useAuth'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const { user } = useAuth()

// Resource Type selection
const resourceType = ref<'kusto' | 'cosmosdb'>(props.connectionForm.provider === 'cosmosdb' ? 'cosmosdb' : 'kusto')

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

// Kusto specific
const kustoClusters = ref<any[]>([])
const selectedCluster = ref<string>('')
const loadingClusters = ref(false)

// CosmosDB specific
const cosmosAccounts = ref<any[]>([])
const selectedCosmosAccount = ref<string>('')
const loadingCosmosAccounts = ref(false)
const fetchingCosmosKeys = ref(false)

// Common discovery
const databases = ref<any[]>([])
const selectedDatabase = ref<string>('')
const loadingDatabases = ref(false)

// Cluster Creation State (Kusto only for now)
const showCreateCluster = ref(false)
const newClusterName = ref('')
const selectedLocation = ref('eastus')
const isCheckingName = ref(false)
const nameAvailable = ref<boolean | null>(null)
const nameMessage = ref('')
const isProvisioning = ref(false)
const provisioningStatus = ref('')
const pollingInterval = ref<any>(null)
const locations = [
  { id: 'eastus', name: 'East US' },
  { id: 'westus', name: 'West US' },
  { id: 'northeurope', name: 'North Europe' },
  { id: 'westeurope', name: 'West Europe' },
  { id: 'southeastasia', name: 'Southeast Asia' }
]

// Check if user is already authenticated with Azure
const checkAuthStatus = async () => {
  checkingAuth.value = true
  try {
    const data = await api.get<{ connected: boolean; expired?: boolean }>(
      `/api/cloud-auth/azure/status`,
      {
        headers: {
          'x-user-id': userId.value
        },
        skipAuthRedirect: true
      }
    )
    
    // Only count as authenticated if connected AND NOT expired
    const isConn = !!data?.connected
    const isExp = !!data?.expired
    
    isAuthenticated.value = (isConn && !isExp)
    
    if (isAuthenticated.value) {
      await fetchSubscriptions()
    } else if (isConn && isExp) {
      console.log('[AzureOAuthForm] Azure token expired')
    }
  } catch (error) {
    console.error('[AzureOAuthForm] Error checking auth status:', error)
    isAuthenticated.value = false
  } finally {
    checkingAuth.value = false
  }
}

// Disconnect Azure account
const handleDisconnect = async () => {
  try {
    await api.delete(`/api/cloud-auth/azure/disconnect`, {
      headers: {
        'x-user-id': userId.value
      },
      skipAuthRedirect: true
    })
    isAuthenticated.value = false
    subscriptions.value = []
    selectedSubscription.value = ''
    await checkAuthStatus()
  } catch (error) {
    console.error('[AzureOAuthForm] Error disconnecting:', error)
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
    `${QUERY_API_URL}/api/cloud-auth/azure/init?user_id=${userId.value}`,
    'oauth-popup',
    `width=${width},height=${height},left=${left},top=${top}`
  )
  
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'azure-oauth-success') {
      isConnecting.value = false
      isAuthenticated.value = true
      window.removeEventListener('message', handleMessage)
      if (popup) popup.close()
      fetchSubscriptions()
    }
  }
  
  window.addEventListener('message', handleMessage)
  
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
      `/api/cloud-provision/azure/subscriptions?user_id=${userId.value}`,
      { skipAuthRedirect: true }
    )
    subscriptions.value = data.subscriptions || []
    if (subscriptions.value.length === 1) {
      selectedSubscription.value = subscriptions.value[0].id
    }
  } catch (error: any) {
    console.error('[AzureOAuthForm] Error fetching subscriptions:', error)
    if (error.status === 403 || error.message?.includes('403')) {
      isAuthenticated.value = false
    }
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
      `/api/cloud-provision/azure/resource-groups?user_id=${userId.value}&subscription_id=${selectedSubscription.value}`,
      { skipAuthRedirect: true }
    )
    resourceGroups.value = data || []
  } catch (error) {
    console.error('[AzureOAuthForm] Error fetching resource groups:', error)
  } finally {
    loadingResourceGroups.value = false
  }
}

// Fetch Resources (Clusters or Accounts)
const fetchResources = async () => {
  if (!selectedSubscription.value || !selectedResourceGroup.value) return
  
  if (resourceType.value === 'kusto') {
    loadingClusters.value = true
    try {
      const data = await api.get<any[]>(
        `/api/cloud-provision/azure/resources?user_id=${userId.value}&subscription_id=${selectedSubscription.value}&resource_group_name=${selectedResourceGroup.value}`,
        { skipAuthRedirect: true }
      )
      kustoClusters.value = (data || []).filter(r => r.type?.toLowerCase().includes('kusto'))
    } catch (error) {
      console.error('[AzureOAuthForm] Error fetching Kusto clusters:', error)
    } finally {
      loadingClusters.value = false
    }
  } else {
    loadingCosmosAccounts.value = true
    try {
      const data = await api.get<any[]>(
        `/api/cloud-provision/azure/resources?user_id=${userId.value}&subscription_id=${selectedSubscription.value}&resource_group_name=${selectedResourceGroup.value}`,
        { skipAuthRedirect: true }
      )
      cosmosAccounts.value = (data || []).filter(r => r.type?.toLowerCase().includes('documentdb'))
    } catch (error) {
      console.error('[AzureOAuthForm] Error fetching Cosmos accounts:', error)
    } finally {
      loadingCosmosAccounts.value = false
    }
  }
}

// Watchers
watch(resourceType, (newType) => {
  props.connectionForm.provider = newType === 'cosmosdb' ? 'cosmosdb' : 'kusto'
  fetchResources()
})

watch(selectedSubscription, (newVal) => {
  if (newVal) {
    fetchResourceGroups()
    selectedResourceGroup.value = ''
    selectedCluster.value = ''
    selectedCosmosAccount.value = ''
  }
})

watch(selectedResourceGroup, (newVal) => {
  if (newVal) {
    fetchResources()
    selectedCluster.value = ''
    selectedCosmosAccount.value = ''
  }
})

// Kusto Select
watch(selectedCluster, (newVal) => {
  if (newVal && resourceType.value === 'kusto') {
    const cluster = kustoClusters.value.find(c => c.id === newVal)
    if (cluster) {
      const clusterName = cluster.name
      const location = cluster.location
      props.connectionForm.kusto.cluster = `https://${clusterName}.${location}.kusto.windows.net`
      if (!props.connectionForm.alias) {
        props.connectionForm.alias = clusterName
        props.connectionForm.nickname = clusterName
      }
    }
  }
})

// Cosmos Select
watch(selectedCosmosAccount, (newVal) => {
  if (newVal && resourceType.value === 'cosmosdb') {
    const account = cosmosAccounts.value.find(a => a.id === newVal)
    if (account) {
      const accountName = account.name
      // Most Cosmos DB accounts follow https://{name}.documents.azure.com/
      props.connectionForm.cosmosdb.endpoint = `https://${accountName}.documents.azure.com/`
      if (!props.connectionForm.alias) {
        props.connectionForm.alias = accountName
        props.connectionForm.nickname = accountName
      }
      fetchCosmosKeys()
    }
  }
})
const fetchCosmosKeys = async () => {
  if (!selectedCosmosAccount.value || !selectedResourceGroup.value || !selectedSubscription.value) return
  
  const account = cosmosAccounts.value.find(a => a.id === selectedCosmosAccount.value)
  if (!account) return

  fetchingCosmosKeys.value = true
  try {
    const data = await api.get<any>(
      `/api/cloud-provision/azure/cosmos/keys?user_id=${userId.value}&subscription_id=${selectedSubscription.value}&resource_group_name=${selectedResourceGroup.value}&account_name=${account.name}`,
      { skipAuthRedirect: true }
    )
    if (data.primaryMasterKey) {
      props.connectionForm.cosmosdb.key = data.primaryMasterKey
    }
  } catch (error) {
    console.error('[AzureOAuthForm] Error fetching Cosmos keys:', error)
  } finally {
    fetchingCosmosKeys.value = false
  }
}

onMounted(() => {
  checkAuthStatus()
})

// Cluster Name Avail (Kusto only)
const checkNameAvailability = async () => {
  if (newClusterName.value.length < 4) return
  isCheckingName.value = true
  try {
    const data = await api.get<any>(
      `/api/cloud-provision/azure/kusto/check-available?user_id=${userId.value}&subscription_id=${selectedSubscription.value}&name=${newClusterName.value}&location=${selectedLocation.value}`,
      { skipAuthRedirect: true }
    )
    nameAvailable.value = data.available
    nameMessage.value = data.message || (data.available ? '✓ Name available' : '✗ Name unavailable')
  } catch (error: any) {
    nameAvailable.value = false
    nameMessage.value = 'Failed to check name availability'
  } finally {
    isCheckingName.value = false
  }
}

const handleCreateCluster = async () => {
  if (!nameAvailable.value || !selectedResourceGroup.value) return
  isProvisioning.value = true
  provisioningStatus.value = 'Initiating request...'
  try {
    await api.post('/api/cloud-provision/azure/provision-kusto', {
      user_id: userId.value,
      subscription_id: selectedSubscription.value,
      resource_group: selectedResourceGroup.value,
      location: selectedLocation.value,
      cluster_name: newClusterName.value
    }, { skipAuthRedirect: true })
    provisioningStatus.value = 'Provisioning in progress... this may take a few minutes.'
    startPollingStatus()
  } catch (error: any) {
    provisioningStatus.value = `Error: ${error.message || 'Failed to start provisioning'}`
    isProvisioning.value = false
  }
}

const startPollingStatus = () => {
  if (pollingInterval.value) clearInterval(pollingInterval.value)
  pollingInterval.value = setInterval(async () => {
    try {
      const resources = await api.get<any[]>(
        `/api/cloud-provision/azure/resources?user_id=${userId.value}&subscription_id=${selectedSubscription.value}&resource_group_name=${selectedResourceGroup.value}`,
        { skipAuthRedirect: true }
      )
      const cluster = resources.find(r => r.name === newClusterName.value && r.type?.toLowerCase().includes('kusto'))
      if (cluster) {
        clearInterval(pollingInterval.value)
        isProvisioning.value = false
        showCreateCluster.value = false
        fetchResources()
      }
    } catch (e) {}
  }, 10000)
}
</script>

<template>
  <div class="space-y-4">
    <!-- resource type selector -->
    <div class="flex p-1 bg-muted rounded-lg border border-border">
      <button
        type="button"
        @click="resourceType = 'kusto'"
        class="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all"
        :class="resourceType === 'kusto' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
      >
        <Database class="w-3.5 h-3.5" />
        Kusto (Data Explorer)
      </button>
      <button
        type="button"
        @click="resourceType = 'cosmosdb'"
        class="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded-md transition-all"
        :class="resourceType === 'cosmosdb' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
      >
        <Server class="w-3.5 h-3.5" />
        Cosmos DB
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="checkingAuth" class="flex items-center justify-center py-8">
      <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">Checking authentication...</span>
    </div>

    <!-- Not Authenticated -->
    <div v-else-if="!isAuthenticated" class="space-y-4">
      <div class="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-4">
        <div class="p-4 rounded-full bg-primary/10">
          <img src="/icons/microsoft/Azure/azure-2.svg" class="w-12 h-12" />
        </div>
        <div class="text-center">
          <h4 class="font-semibold text-lg">Connect to Azure</h4>
          <p class="text-sm text-muted-foreground mt-1">
            Sign in with your Microsoft account to access your Azure resources
          </p>
        </div>
        <Button @click="handleConnect" :disabled="isConnecting" class="gap-2">
          <Loader2 v-if="isConnecting" class="w-4 h-4 animate-spin" />
          <span v-else>Sign in with Microsoft</span>
        </Button>
      </div>
    </div>

    <!-- Authenticated -->
    <div v-else class="space-y-4">
      <div class="flex items-center justify-between gap-2 text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-lg">
        <div class="flex items-center gap-2">
          <CheckCircle2 class="w-4 h-4" />
          <span>Connected to Azure</span>
        </div>
        <button @click="handleDisconnect" class="text-[10px] text-muted-foreground hover:text-rose-500 underline transition-colors">
          Disconnect
        </button>
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
      <div v-if="selectedResourceGroup && resourceType === 'kusto'" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kusto Cluster</label>
        <div v-if="loadingClusters" class="flex items-center justify-center py-4">
          <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="kustoClusters.length === 0 && !showCreateCluster" class="space-y-4">
          <div class="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg flex flex-col items-center gap-2">
            <span>No Kusto clusters found in this resource group</span>
            <Button variant="outline" size="sm" @click="showCreateCluster = true">
              Create New Cluster
            </Button>
          </div>
        </div>

        <div v-else-if="showCreateCluster" class="p-4 border rounded-lg bg-muted/30 space-y-4">
          <div class="flex items-center justify-between">
            <h5 class="text-sm font-semibold">Create New Kusto Cluster</h5>
            <Button variant="ghost" size="sm" @click="showCreateCluster = false">Cancel</Button>
          </div>
          <div class="space-y-2">
            <div class="flex gap-2">
              <input v-model="newClusterName" type="text" placeholder="my-cluster" class="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" @input="nameAvailable = null" />
              <Button size="sm" variant="secondary" :disabled="isCheckingName || newClusterName.length < 4" @click="checkNameAvailability">Check</Button>
            </div>
          </div>
          <Button class="w-full gap-2" :disabled="!nameAvailable || isProvisioning" @click="handleCreateCluster">
            <Loader2 v-if="isProvisioning" class="w-4 h-4 animate-spin" />
            <span>Create (Dev Tier)</span>
          </Button>
        </div>

        <Select v-else v-model="selectedCluster">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select Kusto cluster" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="cluster in kustoClusters" :key="cluster.id" :value="cluster.id">
              {{ cluster.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Cosmos Account Selection -->
      <div v-if="selectedResourceGroup && resourceType === 'cosmosdb'" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cosmos DB Account</label>
        <div v-if="loadingCosmosAccounts" class="flex items-center justify-center py-4">
          <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="cosmosAccounts.length === 0" class="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          No Cosmos DB accounts found
        </div>
        <Select v-else v-model="selectedCosmosAccount">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select Cosmos DB account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="account in cosmosAccounts" :key="account.id" :value="account.id">
              {{ account.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Common Final Steps -->
      <div v-if="selectedCluster || selectedCosmosAccount" class="space-y-4">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Database Name</label>
          <input
            v-if="resourceType === 'kusto'" 
            v-model="props.connectionForm.kusto.database"
            type="text"
            placeholder="e.g., pegasus-kql"
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            v-else
            v-model="props.connectionForm.cosmosdb.database"
            type="text"
            placeholder="e.g., prod-db"
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div v-if="resourceType === 'cosmosdb'" class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Key</label>
          <div class="relative">
            <input 
              :value="fetchingCosmosKeys ? 'Fetching keys...' : props.connectionForm.cosmosdb.key"
              type="password"
              readonly
              class="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm font-mono cursor-not-allowed pr-10"
            />
            <div v-if="fetchingCosmosKeys" class="absolute right-3 top-2.5">
              <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
            <div v-else-if="props.connectionForm.cosmosdb.key" class="absolute right-3 top-2.5 text-emerald-500">
               <CheckCircle2 class="w-4 h-4" />
            </div>
          </div>
        </div>

        <div v-if="resourceType === 'cosmosdb'" class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Container (Optional)</label>
          <input 
            v-model="props.connectionForm.cosmosdb.container"
            type="text"
            placeholder="e.g., users"
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {{ resourceType === 'kusto' ? 'Cluster URL' : 'Endpoint' }}
          </label>
          <input
            :value="resourceType === 'kusto' ? props.connectionForm.kusto.cluster : props.connectionForm.cosmosdb.endpoint"
            type="text"
            readonly
            class="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm font-mono cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  </div>
</template>
