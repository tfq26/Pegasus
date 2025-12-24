<script setup lang="ts">
import { Table, Eye, Edit } from 'lucide-vue-next'
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
}>()

const emit = defineEmits<{
  'table-click': [connection: ConnectionEntry, table: string]
  'preview': [connection: ConnectionEntry, table: string]
  'edit': [connection: ConnectionEntry, table: string]
  'rename': [connection: ConnectionEntry, table: string]
  'delete': [connection: ConnectionEntry, table: string]
}>()

function formatTableName(tableName: string, connectionId?: string): string {
  if (!tableName) return ''
  
  // Format logic from Explorer.vue
  let name = tableName
  
  // Pattern 1: data_UUID_actualName
  const pattern1 = /^data_[a-f0-9]{32}_(.+)$/
  const match1 = name.match(pattern1)
  if (match1) return match1[1]
  
  // Pattern 2: data_UUID_with_dashes_actualName
  const pattern2 = /^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/
  const match2 = name.match(pattern2)
  if (match2) return match2[1]

  return name
}
</script>

<template>
  <div class="mt-4 pt-4 border-t border-stone-800/50 space-y-1 max-h-[400px] overflow-y-auto pr-1">
    <div 
      v-for="table in props.tables" 
      :key="table"
      class="block"
    >
      <ContextMenu>
        <ContextMenuTrigger class="flex-1 flex items-center justify-between">
          <div 
            class="flex items-center justify-between p-2 rounded-lg hover:bg-violet-500/5 group/table transition-all border border-transparent hover:border-violet-500/10 w-full cursor-pointer"
            @click="emit('table-click', props.connection, table)"
          >
            <div class="flex items-center gap-2 overflow-hidden">
              <Table class="w-3.5 h-3.5 text-stone-600 group-hover/table:text-violet-400 shrink-0" />
              <span class="truncate text-stone-400 group-hover/table:text-stone-200 transition-colors">
                {{ formatTableName(table, props.connection.id) }}
              </span>
            </div>
            
            <div class="flex items-center gap-1 opacity-0 group-hover/table:opacity-100 translate-x-1 group-hover/table:translate-x-0 transition-all">
              <button 
                @click.stop="emit('preview', props.connection, table)" 
                class="p-1 hover:text-violet-400 text-stone-500 transition-colors"
                title="Preview Data"
              >
                <Eye class="w-3 h-3" />
              </button>
              <button 
                @click.stop="emit('edit', props.connection, table)" 
                class="p-1 hover:text-white text-stone-500 transition-colors"
                title="Open in Editor"
              >
                <Edit class="w-3 h-3" />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48 bg-[#0a0a0b] border-stone-800 text-stone-100">
           <ContextMenuItem @select="emit('preview', props.connection, table)">
              Preview Data
           </ContextMenuItem>
           <ContextMenuItem @select="emit('edit', props.connection, table)">
              Open in Editor
           </ContextMenuItem>
           <ContextMenuSeparator class="bg-stone-800 my-1" />
           <ContextMenuItem @select="emit('rename', props.connection, table)">
              Rename Table...
           </ContextMenuItem>
           <ContextMenuItem @select="emit('delete', props.connection, table)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
              Delete Table
           </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  </div>
</template>
