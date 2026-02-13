<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/composables/useNotifications'
import { api } from '@/lib/apiClient'
import UpgradeModal from '@/components/UpgradeModal.vue'
import { useEntitlements } from '@/composables/useEntitlements'
import { Beaker, ShieldAlert, BadgeCheck } from 'lucide-vue-next'

interface ExperimentalFeature {
  id: string
  name: string
  description: string
  category: string
  defaultEnabled: boolean
  enabled: boolean
}

const features = ref<ExperimentalFeature[]>([])
const loading = ref(true)
const hasAccess = ref(false)
const accessReason = ref<'tier' | 'pending' | 'metadata' | 'unauthorized' | null>(null)

const { subscriptionTier, fetchEntitlements } = useEntitlements()

const upgradeModalState = ref({
  open: false,
  title: 'Experimental Access Required',
  description: 'Pro+ members get exclusive access to experimental features like RAG pipelines, advanced AI reasoning, and direct Excel formula entry.',
  benefits: [
    'Knowledge Base (RAG Pipeline)',
    'Advanced Multi-step Reasoning',
    'Direct Excel Formula Entry',
    'Real-time External API Tools',
    'Query Performance Insights'
  ],
  targetTier: 'pro_plus' as const,
  limitType: undefined
})

const loadFeatures = async () => {
  try {
    const data = await api.get<any>('/api/experimental/features', { skipAuthRedirect: true })
    features.value = data.features
    hasAccess.value = true
    accessReason.value = null
  } catch (error: any) {
    if (error.status === 403 || error.message.includes('403')) {
      hasAccess.value = false
      
      const responseData = error.data || {}
      accessReason.value = responseData.reason || 'unauthorized'
      
      if (accessReason.value === 'tier') {
        upgradeModalState.value.open = true
      } else if (accessReason.value === 'metadata') {
        toast.warning('Metadata synchronization issue detected. Please contact support if this persists.')
      }
    } else {
      console.error('Failed to load experimental features:', error)
      toast.error('Failed to load experimental features')
    }
  } finally {
    loading.value = false
  }
}

const toggleFeature = async (featureId: string, enabled: boolean) => {
  try {
    await api.post(`/api/experimental/features/${featureId}/toggle`, { enabled })
    
    toast.success(enabled ? 'Feature enabled' : 'Feature disabled')
    
    // Reload user to update feature flags
    setTimeout(() => window.location.reload(), 500)
  } catch (error) {
    console.error('Failed to toggle feature:', error)
    toast.error('Failed to toggle feature')
    await loadFeatures() // Reload to reset UI
  }
}

onMounted(async () => {
  await fetchEntitlements()
  await loadFeatures()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
        <Beaker class="w-6 h-6 text-primary" />
        Experimental Features
      </h2>
      <p class="text-muted-foreground">
        Enable or disable experimental features. These features may be unstable or change without notice.
      </p>
    </div>

    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-lg mx-auto"></div>
    </div>

    <div v-else-if="!hasAccess" class="p-8 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5 shadow-sm">
      <div class="flex items-start gap-4">
        <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <ShieldAlert v-if="accessReason === 'tier'" class="w-6 h-6 text-purple-500" />
          <BadgeCheck v-else-if="accessReason === 'pending'" class="w-6 h-6 text-blue-500" />
          <Beaker v-else class="w-6 h-6 text-amber-500" />
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-foreground mb-2">
            {{ accessReason === 'tier' ? 'Pro+ Exclusive Access' : 'Experimental Access Required' }}
          </h3>
          <p class="text-muted-foreground mb-4">
            {{ accessReason === 'tier' 
               ? 'Experimental features are exclusive to our Pro+ tier. Get a first look at the future of Pegasus intelligence.' 
               : 'Experimental features are available to users who have been granted early access.' }}
          </p>
          
          <div v-if="accessReason === 'tier'" class="mt-4">
            <button 
              @click="upgradeModalState.open = true"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold transition-all hover:scale-105 shadow-lg shadow-primary/20"
            >
              Upgrade to Pro+
            </button>
          </div>
          <div v-else class="space-y-4">
            <p class="text-sm text-muted-foreground">
              {{ accessReason === 'pending' 
                 ? 'Your request is currently under review. We\'ll notify you once it\'s approved.' 
                 : 'To request access, please submit a request through our Support page.' }}
            </p>
            <router-link 
              v-if="accessReason !== 'pending'"
              to="/support" 
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20 transition-all hover:scale-105"
            >
              Request Access
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div v-for="feature in features" :key="feature.id" 
           class="p-5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all group">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-semibold text-foreground group-hover:text-primary transition-colors">{{ feature.name }}</h3>
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Experimental
              </span>
            </div>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ feature.description }}</p>
          </div>
          <Switch 
            :checked="feature.enabled" 
            @update:checked="toggleFeature(feature.id, $event)"
          />
        </div>
      </div>
    </div>

    <!-- Upgrade Modal -->
    <UpgradeModal
      v-model:open="upgradeModalState.open"
      :limit-type="upgradeModalState.limitType"
      :override-title="upgradeModalState.title"
      :override-description="upgradeModalState.description"
      :override-benefits="upgradeModalState.benefits"
      :target-tier="upgradeModalState.targetTier"
      :current-tier="subscriptionTier"
    />
  </div>
</template>
