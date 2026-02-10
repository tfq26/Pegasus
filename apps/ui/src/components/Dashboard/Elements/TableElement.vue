<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { QUERY_API_URL, getAuthHeaders } from '@/lib/api'
import ChatTable from '@/components/Chat/ChatTable.vue'
import { Loader2 } from 'lucide-vue-next'

interface TableConfig {
  connectionId?: string
  tableName?: string
  limit?: number
  data?: any[]
  query?: string
}

const props = defineProps<{
  config: TableConfig
  title?: string
}>()

const entries = ref<any[]>(props.config.data || [])
const loading = ref(false)
const error = ref<string | null>(null)

// Fetch table data if no static data is provided
const fetchData = async () => {
  // If we have snapshotted data, prioritize it or use it as fallback
  if (props.config.data && props.config.data.length > 0) {
    entries.value = props.config.data
    // If it's just static data, we don't need to fetch
    if (!props.config.query && !props.config.tableName) return
  }

  if (!props.config.connectionId || (!props.config.tableName && !props.config.query)) return
  
  loading.value = true
  error.value = null
  
  try {
    let url = ''
    if (props.config.query) {
       // Dedicated query execution for elements if available, otherwise fallback
       url = `${QUERY_API_URL}/query` // Simplified for now, assuming backend handles POST query or similar
       // Note: In a real scenario, this would call the execute API
    } else if (props.config.tableName) {
       url = `${QUERY_API_URL}/tables/${props.config.connectionId}/${props.config.tableName}?limit=${props.config.limit || 100}`
    }

    if (!url) return

    const res = await fetch(url, {
      method: props.config.query ? 'POST' : 'GET',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: props.config.query ? JSON.stringify({ query: props.config.query, connectionId: props.config.connectionId }) : undefined
    })
    
    if (!res.ok) throw new Error('Failed to fetch data')
    
    const data = await res.json()
    entries.value = data.rows || data || []
  } catch (e: any) {
    error.value = e.message || 'Failed to load data'
    console.error('[TableElement] Error:', e)
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
watch(() => props.config, fetchData, { deep: true })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div v-if="loading && entries.length === 0" class="flex items-center justify-center h-full">
      <Loader2 class="w-6 h-6 text-primary animate-spin" />
    </div>
    
    <div v-else-if="error" class="p-4 text-center text-destructive text-sm flex flex-col items-center justify-center h-full">
      <p>{{ error }}</p>
      <button @click="fetchData" class="mt-2 text-xs text-primary hover:underline">Retry</button>
    </div>
    
    <div v-else-if="entries.length > 0" class="flex-1 overflow-hidden p-1">
      <ChatTable 
        :data="entries" 
        :title="title" 
        :show-header="false"
        :show-footer="false"
        class="!my-0 h-full border-0 shadow-none rounded-none" 
      />
    </div>
    
    <div v-else class="flex items-center justify-center h-full text-muted-foreground text-sm italic">
      No data available
    </div>
  </div>
</template>

<style scoped>
:deep(.chat-table-container) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
:deep(.relative.overflow-x-auto) {
  flex: 1;
}
</style>
