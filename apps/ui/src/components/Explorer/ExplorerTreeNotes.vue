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
              <span v-if="filteredFiles?.length" class="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ filteredFiles.length }}</span>
            </div>
            <button 
              @click.stop.prevent="emit('upload-file')" 
              class="mr-1 flex h-6 w-6 items-center justify-center rounded-lg border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border/60 hover:bg-background hover:text-foreground group-hover:opacity-100"
              title="Upload File"
            >
              <Upload class="w-4 h-4" />
            </button>
          </div>
        </template>
        
        <div v-if="!filteredFiles?.length" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/45 px-4 py-6 text-center">
          <FilePlus class="mb-2 h-8 w-8 text-muted-foreground/30" />
          <p class="text-xs font-medium text-muted-foreground">Drop files here or click to upload</p>
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
                <span class="ml-2 rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  {{ (file.file_size_bytes / 1024).toFixed(0) }} KB
                </span>
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
            <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium text-rose-500 focus:bg-rose-500/10 focus:text-rose-500" @select="emit('delete-file', file)">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete File
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
      <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium" @select="emit('upload-file')">
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
              <span v-if="filteredNotes?.length" class="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ filteredNotes.length }}</span>
            </div>
            <button 
              @click.stop.prevent="emit('add-note')" 
              class="mr-1 flex h-6 w-6 items-center justify-center rounded-lg border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border/60 hover:bg-background hover:text-foreground group-hover:opacity-100"
              title="New Note"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </template>
        
        <div v-if="!filteredNotes?.length" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/45 px-4 py-6 text-center">
          <NotebookPen class="mb-2 h-8 w-8 text-muted-foreground/30" />
          <p class="text-xs font-medium text-muted-foreground">Create your first note</p>
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
          <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
            <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium" @select="emit('add-note-to-dashboard', note)">
              <LayoutDashboard class="w-3.5 h-3.5 mr-2" />
              Add to Dashboard
            </ContextMenuItem>
            <ContextMenuSeparator class="bg-border my-1" />
            <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium text-rose-500 focus:bg-rose-500/10 focus:text-rose-500" @select="emit('delete-note', note)">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete Note
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
      <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium" @select="emit('add-note')">
        <Plus class="w-3.5 h-3.5 mr-2" />
        New Note
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
