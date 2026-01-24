<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from 'lucide-vue-next'
import { uploadFile } from '@/lib/api'
import { api } from '@/lib/apiClient'
import { useSpaceStore } from '@/stores/space'
import { useConnectionStore } from '@/stores/connection'
import { toast } from '@/composables/useNotifications'
import type { ConnectionFormState } from '@/views/settings/types'
import SmartImportDialog from '@/components/Import/SmartImportDialog.vue'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const emit = defineEmits<{
  'upload-success': []
}>()

const spaceStore = useSpaceStore()
const connectionStore = useConnectionStore()

const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const tempError = ref<string | null>(null)
const isDragging = ref(false)

const smartImportOpen = ref(false)
const smartImportFiles = ref<any[]>([])

const handleDrop = async (e: DragEvent) => {
    isDragging.value = false
    const file = e.dataTransfer?.files[0]
    if (file) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        await handleZipUpload(file)
      } else {
        await processFile(file)
      }
    }
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files[0]
  if (!file) return
  
  // If ZIP, trigger smart flow
  if (file.name.toLowerCase().endsWith('.zip')) {
    await handleZipUpload(file)
    target.value = ''
    return
  }
  
  await processFile(file)
}

const handleZipUpload = async (file: File) => {
    if (!spaceStore.currentSpaceId) return
    isUploading.value = true
    
    try {
        toast.info(`Analyzing ZIP: ${file.name}...`)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('spaceId', (spaceStore.currentSpaceId as unknown) as string)

        const res = await api.upload<any>('/import/upload-zip', formData)
        
        if (res.suggestions && res.suggestions.length > 0) {
            smartImportFiles.value = res.suggestions
            smartImportOpen.value = true
        } else {
            toast.warning('No processable files found in ZIP')
        }
    } catch (e: any) {
        toast.error('ZIP upload failed', { description: e.message })
    } finally {
        isUploading.value = false
    }
}

const onSmartImportComplete = async () => {
    // Refresh both contexts
    await Promise.all([
        spaceStore.fetchSpaceContext(),
        connectionStore.loadConnections(true)
    ])
    toast.success('All items imported successfully')
    emit('upload-success')
}

const processFile = async (file: File) => {
  isUploading.value = true
  tempError.value = null

  try {
    // Pass current spaceId, but don't auto-create connection (let user edit details first)
    const result = await uploadFile(file, (spaceStore.currentSpaceId as unknown) as string, false)
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
      
      // Auto-set connection name from filename
      if (!props.connectionForm.nickname && !props.connectionForm.alias) {
        const fileName = file.name.split('.')[0] ?? 'Untitled'
        props.connectionForm.nickname = fileName
        props.connectionForm.alias = fileName
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
          accept=".xlsx,.xml,.json,.sqlite,.db,.zip"
          @change="handleFileUpload"
          class="hidden"
      />
      
      <!-- Enable Folder Upload via webkitdirectory hiddenly or just let user select zip -->

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
                 {{ isUploading ? 'Uploading & Analyzing...' : 'Select File or ZIP Folder' }}
             </p>
             <p class="text-xs text-muted-foreground">
                 Connect data files or import an entire folder via ZIP
             </p>
          </div>
      </div>

      <SmartImportDialog 
        v-model:open="smartImportOpen"
        :files="smartImportFiles"
        :space-id="(spaceStore.currentSpaceId as unknown) as string"
        @complete="onSmartImportComplete"
      />

      <p v-if="tempError" class="text-xs font-medium text-rose-500 flex items-center justify-center gap-2 mt-2">
         <span>⚠️</span> {{ tempError }}
      </p>
    <!-- Hidden SQLite path field -->
    <input type="hidden" v-model="connectionForm.sqlite.path" />
  </div>
</template>
