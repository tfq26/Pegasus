<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useColorMode } from '@vueuse/core'
import { Cloud, CheckCircle2, AlertCircle, Loader2, ArrowRight, ExternalLink, ChevronDown, ChevronUp, Globe, ShieldCheck, Key } from 'lucide-vue-next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import CloudProvisionWizard from '@/components/CloudProvisionWizard.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CloudResourceManager from '@/components/CloudResourceManager.vue'
import { useAuth } from '@/composables/useAuth'
import { api } from '@/lib/apiClient'
import type { SettingsModel } from './types'

// Auth
const { user } = useAuth()

// Extract userId from JWT token (more reliable than waiting for user object)
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

// Props
const props = defineProps<{
  settings: SettingsModel
}>()

// State
const mode = useColorMode()
const isDark = computed(() => mode.value === 'dark')

const isConnecting = ref<string | null>(null)
const openWizard = ref(false)
const selectedProvider = ref<string | null>(null)
const connectionStatuses = ref<Record<string, 'connected' | 'disconnected'>>({})
const expandedProvider = ref<string | null>(null)

// Dialog State
const showDisconnectDialog = ref(false)
const disconnectTarget = ref<string | null>(null)
const selectedDetailedProvider = ref<string | null>(null)

// Mock Data for Cloud Providers
const userClouds = computed(() => [
    {
        id: 'azure',
        name: 'Microsoft Azure',
        icon: 'azure',
        description: 'Connect your Azure account for automated database provisioning (ACI), Kusto integration, and cloud storage.',
        status: connectionStatuses.value['azure'] || (props.settings.azureCredentials?.tenantId ? 'connected' : 'disconnected'),
        resources: 0
    },
    {
        id: 'aws',
        name: 'Amazon Web Services',
        icon: 'aws',
        description: 'Link your AWS account to manage ECS Fargate automation, DynamoDB tables, S3 buckets, and Bedrock models.',
        status: connectionStatuses.value['aws'] || (props.settings.awsCredentials?.accessKeyId ? 'connected' : 'disconnected'),
        resources: 0
    },
    {
        id: 'gcp',
        name: 'Google Cloud Platform',
        icon: 'gcp',
        description: 'Integrate with GCP to orchestrate Firestore, GCS, and Vertex AI deployments.',
        status: connectionStatuses.value['gcp'] || 'disconnected',
        resources: 0
    }
])

const handleConnect = (providerId: string) => {
    isConnecting.value = providerId
    selectedProvider.value = providerId // Set provider immediately
    
    // Open OAuth popup
    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    
    const popup = window.open(
        `http://localhost:3000/api/cloud-auth/${providerId}/init?user_id=${userId.value}`,
        'oauth-popup',
        `width=${width},height=${height},left=${left},top=${top}`
    )
    
    // Listen for OAuth success message
    const handleMessage = (event: MessageEvent) => {
        if (event.data.type === `${providerId}-oauth-success`) {
            console.log(`[CloudTab] OAuth success for ${providerId}`)
            isConnecting.value = null
            
            // Refresh cloud status
            connectionStatuses.value[providerId] = 'connected'
            
            // Clean up
            window.removeEventListener('message', handleMessage)
            if (popup) popup.close()
            
            // Open provisioning wizard
            openWizard.value = true
        }
    }
    
    window.addEventListener('message', handleMessage)
    
    // Cleanup if popup is closed manually
    const checkPopup = setInterval(() => {
        if (popup?.closed) {
            clearInterval(checkPopup)
            window.removeEventListener('message', handleMessage)
            isConnecting.value = null
        }
    }, 500)
}

const handleDisconnect = (providerId: string) => {
    disconnectTarget.value = providerId
    showDisconnectDialog.value = true
}

const confirmDisconnect = async () => {
    const providerId = disconnectTarget.value
    if (!providerId) return

    try {
        const response = await api.delete(`/api/cloud-auth/${providerId}/disconnect`, {
            headers: {
                'x-user-id': userId.value
            }
        })
        
        // ApiClient throws on error, so if we get here it succeeded
        console.log(`[CloudTab] Disconnected ${providerId}`)
        
        // Also update the dedicated ConnectionStatuses map explicitly
        connectionStatuses.value[providerId] = 'disconnected'
        
        // Close Resource Manager if it's open for this provider
        if (selectedDetailedProvider.value === providerId) {
            selectedDetailedProvider.value = null
        }

    } catch (error) {
        console.error(`[CloudTab] Error disconnecting ${providerId}:`, error)
    } finally {
        showDisconnectDialog.value = false
        disconnectTarget.value = null
    }
}

// Check connection status when user is available and on mount
const checkConnectionStatus = async () => {
    if (!userId.value || userId.value === 'anonymous') return

    const providers = ['azure', 'aws', 'gcp']
    
    for (const provider of providers) {
        try {
            const data = await api.get<{ connected: boolean; expired?: boolean }>(
                `/api/cloud-auth/${provider}/status`,
                {
                    headers: {
                        'x-user-id': userId.value
                    }
                }
            )
            
            if (data) {
                connectionStatuses.value[provider] = data.connected ? 'connected' : 'disconnected'
                if (data.connected) console.log(`[CloudTab] ${provider} is connected`)
            }
        } catch (error) {
            console.error(`[CloudTab] Error checking ${provider} status:`, error)
            connectionStatuses.value[provider] = 'disconnected'
        }
    }
}

watch(userId, () => {
    checkConnectionStatus()
}, { immediate: true })

onMounted(() => {
    checkConnectionStatus()
})

</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    
    <div>
      <h3 class="text-lg font-medium">Cloud Infrastructure</h3>
      <p class="text-sm text-muted-foreground">
        Connect your cloud provider accounts to automatically provision and manage databases, AI models, and storage resources.
      </p>
    </div>

    <!-- Provider Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card 
            v-for="cloud in userClouds" 
            :key="cloud.id"
            class="flex flex-col overflow-hidden border-muted-foreground/20 shadow-sm hover:shadow-md transition-all hover:border-primary/50 relative group"
        >
            <!-- Provider specific background tint/gradient could go here -->
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

            <CardHeader>
                <div class="flex items-center justify-between">
                    <div class="p-2 rounded-lg bg-muted/50 border border-border w-12 h-12 flex items-center justify-center">
                        <img v-if="cloud.id === 'azure'" src="/icons/microsoft/Azure/azure-2.svg" alt="Azure" class="w-8 h-8" />
                        <img v-else-if="cloud.id === 'aws'" :src="isDark ? '/icons/aws/aws-colored-white-text.svg' : '/icons/aws/aws-colored-black-text.svg'" alt="AWS" class="w-8 h-8" />
                        <img v-else-if="cloud.id === 'gcp'" src="/icons/google/GCP/icons8-google-cloud.svg" alt="GCP" class="w-8 h-8" />
                    </div>
                    <div v-if="cloud.status === 'connected'" class="flex items-center text-xs text-emerald-500 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 class="w-3 h-3 mr-1" />
                        Connected
                    </div>
                     <div v-else class="flex items-center text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Disconnected
                    </div>
                </div>
                <CardTitle class="mt-4">{{ cloud.name }}</CardTitle>
                <CardDescription class="line-clamp-3 min-h-[40px]">{{ cloud.description }}</CardDescription>
            </CardHeader>

            <CardContent class="flex-1">
                <div v-if="cloud.status === 'connected'" class="space-y-2">
                    <div class="text-sm font-medium">Provisioned Resources</div>
                    <div class="text-2xl font-bold">{{ cloud.resources }}</div>
                </div>
            </CardContent>

            <CardFooter class="bg-muted/20 p-4 border-t border-border">
                <div class="w-full space-y-3">
                    <button 
                        v-if="cloud.status !== 'connected'"
                        @click="handleConnect(cloud.id)"
                        :disabled="!!isConnecting"
                        class="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-background border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all font-medium text-sm shadow-sm"
                    >
                        <Loader2 v-if="isConnecting === cloud.id" class="w-4 h-4 animate-spin" />
                        <span v-else>Connect Account</span>
                        <ArrowRight v-if="isConnecting !== cloud.id" class="w-4 h-4 ml-auto opacity-50" />
                    </button>
                    <div v-else class="flex flex-col gap-2">
                        <button 
                            @click="selectedDetailedProvider = cloud.id"
                            class="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium text-sm shadow-sm"
                        >
                            <Globe class="w-4 h-4" />
                            <span>Manage Resources</span>
                        </button>
                        <button 
                            @click="handleDisconnect(cloud.id)"
                            class="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all font-medium text-sm border hover:border-destructive/20"
                        >
                            <span>Disconnect</span>
                        </button>
                    </div>
                </div>
            </CardFooter>
        </Card>
    </div>
    
    <!-- Resource Manager -->
    <div v-if="selectedDetailedProvider" class="mt-8">
       <CloudResourceManager 
           :provider-id="selectedDetailedProvider"
           :user-id="userId"
           @close="selectedDetailedProvider = null"
       />
    </div>
    
    <!-- Cloud Provisioning Wizard -->
    <CloudProvisionWizard
        v-model:open="openWizard"
        :provider="selectedProvider as 'azure' | 'aws' | 'gcp'"
        :user-id="userId"
        @complete="async (resources: any) => {
            console.log('[CloudTab] Provisioning complete:', resources)
            // Save config persistence
            if (selectedProvider) {
                try {
                    await api.post(`/api/cloud-provision/${selectedProvider}/config`, {
                        user_id: userId,
                        resource_group: resources.resourceGroup || resources.resourceGroupName,
                        subscription_id: resources.subscriptionId
                    })
                    console.log('[CloudTab] Saved cloud config for', selectedProvider)
                } catch (e) {
                    console.error('[CloudTab] Failed to save cloud config', e)
                }
            }
            openWizard = false
        }"
    />
    
    <!-- Disconnect Confirmation Dialog -->
    <ConfirmDialog
        v-model:open="showDisconnectDialog"
        title="Disconnect Account"
        :description="`Are you sure you want to disconnect your ${disconnectTarget?.toUpperCase()} account? This will remove access to provisioned resources.`"
        confirm-text="Disconnect"
        :is-destructive="true"
        @confirm="confirmDisconnect"
    />

  </div>
</template>
