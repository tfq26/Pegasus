<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-xl bg-card border-border shadow-2xl overflow-y-auto max-h-[90vh]">
      <DialogHeader>
        <DialogTitle class="text-xl font-bold flex items-center gap-2">
          <Zap class="w-5 h-5 text-amber-500" />
          Provision SurrealDB Instance
        </DialogTitle>
        <DialogDescription>
          Choose how you want to set up your SurrealDB environment.
        </DialogDescription>
      </DialogHeader>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
        <!-- Option 1: Managed -->
        <div 
          @click="activeMode = 'managed'" 
          :class="[
            'p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-3 group',
            activeMode === 'managed' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          ]"
        >
          <div class="flex items-center justify-between">
            <Cloud class="w-8 h-8 text-primary transition-transform group-hover:scale-110" />
            <div v-if="activeMode === 'managed'" class="bg-primary text-primary-foreground px-2 py-0.5 rounded text-[10px] font-bold">SELECTED</div>
          </div>
          <div>
            <h3 class="font-bold text-sm">Managed Cloud</h3>
            <p class="text-[10px] text-muted-foreground mt-1">Provision on Pegasus infrastructure in seconds.</p>
          </div>
        </div>

        <!-- Option 2: Azure Auto -->
        <div 
          @click="activeMode = 'azure_auto'"
          :class="[
            'p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-3 group',
            activeMode === 'azure_auto' ? 'border-violet-500 bg-violet-600/10 backdrop-blur-md' : 'border-border hover:border-violet-500/50'
          ]"
        >
          <div class="flex justify-between">
            <img src="/icons/microsoft/microsoft-purple.svg" class="w-8 h-8 object-contain transition-transform group-hover:scale-110" alt="Azure" />
            <div v-if="activeMode === 'azure_auto'" class="bg-primary text-primary-foreground px-2 py-0.5 rounded text-[10px] font-bold">AUTOMATED</div>
          </div>
          <div>
            <h3 class="font-bold text-sm">Azure Automation</h3>
            <p class="text-[10px] text-muted-foreground mt-1">Deploy to Azure Container Instances (ACI) automatically.</p>
          </div>
        </div>

        <!-- Option 3: AWS Auto -->
        <div 
          @click="activeMode = 'aws_auto'"
          :class="[
            'p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-3 group',
            activeMode === 'aws_auto' ? 'border-violet-500 bg-violet-600/10 backdrop-blur-md' : 'border-border hover:border-violet-500/50'
          ]"
        >
          <div class="flex justify-between">
            <img src="/icons/aws/aws-purple.svg" class="w-8 h-8 object-contain transition-transform group-hover:scale-110" alt="AWS" />
            <div v-if="activeMode === 'aws_auto'" class="bg-primary text-primary-foreground px-2 py-0.5 rounded text-[10px] font-bold">AUTOMATED</div>
          </div>
          <div>
            <h3 class="font-bold text-sm">AWS Automation</h3>
            <p class="text-[10px] text-muted-foreground mt-1">Deploy to AWS ECS Fargate automatically.</p>
          </div>
        </div>

        <!-- Option 4: Local -->
        <div 
          @click="activeMode = 'local'"
          :class="[
            'p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-3 group',
            activeMode === 'local' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          ]"
        >
          <div class="flex justify-between">
            <Terminal class="w-8 h-8 text-stone-500 transition-transform group-hover:rotate-6" />
            <div v-if="activeMode === 'local'" class="bg-primary text-primary-foreground px-2 py-0.5 rounded text-[10px] font-bold">SELECTED</div>
          </div>
          <div>
            <h3 class="font-bold text-sm">Local Machine</h3>
            <p class="text-[10px] text-muted-foreground mt-1">Run SurrealDB locally using Docker.</p>
          </div>
        </div>
      </div>

      <!-- Managed Config -->
      <div v-if="activeMode === 'managed'" class="space-y-4 animate-in slide-in-from-top-2 duration-300">
        <div class="space-y-1.5">
          <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Instance Nickname</label>
          <input v-model="managedNickname" placeholder="e.g. MyProductionDB" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      <!-- Azure Automation Form -->
      <div v-if="activeMode === 'azure_auto'" class="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
        <div class="flex items-center justify-between">
            <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest leading-none">Azure Credentials</label>
            <button @click="importFromSettings('azure')" class="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                <Link2 class="w-3 h-3" /> Import from Linked Accounts
            </button>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <input v-model="azureCreds.tenantId" placeholder="Tenant ID" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-[10px] font-mono outline-none" />
          <input v-model="azureCreds.clientId" placeholder="Client ID" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-[10px] font-mono outline-none" />
        </div>
        <input v-model="azureCreds.clientSecret" type="password" placeholder="Client Secret" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-[10px] font-mono outline-none" />
        <div class="grid grid-cols-2 gap-4">
          <input v-model="azureCreds.subscriptionId" placeholder="Subscription ID" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-[10px] font-mono outline-none" />
          <input v-model="azureConfig.resourceGroup" placeholder="Resource Group (e.g. Pegasus)" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none" />
        </div>
      </div>

      <!-- AWS Automation Form -->
      <div v-if="activeMode === 'aws_auto'" class="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
        <div class="flex items-center justify-between">
            <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest leading-none">AWS Credentials</label>
            <button @click="importFromSettings('aws')" class="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                <Link2 class="w-3 h-3" /> Import from Linked Accounts
            </button>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <input v-model="awsCreds.accessKeyId" placeholder="Access Key ID" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-[10px] font-mono outline-none" />
          <input v-model="awsCreds.secretAccessKey" type="password" placeholder="Secret Access Key" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-[10px] font-mono outline-none" />
        </div>
        <div class="grid grid-cols-2 gap-4">
            <input v-model="awsCreds.region" placeholder="Region (e.g. us-east-1)" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none" />
            <input v-model="awsConfig.clusterName" placeholder="ECS Cluster Name" class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none" />
        </div>
      </div>

      <!-- Local Guide -->
      <div v-if="activeMode === 'local'" class="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
        <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Docker Command</label>
        <code class="block p-3 bg-muted rounded-lg text-[10px] font-mono break-all pr-12 relative group">
          {{ localCommand }}
          <button @click="copyCommand(localCommand)" class="absolute right-2 top-2 p-1.5 hover:bg-background rounded-md transition-colors"><Copy class="w-4 h-4 text-muted-foreground" /></button>
        </code>
      </div>

      <DialogFooter class="pt-4 border-t border-border flex flex-col sm:flex-row gap-3">
        <button @click="$emit('update:open', false)" class="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors border border-border">Cancel</button>
        <button 
          v-if="activeMode !== 'local'"
          @click="handleProvision"
          :disabled="isProvisioning"
          class="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          <Loader2 v-if="isProvisioning" class="w-4 h-4 animate-spin" />
          {{ isProvisioning ? 'Working...' : 'Provision Now' }}
        </button>
        <button v-else @click="$emit('update:open', false)" class="px-6 py-2 bg-violet-600 text-white font-bold rounded-lg hover:bg-violet-500 transition-all">I've Started It</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Cloud, Terminal, Zap, Info, Copy, Loader2, Bot, Link2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { api } from '@/lib/apiClient'
import type { SettingsModel } from '@/views/settings/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits(['update:open', 'provisioned'])

const activeMode = ref<'managed' | 'local' | 'azure_auto' | 'aws_auto'>('managed')
const managedNickname = ref('')
const isProvisioning = ref(false)
const cachedSettings = ref<SettingsModel | null>(null)

const azureCreds = reactive({ tenantId: '', clientId: '', clientSecret: '', subscriptionId: '' })
const azureConfig = reactive({ resourceGroup: 'PegasusSurreal', containerName: 'surreal-db', dnsLabel: `surreal-${Math.random().toString(36).substring(7)}`, location: 'eastus' })

const awsCreds = reactive({ accessKeyId: '', secretAccessKey: '', region: 'us-east-1' })
const awsConfig = reactive({ clusterName: 'default', taskDefinitionName: 'surrealdb' })

const localCommand = 'docker run --rm -p 8000:8000 surrealdb/surrealdb:latest start --user root --pass root'

onMounted(async () => {
    try {
        const res = await api.get<any>('/settings')
        if (res.settings) cachedSettings.value = res.settings
    } catch (e) {
        console.error('Failed to load settings in ProvisionModal')
    }
})

const importFromSettings = (type: 'azure' | 'aws') => {
    if (!cachedSettings.value) {
        toast.error('Could not find stored settings. Please configure "Linked Accounts" first.')
        return
    }

    if (type === 'azure' && cachedSettings.value.azureCredentials) {
        Object.assign(azureCreds, cachedSettings.value.azureCredentials)
        toast.success('Azure credentials imported from Linked Accounts')
    } else if (type === 'aws' && cachedSettings.value.awsCredentials) {
        Object.assign(awsCreds, cachedSettings.value.awsCredentials)
        toast.success('AWS credentials imported from Linked Accounts')
    } else {
        toast.error(`No ${type.toUpperCase()} credentials found in your Linked Accounts.`)
    }
}

const handleProvision = async () => {
  isProvisioning.value = true
  try {
    let data;
    if (activeMode.value === 'managed') {
      data = await api.post<any>('/provision/managed', { nickname: managedNickname.value })
    } else if (activeMode.value === 'azure_auto') {
      data = await api.post<any>('/provision/azure', { credentials: { ...azureCreds }, config: { ...azureConfig } })
    } else {
      data = await api.post<any>('/provision/aws', { credentials: { ...awsCreds }, config: { ...awsConfig } })
    }
    
    if (data.error) throw new Error(data.error)
    
    toast.success('Successfully provisioned SurrealDB instance!', {
      description: data.fqdn ? `Host: ${data.fqdn}` : data.taskArn ? `ECS Task: ${data.taskArn}` : 'Success'
    })
    
    emit('provisioned', {
      nickname: managedNickname.value || azureConfig.containerName || 'SurrealDB Instance',
      config: data.config
    })
    
    emit('update:open', false)
  } catch (e: any) {
    toast.error('Provisioning failed: ' + e.message)
  } finally {
    isProvisioning.value = false
  }
}

const copyCommand = (cmd: string) => {
  navigator.clipboard.writeText(cmd)
  toast.success('Command copied to clipboard')
}
</script>
