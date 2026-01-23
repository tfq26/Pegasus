<script setup lang="ts">
import { ref } from 'vue'
import { Upload, X, Loader2, Check, FileSpreadsheet } from 'lucide-vue-next'
import { uploadFileToConnection } from '@/lib/api'
import { toast } from '@/composables/useNotifications'
import type { ConnectionEntry } from '@/lib/db-connections'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
  connection: ConnectionEntry | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'table-added': []
}>()

const isUploading = ref(false)
const uploadProgress = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isDragOver = ref(false)

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0] || null
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    selectedFile.value = event.dataTransfer.files[0] || null
  }
}

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const clearFile = () => {
  selectedFile.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const handleUpload = async () => {
  if (!selectedFile.value || !props.connection) return

  isUploading.value = true
  uploadProgress.value = 'Uploading file...'

  try {
    const result = await uploadFileToConnection(selectedFile.value, props.connection.id)
    
    if (result.success) {
      uploadProgress.value = 'Table created successfully!'
      toast.success(`Added ${result.tables?.length || 1} table(s) to ${props.connection.nickname}`)
      
      // Trigger refresh of connection schema
      emit('table-added')
      
      // Close dialog after short delay
      setTimeout(() => {
        emit('update:open', false)
        clearFile()
        uploadProgress.value = ''
      }, 1000)
    } else {
      throw new Error(result.error || 'Upload failed')
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Upload failed'
    toast.error(error)
    uploadProgress.value = ''
  } finally {
    isUploading.value = false
  }
}

const close = () => {
  if (!isUploading.value) {
    emit('update:open', false)
    clearFile()
    uploadProgress.value = ''
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="close">
    <DialogContent class="bg-card border-border text-foreground max-w-md rounded-xl p-0 overflow-hidden shadow-2xl">
      <div class="p-6 space-y-4">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-lg font-semibold">
            <Upload class="w-5 h-5 text-violet-500" />
            Add Table to {{ connection?.alias || connection?.nickname }}
          </DialogTitle>
          <DialogDescription class="text-muted-foreground text-sm">
            Upload a file to add a new table to this existing connection.
          </DialogDescription>
        </DialogHeader>

        <!-- Drop Zone -->
        <div 
          @drop="handleDrop"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          :class="[
            'relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
            isDragOver 
              ? 'border-violet-500 bg-violet-500/10' 
              : selectedFile 
                ? 'border-emerald-500/50 bg-emerald-500/5' 
                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
          ]"
          @click="fileInput?.click()"
        >
          <input 
            type="file" 
            ref="fileInput"
            accept=".xlsx,.xml,.json"
            @change="handleFileSelect"
            class="hidden"
          />
          
          <div v-if="selectedFile" class="space-y-2">
            <div class="w-12 h-12 mx-auto rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <FileSpreadsheet class="w-6 h-6 text-emerald-500" />
            </div>
            <p class="text-sm font-medium text-foreground">{{ selectedFile.name }}</p>
            <p class="text-xs text-muted-foreground">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
            <button 
              @click.stop="clearFile"
              class="text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1 mx-auto"
            >
              <X class="w-3 h-3" />
              Remove
            </button>
          </div>
          
          <div v-else class="space-y-3">
            <div class="w-12 h-12 mx-auto rounded-xl bg-muted flex items-center justify-center">
              <Upload class="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p class="text-sm font-medium text-foreground">Drop a file here or click to browse</p>
              <p class="text-xs text-muted-foreground mt-1">Supports Excel (.xlsx), JSON, and XML</p>
            </div>
          </div>
        </div>

        <!-- Progress -->
        <div v-if="uploadProgress" class="flex items-center gap-2 text-sm">
          <Loader2 v-if="isUploading" class="w-4 h-4 animate-spin text-violet-500" />
          <Check v-else class="w-4 h-4 text-emerald-500" />
          <span :class="isUploading ? 'text-muted-foreground' : 'text-emerald-500'">
            {{ uploadProgress }}
          </span>
        </div>
      </div>

      <DialogFooter class="bg-muted/40 p-4 border-t border-border flex items-center justify-end gap-3">
        <button 
          @click="close" 
          :disabled="isUploading"
          class="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button 
          @click="handleUpload" 
          :disabled="!selectedFile || isUploading"
          class="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg shadow-violet-950/20 transition-all active:scale-95 flex items-center gap-2"
        >
          <Loader2 v-if="isUploading" class="w-4 h-4 animate-spin" />
          <Upload v-else class="w-4 h-4" />
          {{ isUploading ? 'Uploading...' : 'Add Table' }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

