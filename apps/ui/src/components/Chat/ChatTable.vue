<script setup lang="ts">
import { computed, ref } from 'vue'
import { 
  ArrowUpDown, 
  Download, 
  Copy, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  Table as TableIcon,
  LayoutDashboard
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const props = withDefaults(defineProps<{
  data: any[]
  title?: string
  showAddToDashboard?: boolean
  showHeader?: boolean
  showFooter?: boolean
}>(), {
  showHeader: true,
  showFooter: true
})

const emit = defineEmits<{
  (e: 'add-to-dashboard'): void
}>()

const sortKey = ref('')
const sortOrder = ref<'asc' | 'desc'>('asc')
const copied = ref(false)

const columns = computed(() => {
  if (!props.data || props.data.length === 0) return []
  const keys = new Set<string>()
  props.data.slice(0, 10).forEach(row => {
    Object.keys(row).forEach(k => keys.add(k))
  })
  return Array.from(keys)
})

const sortedData = computed(() => {
  if (!sortKey.value) return props.data
  
  return [...props.data].sort((a, b) => {
    const valA = a[sortKey.value]
    const valB = b[sortKey.value]
    
    if (valA === valB) return 0
    
    let comparison = 0
    if (typeof valA === 'number' && typeof valB === 'number') {
      comparison = valA - valB
    } else {
      comparison = String(valA).localeCompare(String(valB))
    }
    
    return sortOrder.value === 'asc' ? comparison : -comparison
  })
})

const toggleSort = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const formatValue = (value: any) => {
  if (value === null || value === undefined) return '-'
  
  // Detect date strings
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      return new Date(value).toLocaleDateString()
    } catch (e) {
      return value
    }
  }
  
  // Precision for numbers
  if (typeof value === 'number') {
    // Currency detection (naive)
    if (sortKey.value.toLowerCase().includes('price') || sortKey.value.toLowerCase().includes('value') || sortKey.value.toLowerCase().includes('amount')) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
    }
    // Percentage detection
    if (sortKey.value.toLowerCase().includes('percent') || sortKey.value.toLowerCase().includes('ratio')) {
       return (value * 100).toFixed(2) + '%'
    }
    return value.toLocaleString()
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  
  return String(value)
}

const downloadCSV = () => {
  if (!props.data.length) return
  
  const headers = columns.value.join(',')
  const rows = props.data.map(row => 
    columns.value.map(col => {
      let val = row[col]
      if (typeof val === 'string' && val.includes(',')) {
        val = `"${val}"`
      }
      return val
    }).join(',')
  )
  
  const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n")
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  link.setAttribute("download", `${props.title || 'data'}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const copyToClipboard = async () => {
  const headers = columns.value.join('\t')
  const rows = props.data.map(row => 
    columns.value.map(col => row[col]).join('\t')
  ).join('\n')
  
  const text = headers + '\n' + rows
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

// Pagination logic
const currentPage = ref(1)
const itemsPerPage = ref(10)
const totalPages = computed(() => Math.ceil(sortedData.value.length / itemsPerPage.value))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return sortedData.value.slice(start, start + itemsPerPage.value)
})
</script>

<template>
  <div class="chat-table-container rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col max-w-full my-2 animate-in fade-in zoom-in-95 duration-300">
    <!-- Header/Toolbar -->
    <div v-if="showHeader" class="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 overflow-hidden">
        <div class="p-1 rounded-lg bg-primary/10 text-primary">
          <TableIcon class="w-3.5 h-3.5" />
        </div>
        <h3 class="text-xs font-semibold truncate">{{ title || 'Query Results' }}</h3>
        <span class="text-[9px] bg-muted px-1 py-0.5 rounded-md text-muted-foreground whitespace-nowrap">{{ data.length }} rows</span>
      </div>
      
      <div class="flex items-center gap-1">
        <Button 
          v-if="showAddToDashboard"
          variant="ghost" 
          size="icon" 
          class="h-7 w-7 text-primary hover:bg-primary/10" 
          title="Add to Dashboard" 
          @click="emit('add-to-dashboard')"
        >
          <LayoutDashboard class="w-3.5 h-3.5" />
        </Button>

        <Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground hover:text-foreground" title="Copy to Clipboard" @click="copyToClipboard">
          <Check v-if="copied" class="w-3.5 h-3.5 text-emerald-500" />
          <Copy v-else class="w-3.5 h-3.5" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground hover:text-foreground">
              <Download class="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="downloadCSV">
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    
    <!-- Table Body -->
    <div class="relative overflow-x-auto max-w-full">
      <table class="w-full">
        <thead>
          <tr class="hover:bg-transparent border-b border-border">
            <th 
              v-for="col in columns" 
              :key="col"
              @click="toggleSort(col)"
              class="px-3 py-2 cursor-pointer select-none group whitespace-nowrap align-middle text-left"
            >
              <div class="flex items-center gap-1.5 transition-colors group-hover:text-foreground">
                <span class="text-[10px] font-bold tracking-tight uppercase">{{ col }}</span>
                <ArrowUpDown class="w-2.5 h-2.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-all" :class="{'text-primary opacity-100': sortKey === col}" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/50">
          <tr 
            v-for="(row, idx) in paginatedData" 
            :key="idx"
            class="group transition-colors last:border-0 hover:bg-muted/40"
          >
            <td 
              v-for="col in columns" 
              :key="col"
              class="px-3 py-1.5 text-[11px] text-foreground/90 whitespace-nowrap"
            >
              {{ formatValue(row[col]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- Footer / Pagination -->
    <div v-if="showFooter && data.length > 0" class="px-3 py-1 border-t border-border bg-muted/20 flex items-center justify-between gap-4">
      <div class="text-[9px] text-muted-foreground font-medium">
        Page {{ currentPage }} of {{ totalPages || 1 }}
      </div>
      
      <div class="flex items-center gap-1">
        <Button 
          variant="outline" 
          size="icon" 
          class="h-6 w-6 rounded-md" 
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          <ChevronLeft class="w-2.5 h-2.5" />
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          class="h-6 w-6 rounded-md" 
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
        >
          <ChevronRight class="w-2.5 h-2.5" />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-table-container {
  max-width: 100%;
}

::-webkit-scrollbar {
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.4);
}
</style>
