<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { toast } from '@/composables/useNotifications'

const props = defineProps<{
  content: string
  fileType: 'txt' | 'md' | 'docx'
  fileName?: string
  autoSave?: boolean
  isPrivate?: boolean
  isSaving?: boolean
}>()

const emit = defineEmits<{
  'update:content': [content: string]
  'save': [content: string]
  'update:format-state': [state: any]
  'share': []
  'download': []
  'update:is-private': [value: boolean]
}>()

// Editor state
const editorRef = ref<HTMLDivElement | null>(null)
const localContent = ref(props.content || '')
const saveTimer = ref<any>(null)

// Toolbar state
const currentFormat = ref({
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false
})

// Save selection for restoring after toolbar clicks
let savedSelection: Range | null = null;

const saveSelection = () => {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    savedSelection = selection.getRangeAt(0).cloneRange();
  }
};

const restoreSelection = () => {
  if (savedSelection && editorRef.value) {
    editorRef.value.focus();
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(savedSelection);
    }
  }
};

// Initialize editor content
watch(() => props.content, (newContent) => {
  if (editorRef.value && editorRef.value.innerHTML !== newContent) {
    editorRef.value.innerHTML = newContent
  }
}, { immediate: true })

// Format commands (exposed to parent)
const execCommand = (command: string, value?: string) => {
  // Restore selection first so formatting applies to the right text
  restoreSelection();
  document.execCommand(command, false, value);
  editorRef.value?.focus();
  updateFormatState();
  // Save the new selection state
  saveSelection();
}

const updateFormatState = () => {
  currentFormat.value = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strikethrough: document.queryCommandState('strikethrough')
  }
  emit('update:format-state', currentFormat.value)
  // Save current selection whenever format state updates
  saveSelection();
}

// Handle content changes
const handleInput = () => {
  if (!editorRef.value) return
  
  const content = editorRef.value.innerHTML
  localContent.value = content
  emit('update:content', content)
  
  if (props.autoSave) {
    debouncedSave()
  }
}

const debouncedSave = () => {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  saveTimer.value = setTimeout(() => {
    handleSave()
  }, 1000)
}

const handleSave = async () => {
  emit('save', localContent.value)
}

// Keyboard shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  // Ctrl/Cmd + B = Bold
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault()
    execCommand('bold')
  }
  // Ctrl/Cmd + I = Italic  
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault()
    execCommand('italic')
  }
  // Ctrl/Cmd + U = Underline
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault()
    execCommand('underline')
  }
  // Ctrl/Cmd + S = Save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
}

// Lifecycle
onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerHTML = props.content
    editorRef.value.addEventListener('keydown', handleKeyDown)
  }
  document.addEventListener('selectionchange', updateFormatState)
})

onBeforeUnmount(() => {
  if (editorRef.value) {
    editorRef.value.removeEventListener('keydown', handleKeyDown)
  }
  document.removeEventListener('selectionchange', updateFormatState)
  if (saveTimer.value) clearTimeout(saveTimer.value)
})

// Expose methods to parent/toolbar
defineExpose({
  execCommand,
  updateFormatState,
  handleSave
})
</script>

<template>
  <div class="flex flex-col h-full bg-background">
    <!-- Embedded Toolbar (for reliable formatting) -->
    <div class="flex items-center gap-1 p-1 px-2 border-b border-border flex-shrink-0">
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        :class="{ 'bg-accent': currentFormat.bold }"
        @mousedown.prevent="execCommand('bold')"
        title="Bold (Ctrl+B)"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        :class="{ 'bg-accent': currentFormat.italic }"
        @mousedown.prevent="execCommand('italic')"
        title="Italic (Ctrl+I)"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        :class="{ 'bg-accent': currentFormat.underline }"
        @mousedown.prevent="execCommand('underline')"
        title="Underline (Ctrl+U)"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>
      </button>
      
      <div class="w-px h-5 bg-border mx-1" />
      
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @mousedown.prevent="execCommand('formatBlock', 'h1')"
        title="Heading 1"
      >
        <span class="text-xs font-bold">H1</span>
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @mousedown.prevent="execCommand('formatBlock', 'h2')"
        title="Heading 2"
      >
        <span class="text-xs font-bold">H2</span>
      </button>
      
      <div class="w-px h-5 bg-border mx-1" />
      
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @mousedown.prevent="execCommand('insertUnorderedList')"
        title="Bullet List"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @mousedown.prevent="execCommand('insertOrderedList')"
        title="Numbered List"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="3" y="7" font-size="6" fill="currentColor">1</text><text x="3" y="13" font-size="6" fill="currentColor">2</text><text x="3" y="19" font-size="6" fill="currentColor">3</text></svg>
      </button>
      
      <div class="w-px h-5 bg-border mx-1" />
      
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @mousedown.prevent="execCommand('formatBlock', 'blockquote')"
        title="Quote"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
      </button>
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @mousedown.prevent="execCommand('formatBlock', 'pre')"
        title="Code Block"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
      </button>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Right side: Privacy, Share, Download, Save -->
      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        :class="{ 'text-amber-500': isPrivate }"
        @click="emit('update:is-private', !isPrivate)"
        :title="isPrivate ? 'Private note (click to make public)' : 'Public note (click to make private)'"
      >
        <svg v-if="isPrivate" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
      </button>

      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @click="emit('share')"
        title="Share"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </button>

      <button
        type="button"
        class="p-1.5 rounded hover:bg-muted transition-colors"
        @click="emit('download')"
        title="Download"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>

      <button
        type="button"
        class="px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium flex items-center gap-1.5"
        @click="handleSave"
        :disabled="isSaving"
        title="Save (Ctrl+S)"
      >
        <svg v-if="isSaving" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        {{ isSaving ? 'Saving...' : 'Save' }}
      </button>
    </div>

    <!-- Editor -->
    <div class="flex-1 overflow-auto p-6">
      <div
        ref="editorRef"
        class="min-h-full outline-none prose prose-sm dark:prose-invert max-w-none focus:outline-none"
        contenteditable="true"
        @input="handleInput"
        @paste="handleInput"
      />
    </div>
  </div>
</template>

<style scoped>
/* Allow rich text editing (not plaintext-only) */
[contenteditable] {
  white-space: pre-wrap;
  word-wrap: break-word;
}

[contenteditable]:focus {
  outline: none;
}

/* Ensure proper spacing for formatted content */
:deep(h1) {
  font-size: 1.875rem;
  font-weight: 700;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
}

:deep(h2) {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
}

:deep(h3) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

:deep(blockquote) {
  border-left: 4px solid hsl(var(--muted-foreground));
  padding-left: 1rem;
  font-style: italic;
  margin-top: 1rem;
  margin-bottom: 1rem;
}

:deep(pre) {
  background-color: hsl(var(--muted));
  padding: 1rem;
  border-radius: 0.375rem;
  margin-top: 1rem;
  margin-bottom: 1rem;
  overflow-x: auto;
}

:deep(ul), :deep(ol) {
  margin-top: 1rem;
  margin-bottom: 1rem;
  margin-left: 1.5rem;
}

:deep(li) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
</style>
