<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import mammoth from 'mammoth'
import { toast } from '@/composables/useNotifications'
import { FileText, FileType, Image as ImageIcon, File, ScrollText } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { QUERY_API_URL } from '@/lib/api'

const props = defineProps<{
  file: {
    id?: string
    filename: string
    file_type: string
    storage_path?: string
    content?: ArrayBuffer | Blob
  }
}>()

const emit = defineEmits<{
  'download': []
}>()

// Viewer state
const viewerContent = ref<string>('')
const isLoading = ref(true)
const error = ref<string | null>(null)
const viewMode = ref<'pdf' | 'docx' | 'image' | 'markdown' | 'unsupported'>('unsupported')

// Determine file type
const fileExtension = computed(() => {
  const ext = props.file.filename.split('.').pop()?.toLowerCase()
  return ext || ''
})

const fileIcon = computed(() => {
  const ext = fileExtension.value
  if (ext === 'pdf') return FileText
  if (['doc', 'docx'].includes(ext)) return FileType
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return ImageIcon
  if (ext === 'md') return ScrollText
  return File
})

// Initialize viewer
const initializeViewer = async () => {
  isLoading.value = true
  error.value = null

  try {
    const ext = fileExtension.value

    // PDF
    if (ext === 'pdf') {
      viewMode.value = 'pdf'
      // PDF will be loaded via iframe
    }
    // DOCX
    else if (['doc', 'docx'].includes(ext)) {
      viewMode.value = 'docx'
      await loadDocx()
    }
    // Images
    else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      viewMode.value = 'image'
    }
    // Markdown
    else if (ext === 'md') {
      viewMode.value = 'markdown'
      await loadMarkdown()
    }
    // Unsupported
    else {
      viewMode.value = 'unsupported'
      error.value = `File type ".${ext}" is not supported for preview`
    }
  } catch (e: any) {
    console.error('[FileViewer] Failed to load file:', e)
    error.value =  e.message || 'Failed to load file'
    toast.error('Failed to load file')
  } finally {
    isLoading.value = false
  }
}

// Load DOCX using mammoth.js
const loadDocx = async () => {
  if (!props.file.content) {
    throw new Error('No file content provided')
  }

  try {
    const arrayBuffer = props.file.content instanceof Blob 
      ? await props.file.content.arrayBuffer()
      : props.file.content

    const result = await mammoth.convertToHtml({ arrayBuffer })
    viewerContent.value = result.value

    if (result.messages.length > 0) {
      console.warn('[FileViewer] Mammoth warnings:', result.messages)
    }
  } catch (e: any) {
    console.error('[FileViewer] DOCX conversion failed:', e)
    throw new Error('Failed to convert DOCX file')
  }
}

// Load Markdown
const loadMarkdown = async () => {
  if (!props.file.content) {
    // If we have an ID, we might want to fetch it textually?
    // For now, keep requirement for content for text files
    throw new Error('No file content provided')
  }

  try {
    if (props.file.content instanceof Blob) {
      viewerContent.value = await props.file.content.text()
    } else if (props.file.content instanceof ArrayBuffer) {
      const decoder = new TextDecoder()
      viewerContent.value = decoder.decode(props.file.content)
    } else {
        viewerContent.value = String(props.file.content)
    }
  } catch (e: any) {
    console.error('[FileViewer] Markdown loading failed:', e)
    throw new Error('Failed to load Markdown file')
  }
}

// Get file URL for rendering
const fileUrl = computed(() => {
  // 1. Content-based Blob URL (Priority)
  if (props.file.content) {
    if (props.file.content instanceof Blob) {
      return URL.createObjectURL(props.file.content)
    }
    // ArrayBuffer -> Blob
    const blob = new Blob([props.file.content], { 
      type: getMimeType(fileExtension.value) 
    })
    return URL.createObjectURL(blob)
  }

  // 2. ID-based Remote URL (Fallback)
  if (props.file.id) {
    return `${QUERY_API_URL}/files/${props.file.id}`
  }

  return ''
})

const getMimeType = (ext: string): string => {
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp'
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

// Lifecycle
watch(() => props.file, () => {
  initializeViewer()
}, { immediate: true, deep: true })
</script>

<template>
  <div class="flex flex-col h-full bg-background">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-border bg-muted/30">
      <div class="flex items-center gap-3">
        <component :is="fileIcon" class="w-5 h-5 text-muted-foreground" />
        <div>
          <h3 class="font-medium text-sm">{{ file.filename }}</h3>
          <p class="text-xs text-muted-foreground">{{ fileExtension.toUpperCase() }} File</p>
        </div>
      </div>
      <Button variant="outline" size="sm" @click="emit('download')">
        Download
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="text-center space-y-2">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p class="text-sm text-muted-foreground">Loading file...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center p-8">
      <div class="text-center space-y-3 max-w-md">
        <component :is="fileIcon" class="w-12 h-12 text-muted-foreground mx-auto" />
        <div class="space-y-1">
          <h3 class="font-medium">Unable to preview file</h3>
          <p class="text-sm text-muted-foreground">{{ error }}</p>
        </div>
        <Button variant="outline" @click="emit('download')">
          Download to view
        </Button>
      </div>
    </div>

    <!-- PDF Viewer -->
    <div v-else-if="viewMode === 'pdf'" class="flex-1 overflow-hidden">
      <iframe
        :src="fileUrl"
        class="w-full h-full border-0"
        title="PDF Viewer"
      />
    </div>

    <!-- DOCX Viewer -->
    <div v-else-if="viewMode === 'docx'" class="flex-1 overflow-auto p-8">
      <div
        class="max-w-4xl mx-auto bg-white dark:bg-zinc-900 p-12 shadow-lg rounded-lg prose prose-sm dark:prose-invert"
        v-html="viewerContent"
      />
    </div>

    <!-- Image Viewer -->
    <div v-else-if="viewMode === 'image'" class="flex-1 overflow-auto p-8 flex items-center justify-center bg-muted/20">
      <img
        :src="fileUrl"
        :alt="file.filename"
        class="max-w-full max-h-full object-contain rounded-lg shadow-lg"
      />
    </div>

    <!-- Markdown Viewer -->
    <div v-else-if="viewMode === 'markdown'" class="flex-1 overflow-auto p-8">
      <div class="max-w-4xl mx-auto bg-card p-12 shadow-sm border border-border rounded-lg">
        <MarkdownRenderer :content="viewerContent" />
      </div>
    </div>

    <!-- Unsupported -->
    <div v-else class="flex-1 flex items-center justify-center p-8">
      <div class="text-center space-y-3 max-w-md">
        <File class="w-12 h-12 text-muted-foreground mx-auto" />
        <div class="space-y-1">
          <h3 class="font-medium">Preview not available</h3>
          <p class="text-sm text-muted-foreground">
            This file type cannot be previewed in the browser.
          </p>
        </div>
        <Button variant="outline" @click="emit('download')">
          Download to view
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* DOCX content styling */
:deep(.docx-content) p {
  margin-bottom: 0.75rem;
}

:deep(.docx-content) h1,
:deep(.docx-content) h2,
:deep(.docx-content) h3 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

:deep(.docx-content) ul,
:deep(.docx-content) ol {
  margin-left: 1.5rem;
  margin-bottom: 0.75rem;
}
</style>
