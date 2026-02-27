<script setup lang="ts">
import { Folder, File } from '@/components/ui/file-tree';
import { 
  ContextMenu, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuSeparator,
  ContextMenuTrigger 
} from '@/components/ui/context-menu';
import { Plus, Upload, FilePlus, NotebookPen, Trash, LayoutDashboard, CheckCircle2 } from 'lucide-vue-next';
import { useExplorerHelpers } from '@/composables/useExplorerHelpers';

const props = defineProps<{
  filteredFiles?: any[];
  filteredNotes?: any[];
  selectedIds: string[];
}>();

const emit = defineEmits<{
  'select': [id: string, event?: MouseEvent];
  'upload-file': [];
  'delete-file': [file: any];
  'add-note': [];
  'add-note-to-dashboard': [note: any];
  'delete-note': [note: any];
}>();

const { getFileIcon } = useExplorerHelpers();

function handleSelect(id: string, event?: MouseEvent) {
  emit('select', id, event);
}
</script>

<template>
  <!-- FILES ROOT -->
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <Folder 
        id="root:files" 
        name="Files" 
        open-icon="lucide:folder-open" 
        close-icon="lucide:folder"
        :is-select="selectedIds.includes('root:files')"
        class="font-medium group"
      >
        <template #label>
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2">
              <span class="text-foreground">Files</span>
              <span v-if="filteredFiles?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">{{ filteredFiles.length }}</span>
            </div>
            <button 
              @click.stop.prevent="emit('upload-file')" 
              class="mr-1 p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
              title="Upload File"
            >
              <Upload class="w-4 h-4" />
            </button>
          </div>
        </template>
        
        <div v-if="!filteredFiles?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
          <FilePlus class="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p class="text-xs text-muted-foreground">Drop files here or click to upload</p>
        </div>

        <ContextMenu v-for="file in filteredFiles" :key="file.id">
          <ContextMenuTrigger as-child>
            <File 
              :id="`file:${file.id}`" 
              :name="file.filename"
              :file-icon="getFileIcon(file.filename)"
              :is-select="selectedIds.includes(`file:${file.id}`)"
              @click="(ev: MouseEvent) => handleSelect(`file:${file.id}`, ev)"
            >
              <div class="flex items-center justify-between w-full pr-2 overflow-hidden">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="truncate">{{ file.filename }}</span>
                  <CheckCircle2 class="w-3 h-3 text-emerald-500/50" />
                </div>
                <span class="text-[9px] text-muted-foreground ml-2">
                  {{ (file.file_size_bytes / 1024).toFixed(0) }} KB
                </span>
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('delete-file', file)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete File
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
      <ContextMenuItem @select="emit('upload-file')">
        <Upload class="w-3.5 h-3.5 mr-2" />
        Upload File
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>

  <!-- NOTES ROOT -->
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <Folder 
        id="root:notes" 
        name="Notes" 
        open-icon="lucide:notebook" 
        close-icon="lucide:notebook"
        :is-select="selectedIds.includes('root:notes')"
        class="font-medium group"
      >
        <template #label>
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2">
              <span class="text-foreground">Notes</span>
              <span v-if="filteredNotes?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">{{ filteredNotes.length }}</span>
            </div>
            <button 
              @click.stop.prevent="emit('add-note')" 
              class="mr-1 p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
              title="New Note"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </template>
        
        <div v-if="!filteredNotes?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
          <NotebookPen class="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p class="text-xs text-muted-foreground">Create your first note</p>
        </div>

        <ContextMenu v-for="note in filteredNotes" :key="note.id">
          <ContextMenuTrigger as-child>
            <File 
              :id="`note:${note.id}`" 
              :name="note.title"
              file-icon="lucide:sticky-note"
              :is-select="selectedIds.includes(`note:${note.id}`)"
              @click="(ev: MouseEvent) => handleSelect(`note:${note.id}`, ev)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ note.title }}</span>
                <CheckCircle2 class="w-3 h-3 text-emerald-500/50" />
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('add-note-to-dashboard', note)">
              <LayoutDashboard class="w-3.5 h-3.5 mr-2" />
              Add to Dashboard
            </ContextMenuItem>
            <ContextMenuSeparator class="bg-border my-1" />
            <ContextMenuItem @select="emit('delete-note', note)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete Note
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
      <ContextMenuItem @select="emit('add-note')">
        <Plus class="w-3.5 h-3.5 mr-2" />
        New Note
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
