<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { 
  ExternalLink, 
  Settings, 
  ChevronRight,
  ChevronDown,
  Globe,
  ShieldCheck,
  Key,
  Cloud,
  Info,
  Sparkles
} from 'lucide-vue-next'
import type { SettingsModel } from './types'

const props = defineProps<{
  settings: SettingsModel
}>()

const router = useRouter()
const showAzureDetails = ref(false)
const showAWSDetails = ref(false)

const openDoc = (slug: string) => {
  router.push(`/docs/guide/${slug}`)
}

const azureStatus = computed(() => {
  const creds = props.settings.azureCredentials
  if (creds?.tenantId && creds?.clientId && creds?.clientSecret) return 'connected'
  return 'missing'
})

const awsStatus = computed(() => {
  const creds = props.settings.awsCredentials
  if (creds?.accessKeyId && creds?.secretAccessKey) return 'connected'
  return 'missing'
})
</script>

<template>
  <div class="space-y-8 max-w-4xl">
    <div>
      <h2 class="text-2xl font-bold tracking-tight text-foreground mb-2">Linked Accounts</h2>
      <p class="text-sm text-muted-foreground">Manage your cloud infrastructure credentials. These are used for automated database provisioning and Kusto integration.</p>
    </div>

    <!-- Azure / Microsoft Section -->
    <div class="rounded-2xl border border-border bg-card/30 backdrop-blur-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/10">
      <div class="p-6">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-5">
            <div class="p-4 rounded-2xl bg-violet-600/10 border border-violet-500/20 backdrop-blur-md shadow-inner">
              <img src="/icons/microsoft/microsoft-purple.svg" class="w-10 h-10 object-contain" alt="Azure" />
            </div>
            <div>
              <div class="flex items-center gap-3">
                <h3 class="text-xl font-bold text-foreground">Microsoft Azure</h3>
                <span :class="[
                  'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                  azureStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-stone-500/10 text-stone-500 border border-stone-500/20'
                ]">
                  {{ azureStatus === 'connected' ? 'Configured' : 'Missing Credentials' }}
                </span>
              </div>
              <p class="text-sm text-muted-foreground mt-1 mx-w-md">
                Used for Azure Container Instance (ACI) automation and Azure Data Explorer (Kusto).
              </p>
              <button 
                @click="openDoc('azure-credentials')"
                class="inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors mt-3"
              >
                <ExternalLink class="w-3.5 h-3.5" /> View Setup Guide
              </button>
            </div>
          </div>
          
          <button 
            @click="showAzureDetails = !showAzureDetails"
            class="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <Settings class="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div v-if="showAzureDetails" class="mt-8 space-y-6 pt-6 border-t border-border/50 animate-in slide-in-from-top-4 duration-300">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                <Globe class="w-3 h-3" /> Tenant ID
              </label>
              <input 
                v-model="props.settings.azureCredentials!.tenantId" 
                placeholder="00000000-0000-0000-0000-000000000000"
                class="w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary outline-none" 
              />
            </div>
            <div class="space-y-2">
              <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                <ShieldCheck class="w-3 h-3" /> Client ID
              </label>
              <input 
                v-model="props.settings.azureCredentials!.clientId" 
                placeholder="00000000-0000-0000-0000-000000000000"
                class="w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary outline-none" 
              />
            </div>
          </div>
          
          <div class="space-y-2">
            <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
              <Key class="w-3 h-3" /> Client Secret
            </label>
            <input 
              v-model="props.settings.azureCredentials!.clientSecret" 
              type="password"
              placeholder="••••••••••••••••••••••••••••"
              class="w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary outline-none" 
            />
          </div>

          <div class="space-y-2">
            <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
              <Cloud class="w-3 h-3" /> Subscription ID
            </label>
            <input 
              v-model="props.settings.azureCredentials!.subscriptionId" 
              placeholder="00000000-0000-0000-0000-000000000000"
              class="w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary outline-none" 
            />
          </div>
          
          <div class="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
            <Info class="w-5 h-5 text-primary mt-0.5" />
            <p class="text-xs text-muted-foreground leading-relaxed">
              These credentials will be automatically used when you provision a new SurrealDB instance on Azure.
              They are also optionally shared with Kusto connections to simplify your setup.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- AWS Section -->
    <div class="rounded-2xl border border-border bg-card/30 backdrop-blur-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/10">
      <div class="p-6">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-5">
            <div class="p-4 rounded-2xl bg-violet-600/10 border border-violet-500/20 backdrop-blur-md shadow-inner">
              <img src="/icons/aws/aws-purple.svg" class="w-10 h-10 object-contain" alt="AWS" />
            </div>
            <div>
              <div class="flex items-center gap-3">
                <h3 class="text-xl font-bold text-foreground">AWS (Amazon Web Services)</h3>
                <span :class="[
                  'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                  awsStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-stone-500/10 text-stone-500 border border-stone-500/20'
                ]">
                  {{ awsStatus === 'connected' ? 'Configured' : 'Missing Credentials' }}
                </span>
              </div>
              <p class="text-sm text-muted-foreground mt-1 mx-w-md">
                Used for ECS Fargate automation to host SurrealDB on your AWS infrastructure.
              </p>
              <button 
                @click="openDoc('aws-credentials')"
                class="inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors mt-3"
              >
                <ExternalLink class="w-3.5 h-3.5" /> View Setup Guide
              </button>
            </div>
          </div>
          
          <button 
            @click="showAWSDetails = !showAWSDetails"
            class="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <Settings class="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div v-if="showAWSDetails" class="mt-8 space-y-6 pt-6 border-t border-border/50 animate-in slide-in-from-top-4 duration-300">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                <Globe class="w-3 h-3" /> Access Key ID
              </label>
              <input 
                v-model="props.settings.awsCredentials!.accessKeyId" 
                placeholder="AKIA..."
                class="w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary outline-none" 
              />
            </div>
            <div class="space-y-2">
              <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                <Key class="w-3 h-3" /> Secret Access Key
              </label>
              <input 
                v-model="props.settings.awsCredentials!.secretAccessKey" 
                type="password"
                placeholder="••••••••••••••••••••••••••••"
                class="w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary outline-none" 
              />
            </div>
          </div>
          
          <div class="space-y-2">
            <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
              <Globe class="w-3 h-3" /> Default Region
            </label>
            <input 
              v-model="props.settings.awsCredentials!.region" 
              placeholder="us-east-1"
              class="w-full bg-background/50 border border-border rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary outline-none" 
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Latest Releases Link -->
    <div class="mt-12 p-6 rounded-2xl border border-border bg-violet-600/5 backdrop-blur-sm flex items-center justify-between group cursor-pointer hover:border-violet-500/50 transition-all duration-300" @click="router.push('/docs/release/v0.7.1')">
      <div class="flex items-center gap-4">
        <div class="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 group-hover:scale-110 transition-transform">
          <Sparkles class="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-foreground">What's New in Pegasus?</h3>
          <p class="text-xs text-muted-foreground">Check out the latest features and updates in v0.7.1</p>
        </div>
      </div>
      <ChevronRight class="w-5 h-5 text-muted-foreground group-hover:text-violet-500 group-hover:translate-x-1 transition-all" />
    </div>
  </div>
</template>
