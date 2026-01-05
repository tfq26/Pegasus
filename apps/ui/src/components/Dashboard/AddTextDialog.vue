<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent size="lg" class="max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Add Text Block</DialogTitle>
        <DialogDescription>Add rich text content to your dashboard using markdown.</DialogDescription>
      </DialogHeader>
      
      <div class="space-y-4 py-4 flex-1 overflow-auto">
        <div class="space-y-2">
          <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Title (Optional)
          </label>
          <input 
            v-model="title" 
            placeholder="e.g. Instructions" 
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Content
          </label>
          
          <!-- Rich Text Toolbar -->
          <RichTextToolbar @format="handleFormat" />
          
          <textarea 
            ref="textareaRef"
            v-model="content" 
            placeholder="Type your content here...&#10;&#10;You can use markdown:&#10;**bold**, *italic*, [link](url)" 
            class="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-y"
            @select="updateSelection"
            @keydown="handleKeydown"
          ></textarea>
          
          <!-- Preview -->
          <div v-if="content" class="mt-2 p-3 border border-border rounded-md bg-muted/30">
            <div class="text-xs text-muted-foreground mb-2 font-semibold">Preview:</div>
            <div 
              class="prose dark:prose-invert prose-sm max-w-none"
              v-html="renderMarkdown(content)"
            ></div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t">
        <button 
          @click="$emit('update:open', false)"
          class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
        >
          Cancel
        </button>
        <button 
          @click="handleSave"
          class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Add To Dashboard
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import RichTextToolbar from './RichTextToolbar.vue'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt()

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': [data: { title: string, content: string }]
}>()

const title = ref('')
const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const selectionStart = ref(0)
const selectionEnd = ref(0)

// Reset when opened
watch(() => props.open, (newVal) => {
  if (newVal) {
    title.value = ''
    content.value = ''
  }
})

const renderMarkdown = (text: string) => {
  return md.render(text || '')
}

const updateSelection = () => {
  if (textareaRef.value) {
    selectionStart.value = textareaRef.value.selectionStart
    selectionEnd.value = textareaRef.value.selectionEnd
  }
}

const insertMarkdown = (before: string, after: string = '') => {
  if (!textareaRef.value) return
  
  const start = textareaRef.value.selectionStart
  const end = textareaRef.value.selectionEnd
  const selectedText = content.value.substring(start, end)
  
  const newText = content.value.substring(0, start) + before + selectedText + after + content.value.substring(end)
  content.value = newText
  
  // Set cursor position
  setTimeout(() => {
    if (textareaRef.value) {
      const newPos = start + before.length + selectedText.length
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(newPos, newPos)
    }
  }, 0)
}

const handleFormat = (type: string, value?: any) => {
  switch (type) {
    case 'bold':
      insertMarkdown('**', '**')
      break
    case 'italic':
      insertMarkdown('*', '*')
      break
    case 'underline':
      insertMarkdown('<u>', '</u>')
      break
    case 'strikethrough':
      insertMarkdown('~~', '~~')
      break
    case 'h1':
      insertMarkdown('# ', '')
      break
    case 'h2':
      insertMarkdown('## ', '')
      break
    case 'h3':
      insertMarkdown('### ', '')
      break
    case 'bulletList':
      insertMarkdown('- ', '')
      break
    case 'orderedList':
      insertMarkdown('1. ', '')
      break
    case 'link':
      insertMarkdown('[', '](url)')
      break
    case 'code':
      insertMarkdown('```\n', '\n```')
      break
    case 'fontSize':
      // Markdown doesn't support font size directly, but we can use HTML
      insertMarkdown(`<span style="font-size: ${value}px">`, '</span>')
      break
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  // Handle keyboard shortcuts
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'b':
        e.preventDefault()
        handleFormat('bold')
        break
      case 'i':
        e.preventDefault()
        handleFormat('italic')
        break
      case 'u':
        e.preventDefault()
        handleFormat('underline')
        break
    }
  }
}

const handleSave = () => {
  emit('save', { title: title.value, content: content.value })
  emit('update:open', false)
}
</script>
