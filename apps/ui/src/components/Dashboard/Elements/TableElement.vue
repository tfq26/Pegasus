<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Table, RefreshCw, Search, Loader2, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { QUERY_API_URL, getAuthHeaders } from '@/lib/api'

interface TableConfig {
  connectionId: string
  tableName: string
  limit?: number
}

const props = defineProps<{
  config: TableConfig
}>()

const entries = ref<any[]>([])
const columns = ref<string[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const sortColumn = ref<string | null>(null)
const sortDirection = ref<'asc' | 'desc'>('asc')
const currentPage = ref(1)
const rowsPerPage = ref(10)

// Fetch table data
const fetchData = async () => {
  if (!props.config.connectionId || !props.config.tableName) return
  
  loading.value = true
  error.value = null
  
  try {
    const res = await fetch(`${QUERY_API_URL}/tables/${props.config.connectionId}/${props.config.tableName}?limit=${props.config.limit || 100}`, {
      headers: getAuthHeaders()
    })
    
    if (!res.ok) throw new Error('Failed to fetch data')
    
    const data = await res.json()
    entries.value = data.rows || data || []
    
    // Extract columns from first row
    if (entries.value.length > 0) {
      columns.value = Object.keys(entries.value[0]).filter(k => 
        k !== 'id' && k !== '__id' && k !== '_row_order'
      )
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load data'
    console.error('[TableElement] Error:', e)
  } finally {
    loading.value = false
  }
}

// Filtered and sorted data
const processedRows = computed(() => {
  let rows = [...entries.value]
  
  // Filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    rows = rows.filter(row => 
      Object.values(row).some(v => 
        String(v).toLowerCase().includes(q)
      )
    )
  }
  
  // Sort
  if (sortColumn.value) {
    const col = sortColumn.value
    const dir = sortDirection.value
    rows.sort((a, b) => {
      const aVal = a[col]
      const bVal = b[col]
      if (aVal == null) return dir === 'asc' ? 1 : -1
      if (bVal == null) return dir === 'asc' ? -1 : 1
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return dir === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }
  
  return rows
})

// Pagination
const totalPages = computed(() => Math.ceil(processedRows.value.length / rowsPerPage.value))
const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * rowsPerPage.value
  return processedRows.value.slice(start, start + rowsPerPage.value)
})

const toggleSort = (col: string) => {
  if (sortColumn.value === col) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = col
    sortDirection.value = 'asc'
  }
}

const formatValue = (val: any) => {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

onMounted(fetchData)

watch(() => props.config, fetchData, { deep: true })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="p-2 border-b border-border flex items-center gap-2 bg-muted/30">
      <div class="relative flex-1">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter..."
          class="w-full pl-8 pr-2 py-1 bg-background border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        @click="fetchData"
        :disabled="loading"
        class="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Refresh"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" />
      </button>
    </div>
    
    <!-- Table -->
    <div class="flex-1 overflow-auto">
      <div v-if="loading && entries.length === 0" class="flex items-center justify-center h-full">
        <Loader2 class="w-6 h-6 text-primary animate-spin" />
      </div>
      
      <div v-else-if="error" class="p-4 text-center text-destructive text-sm">
        {{ error }}
      </div>
      
      <table v-else-if="entries.length > 0" class="w-full text-xs">
        <thead class="sticky top-0 bg-card z-10">
          <tr>
            <th
              v-for="col in columns"
              :key="col"
              @click="toggleSort(col)"
              class="px-2 py-1.5 text-left font-medium text-muted-foreground border-b border-border cursor-pointer hover:text-foreground transition-colors"
            >
              <div class="flex items-center gap-1">
                {{ col }}
                <ChevronUp v-if="sortColumn === col && sortDirection === 'asc'" class="w-3 h-3" />
                <ChevronDown v-else-if="sortColumn === col && sortDirection === 'desc'" class="w-3 h-3" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in paginatedRows"
            :key="idx"
            class="hover:bg-muted/50 transition-colors"
          >
            <td
              v-for="col in columns"
              :key="col"
              class="px-2 py-1.5 border-b border-border truncate max-w-[150px]"
              :title="formatValue(row[col])"
            >
              {{ formatValue(row[col]) }}
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-else class="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Table class="w-5 h-5 mr-2" />
        No data
      </div>
    </div>
    
    <!-- Footer -->
    <div v-if="entries.length > 0" class="p-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground bg-muted/30">
      <span>{{ processedRows.length }} rows</span>
      <div v-if="totalPages > 1" class="flex items-center gap-1">
        <button
          @click="currentPage = Math.max(1, currentPage - 1)"
          :disabled="currentPage === 1"
          class="px-2 py-0.5 rounded hover:bg-muted disabled:opacity-50"
        >
          Prev
        </button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button
          @click="currentPage = Math.min(totalPages, currentPage + 1)"
          :disabled="currentPage === totalPages"
          class="px-2 py-0.5 rounded hover:bg-muted disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
