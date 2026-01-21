<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from 'lucide-vue-next'
import { uploadFile } from '@/lib/api'
import { useSpaceStore } from '@/stores/space'
import type { ConnectionFormState } from '@/views/settings/types'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const emit = defineEmits<{
  'upload-success': []
}>()

const spaceStore = useSpaceStore()

const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const tempError = ref<string | null>(null)
const isDragging = ref(false)

const handleDrop = async (e: DragEvent) => {
    isDragging.value = false
    const file = e.dataTransfer?.files[0]
    if (file) await processFile(file)
}

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
    // Pass current spaceId for Smart Ingestion (auto-connect)
    const result = await uploadFile(file, spaceStore.currentSpaceId as string, true)
    if (result.success) {
      if (result.provider === 'duckdb') {
        // DuckDB upload (new system)
        props.connectionForm.provider = 'file' // Frontend uses 'file', converts to 'duckdb' in api.ts
        if (!props.connectionForm.sqlite) props.connectionForm.sqlite = { path: '' }
        props.connectionForm.sqlite.path = result.duckdbPath
        props.connectionForm.sqlite.tables = result.tables
      } else if (result.provider === 'surrealdb') {
        // Legacy SurrealDB upload
        props.connectionForm.provider = 'surrealdb'
        if (!props.connectionForm.surrealdb) props.connectionForm.surrealdb = {}
        props.connectionForm.surrealdb.uploadId = result.uploadId
      } else {
        // Legacy SQLite/Turso upload
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
      <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Upload File</label>
      
      <input 
          type="file" 
          ref="fileInput"
          accept=".xlsx,.xml,.json,.sqlite,.db"
          @change="handleFileUpload"
          class="hidden"
      />

      <!-- Success State -->
      <div 
        v-if="connectionForm.sqlite.path || connectionForm.surrealdb?.uploadId"
        class="w-full p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-between"
      >
          <div class="flex items-center gap-3">
              <div class="p-2 rounded-full bg-emerald-500/20 text-emerald-500">
                  <Upload class="w-4 h-4" /> 
              </div>
              <div class="space-y-0.5">
                  <p class="text-sm font-medium text-emerald-500">File uploaded successfully</p>
                  <p class="text-xs text-muted-foreground opacity-80">Ready to save connection</p>
              </div>
          </div>
          <button 
            type="button" 
            @click="fileInput?.click()"
            class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Replace
          </button>
      </div>

      <!-- Upload Zone -->
      <div 
          v-else
          @click="fileInput?.click()"
          @dragenter.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @dragover.prevent
          @drop.prevent="handleDrop"
          class="group relative w-full h-32 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer"
          :class="[
            isDragging 
              ? 'border-primary bg-primary/5 scale-[1.02] shadow-lg ring-2 ring-primary/20' 
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30',
            {'opacity-60 cursor-not-allowed': isUploading}
          ]"
      >
          <div 
            class="p-3 rounded-full bg-muted/50 group-hover:bg-background group-hover:shadow-sm transition-all duration-300 ring-1 ring-border/50"
          >
              <Upload class="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          
          <div class="text-center space-y-1">
             <p class="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                 {{ isUploading ? 'Uploading...' : 'Click to select file' }}
             </p>
             <p class="text-xs text-muted-foreground">
                 Supported formats: .xlsx, .xml, .json, .sqlite, .db
             </p>
          </div>
      </div>

      <p v-if="tempError" class="text-xs font-medium text-rose-500 flex items-center justify-center gap-2 mt-2">
         <span>⚠️</span> {{ tempError }}
      </p>
    <!-- Hidden SQLite path field -->
    <input type="hidden" v-model="connectionForm.sqlite.path" />
  </div>
</template>
