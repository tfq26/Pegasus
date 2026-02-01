<script setup lang="ts">
import { ref, watch } from 'vue'
import { Save, X, Trash2, StickyNote, Eye, Edit3, Sparkles } from 'lucide-vue-next'
import { updateSpaceNote, deleteSpaceNote } from '@/lib/api'
import { useSpaceStore } from '@/stores/space'
import { toast } from '@/composables/useNotifications'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const props = defineProps<{
  note: any
}>()

const emit = defineEmits<{
  'close': []
  'deleted': []
}>()

const spaceStore = useSpaceStore()
const title = ref(props.note.title)
const content = ref(props.note.content)
const saving = ref(false)
const isEditMode = ref(false)

watch(() => props.note, (newNote) => {
  title.value = newNote.title
  content.value = newNote.content
})

const handleSave = async () => {
  saving.value = true
  try {
    await updateSpaceNote(props.note.id, {
      title: title.value,
      content: content.value
    })
    await spaceStore.fetchSpaceContext()
    toast.success('Note saved')
  } catch (e: any) {
    toast.error('Failed to save note', { description: e.message })
  } finally {
    saving.value = false
  }
}

const handleDelete = async () => {
  if (!confirm('Are you sure you want to delete this note?')) return
  try {
    await deleteSpaceNote(props.note.id)
    await spaceStore.fetchSpaceContext()
    toast.success('Note deleted')
    emit('deleted')
  } catch (e: any) {
    toast.error('Failed to delete note', { description: e.message })
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-background border-l border-border animate-in slide-in-from-right duration-300">
    <!-- Header -->
    <header class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
      <div class="flex items-center gap-2 flex-1">
        <StickyNote class="w-4 h-4 text-amber-500 shrink-0" />
        <input 
          v-model="title"
          class="bg-transparent border-none focus:ring-0 text-sm font-semibold p-0 w-full"
          placeholder="Note Title"
          @blur="handleSave"
        />
      </div>
      
      <div class="flex items-center gap-1 shrink-0 ml-2">
        <div class="flex bg-muted/50 p-1 rounded-lg mr-2 border border-border/50">
          <button 
            @click="isEditMode = true"
            class="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all"
            :class="isEditMode ? 'bg-background text-foreground shadow-sm shadow-black/20' : 'text-muted-foreground hover:text-foreground'"
          >
            <Edit3 class="w-3 h-3" />
            Edit
          </button>
          <button 
            @click="isEditMode = false"
            class="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all"
            :class="!isEditMode ? 'bg-background text-foreground shadow-sm shadow-black/20' : 'text-muted-foreground hover:text-foreground'"
          >
            <Eye class="w-3 h-3" />
            Preview
          </button>
        </div>

        <button 
          @click="handleSave"
          :disabled="saving"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Save Note"
        >
          <Save class="w-4 h-4" :class="{ 'animate-pulse': saving }" />
        </button>
        <button 
          @click="handleDelete"
          class="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Delete Note"
        >
          <Trash2 class="w-4 h-4" />
        </button>
        <div class="w-px h-4 bg-border mx-1" />
        <button 
          @click="emit('close')"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </header>

    <!-- Editor/Preview Area -->
    <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
      <div class="min-h-full p-6">
        <textarea 
          v-if="isEditMode"
          v-model="content"
          autoFocus
          class="w-full h-full bg-transparent border-none focus:ring-0 text-[13px] leading-relaxed resize-none p-0 placeholder:text-muted-foreground/50 font-mono min-h-[400px]"
          placeholder="Start documenting your space knowledge here... (Markdown supported)"
        />
        <div v-else class="min-h-full cursor-text" @click="isEditMode = true">
          <MarkdownRenderer :content="content || '*No content yet...*'" />
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="px-4 py-2 border-t border-border bg-muted/10">
      <div class="flex items-center justify-between text-[10px] text-muted-foreground">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1 font-bold">
            <Sparkles class="w-2.5 h-2.5" />
            MARKDOWN READY
          </span>
          <span>•</span>
          <span>Last edited: {{ new Date(note.updated_at).toLocaleTimeString() }}</span>
        </div>
        <div class="flex items-center gap-1">
           <span v-if="saving" class="flex items-center gap-1">
              <div class="w-1 h-1 rounded-full bg-amber-500 animate-ping" />
              Saving...
           </span>
           <span v-else class="text-emerald-500/70">Synced to Space</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.1) transparent;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.1);
  border-radius: 20px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.2);
}

:deep(.markdown-body) {
  font-size: 13px;
}
</style>
