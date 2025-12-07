<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold text-foreground mb-2">Experimental Features</h2>
      <p class="text-muted-foreground">
        Enable or disable experimental features. These features may be unstable or change without notice.
      </p>
    </div>

    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
    </div>

    <div v-else-if="!hasAccess" class="p-6 rounded-lg border border-border bg-muted/50">
      <p class="text-muted-foreground">
        You don't have access to experimental features yet. 
        <router-link to="/support" class="text-primary hover:underline">Request access</router-link>
      </p>
    </div>

    <div v-else class="space-y-4">
      <div v-for="feature in features" :key="feature.id" 
           class="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-semibold text-foreground">{{ feature.name }}</h3>
              <span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20">
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
import { toast } from 'vue-sonner'

const API_URL = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'

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
    const response = await fetch(`${API_URL}/api/experimental/features`, {
      credentials: 'include'
    })
    
    if (response.status === 403) {
      hasAccess.value = false
      return
    }
    
    const data = await response.json()
    features.value = data.features
    hasAccess.value = true
  } catch (error) {
    console.error('Failed to load experimental features:', error)
    toast.error('Failed to load experimental features')
  } finally {
    loading.value = false
  }
}

const toggleFeature = async (featureId: string, enabled: boolean) => {
  try {
    const response = await fetch(`${API_URL}/api/experimental/features/${featureId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled })
    })
    
    if (!response.ok) throw new Error('Failed to toggle feature')
    
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
