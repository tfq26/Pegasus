<script setup lang="ts">
import { ref, computed } from 'vue'
import { Table, Eye, Edit, Search, X, ChevronDown } from 'lucide-vue-next'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import type { ConnectionEntry } from '@/lib/db-connections'

const props = defineProps<{
  connection: ConnectionEntry
  tables: string[]
  tableMetadata?: Record<string, { displayName: string; actualName: string }>
}>()

const emit = defineEmits<{
  'table-click': [connection: ConnectionEntry, table: string]
  'preview': [connection: ConnectionEntry, table: string]
  'edit': [connection: ConnectionEntry, table: string]
  'rename': [connection: ConnectionEntry, table: string]
  'delete': [connection: ConnectionEntry, table: string]
}>()

// --- Performance & UX for large schemas ---
const searchQuery = ref('')
const displayLimit = ref(50)

const filteredTables = computed(() => {
  if (!searchQuery.value) return props.tables
  const q = searchQuery.value.toLowerCase()
  return props.tables.filter(t => t.toLowerCase().includes(q))
})

const visibleTables = computed(() => {
  return filteredTables.value.slice(0, displayLimit.value)
})

const hasMore = computed(() => {
  return displayLimit.value < filteredTables.value.length
})

function formatTableName(tableName: string): string {
  if (!tableName) return ''

  // Use metadata if available (renamed tables)
  if (props.tableMetadata?.[tableName]?.displayName) {
    return props.tableMetadata[tableName].displayName
  }
  
  // Pattern 1: data_UUID_actualName (no dashes in hex)
  const pattern1 = /^data_[a-f0-9]{32}_(.+)$/
  const match1 = tableName.match(pattern1)
  if (match1) return match1[1] || ''
  
  // Pattern 2: data_UUID_with_dashes_actualName
  const pattern2 = /^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/
  const match2 = tableName.match(pattern2)
  if (match2) return match2[1] || ''

  return tableName
}
</script>

<template>
  <div class="mt-4 pt-4 border-t border-border/50 space-y-3">
    <!-- Local Search for large connections -->
    <div v-if="props.tables.length > 10" class="px-1">
      <div class="relative group/search">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground group-focus-within/search:text-purple-500 transition-colors" />
        <input 
          v-model="searchQuery"
          type="text"
          placeholder="Filter tables..."
          class="w-full bg-muted/50 border border-border/80 rounded-lg pl-8 pr-8 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-purple-500/30 focus:ring-1 focus:ring-purple-500/10 transition-all font-medium"
        />
        <button 
          v-if="searchQuery" 
          @click="searchQuery = ''"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
        >
          <X class="w-2.5 h-2.5" />
        </button>
      </div>
    </div>

    <!-- Table List -->
    <div class="space-y-1 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
      <div 
        v-for="table in visibleTables" 
        :key="table!"
        class="block"
      >
        <ContextMenu>
          <ContextMenuTrigger class="flex-1 flex items-center justify-between">
            <div 
              class="flex items-center justify-between p-2 rounded-lg hover:bg-purple-500/5 group/table transition-all border border-transparent hover:border-purple-500/10 w-full cursor-pointer"
              @click="emit('table-click', props.connection, table!)"
            >
              <div class="flex items-center gap-2 overflow-hidden">
                <Table class="w-3.5 h-3.5 text-muted-foreground group-hover/table:text-purple-500 shrink-0" />
                <span class="truncate text-muted-foreground group-hover/table:text-foreground transition-colors text-[12px]">
                  {{ formatTableName(table!) }}
                </span>
              </div>
              
              <div class="flex items-center gap-1 opacity-0 group-hover/table:opacity-100 translate-x-1 group-hover/table:translate-x-0 transition-all">
                <button 
                  @click.stop="emit('preview', props.connection, table)" 
                  class="p-1 hover:text-purple-500 text-muted-foreground transition-colors"
                  title="Preview Data"
                >
                  <Eye class="w-3 h-3" />
                </button>
                <button 
                  @click.stop="emit('edit', props.connection, table)" 
                  class="p-1 hover:text-foreground text-muted-foreground transition-colors"
                  title="Open in Editor"
                >
                  <Edit class="w-3 h-3" />
                </button>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
             <ContextMenuItem @select="emit('preview', props.connection, table)">
                Preview Data
             </ContextMenuItem>
             <ContextMenuItem @select="emit('edit', props.connection, table)">
                Open in Editor
             </ContextMenuItem>
             <ContextMenuSeparator class="bg-border my-1" />
             <ContextMenuItem @select="emit('rename', props.connection, table)">
                Rename Table...
             </ContextMenuItem>
             <ContextMenuItem @select="emit('delete', props.connection, table)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                Delete Table
             </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <!-- Footer / Load More -->
      <div v-if="filteredTables.length === 0" class="py-12 text-center">
        <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No tables found</p>
      </div>
      
      <div v-if="hasMore" class="p-2 pt-4 flex flex-col items-center gap-2">
        <p class="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Showing {{ displayLimit }} of {{ filteredTables.length }}
        </p>
        <button 
          @click="displayLimit += 100"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-purple-500 hover:bg-muted/80 transition-all active:scale-95"
        >
           Load More
           <ChevronDown class="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 3px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.3);
  border-radius: 10px;
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}
</style>

