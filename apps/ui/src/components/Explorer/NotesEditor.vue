<script setup lang="ts">
import { ref, watch } from 'vue'
import { Save, X, Trash2, StickyNote } from 'lucide-vue-next'
import { updateSpaceNote, deleteSpaceNote } from '@/lib/api'
import { useSpaceStore } from '@/stores/space'
import { toast } from '@/composables/useNotifications'

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
      <div class="flex items-center gap-2">
        <StickyNote class="w-4 h-4 text-amber-500" />
        <input 
          v-model="title"
          class="bg-transparent border-none focus:ring-0 text-sm font-semibold p-0 w-full"
          placeholder="Note Title"
          @blur="handleSave"
        />
      </div>
      
      <div class="flex items-center gap-1">
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

    <!-- Editor Area -->
    <div class="flex-1 p-4 overflow-hidden flex flex-col gap-4">
      <textarea 
        v-model="content"
        class="flex-1 bg-transparent border-none focus:ring-0 text-[13px] leading-relaxed resize-none p-0 placeholder:text-muted-foreground/50 font-mono"
        placeholder="Start documenting your space knowledge here... (Markdown supported)"
      />
    </div>

    <!-- Footer -->
    <footer class="px-4 py-2 border-t border-border bg-muted/10">
      <div class="flex items-center justify-between text-[10px] text-muted-foreground">
        <div class="flex items-center gap-3">
          <span>Markdown Enabled</span>
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
textarea {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.2) transparent;
}
textarea::-webkit-scrollbar {
  width: 4px;
}
textarea::-webkit-scrollbar-track {
  background: transparent;
}
textarea::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.2);
  border-radius: 20px;
}
</style>
