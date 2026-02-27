<script setup lang="ts">
import { Folder, File } from '@/components/ui/file-tree';
import { 
  ContextMenu, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuTrigger 
} from '@/components/ui/context-menu';
import { Star } from 'lucide-vue-next';

const props = defineProps<{
  favoriteItems: any[];
  selectedIds: string[];
}>();

const emit = defineEmits<{
  'select': [id: string, event?: MouseEvent];
  'toggle-favorite': [id: string];
}>();

function handleSelect(id: string, event?: MouseEvent) {
  emit('select', id, event);
}
</script>

<template>
  <Folder
    v-if="favoriteItems.length > 0"
    id="root:favorites"
    name="Favorites"
    open-icon="lucide:star"
    close-icon="lucide:star"
    class="font-medium"
  >
    <template #label>
      <div class="flex items-center gap-2">
        <Star class="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
        <span class="text-foreground">Favorites</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">{{ favoriteItems.length }}</span>
      </div>
    </template>
    <ContextMenu v-for="item in favoriteItems" :key="item.id">
      <ContextMenuTrigger as-child>
        <File
          :id="item.id"
          :name="item.name"
          :file-icon="item.icon"
          :is-select="selectedIds.includes(item.id)"
          @click="(ev: MouseEvent) => handleSelect(item.id, ev)"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="truncate">{{ item.name }}</span>
            <Star class="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
          </div>
        </File>
      </ContextMenuTrigger>
      <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
        <ContextMenuItem @select="emit('toggle-favorite', item.id)" class="text-amber-600">
          <Star class="w-3.5 h-3.5 mr-2" />
          Remove from Favorites
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  </Folder>
</template>
