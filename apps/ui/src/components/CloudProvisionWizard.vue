<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Loader2, ChevronRight, ChevronLeft, Check, AlertCircle, ExternalLink, AlertTriangle, Info } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/apiClient'
import { useProgress } from '@/lib/progress'

// ... (props and emits)
interface Props {
    open: boolean
    provider: 'azure' | 'aws' | 'gcp'
    userId: string
    initialStep?: number
    subscriptionId?: string
    location?: string
    resourceGroupName?: string
}

const props = withDefaults(defineProps<Props>(), {
    initialStep: 1
})
const emit = defineEmits<{
    'update:open': [value: boolean]
    'complete': [resources: any]
}>()

// Wizard state
const currentStep = ref(1)
const totalSteps = 6
const loading = ref(false)
const error = ref<string | null>(null)
const showDefaultInfo = ref(false)

const { startOperation, updateOperation, finishOperation, failOperation } = useProgress()
let pollInterval: any = null

// Step 1: Subscriptions
const subscriptions = ref<any[]>([])
const selectedSubscription = ref<string | null>(null)
const loadingSubscriptions = ref(false)

// Step 2: Location
const locations = ref<any[]>([])
const selectedLocation = ref<string | null>(null)
const loadingLocations = ref(false)

// Step 3: Resource Group
const resourceGroupName = ref('')
const checkingResourceGroup = ref(false)
const resourceGroupExists = ref(false)
const confirmedExistingGroup = ref(false)

// Check resource group existence
const checkResourceGroup = useDebounceFn(async (name: string) => {
    if (!name || name.length < 3 || props.provider !== 'azure') return
    
    checkingResourceGroup.value = true
    resourceGroupExists.value = false
    
    try {
        const data = await api.get<{ exists: boolean }>(
            `/api/cloud-provision/azure/resource-group/check?user_id=${props.userId}&subscription_id=${selectedSubscription.value}&name=${name}`
        )
        
        if (data) {
            resourceGroupExists.value = data.exists
        }
    } catch (err) {
        console.error('[Wizard] Error checking resource group:', err)
    } finally {
        checkingResourceGroup.value = false
    }
}, 500)

// Watch for input changes
watch(resourceGroupName, (newValue) => {
    confirmedExistingGroup.value = false
    checkResourceGroup(newValue)
})

// Step 4: Resources
const selectedResources = ref({
    cosmosdb: false,
    storage: false,
    ai: false,
    kusto: false
})

const resourceConfig = ref({
    cosmosdb: {
        accountName: '',
        databaseName: 'pegasus-db',
        containerName: 'data'
    },
    storage: {
        accountName: '',
        containerName: 'pegasus-data'
    },
    ai: {
        accountName: '',
        deploymentName: 'gpt-4'
    },
    kusto: {
        clusterName: '',
        databaseName: 'pegasus-kql'
    }
})

const provisioningMode = ref<'premade' | 'manual'>('premade')

// Step 5: Provisioning
const provisioningStatus = ref<any>({})
const provisioningComplete = ref(false)

// Provider-specific labels
const providerLabels = computed(() => {
    switch (props.provider) {
        case 'azure':
            return {
                subscription: 'Azure Subscription',
                location: 'Region',
                resourceGroup: 'Resource Group',
                database: 'CosmosDB',
                storage: 'Blob Storage',
                ai: 'Azure OpenAI',
                kusto: 'Azure Data Explorer (KQL)'
            }
        case 'aws':
            return {
                subscription: 'AWS Account',
                location: 'Region',
                resourceGroup: 'Stack Name',
                database: 'DynamoDB',
                storage: 'S3 Bucket',
                ai: 'Bedrock'
            }
        case 'gcp':
            return {
                subscription: 'GCP Project',
                location: 'Region',
                resourceGroup: 'Resource Prefix',
                database: 'Firestore',
                storage: 'Cloud Storage',
                ai: 'Vertex AI'
            }
        default:
            return {
                subscription: 'Subscription',
                location: 'Region',
                resourceGroup: 'Resource Group',
                database: 'Database',
                storage: 'Storage',
                ai: 'AI'
            }
    }
})

// Watch for dialog to open and provider to be set
watch(() => props.open, (isOpen) => {
    if (isOpen && props.provider) {
        console.log('[Wizard] Dialog opened for provider:', props.provider, 'Initial Step:', props.initialStep)
        
        // Initialize state
        currentStep.value = props.initialStep || 1
        
        // Pre-fill if provided
        selectedSubscription.value = props.subscriptionId || null
        selectedLocation.value = props.location || null
        resourceGroupName.value = props.resourceGroupName || ''
        
        // Only reset arrays if starting from scratch
        if (currentStep.value === 1) {
            subscriptions.value = []
            locations.value = []
        }
        provisioningComplete.value = false
        error.value = null
        
        // Fetch subscriptions
        fetchSubscriptions()
    }
})

async function fetchSubscriptions() {
    loadingSubscriptions.value = true
    error.value = null
    
    try {
        const data = await api.get<any>(
            `/api/cloud-provision/${props.provider}/subscriptions?user_id=${props.userId}`
        )
        
        subscriptions.value = data.subscriptions || []
        
        // Auto-select if only one
        if (subscriptions.value.length === 1) {
            selectedSubscription.value = subscriptions.value[0].id
        }
    } catch (err: any) {
        error.value = err.message
        console.error('[Wizard] Error fetching subscriptions:', err)
    } finally {
        loadingSubscriptions.value = false
    }
}

async function fetchLocations() {
    if (!selectedSubscription.value) return
    
    loadingLocations.value = true
    error.value = null
    
    try {
        const data = await api.get<any>(
            `/api/cloud-provision/${props.provider}/locations?user_id=${props.userId}&subscription_id=${selectedSubscription.value}`
        )
        
        locations.value = data.locations || []
        
        // Set default location
        const defaultLocation = locations.value.find(l => l.name === 'eastus' || l.name === 'us-east-1')
        if (defaultLocation) {
            selectedLocation.value = defaultLocation.name
        }
    } catch (err: any) {
        error.value = err.message
        console.error('[Wizard] Error fetching locations:', err)
    } finally {
        loadingLocations.value = false
    }
}

async function provisionResources() {
    loading.value = true
    error.value = null
    provisioningStatus.value = {}
    
    // Start global operation tracking
    const opId = `provision-${props.provider}-${Date.now()}`
    const resourceNames = Object.entries(selectedResources.value)
        .filter(([_, selected]) => selected)
        .map(([type, _]) => providerLabels.value[type as keyof typeof providerLabels.value])
        .join(', ')
    
    startOperation(opId, `Provisioning ${resourceNames}...`, { category: 'cloud' })
    
    try {
        const resources: any = {}
        
        if (selectedResources.value.cosmosdb) {
            resources.cosmosdb = resourceConfig.value.cosmosdb
        }
        if (selectedResources.value.storage) {
            resources.storage = resourceConfig.value.storage
        }
        if (selectedResources.value.ai) {
            resources.ai = resourceConfig.value.ai
        }
        if (selectedResources.value.kusto) {
            resources.kusto = resourceConfig.value.kusto
        }

        const data = await api.post<{ resources: Record<string, any> }>(
            `/api/cloud-provision/${props.provider}/provision`,
            {
                subscriptionId: selectedSubscription.value,
                location: selectedLocation.value,
                resourceGroupName: resourceGroupName.value,
                resources
            },
            {
                headers: {
                    'x-user-id': props.userId
                }
            }
        )
        
        provisioningStatus.value = data.resources || {}
        provisioningComplete.value = true
        
        // Start polling for real status until "Succeeded"
        let attempts = 0
        const maxAttempts = 60 // 10 minutes (10s interval)
        
        updateOperation(opId, 10, 'Deployment initiated...')
        
        pollInterval = setInterval(async () => {
            attempts++
            if (attempts > maxAttempts) {
                clearInterval(pollInterval)
                failOperation(opId, 'Provisioning timed out. Check Azure portal for details.')
                return
            }

            try {
                const resourcesList = await api.get<any[]>(
                    `/api/cloud-provision/${props.provider}/resources?user_id=${props.userId}&subscription_id=${selectedSubscription.value}&resource_group_name=${resourceGroupName.value}`
                )
                
                if (resourcesList) {
                    // Update internal status map for the UI
                    const newStatus = { ...provisioningStatus.value }
                    let allSucceeded = true
                    let succeededCount = 0
                    const totalRequested = Object.values(selectedResources.value).filter(v => v).length

                    resourcesList.forEach(r => {
                        // Match by name partially or type
                        const typeMatch = Object.entries(selectedResources.value).find(([type, selected]) => {
                            if (!selected) return false
                            // Azure
                            if (type === 'cosmosdb' && r.type.includes('documentDB')) return true
                            if (type === 'storage' && r.type.includes('storageAccounts')) return true
                            if (type === 'ai' && (r.type.includes('cognitiveServices') || r.type.includes('Bedrock'))) return true
                            if (type === 'kusto' && r.type.includes('Kusto')) return true
                            
                            // AWS
                            if (type === 'cosmosdb' && r.type.includes('DynamoDB')) return true
                            if (type === 'storage' && r.type.includes('S3')) return true
                            if (type === 'ai' && r.type.includes('Bedrock')) return true
                            
                            // GCP
                            if (type === 'cosmosdb' && r.type.includes('Database')) return true
                            if (type === 'storage' && r.type.includes('Bucket')) return true
                            if (type === 'ai' && r.type.includes('AIPlatform')) return true
                            
                            return false
                        })

                        if (typeMatch) {
                            const [type] = typeMatch
                            newStatus[type] = {
                                ...newStatus[type],
                                status: r.status || 'Provisioning',
                                name: r.name
                            }
                            if (r.status === 'Succeeded') succeededCount++
                            else allSucceeded = false
                        }
                    })

                    provisioningStatus.value = newStatus
                    
                    // Update global progress
                    const progress = Math.min(10 + (succeededCount / totalRequested) * 90, 95)
                    updateOperation(opId, progress, `${succeededCount}/${totalRequested} resources ready`)

                    if (allSucceeded && resourcesList.length >= totalRequested) {
                        clearInterval(pollInterval)
                        finishOperation(opId)
                    }
                }
            } catch (err) {
                console.error('[Wizard] Polling error:', err)
            }
        }, 10000)

        console.log('[Wizard] Provisioning initiated:', data)
    } catch (err: any) {
        error.value = err.message
        failOperation(opId, err.message)
        console.error('[Wizard] Provisioning error:', err)
    } finally {
        loading.value = false
    }
}

function nextStep() {
    if (currentStep.value === 1 && selectedSubscription.value) {
        fetchLocations()
    }
    if (currentStep.value === 5 && provisioningMode.value === 'premade') {
        provisionResources()
    }
    if (currentStep.value < totalSteps) {
        currentStep.value++
    }
}

function handleOpenPortal() {
    window.open(`https://portal.azure.com/#create/hub`, '_blank')
}

function prevStep() {
    if (currentStep.value > 1) {
        currentStep.value--
    }
}

function skipProvisioning() {
    emit('complete', { 
        skipped: true,
        resourceGroup: resourceGroupName.value,
        subscriptionId: selectedSubscription.value,
        location: selectedLocation.value
    })
    emit('update:open', false)
}

function close() {
    emit('update:open', false)
    if (provisioningComplete.value) {
        emit('complete', {
            ...provisioningStatus.value,
            resourceGroup: resourceGroupName.value,
            subscriptionId: selectedSubscription.value
        })
    }
}

// Azure resource naming limits
const AZURE_LIMITS = {
    storage: { min: 3, max: 24, pattern: /^[a-z0-9]+$/, description: '3-24 chars, lowercase letters and numbers only' },
    cosmos: { min: 3, max: 44, pattern: /^[a-z0-9-]+$/, description: '3-44 chars, lowercase letters, numbers, and hyphens' },
    openai: { min: 2, max: 64, pattern: /^[a-zA-Z0-9-]+$/, description: '2-64 chars, letters, numbers, and hyphens' },
    resourceGroup: { min: 1, max: 90, pattern: /^[a-zA-Z0-9._-]+$/, description: '1-90 chars, letters, numbers, hyphens, underscores, periods' },
    kusto: { min: 4, max: 22, pattern: /^[a-z0-9]+$/, description: '4-22 chars, lowercase letters and numbers only' }
}

// Validation errors
const validationErrors = computed(() => {
    const errors: Record<string, string> = {}
    
    // Storage account validation
    if (selectedResources.value.storage && resourceConfig.value.storage.accountName) {
        const name = resourceConfig.value.storage.accountName
        if (name.length < AZURE_LIMITS.storage.min || name.length > AZURE_LIMITS.storage.max) {
            errors.storage = `Storage account name must be ${AZURE_LIMITS.storage.min}-${AZURE_LIMITS.storage.max} characters`
        } else if (!AZURE_LIMITS.storage.pattern.test(name)) {
            errors.storage = 'Only lowercase letters and numbers allowed'
        }
    }
    
    // CosmosDB validation
    if (selectedResources.value.cosmosdb && resourceConfig.value.cosmosdb.accountName) {
        const name = resourceConfig.value.cosmosdb.accountName
        if (name.length < AZURE_LIMITS.cosmos.min || name.length > AZURE_LIMITS.cosmos.max) {
            errors.cosmos = `CosmosDB account name must be ${AZURE_LIMITS.cosmos.min}-${AZURE_LIMITS.cosmos.max} characters`
        } else if (!AZURE_LIMITS.cosmos.pattern.test(name)) {
            errors.cosmos = 'Only lowercase letters, numbers, and hyphens allowed'
        }
    }
    
    // Azure OpenAI validation
    if (selectedResources.value.ai && resourceConfig.value.ai.accountName) {
        const name = resourceConfig.value.ai.accountName
        if (name.length < AZURE_LIMITS.openai.min || name.length > AZURE_LIMITS.openai.max) {
            errors.openai = `Azure OpenAI account name must be ${AZURE_LIMITS.openai.min}-${AZURE_LIMITS.openai.max} characters`
        } else if (!AZURE_LIMITS.openai.pattern.test(name)) {
            errors.openai = 'Only letters, numbers, and hyphens allowed'
        }
    }

    // Azure Data Explorer (KQL) validation
    if (selectedResources.value.kusto && resourceConfig.value.kusto.clusterName) {
        const name = resourceConfig.value.kusto.clusterName
        if (name.length < AZURE_LIMITS.kusto.min || name.length > AZURE_LIMITS.kusto.max) {
            errors.kusto = `KQL cluster name must be ${AZURE_LIMITS.kusto.min}-${AZURE_LIMITS.kusto.max} characters`
        } else if (!AZURE_LIMITS.kusto.pattern.test(name)) {
            errors.kusto = 'Only lowercase letters and numbers allowed'
        }
    }
    
    return errors
})

const hasValidationErrors = computed(() => Object.keys(validationErrors.value).length > 0)

// Validation
const canProceed = computed(() => {
    switch (currentStep.value) {
        case 1:
            return !!selectedSubscription.value
        case 2:
            return !!selectedLocation.value
        case 3:
            return resourceGroupName.value.length > 0 && 
                   (!resourceGroupExists.value || confirmedExistingGroup.value)
        case 4:
            return Object.values(selectedResources.value).some(v => v) && !hasValidationErrors.value
        case 5:
            return !!provisioningMode.value
        default:
            return true
    }
})

// Auto-generate resource names with proper limits
function generateResourceNames() {
    const timestamp = Date.now().toString().slice(-4) // Shorter timestamp
    const prefix = resourceGroupName.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) // Max 10 chars
    
    if (selectedResources.value.cosmosdb && !resourceConfig.value.cosmosdb.accountName) {
        // CosmosDB: prefix + cosmos + timestamp (max 44 chars)
        resourceConfig.value.cosmosdb.accountName = `${prefix}cosmos${timestamp}`.slice(0, 44)
    }
    if (selectedResources.value.storage && !resourceConfig.value.storage.accountName) {
        // Storage: must be 3-24 chars, lowercase letters and numbers only
        resourceConfig.value.storage.accountName = `${prefix}blob${timestamp}`.slice(0, 24)
    }
    if (selectedResources.value.ai && !resourceConfig.value.ai.accountName) {
        // OpenAI: prefix + openai + timestamp (max 64 chars)
        resourceConfig.value.ai.accountName = `${prefix}openai${timestamp}`.slice(0, 64)
    }
    if (selectedResources.value.kusto && !resourceConfig.value.kusto.clusterName) {
        // KQL: must be 4-22 chars, lowercase letters and numbers only
        resourceConfig.value.kusto.clusterName = `${prefix}kql${timestamp}`.slice(0, 22)
    }
}

onUnmounted(() => {
    if (pollInterval) clearInterval(pollInterval)
})
</script>

<template>
    <Dialog :open="open" @update:open="close">
        <DialogContent class="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <img 
                        v-if="provider === 'azure'" 
                        src="/icons/microsoft/Azure/azure-2.svg" 
                        alt="Azure" 
                        class="w-6 h-6" 
                    />
                    <span>Provision {{ providerLabels.subscription }}</span>
                </DialogTitle>
                <DialogDescription>
                    Step {{ currentStep }} of {{ totalSteps }}
                </DialogDescription>
            </DialogHeader>

            <!-- Progress Bar -->
            <div class="w-full bg-muted rounded-full h-2 mb-6">
                <div 
                    class="bg-primary h-2 rounded-full transition-all duration-300"
                    :style="{ width: `${(currentStep / totalSteps) * 100}%` }"
                ></div>
            </div>

            <!-- Error Display -->
            <div v-if="error" class="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4 flex items-start gap-2">
                <AlertCircle class="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                    <p class="font-medium text-destructive">Error</p>
                    <p class="text-sm text-destructive/80">{{ error }}</p>
                </div>
            </div>

            <!-- Step 1: Select Subscription -->
            <div v-if="currentStep === 1" class="space-y-4">
                <h3 class="text-lg font-semibold">Select {{ providerLabels.subscription }}</h3>
                
                <div v-if="loadingSubscriptions" class="flex items-center justify-center py-8">
                    <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
                
                <div v-else-if="subscriptions.length === 0" class="text-center py-8 text-muted-foreground">
                    No subscriptions found
                </div>
                
                <div v-else class="space-y-2">
                    <div 
                        v-for="sub in subscriptions" 
                        :key="sub.id"
                        @click="selectedSubscription = sub.id"
                        class="border rounded-lg p-4 cursor-pointer transition-all hover:border-primary"
                        :class="selectedSubscription === sub.id ? 'border-primary bg-primary/5' : 'border-border'"
                    >
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="font-medium">{{ sub.displayName }}</p>
                                <p class="text-sm text-muted-foreground">{{ sub.id }}</p>
                            </div>
                            <div 
                                v-if="selectedSubscription === sub.id"
                                class="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                            >
                                <Check class="w-3 h-3 text-primary-foreground" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 2: Select Location -->
            <div v-if="currentStep === 2" class="space-y-4">
                <h3 class="text-lg font-semibold">Select {{ providerLabels.location }}</h3>
                
                <div v-if="loadingLocations" class="flex items-center justify-center py-8">
                    <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
                
                <div v-else class="grid grid-cols-2 gap-2">
                    <div 
                        v-for="loc in locations.slice(0, 12)" 
                        :key="loc.name"
                        @click="selectedLocation = loc.name"
                        class="border rounded-lg p-3 cursor-pointer transition-all hover:border-primary text-sm"
                        :class="selectedLocation === loc.name ? 'border-primary bg-primary/5' : 'border-border'"
                    >
                        <div class="flex items-center justify-between">
                            <span>{{ loc.displayName }}</span>
                            <Check 
                                v-if="selectedLocation === loc.name"
                                class="w-4 h-4 text-primary"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 3: Resource Group Name -->
            <div v-if="currentStep === 3" class="space-y-4">
                <h3 class="text-lg font-semibold">Name Your {{ providerLabels.resourceGroup }}</h3>
                <p class="text-sm text-muted-foreground">
                    All resources will be created in this {{ providerLabels.resourceGroup.toLowerCase() }}
                </p>
                
                <div class="space-y-2">
                    <label class="text-sm font-medium">{{ providerLabels.resourceGroup }} Name</label>
                    <div class="relative">
                        <input 
                            v-model="resourceGroupName"
                            type="text"
                            placeholder="pegasus-resources"
                            class="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                        />
                        <div v-if="checkingResourceGroup" class="absolute right-3 top-3">
                             <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                    </div>
                    <p class="text-xs text-muted-foreground">
                        Use lowercase letters, numbers, and hyphens only
                    </p>

                    <!-- Existence Warning -->
                    <div v-if="resourceGroupExists && !confirmedExistingGroup" class="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg flex items-start gap-3">
                        <AlertTriangle class="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 class="text-sm font-medium text-yellow-500">Resource Group Exists</h4>
                            <p class="text-xs text-muted-foreground mt-1">
                                A resource group named <strong>{{ resourceGroupName }}</strong> already exists in this subscription.
                            </p>
                            <div class="flex gap-2 mt-3">
                                <Button size="sm" variant="secondary" @click="confirmedExistingGroup = true">
                                    Use Existing Group
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 4: Select Resources -->
            <div v-if="currentStep === 4" class="space-y-6">
                <h3 class="text-lg font-semibold">Select Resources to Provision</h3>
                
                <!-- Database -->
                <div class="border rounded-lg p-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            v-model="selectedResources.cosmosdb"
                            @change="generateResourceNames"
                            class="w-4 h-4"
                        />
                        <div class="flex-1">
                            <p class="font-medium">{{ providerLabels.database }}</p>
                            <p class="text-sm text-muted-foreground">Serverless NoSQL database</p>
                        </div>
                    </label>
                    
                    <div v-if="selectedResources.cosmosdb" class="mt-4 space-y-3 pl-7">
                        <div>
                            <label class="text-xs font-medium text-muted-foreground">Account Name</label>
                            <input 
                                v-model="resourceConfig.cosmosdb.accountName"
                                type="text"
                                :maxlength="44"
                                :class="['w-full px-2 py-1 text-sm border rounded mt-1', validationErrors.cosmos ? 'border-destructive' : 'border-border']"
                            />
                            <div class="flex justify-between mt-1">
                                <span v-if="validationErrors.cosmos" class="text-xs text-destructive">{{ validationErrors.cosmos }}</span>
                                <span v-else class="text-xs text-muted-foreground">3-44 chars, lowercase + numbers + hyphens</span>
                                <span class="text-xs text-muted-foreground">{{ resourceConfig.cosmosdb.accountName?.length || 0 }}/44</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs font-medium text-muted-foreground">Database Name</label>
                            <input 
                                v-model="resourceConfig.cosmosdb.databaseName"
                                type="text"
                                class="w-full px-2 py-1 text-sm border border-border rounded mt-1"
                            />
                        </div>
                    </div>
                </div>

                <!-- Storage -->
                <div class="border rounded-lg p-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            v-model="selectedResources.storage"
                            @change="generateResourceNames"
                            class="w-4 h-4"
                        />
                        <div class="flex-1">
                            <p class="font-medium">{{ providerLabels.storage }}</p>
                            <p class="text-sm text-muted-foreground">Object storage for files and data</p>
                        </div>
                    </label>
                    
                    <div v-if="selectedResources.storage" class="mt-4 space-y-3 pl-7">
                        <div>
                            <label class="text-xs font-medium text-muted-foreground">Account Name</label>
                            <input 
                                v-model="resourceConfig.storage.accountName"
                                type="text"
                                :maxlength="24"
                                :class="['w-full px-2 py-1 text-sm border rounded mt-1', validationErrors.storage ? 'border-destructive' : 'border-border']"
                            />
                            <div class="flex justify-between mt-1">
                                <span v-if="validationErrors.storage" class="text-xs text-destructive">{{ validationErrors.storage }}</span>
                                <span v-else class="text-xs text-muted-foreground">3-24 chars, lowercase + numbers only</span>
                                <span class="text-xs text-muted-foreground">{{ resourceConfig.storage.accountName?.length || 0 }}/24</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- AI Services -->
                <div class="border rounded-lg p-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            v-model="selectedResources.ai"
                            @change="generateResourceNames"
                            class="w-4 h-4"
                        />
                        <div class="flex-1">
                            <p class="font-medium">{{ providerLabels.ai }}</p>
                            <p class="text-sm text-muted-foreground">AI and machine learning services</p>
                        </div>
                    </label>
                    
                    <div v-if="selectedResources.ai" class="mt-4 space-y-3 pl-7">
                        <div>
                            <label class="text-xs font-medium text-muted-foreground">Account Name</label>
                            <input 
                                v-model="resourceConfig.ai.accountName"
                                type="text"
                                class="w-full px-2 py-1 text-sm border border-border rounded mt-1"
                            />
                        </div>
                    </div>
                </div>

                <!-- Azure Data Explorer (KQL) -->
                <div v-if="provider === 'azure'" class="border rounded-lg p-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            v-model="selectedResources.kusto"
                            @change="generateResourceNames"
                            class="w-4 h-4"
                        />
                        <div class="flex-1">
                            <p class="font-medium">{{ providerLabels.kusto }}</p>
                            <p class="text-sm text-muted-foreground">Big data analytics service</p>
                        </div>
                    </label>
                    
                    <div v-if="selectedResources.kusto" class="mt-4 space-y-3 pl-7">
                        <div>
                            <label class="text-xs font-medium text-muted-foreground">Cluster Name</label>
                            <input 
                                v-model="resourceConfig.kusto.clusterName"
                                type="text"
                                :maxlength="22"
                                :class="['w-full px-2 py-1 text-sm border rounded mt-1', validationErrors.kusto ? 'border-destructive' : 'border-border']"
                            />
                             <div class="flex justify-between mt-1">
                                <span v-if="validationErrors.kusto" class="text-xs text-destructive">{{ validationErrors.kusto }}</span>
                                <span v-else class="text-xs text-muted-foreground">4-22 chars, lowercase + numbers only</span>
                                <span class="text-xs text-muted-foreground">{{ resourceConfig.kusto.clusterName?.length || 0 }}/22</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs font-medium text-muted-foreground">Database Name</label>
                            <input 
                                v-model="resourceConfig.kusto.databaseName"
                                type="text"
                                class="w-full px-2 py-1 text-sm border border-border rounded mt-1"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 5: Configuration Mode -->
            <div v-if="currentStep === 5" class="space-y-6">
                <h3 class="text-lg font-semibold">Deployment Configuration</h3>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Premade Mode -->
                    <div 
                        @click="provisioningMode = 'premade'"
                        :class="['p-4 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md', provisioningMode === 'premade' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50']"
                    >
                        <div class="flex items-center gap-3 mb-3">
                            <div class="p-2 bg-primary/10 rounded-lg">
                                <Check class="w-5 h-5 text-primary" />
                            </div>
                            <h4 class="font-semibold text-base">Pegasus Managed</h4>
                            <button 
                                @click.stop="showDefaultInfo = true"
                                class="ml-auto p-1 rounded-full hover:bg-primary/20 text-primary transition-colors"
                                title="View Default Configurations"
                            >
                                <Info class="w-4 h-4" />
                            </button>
                        </div>
                        <p class="text-sm text-muted-foreground">
                            Automatic provisioning with optimized, premade configurations. Best for quick setup.
                        </p>
                    </div>

                    <!-- Manual Mode -->
                    <div 
                        @click="provisioningMode = 'manual'"
                        :class="['p-4 border-2 rounded-xl cursor-pointer transition-all hover:shadow-md', provisioningMode === 'manual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50']"
                    >
                        <div class="flex items-center gap-3 mb-3">
                            <div class="p-2 bg-muted rounded-lg">
                                <ExternalLink class="w-5 h-5 text-muted-foreground" />
                            </div>
                            <h4 class="font-semibold text-base">Custom Setup</h4>
                        </div>
                        <p class="text-sm text-muted-foreground">
                            Link directly to the {{ provider?.toUpperCase() }} portal to create and configure resources manually.
                        </p>
                    </div>
                </div>

                <div v-if="provisioningMode === 'manual'" class="mt-6 p-4 bg-muted/50 rounded-lg border flex flex-col items-center gap-4 text-center">
                    <p class="text-sm text-muted-foreground">
                        You've chosen to configure your resources manually. Click the button below to open the {{ provider.toUpperCase() }} portal in a new tab.
                    </p>
                    <Button 
                        @click="handleOpenPortal"
                        variant="outline"
                        class="gap-2"
                    >
                        <ExternalLink class="w-4 h-4" />
                        Open {{ provider.toUpperCase() }} Portal
                    </Button>
                </div>
            </div>

            <!-- Step 6: Provisioning Progress -->
            <div v-if="currentStep === 6" class="space-y-4">
                <h3 class="text-lg font-semibold">
                    {{ provisioningComplete ? 'Provisioning Complete!' : 'Provisioning Resources...' }}
                </h3>
                
                <div v-if="loading" class="flex flex-col items-center justify-center py-8 space-y-4">
                    <Loader2 class="w-12 h-12 animate-spin text-primary" />
                    <p class="text-muted-foreground">Creating your resources...</p>
                </div>
                
                <div v-else-if="provisioningComplete" class="space-y-3">
                    <div 
                        v-for="(resource, key) in provisioningStatus" 
                        :key="key"
                        class="border rounded-lg p-4"
                    >
                        <div class="flex items-start justify-between">
                            <div>
                                <p class="font-medium capitalize">{{ key }}</p>
                                <p class="text-sm text-muted-foreground">{{ resource.status }}</p>
                                <p v-if="resource.accountName" class="text-xs text-muted-foreground mt-1">
                                    {{ resource.accountName }}
                                </p>
                            </div>
                            <Check class="w-5 h-5 text-green-500" />
                        </div>
                    </div>
                    
                    <div class="bg-primary/10 border border-primary/20 rounded-lg p-4 mt-4">
                        <p class="text-sm font-medium">Next Steps:</p>
                        <ul class="text-sm text-muted-foreground mt-2 space-y-1">
                            <li>• Resources are being created in your cloud account</li>
                            <li>• This may take 5-10 minutes to complete</li>
                            <li>• You can close this dialog and continue working</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Navigation Buttons -->
            <div class="flex items-center justify-between mt-8 pt-6 border-t">
                <Button
                    v-if="currentStep > props.initialStep && currentStep < 6"
                    @click="prevStep"
                    variant="outline"
                    class="gap-2"
                >
                    <ChevronLeft class="w-4 h-4" />
                    Back
                </Button>
                <div v-else></div>
                
                <div class="flex items-center gap-2">
                    <Button
                        v-if="currentStep === 4 || currentStep === 5"
                        @click="skipProvisioning"
                        variant="ghost"
                        :disabled="loading"
                    >
                        Skip
                    </Button>

                    <Button
                        v-if="currentStep < 6"
                        @click="nextStep"
                        :disabled="!canProceed || loading"
                        class="gap-2"
                    >
                        {{ currentStep === 5 ? (provisioningMode === 'premade' ? 'Provision' : 'Finish') : 'Next' }}
                        <ChevronRight v-if="currentStep < 5" class="w-4 h-4" />
                    </Button>
                    <Button
                        v-else
                        @click="close"
                        class="gap-2"
                    >
                        Done
                    </Button>
                </div>
            </div>
        </DialogContent>
    </Dialog>

    <!-- Default Config Info Dialog -->
    <Dialog :open="showDefaultInfo" @update:open="showDefaultInfo = false">
        <DialogContent class="max-w-md">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <Info class="w-5 h-5 text-primary" />
                    <span>Pegasus Default Configs</span>
                </DialogTitle>
                <DialogDescription>
                    These optimized settings are used when you choose Pegasus Managed provisioning.
                </DialogDescription>
            </DialogHeader>

            <div class="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                <!-- Azure Defaults -->
                <div v-if="provider === 'azure'" class="space-y-3 px-1">
                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">Azure OpenAI</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Model Deployment</span> <span class="text-foreground font-medium">gpt-4</span></li>
                            <li class="flex justify-between"><span>Pricing Tier</span> <span class="text-foreground font-medium">Standard</span></li>
                        </ul>
                    </div>

                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">CosmosDB</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Account Offer</span> <span class="text-foreground font-medium">Standard</span></li>
                            <li class="flex justify-between"><span>Capacity Mode</span> <span class="text-foreground font-medium">Serverless</span></li>
                            <li class="flex justify-between"><span>Database Name</span> <span class="text-foreground font-medium">pegasus-db</span></li>
                        </ul>
                    </div>

                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">Blob Storage</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>SKU Name</span> <span class="text-foreground font-medium">Standard_LRS</span></li>
                            <li class="flex justify-between"><span>Storage Kind</span> <span class="text-foreground font-medium">StorageV2</span></li>
                            <li class="flex justify-between"><span>Access Tier</span> <span class="text-foreground font-medium">Hot</span></li>
                        </ul>
                    </div>

                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">Data Explorer (KQL)</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Cluster SKU</span> <span class="text-foreground font-medium">Dev Tier (No SLA)</span></li>
                            <li class="flex justify-between"><span>Database Name</span> <span class="text-foreground font-medium">pegasus-kql</span></li>
                            <li class="flex justify-between"><span>Streaming Ingest</span> <span class="text-foreground font-medium">Enabled</span></li>
                        </ul>
                    </div>
                </div>

                <!-- AWS Defaults -->
                <div v-else-if="provider === 'aws'" class="space-y-3 px-1">
                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">AWS Bedrock</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Model ID</span> <span class="text-foreground font-medium">claude-3-sonnet</span></li>
                            <li class="flex justify-between"><span>Throughput</span> <span class="text-foreground font-medium">On-demand</span></li>
                        </ul>
                    </div>

                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">DynamoDB</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Billing Mode</span> <span class="text-foreground font-medium">Pay-per-request</span></li>
                            <li class="flex justify-between"><span>Partition Key</span> <span class="text-foreground font-medium">id (String)</span></li>
                        </ul>
                    </div>

                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">S3 Storage</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Storage Class</span> <span class="text-foreground font-medium">Standard</span></li>
                            <li class="flex justify-between"><span>Security</span> <span class="text-foreground font-medium">Block Public Access</span></li>
                        </ul>
                    </div>
                </div>

                <!-- GCP Defaults -->
                <div v-else-if="provider === 'gcp'" class="space-y-3 px-1">
                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">Vertex AI</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Model ID</span> <span class="text-foreground font-medium">gemini-1.5-pro</span></li>
                            <li class="flex justify-between"><span>Location</span> <span class="text-foreground font-medium">Global</span></li>
                        </ul>
                    </div>

                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">Firestore</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Database Mode</span> <span class="text-foreground font-medium">Native</span></li>
                            <li class="flex justify-between"><span>Location</span> <span class="text-foreground font-medium">Regional</span></li>
                        </ul>
                    </div>

                    <div class="p-3 bg-muted/40 rounded-lg border border-border/50">
                        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-2">Cloud Storage</p>
                        <ul class="text-sm space-y-1 text-muted-foreground">
                            <li class="flex justify-between"><span>Storage Class</span> <span class="text-foreground font-medium">Standard</span></li>
                            <li class="flex justify-between"><span>Access Control</span> <span class="text-foreground font-medium">Uniform</span></li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="flex justify-end pt-4 border-t">
                <Button @click="showDefaultInfo = false">Back to Wizard</Button>
            </div>
        </DialogContent>
    </Dialog>
</template>
