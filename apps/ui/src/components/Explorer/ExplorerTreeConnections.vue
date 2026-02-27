<script setup lang="ts">
import { computed } from 'vue';
import { Database, Plus, FolderPlus, AlertTriangle, CheckCircle2, Eye, Edit, Star, Sparkles, Trash, Activity, RefreshCw } from 'lucide-vue-next';
import { Folder, File } from '@/components/ui/file-tree';
import { 
  ContextMenu, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuTrigger, 
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent
} from '@/components/ui/context-menu';
import type { ConnectionEntry } from '@/lib/db-connections';
import { useExplorerHelpers } from '@/composables/useExplorerHelpers';

const props = defineProps<{
  connections: ConnectionEntry[];
  filteredConnections: ConnectionEntry[];
  spaces?: any[];
  selectedIds: string[];
  isFavorite: (id: string) => boolean;
  getFilteredTables: (connId: string) => string[];
  getDisplayName: (connId: string, table: string) => string;
  getRowCount: (connId: string, table: string) => number | undefined;
}>();

const emit = defineEmits<{
  'select': [id: string, event?: MouseEvent];
  'add-connection': [];
  'preview-table': [conn: ConnectionEntry, table: string];
  'select-table': [conn: ConnectionEntry, table: string];
  'rename-table': [conn: ConnectionEntry, table: string];
  'explain-table': [conn: ConnectionEntry, table: string];
  'generate-data': [conn: ConnectionEntry, table: string];
  'delete-table': [conn: ConnectionEntry, table: string];
  'add-table': [conn: ConnectionEntry];
  'move-connection': [conn: ConnectionEntry, spaceId: string];
  'health-check': [conn: ConnectionEntry];
  'delete-connection': [conn: ConnectionEntry];
  'toggle-favorite': [id: string];
  'refresh-table-details': [conn: ConnectionEntry, table: string];
}>();

const { getProviderIcon, getTableIcon, getTableId, formatRowCount } = useExplorerHelpers();

function handleSelect(id: string, event?: MouseEvent) {
  emit('select', id, event);
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <Folder 
        id="root:db" 
        name="Databases" 
        open-icon="lucide:database" 
        close-icon="lucide:database"
        class="font-medium group"
      >
        <template #label>
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2">
              <span class="text-foreground">Databases</span>
              <span v-if="filteredConnections.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{{ filteredConnections.length }}</span>
            </div>
            <button 
              @click.stop.prevent="emit('add-connection')" 
              class="mr-1 p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
              title="Add Connection"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </template>
        
        <div v-if="filteredConnections.length === 0" class="flex flex-col items-center justify-center py-6 px-4 text-center">
          <Database class="w-10 h-10 text-muted-foreground/30 mb-2" />
          <p class="text-xs text-muted-foreground mb-2">No database connections yet</p>
          <button 
            @click="emit('add-connection')" 
            class="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <FolderPlus class="w-3.5 h-3.5" /> Add your first connection
          </button>
        </div>
        
        <!-- Connection Loop -->
        <ContextMenu v-for="conn in filteredConnections" :key="conn.id">
          <ContextMenuTrigger as-child>
            <Folder
              :id="conn.id"
              :name="conn.alias || conn.nickname"
              :open-icon="getProviderIcon(conn)"
              :close-icon="getProviderIcon(conn)"
              :is-select="selectedIds.includes(conn.id)"
              class="group/folder ml-0"
            >
              <template #label>
                <div class="flex items-center gap-2 overflow-hidden">
                  <span class="truncate font-semibold" :title="conn.alias ? `Original: ${conn.nickname}` : conn.nickname">
                    {{ conn.alias || conn.nickname }}
                  </span>
                </div>
                <div v-if="!conn.space" class="inline-flex items-center ml-2" title="Unassigned Connection">
                  <AlertTriangle class="w-3.5 h-3.5 text-amber-500/80" />
                </div>
                <div v-else class="inline-flex items-center ml-2" title="Synced & Healthy">
                  <CheckCircle2 class="w-3.5 h-3.5 text-emerald-500/80" />
                </div>
              </template>

              <!-- Table Loop -->
              <ContextMenu v-for="table in getFilteredTables(conn.id)" :key="getTableId(conn.id, table)">
                <ContextMenuTrigger as-child>
                  <File
                    :id="getTableId(conn.id, table)"
                    :name="table"
                    :file-icon="getTableIcon(conn)"
                    :is-select="selectedIds.includes(getTableId(conn.id, table))"
                    class="group"
                    @click="(ev: MouseEvent) => handleSelect(getTableId(conn.id, table), ev)"
                  >
                    <div class="flex items-center justify-between w-full pr-2 overflow-hidden">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="truncate">{{ getDisplayName(conn.id, table) }}</span>
                        <Star v-if="isFavorite(getTableId(conn.id, table))" class="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      </div>
                      <span 
                        v-if="getRowCount(conn.id, table) !== undefined"
                        class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap ml-2"
                      >
                        {{ formatRowCount(getRowCount(conn.id, table)) }}
                      </span>
                    </div>
                  </File>
                </ContextMenuTrigger>
                <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                  <ContextMenuItem @select="emit('preview-table', conn, table)">
                    <Eye class="w-3.5 h-3.5 mr-2" />
                    Preview Data
                  </ContextMenuItem>
                  <ContextMenuItem @select="emit('select-table', conn, table)">
                    <Edit class="w-3.5 h-3.5 mr-2" />
                    Open in Editor
                  </ContextMenuItem>
                  <ContextMenuItem @select="emit('toggle-favorite', getTableId(conn.id, table))" :class="isFavorite(getTableId(conn.id, table)) ? 'text-amber-600' : ''">
                    <Star class="w-3.5 h-3.5 mr-2" :class="isFavorite(getTableId(conn.id, table)) ? 'fill-amber-500 text-amber-500' : ''" />
                    {{ isFavorite(getTableId(conn.id, table)) ? 'Remove from Favorites' : 'Add to Favorites' }}
                  </ContextMenuItem>
                  <ContextMenuSeparator class="bg-border my-1" />
                  <ContextMenuItem @select="emit('rename-table', conn, table)">
                    Rename Table...
                  </ContextMenuItem>
                  <ContextMenuItem @select="emit('explain-table', conn, table)">
                    <Sparkles class="w-3.5 h-3.5 mr-2 text-purple-500" />
                    Explain Table (AI)
                  </ContextMenuItem>
                  <ContextMenuItem @select="emit('generate-data', conn, table)">
                    <Sparkles class="w-3.5 h-3.5 mr-2 text-indigo-500" />
                    Generate Test Data (AI)
                  </ContextMenuItem>
                  <ContextMenuItem @select="emit('refresh-table-details', conn, table)">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" />
                    Refresh Details
                  </ContextMenuItem>
                  <ContextMenuSeparator class="bg-border my-1" />
                  <ContextMenuItem @select="emit('delete-table', conn, table)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                    <Trash class="w-3.5 h-3.5 mr-2" />
                    Delete Table
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </Folder>
          </ContextMenuTrigger>

          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('add-table', conn)">
              <Plus class="w-3.5 h-3.5 mr-2" />
              Add Table
            </ContextMenuItem>
            
            <ContextMenuSub v-if="spaces && spaces.length > 0">
              <ContextMenuSubTrigger>Move to Space</ContextMenuSubTrigger>
              <ContextMenuSubContent class="w-48 bg-popover border-border text-popover-foreground p-1">
                <ContextMenuItem 
                  v-for="space in spaces" 
                  :key="space.id"
                  @select="emit('move-connection', conn, space.id)"
                >
                  {{ space.name }}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            
            <ContextMenuSeparator class="bg-border my-1" />

            <ContextMenuItem @select="emit('health-check', conn)">
              <Activity class="w-3.5 h-3.5 mr-2 text-emerald-500" />
              Health Check
            </ContextMenuItem>
            <ContextMenuSeparator class="bg-border my-1" />
            <ContextMenuItem @select="emit('delete-connection', conn)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Remove Connection
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
      <ContextMenuItem @select="emit('add-connection')">
        <Plus class="w-3.5 h-3.5 mr-2" />
        Add Connection
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
