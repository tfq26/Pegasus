<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { Loader2, RefreshCw, ExternalLink, Power, Trash2, Database, X, AlertTriangle, Plus } from 'lucide-vue-next'
import { api } from '@/lib/apiClient'
import { useAuth } from '@/composables/useAuth'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import CloudProvisionWizard from './CloudProvisionWizard.vue'

const props = defineProps<{
    providerId: string
    userId: string
}>()

const emit = defineEmits(['close'])

// State
const loading = ref(false)
const resourceGroups = ref<any[]>([])
const selectedRg = ref<string>('')
const resources = ref<any[]>([])
const loadingResources = ref(false)
const actionInProgress = ref<string | null>(null) // resourceId being acted upon

// Kusto State
const creatingKusto = ref(false)
const showAddResourceWizard = ref(false)
const currentSubId = ref<string>('')
const currentLocation = ref<string>('')

// Fetch Resource Groups
const fetchResourceGroups = async () => {
    console.log('[ResourceManager] Fetching RGs for user:', props.userId)
    if (!props.userId) return

    loading.value = true
    try {
        // First get subscriptions (assuming 1 for MVP)
        const subData = await api.get<any>(`/api/cloud-provision/${props.providerId}/subscriptions?user_id=${props.userId}`)
        console.log('[ResourceManager] Subscriptions:', subData)
        
        const subList = Array.isArray(subData) ? subData : (subData.subscriptions || [])
        
        if (subList.length > 0) {
            // Try to get saved config
            let savedSubId, savedRgName
            try {
                 const config = await api.get<any>(`/api/cloud-provision/${props.providerId}/config?user_id=${props.userId}`)
                 console.log('[ResourceManager] Saved config:', config)
                 if (config && config.resource_group) {
                     savedRgName = config.resource_group
                     savedSubId = config.subscription_id
                 }
            } catch (e) { console.warn('No saved config found') }

            const subId = savedSubId || subList[0].id
            console.log('[ResourceManager] Using Subscription ID:', subId)
            currentSubId.value = subId
            
            // Get RGs
            const rgs = await api.get<any[]>(`/api/cloud-provision/${props.providerId}/resource-groups?user_id=${props.userId}&subscription_id=${subId}`)
            console.log('[ResourceManager] RGs:', rgs)
            resourceGroups.value = rgs || []
            
            // Select stored RG if available
            if (savedRgName) {
                const found = rgs.find((r: any) => r.name === savedRgName)
                if (found) {
                    selectedRg.value = found.name
                }
            }
            
            // Fallback
            if (!selectedRg.value) {
                const defaultRg = rgs.find((r: any) => r.name === 'pegasus-resources') || rgs[0]
                if (defaultRg) {
                    selectedRg.value = defaultRg.name
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch RGs', e)
    } finally {
        loading.value = false
    }
}

// Fetch Resources
const fetchResources = async () => {
    if (!selectedRg.value) return
    loadingResources.value = true
    try {
        // Need subscription ID again (should store it)
        const subData = await api.get<any>(`/api/cloud-provision/${props.providerId}/subscriptions?user_id=${props.userId}`)
        const subList = Array.isArray(subData) ? subData : (subData.subscriptions || [])
        if (!subList.length) return
        
        const subId = subList[0].id

        const res = await api.get<any[]>(`/api/cloud-provision/${props.providerId}/resources?user_id=${props.userId}&subscription_id=${subId}&resource_group_name=${selectedRg.value}`)
        resources.value = res || []
        console.log('Resources:', res)
    } catch (e) {
        console.error('Failed to fetch resources', e)
    } finally {
        loadingResources.value = false
    }
}

// Actions
const openInPortal = (res: any) => {
    // Construct Portal URL
    let url = ''
    if (props.providerId === 'azure') {
        url = `https://portal.azure.com/#@/resource${res.id}`
    } else if (props.providerId === 'aws') {
        url = `https://console.aws.amazon.com/resource-groups/home`
    } else if (props.providerId === 'gcp') {
        url = `https://console.cloud.google.com/resources`
    }
    if (url) window.open(url, '_blank')
}

const stopResource = async (res: any) => {
    if (!confirm(`Are you sure you want to STOP ${res.name}?`)) return
    actionInProgress.value = res.id
    try {
        await api.post(`/api/cloud-provision/${props.providerId}/resource/action`, {
            user_id: props.userId,
            resource_id: res.id,
            action: 'stop' // Assumes resource supports /stop (e.g. ACI, ADX). VMs use /deallocate.
        })
        // Refresh status logic would go here
    } catch (e) {
        console.error('Failed to stop resource', e)
        alert('Failed to stop resource. Check console.')
    } finally {
        actionInProgress.value = null
    }
}

const deleteResource = async (res: any) => {
    if (!confirm(`Are you sure you want to DELETE ${res.name}? This cannot be undone.`)) return
    actionInProgress.value = res.id
    try {
        await api.delete(`/api/cloud-provision/${props.providerId}/resource?user_id=${props.userId}&resource_id=${res.id}`)
        // Remove from list
        resources.value = resources.value.filter(r => r.id !== res.id)
    } catch (e) {
        console.error('Failed to delete resource', e)
        alert('Failed to delete resource.')
    } finally {
        actionInProgress.value = null
    }
}

const provisionKusto = async () => {
    if (!confirm('Provision Azure Data Explorer (Kusto) cluster? This will incur costs.')) return
    creatingKusto.value = true
    try {
         const subData = await api.get<any>(`/api/cloud-provision/${props.providerId}/subscriptions?user_id=${props.userId}`)
         const subList = Array.isArray(subData) ? subData : (subData.subscriptions || [])
         const subId = subList.length > 0 ? subList[0].id : null
         
         if (!subId) throw new Error('No subscription found')

        await api.post(`/api/cloud-provision/${props.providerId}/provision-kusto`, {
            user_id: props.userId,
            subscription_id: subId,
            resource_group: selectedRg.value,
            cluster_name: `pegasuskusto${Math.floor(Math.random() * 10000)}`, // Random name
            location: 'eastus'
        })
        alert('Kusto provisioning started! It may take 15-30 minutes.')
        fetchResources() // It shows up as "Creating"
    } catch (e) {
        console.error('Failed to provision Kusto', e)
        alert('Failed to start provisioning.')
    } finally {
        creatingKusto.value = false
    }
}

// Watchers
watch(() => props.userId, (newVal) => {
    if (newVal) fetchResourceGroups()
})

watch(selectedRg, (newVal) => {
    if (newVal) {
        const rg = resourceGroups.value.find(r => r.name === newVal)
        if (rg) {
            currentLocation.value = rg.location
            console.log('[ResourceManager] Updated location to:', rg.location)
        }
        fetchResources()
    }
})

onMounted(() => {
    fetchResourceGroups()
})
</script>

<template>
    <div class="border rounded-xl bg-card shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <!-- Header -->
        <div class="p-6 border-b flex items-center justify-between bg-muted/20">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-background rounded-lg border shadow-sm">
                    <img v-if="providerId === 'azure'" src="/icons/microsoft/Azure/azure-2.svg" class="w-6 h-6" />
                    <img v-else-if="providerId === 'aws'" src="/icons/aws/aws-colored-black-text.svg" class="w-6 h-6" />
                    <img v-else-if="providerId === 'gcp'" src="/icons/google/GCP/icons8-google-cloud.svg" class="w-6 h-6" />
                </div>
                <div>
                    <h3 class="font-semibold text-lg">Resource Manager</h3>
                    <p class="text-xs text-muted-foreground hidden sm:block">Manage your {{ providerId.toUpperCase() }} cloud resources</p>
                </div>
            </div>
            <button @click="$emit('close')" class="p-2 hover:bg-muted rounded-full transition-colors">
                <X class="w-5 h-5 text-muted-foreground" />
            </button>
        </div>

        <div class="p-6 space-y-6">
            <!-- Controls -->
            <div class="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div class="flex flex-col gap-1.5 w-full sm:w-auto">
                    <label class="text-xs font-medium text-muted-foreground uppercase">Resource Group</label>
                     <div class="relative w-full sm:w-64">
                        <Select v-model="selectedRg" :disabled="loading">
                            <SelectTrigger class="w-full h-10 bg-background/50 border-input">
                                <SelectValue placeholder="Select Resource Group" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="rg in resourceGroups" :key="rg.id" :value="rg.name">
                                    {{ rg.name }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <Loader2 v-if="loading" class="absolute right-9 top-2.5 w-4 h-4 animate-spin text-muted-foreground z-10" />
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <Button 
                        @click="showAddResourceWizard = true"
                        variant="default"
                        size="sm"
                        class="gap-2"
                        :disabled="!selectedRg"
                    >
                        <Plus class="w-4 h-4" />
                        New Resource
                    </Button>
                    <Button 
                        @click="fetchResources" 
                        variant="outline" 
                        size="sm"
                        :disabled="loadingResources || !selectedRg"
                        title="Refresh Resources"
                    >
                        <RefreshCw :class="['w-4 h-4 mr-1', loadingResources ? 'animate-spin' : '']" />
                        Refresh
                    </Button>
                </div>
            </div>

            <!-- Resource List -->
            <div class="border rounded-lg bg-background/50 min-h-[200px] relative">
                <div v-if="loadingResources && resources.length === 0" class="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                    <Loader2 class="w-8 h-8 animate-spin text-primary" />
                </div>

                <div v-if="!loadingResources && resources.length === 0" class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <div class="p-3 bg-muted rounded-full mb-3">
                        <Database class="w-6 h-6 opacity-50" />
                    </div>
                    <p class="font-medium">No resources found</p>
                    <p class="text-sm">Select a resource group or provision new resources.</p>
                </div>

                <div v-else class="divide-y">
                     <!-- Header -->
                    <div class="grid grid-cols-12 gap-4 p-3 text-xs font-medium text-muted-foreground bg-muted/30 uppercase tracking-wider">
                        <div class="col-span-5">Name / Type</div>
                        <div class="col-span-3">Location</div>
                        <div class="col-span-4 text-right">Actions</div>
                    </div>

                    <!-- Items -->
                    <div v-for="res in resources" :key="res.id" class="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/30 transition-colors group">
                        <div class="col-span-5 overflow-hidden">
                            <div class="font-medium truncate flex items-center gap-2">
                                {{ res.name }}
                            </div>
                            <div class="text-xs text-muted-foreground truncate" :title="res.type">{{ res.type.split('/').pop() }}</div>
                        </div>
                        <div class="col-span-3 text-sm text-muted-foreground">
                            {{ res.location }}
                        </div>
                        <div class="col-span-4 flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                             <button 
                                @click="openInPortal(res)"
                                class="p-1.5 hover:bg-sky-100 hover:text-sky-600 dark:hover:bg-sky-900/30 rounded-md transition-colors"
                                :title="`Open in ${providerId.toUpperCase()} Portal`"
                            >
                                <ExternalLink class="w-4 h-4" />
                            </button>
                            <button 
                                v-if="res.type.includes('ContainerInstance') || res.type.includes('Kusto')"
                                @click="stopResource(res)"
                                :disabled="actionInProgress === res.id"
                                class="p-1.5 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-900/30 rounded-md transition-colors"
                                title="Pause/Stop Resource"
                            >
                                <Power class="w-4 h-4" />
                            </button>
                            <button 
                                @click="deleteResource(res)"
                                :disabled="actionInProgress === res.id"
                                class="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors"
                                title="Delete Resource"
                            >
                                <Trash2 v-if="actionInProgress !== res.id" class="w-4 h-4" />
                                <Loader2 v-else class="w-4 h-4 animate-spin" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle class="w-3.5 h-3.5" />
                <span>Modifying cloud resources may impact running services. Use caution.</span>
            </div>
        </div>

        <CloudProvisionWizard
            v-model:open="showAddResourceWizard"
            :provider="providerId as any"
            :user-id="userId"
            :initial-step="4"
            :subscription-id="currentSubId"
            :location="currentLocation"
            :resource-group-name="selectedRg"
            @complete="fetchResources"
        />
    </div>
</template>
