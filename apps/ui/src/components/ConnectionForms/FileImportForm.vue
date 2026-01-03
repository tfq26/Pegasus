<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from 'lucide-vue-next'
import { uploadFile } from '@/lib/api'
import type { ConnectionFormState } from '@/views/settings/types'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const emit = defineEmits<{
  'upload-success': []
}>()

const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const tempError = ref<string | null>(null)

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files[0]
  if (!file) return
  await processFile(file)
}

const processFile = async (file: File) => {
  isUploading.value = true
  tempError.value = null

  try {
    const result = await uploadFile(file)
    if (result.success) {
      if (result.provider === 'surrealdb') {
        props.connectionForm.provider = 'surrealdb'
        if (!props.connectionForm.surrealdb) props.connectionForm.surrealdb = {}
        props.connectionForm.surrealdb.uploadId = result.uploadId
      } else {
        props.connectionForm.sqlite.path = result.dbPath || ''
        props.connectionForm.sqlite.authToken = result.authToken
        props.connectionForm.sqlite.tables = result.tables
      }
      
      // Auto-set nickname if empty
      if (!props.connectionForm.nickname) {
        props.connectionForm.nickname = file.name.split('.')[0] ?? 'Untitled'
      }
      emit('upload-success')
    } else {
      tempError.value = (result.error as string) || 'Upload failed'
    }
  } catch (e) {
    tempError.value = e instanceof Error ? e.message : 'Upload failed'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Upload File</label>
      <div class="flex items-center gap-3">
          <input 
              type="file" 
              ref="fileInput"
              accept=".xlsx,.xml,.json"
              @change="handleFileUpload"
              class="hidden"
          />
          <button 
              type="button"
              @click="fileInput?.click()"
              class="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-input hover:border-primary hover:bg-muted/50 transition-colors text-sm text-muted-foreground"
          >
              <Upload class="w-4 h-4" />
              {{ isUploading ? 'Uploading...' : 'Choose File (Excel, JSON, XML)' }}
          </button>
          <span v-if="connectionForm.sqlite.path || connectionForm.surrealdb?.uploadId" class="text-xs text-emerald-400">
              File uploaded successfully!
          </span>
      </div>
      <p v-if="tempError" class="text-[10px] text-rose-500">{{ tempError }}</p>
      <p class="text-[10px] text-muted-foreground">Supported formats: .xlsx, .xml, .json</p>
    </div>
    <!-- Hidden SQLite path field -->
    <input type="hidden" v-model="connectionForm.sqlite.path" />
  </div>
</template>
