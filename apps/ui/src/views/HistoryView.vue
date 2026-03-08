<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ChatHistoryList from '@/components/Explorer/ChatHistoryList.vue'
import QueryLogList from '@/components/Explorer/QueryLogList.vue'
import { api, fetchChats, fetchQueries } from '@/lib/api'
import { useRouter } from 'vue-router'

const router = useRouter()
const activeTab = ref<'chats' | 'queries'>('chats')
const chats = ref<any[]>([])
const queryHistory = ref<any[]>([])
const loading = ref(true)

const loadData = async () => {
  loading.value = true
  try {
    const [c, q] = await Promise.all([
      fetchChats(),
      fetchQueries()
    ])
    // api returns { chats: [...] } or just array? 
    // fetchChats returns array based on lib/api.ts
    // fetchQueries returns body... need to check response format
    chats.value = c as any[] 
    
    // fetchQueries returns api.get('/queries'). body.queries?
    // Let's assume it returns { queries: [] } or []
    // Actually looking at api.ts: return api.get('/queries')
    // We might need to adjust based on actual response.
    const qRes = q as any
    queryHistory.value = qRes.queries || qRes || []
    
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})

const handleSelectChat = (id: string) => {
    // Navigate to query view with chatId pre-selected
    router.push({ path: '/query', query: { chatId: id } })
}

const handleLoadQuery = (query: string, cid?: string) => {
    // Copy to clipboard for convenience
    navigator.clipboard.writeText(query)
    // Navigate to query view with query and connection pre-filled
    const queryParams: any = { q: query }
    if (cid) queryParams.cid = cid
    router.push({ path: '/query', query: queryParams })
}

</script>

<template>
  <div class="h-full flex flex-col bg-background p-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold mb-2">History</h1>
      <p class="text-muted-foreground">Global history of all your conversations and data queries.</p>
    </header>
    
    <div class="flex items-center gap-2 mb-4 bg-muted/40 p-1 rounded-lg w-fit">
        <button 
            @click="activeTab = 'chats'"
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="activeTab === 'chats' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
        >
            Chats
        </button>
        <button 
            @click="activeTab = 'queries'"
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="activeTab === 'queries' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
        >
            Queries
        </button>
    </div>
    
    <div class="flex-1 overflow-hidden border border-border rounded-xl bg-card">
        <div v-if="loading" class="h-full flex items-center justify-center text-muted-foreground">
            Loading...
        </div>
        
        <div v-else-if="activeTab === 'chats'" class="h-full overflow-y-auto">
            <ChatHistoryList 
                :chats="chats" 
                @select-chat="handleSelectChat"
            />
        </div>
        
        <div v-else class="h-full overflow-y-auto">
            <QueryLogList 
                :query-history="queryHistory"
                @load-query="handleLoadQuery"
            />
        </div>
    </div>
  </div>
</template>
