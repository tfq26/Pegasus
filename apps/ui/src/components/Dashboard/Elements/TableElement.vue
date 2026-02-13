<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { QUERY_API_URL, getAuthHeaders } from '@/lib/api'
import ChatTable from '@/components/Chat/ChatTable.vue'
import { Loader2, Table as TableIcon } from 'lucide-vue-next'

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
       url = `${QUERY_API_URL}/query`
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
  <div class="flex flex-col h-full overflow-hidden bg-card/10 rounded-xl transition-all duration-300">
    <!-- Skeleton Loading -->
    <div v-if="loading && entries.length === 0" class="flex flex-col h-full p-6 space-y-4 animate-in fade-in duration-500">
      <div class="flex items-center space-x-4 mb-2">
        <div class="h-8 w-1/3 bg-muted/40 rounded-lg animate-pulse"></div>
        <div class="h-8 w-1/4 bg-muted/20 rounded-lg animate-pulse"></div>
      </div>
      <div v-for="i in 5" :key="i" class="h-10 w-full bg-muted/10 rounded-lg animate-pulse" :style="{ opacity: 1 - (i * 0.15) }"></div>
      <div class="flex-1 flex items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <Loader2 class="w-8 h-8 text-primary/40 animate-spin" />
          <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">Fetching Data</span>
        </div>
      </div>
    </div>
    
    <!-- Error State -->
    <div v-else-if="error" class="p-8 text-center flex flex-col items-center justify-center h-full animate-in zoom-in duration-300">
      <div class="w-16 h-16 rounded-full bg-destructive/5 flex items-center justify-center mb-4">
        <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <span class="text-destructive font-bold text-xl">!</span>
        </div>
      </div>
      <h4 class="text-sm font-bold text-foreground mb-2">Query Failed</h4>
      <p class="text-xs text-muted-foreground max-w-[200px] mb-6 leading-relaxed">{{ error }}</p>
      <button 
        @click="fetchData" 
        class="px-6 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 border border-border/50"
      >
        Retry Connection
      </button>
    </div>
    
    <!-- Data Display -->
    <div v-else-if="entries.length > 0" class="flex-1 overflow-hidden p-0 relative animate-in fade-in duration-700">
      <ChatTable 
        :data="entries" 
        :title="title" 
        :show-header="false"
        :show-footer="false"
        class="!my-0 h-full border-0 shadow-none rounded-none w-full" 
      />
      <!-- Subtle Gradient Overlay for Scroll Hint -->
      <div class="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card/30 to-transparent pointer-events-none"></div>
    </div>
    
    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in zoom-in duration-500">
      <div class="w-20 h-20 rounded-3xl bg-muted/20 flex items-center justify-center mb-4 border border-border/40">
        <TableIcon class="w-10 h-10 text-muted-foreground/40" />
      </div>
      <h4 class="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/60">No Results</h4>
      <p class="text-[10px] text-muted-foreground/40 mt-2 max-w-[180px]">Your query returned zero rows. Check your connection or filters.</p>
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
