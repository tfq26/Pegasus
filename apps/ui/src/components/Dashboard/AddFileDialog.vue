<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Upload File</DialogTitle>
        <DialogDescription>
          Upload a file or zip folder to your dashboard. Max size 200MB.
        </DialogDescription>
      </DialogHeader>
      
      <div class="grid w-full items-center gap-4 py-4">
        <div 
          class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
          :class="{'border-primary bg-primary/5': isDragging}"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
          @click="triggerFileInput"
        >
          <div v-if="!selectedFile" class="flex flex-col items-center justify-center pt-5 pb-6">
            <UploadCloud class="w-8 h-8 mb-2 text-muted-foreground" />
            <p class="mb-1 text-sm text-muted-foreground"><span class="font-semibold">Click to upload</span> or drag and drop</p>
            <p class="text-xs text-muted-foreground">Any file type up to 200MB</p>
          </div>
          <div v-else class="flex flex-col items-center justify-center p-4">
            <File class="w-8 h-8 mb-2 text-primary" />
            <p class="text-sm font-medium text-center break-all">{{ selectedFile.name }}</p>
            <p class="text-xs text-muted-foreground">{{ formatSize(selectedFile.size) }}</p>
            <button 
              @click.stop="selectedFile = null" 
              class="mt-2 text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
          <input 
            ref="fileInput" 
            type="file" 
            class="hidden" 
            @change="handleFileSelect" 
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium leading-none">Title (Optional)</label>
          <input 
            v-model="title" 
            placeholder="Display name for the file" 
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <button 
          @click="$emit('update:open', false)"
          class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
        >
          Cancel
        </button>
        <button 
          @click="handleSave"
          :disabled="!selectedFile"
          class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Upload & Add
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
import { UploadCloud, File } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': [data: { file: File, title: string }]
}>()

const title = ref('')
const selectedFile = ref<File | null>(null)
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const file = input.files[0]
    if (file) {
      selectedFile.value = file
      if (!title.value) {
        title.value = file.name
      }
    }
  }
}

const handleDrop = (event: DragEvent) => {
  isDragging.value = false
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    const file = event.dataTransfer.files[0]
    if (file) {
      selectedFile.value = file
      if (!title.value) {
        title.value = file.name
      }
    }
  }
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Reset when opened
watch(() => props.open, (newVal) => {
  if (newVal) {
    title.value = ''
    selectedFile.value = null
  }
})

const handleSave = () => {
  if (selectedFile.value) {
    emit('save', { file: selectedFile.value, title: title.value })
    emit('update:open', false)
  }
}
</script>
