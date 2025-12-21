<template>
  <div class="w-full h-full flex flex-col text-foreground bg-background">
    <!-- Header -->
    <header class="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-background/50 backdrop-blur-sm z-10">
      <div class="flex items-center gap-4">
        <h1 class="text-lg font-bold text-primary">{{ dashboard?.title || 'Shared Dashboard' }}</h1>
        <span class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-medium border border-amber-500/20">
          Read Only Preview
        </span>
        <span v-if="dashboard" class="text-xs text-muted-foreground">
          Last updated: {{ formatDate(dashboard.updated_at) }}
        </span>
      </div>
      
      <!-- Layout Controls (View Only) -->
      <div class="flex items-center gap-2">
        <button
          @click="handleImport"
          class="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition flex items-center gap-2 shadow-sm"
        >
          <Download class="w-4 h-4" />
          Import to my Dashboards
        </button>

        <div class="w-px h-4 bg-border mx-2"></div>

        <div class="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-lg border border-border">
          <button
            @click="isCompact = !isCompact"
            class="p-1.5 rounded hover:bg-muted transition text-xs flex items-center gap-1.5"
            :class="isCompact ? 'text-primary' : 'text-muted-foreground'"
            title="Toggle Compact Mode"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2h12v4H2V2zm0 6h12v6H2V8z" opacity="0.8"/>
            </svg>
            Compact
          </button>
        </div>
      </div>
    </header>

    <!-- Main Grid -->
    <div class="flex-1 overflow-auto p-4 relative">
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>

      <div v-else-if="error" class="flex flex-col items-center justify-center h-full text-destructive">
        <p class="font-medium">Failed to load dashboard</p>
        <p class="text-sm opacity-80">{{ error }}</p>
      </div>

      <DraggableGrid
        v-else-if="dashboard"
        v-model:items="layout"
        :cols="12"
        :row-height="30"
        :gap="8"
        :is-draggable="false"
        :is-resizable="false"
        :is-locked="true"
        :vertical-compact="isCompact"
      >
        <template #item="{ item }">
          <div class="dashboard-card w-full h-full flex flex-col bg-card border border-border shadow-sm pointer-events-none">
            <div class="card-content">
              <div class="card-header">
                <div class="card-title-section">
                  <div>
                    <h3 class="card-title text-foreground font-semibold text-sm">{{ getElement(item.i)?.title }}</h3>
                  </div>
                </div>
              </div>

              <div class="card-body relative overflow-hidden">
                <ChartRenderer 
                  v-if="getElement(item.i)"
                  :type="getElement(item.i)!.type"
                  :data="getElement(item.i)!.type === 'stat' ? getElement(item.i)!.config : getElement(item.i)!.config.data"
                  :options="getElement(item.i)!.type === 'stat' ? getElement(item.i)!.config : { ...getElement(item.i)!.config.options, maintainAspectRatio: false, responsive: true }"
                  class="w-full h-full"
                />
              </div>
            </div>
          </div>
        </template>
      </DraggableGrid>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchSharedDashboard } from '@/lib/api'
import { useDashboardStore } from '@/stores/dashboard'
import DraggableGrid from '@/components/grid/DraggableGrid.vue'
import ChartRenderer from '@/components/Dashboard/ChartRenderer.vue'
import { Download } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

defineOptions({ name: 'SharedDashboard' })

const route = useRoute()
const router = useRouter()
const store = useDashboardStore()
const dashboard = ref<any>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)
const isCompact = ref(false)

const layout = computed({
  get: () => dashboard.value?.data?.layout || [],
  set: () => {} // Read-only
})

const elementsMap = computed(() => {
  const map = new Map()
  if (dashboard.value?.data?.elements) {
    dashboard.value.data.elements.forEach((el: any) => {
      map.set(el.id, el)
    })
  }
  return map
})

const getElement = (id: string) => elementsMap.value.get(id)

// Helper to safely format dates
const formatDate = (timestamp: any) => {
  if (!timestamp) return 'Never'
  
  try {
    // Handle Unix timestamp (number)
    if (typeof timestamp === 'number') {
      return new Date(timestamp * 1000).toLocaleDateString()
    }
    // Handle ISO string or other date formats
    if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleDateString()
    }
    // Fallback
    return new Date(timestamp).toLocaleDateString()
  } catch (e) {
    return 'Invalid date'
  }
}

onMounted(async () => {
  const token = route.params.token as string
  if (!token) {
    error.value = 'Invalid share link'
    isLoading.value = false
    return
  }

  try {
    dashboard.value = await fetchSharedDashboard(token)
  } catch (e: any) {
    error.value = e.message || 'Failed to load dashboard'
  } finally {
    isLoading.value = false
  }
})

const handleImport = async () => {
  if (!dashboard.value) return
  
  try {
    const id = await store.importDashboard(dashboard.value)
    toast.success('Dashboard imported successfully')
    router.push(`/dashboard/${id}`)
  } catch (e) {
    toast.error('Failed to import dashboard')
    console.error(e)
  }
}
</script>

<style scoped>
.dashboard-card {
  transition: all 0.2s ease;
  overflow: hidden;
  border-radius: 0.25rem;
}

.card-content {
  padding: 1rem;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-title-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
</style>
