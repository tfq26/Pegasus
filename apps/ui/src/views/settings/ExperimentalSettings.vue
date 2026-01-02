<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-foreground mb-2">Experimental Features</h2>
      <p class="text-muted-foreground">
        Enable or disable experimental features. These features may be unstable or change without notice.
      </p>
    </div>

    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-lg mx-auto"></div>
    </div>

    <div v-else-if="!hasAccess" class="p-8 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
      <div class="flex items-start gap-4">
        <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 9v4" /><path d="M12 17h.01" />
            <path d="M3.586 15.096L2.132 18.33a2 2 0 0 0 2.098 2.817l14.22-2.094a2 2 0 0 0 1.683-1.683l2.094-14.22a2 2 0 0 0-2.817-2.098L16.096 2.585a2 2 0 0 0-.992.585L3.586 14.688a2 2 0 0 0 0 .408Z" />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-foreground mb-2">Experimental Access Required</h3>
          <p class="text-muted-foreground mb-4">
            Experimental features are available to users who have been granted early access. 
            These features may be unstable or change without notice, but they give you a first look at what's coming next.
          </p>
          <p class="text-sm text-muted-foreground mb-6">
            To request access, please submit a request through our Support page. 
            We'll review your request and notify you once access has been granted.
          </p>
          <router-link 
            to="/support" 
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20 transition-all hover:scale-105"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Request Experimental Access
          </router-link>
        </div>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div v-for="feature in features" :key="feature.id" 
           class="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-semibold text-foreground">{{ feature.name }}</h3>
              <span class="px-2 py-0.5 rounded-lg text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Experimental
              </span>
            </div>
            <p class="text-sm text-muted-foreground">{{ feature.description }}</p>
          </div>
          <Switch 
            :checked="feature.enabled" 
            @update:checked="toggleFeature(feature.id, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/composables/useNotifications'
import { api } from '@/lib/apiClient'

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

const loadFeatures = async () => {
  try {
    const data = await api.get<any>('/api/experimental/features', { skipAuthRedirect: true })
    features.value = data.features
    hasAccess.value = true
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message.includes('403')) {
      hasAccess.value = false
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
    window.location.reload()
  } catch (error) {
    console.error('Failed to toggle feature:', error)
    toast.error('Failed to toggle feature')
    await loadFeatures() // Reload to reset UI
  }
}

onMounted(loadFeatures)
</script>
