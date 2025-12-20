<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <!-- Text Element Editor -->
    <DialogContent v-if="element?.type === 'text'" class="sm:max-w-[700px] max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Edit Text Block</DialogTitle>
        <DialogDescription>Edit your text content.</DialogDescription>
      </DialogHeader>
      
      <div class="space-y-4 py-4 flex-1 overflow-auto">
        <div class="space-y-2">
          <label class="text-sm font-medium">Title (Optional)</label>
          <input 
            v-model="textTitle" 
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">Content</label>
          <RichTextToolbar @format="handleFormat" />
          <textarea 
            ref="textareaRef"
            v-model="textContent" 
            class="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
            @select="updateSelection"
            @keydown="handleKeydown"
          ></textarea>
          
          <div v-if="textContent" class="mt-2 p-3 border border-border rounded-md bg-muted/30">
            <div class="text-xs text-muted-foreground mb-2 font-semibold">Preview:</div>
            <div class="prose dark:prose-invert prose-sm max-w-none" v-html="renderMarkdown(textContent)"></div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t">
        <button @click="$emit('update:open', false)" class="px-4 py-2 text-sm border rounded-md">Cancel</button>
        <button @click="saveTextElement" class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">Save Changes</button>
      </div>
    </DialogContent>

    <!-- File Element Editor -->
    <DialogContent v-else-if="element?.type === 'file'" class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Edit File Attachment</DialogTitle>
        <DialogDescription>Update file information.</DialogDescription>
      </DialogHeader>
      
      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Display Title</label>
          <input 
            v-model="fileTitle" 
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        
        <div class="p-4 border border-border rounded-md bg-muted/30">
          <div class="flex items-center gap-3">
            <File class="w-8 h-8 text-primary" />
            <div>
              <div class="text-sm font-medium">{{ element.config.fileName }}</div>
              <div class="text-xs text-muted-foreground">{{ formatSize(element.config.fileSize) }}</div>
            </div>
          </div>
        </div>
        
        <div class="text-xs text-muted-foreground">
          Note: To replace the file, delete this element and add a new one.
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t">
        <button @click="$emit('update:open', false)" class="px-4 py-2 text-sm border rounded-md">Cancel</button>
        <button @click="saveFileElement" class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md">Save Changes</button>
      </div>
    </DialogContent>

    <!-- Chart/Visualization Element Editor (existing) -->
    <DashboardElementEditor 
      v-else
      :open="open"
      :element="element"
      @update:open="$emit('update:open', $event)"
      @save="$emit('save', $event)"
    />
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import RichTextToolbar from './RichTextToolbar.vue'
import DashboardElementEditor from './DashboardElementEditor.vue'
import { File } from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt()

const props = defineProps<{
  open: boolean
  element: any
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': [element: any]
}>()

const textTitle = ref('')
const textContent = ref('')
const fileTitle = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.element, (newElement) => {
  if (newElement) {
    if (newElement.type === 'text') {
      textTitle.value = newElement.title || ''
      textContent.value = newElement.config?.content || ''
    } else if (newElement.type === 'file') {
      fileTitle.value = newElement.title || ''
    }
  }
}, { immediate: true })

const renderMarkdown = (text: string) => md.render(text || '')

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const updateSelection = () => {
  // For toolbar formatting
}

const insertMarkdown = (before: string, after: string = '') => {
  if (!textareaRef.value) return
  
  const start = textareaRef.value.selectionStart
  const end = textareaRef.value.selectionEnd
  const selectedText = textContent.value.substring(start, end)
  
  const newText = textContent.value.substring(0, start) + before + selectedText + after + textContent.value.substring(end)
  textContent.value = newText
  
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
    case 'bold': insertMarkdown('**', '**'); break
    case 'italic': insertMarkdown('*', '*'); break
    case 'underline': insertMarkdown('<u>', '</u>'); break
    case 'strikethrough': insertMarkdown('~~', '~~'); break
    case 'h1': insertMarkdown('# ', ''); break
    case 'h2': insertMarkdown('## ', ''); break
    case 'h3': insertMarkdown('### ', ''); break
    case 'bulletList': insertMarkdown('- ', ''); break
    case 'orderedList': insertMarkdown('1. ', ''); break
    case 'link': insertMarkdown('[', '](url)'); break
    case 'code': insertMarkdown('```\n', '\n```'); break
    case 'fontSize': insertMarkdown(`<span style="font-size: ${value}px">`, '</span>'); break
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'b': e.preventDefault(); handleFormat('bold'); break
      case 'i': e.preventDefault(); handleFormat('italic'); break
      case 'u': e.preventDefault(); handleFormat('underline'); break
    }
  }
}

const saveTextElement = () => {
  emit('save', {
    ...props.element,
    title: textTitle.value,
    config: { content: textContent.value }
  })
}

const saveFileElement = () => {
  emit('save', {
    ...props.element,
    title: fileTitle.value
  })
}
</script>
