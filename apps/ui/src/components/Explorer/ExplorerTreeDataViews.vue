<script setup lang="ts">
import { Folder, File } from '@/components/ui/file-tree';
import { 
  ContextMenu, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuTrigger 
} from '@/components/ui/context-menu';
import { Plus, Trash } from 'lucide-vue-next';

const props = defineProps<{
  filteredDataViews?: any[];
  selectedIds: string[];
}>();

const emit = defineEmits<{
  'select': [id: string, event?: MouseEvent];
  'add-data-view': [];
  'delete-data-view': [view: any];
}>();

function handleSelect(id: string, event?: MouseEvent) {
  emit('select', id, event);
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <Folder 
        id="root:data-views" 
        name="Data Views" 
        open-icon="lucide:layout-grid" 
        close-icon="lucide:layout-grid"
        :is-select="selectedIds.includes('root:data-views')"
        class="font-medium group"
      >
        <template #label>
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2">
              <span class="text-foreground">Data Views</span>
              <span v-if="filteredDataViews?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">{{ filteredDataViews.length }}</span>
            </div>
          </div>
        </template>
        
        <div v-if="!filteredDataViews?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
          <p class="text-xs text-muted-foreground whitespace-nowrap">No saved views</p>
        </div>

        <!-- Data Views Loop -->
        <ContextMenu v-for="view in filteredDataViews" :key="view.id">
          <ContextMenuTrigger as-child>
            <File 
              :id="`view:${view.id}`" 
              :name="view.name"
              file-icon="lucide:layout-template"
              :is-select="selectedIds.includes(`view:${view.id}`)"
              @click="(ev: MouseEvent) => handleSelect(`view:${view.id}`, ev)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ view.name }}</span>
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('delete-data-view', view)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete View
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
      <ContextMenuItem @select="emit('add-data-view')">
        <Plus class="w-3.5 h-3.5 mr-2" />
        New Data View
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
