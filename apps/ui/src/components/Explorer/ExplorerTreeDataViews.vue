<script setup lang="ts">
import { Folder, File } from '@/components/ui/file-tree';
import { 
  ContextMenu, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuTrigger 
} from '@/components/ui/context-menu';
import { Plus, Trash, LayoutGrid } from 'lucide-vue-next';

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
              <span v-if="filteredDataViews?.length" class="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ filteredDataViews.length }}</span>
            </div>
            <button 
              @click.stop.prevent="emit('add-data-view')"
              class="mr-1 flex h-6 w-6 items-center justify-center rounded-lg border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border/60 hover:bg-background hover:text-foreground group-hover:opacity-100"
              title="New Data View"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </template>
        
        <div v-if="!filteredDataViews?.length" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/45 px-4 py-6 text-center">
          <LayoutGrid class="mb-2 h-8 w-8 text-muted-foreground/30" />
          <p class="whitespace-nowrap text-xs font-medium text-muted-foreground">No saved views</p>
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
          <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
            <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium text-rose-500 focus:bg-rose-500/10 focus:text-rose-500" @select="emit('delete-data-view', view)">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete View
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
      <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium" @select="emit('add-data-view')">
        <Plus class="w-3.5 h-3.5 mr-2" />
        New Data View
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
