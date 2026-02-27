<template>
  <div v-if="parameters && Object.keys(parameters).length > 0" class="px-6 py-2 border-b border-border bg-card/40 flex flex-wrap items-center gap-4">
    <div v-for="(val, key) in parameters" :key="key" class="flex items-center gap-2">
      <label :for="'param-' + key" class="text-xs font-medium text-muted-foreground  tracking-wider">{{ key }}</label>
      
      <!-- Date Picker (if key contains date) -->
      <div v-if="key.toLowerCase().includes('date')" class="relative">
         <input 
           type="date" 
           :id="'param-' + key"
           :value="val"
           @input="(e) => updateParam(key, (e.target as HTMLInputElement).value)"
           class="h-8 bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
         />
      </div>
      
      <!-- Standard Input -->
      <input 
        v-else
        type="text" 
        :id="'param-' + key"
        :value="val"
        @input="(e) => updateParam(key, (e.target as HTMLInputElement).value)"
        @keydown.enter="handleRefresh"
        class="h-8 w-32 bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
    
    <button 
      @click="handleRefresh"
      class="ml-auto p-1.5 rounded-md hover:bg-muted text-primary transition-colors flex items-center gap-2 text-xs font-medium"
      title="Apply Parameters"
    >
      <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isRefreshing }" />
      Apply Filters
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { RefreshCw } from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'

const store = useDashboardStore()
const isRefreshing = ref(false)

const parameters = computed(() => store.parameters)

const updateParam = (key: string, value: any) => {
  store.updateParameter(key, value)
}

const handleRefresh = async () => {
  isRefreshing.value = true
  try {
    await store.refreshDashboard(true)
    toast.success('Dashboard updated')
  } catch (e) {
    toast.error('Failed to update dashboard')
  } finally {
    isRefreshing.value = false
  }
}
</script>
