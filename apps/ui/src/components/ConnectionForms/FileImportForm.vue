<script setup lang="ts">
import { ref, computed } from 'vue'
import { Upload, Database, Globe } from 'lucide-vue-next'
import { uploadFile, uploadFileToKusto } from '@/lib/api'
import JSZip from 'jszip'
import { api } from '@/lib/apiClient'
import { useSpaceStore } from '@/stores/space'
import { useConnectionStore } from '@/stores/connection'
import { toast } from '@/composables/useNotifications'
import { showProgressToast } from '@/lib/toastProgress'
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
const folderInput = ref<HTMLInputElement | null>(null)
const tempError = ref<string | null>(null)
const isDragging = ref(false)

const smartImportOpen = ref(false)
const smartImportFiles = ref<any[]>([])
const destination = ref<'pegasus' | string>('pegasus')
const kustoConnections = computed(() => 
  ((connectionStore as any).connections || []).filter((c: any) => c.provider === 'kusto')
)

// Folder Handling - Drag Drop Only
const isZipping = ref(false)

// Recursive scanner helper
const scanDropFiles = async (item: any, zip: JSZip, path = '') => {
  if (item.isFile) {
    const file: File = await new Promise((resolve, reject) => {
      item.file(resolve, reject)
    })
    if (!file.name.startsWith('.')) {
      zip.file(path + file.name, file)
    }
  } else if (item.isDirectory) {
    const dirReader = item.createReader()
    const entries: any[] = await new Promise((resolve, reject) => {
      dirReader.readEntries(resolve, reject)
    })
    for (const entry of entries) {
      await scanDropFiles(entry, zip, path + item.name + '/')
    }
  }
}

const handleDrop = async (e: DragEvent) => {
    isDragging.value = false
    const items = e.dataTransfer?.items
    if (!items) return

    // Try to get as entry for folder support
    const entry = items[0]?.webkitGetAsEntry()
    
    if (entry && entry.isDirectory) {
      isZipping.value = true
      const progress = showProgressToast(`Scanning folder "${entry.name}"...`, 10);
      try {
        const zip = new JSZip()
        
        await scanDropFiles(entry, zip, '')
        
        progress.update(30, `Compressing folder...`, entry.name);
        
        const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
            progress.update(30 + (metadata.percent * 0.4), `Compressing: ${Math.round(metadata.percent)}%`, metadata.currentFile || entry.name);
        })
        
        const zipFile = new window.File([content], `${entry.name}.zip`, { type: 'application/zip' })
        
        progress.update(80, `Uploading ZIP...`, zipFile.name);
        await handleZipUpload(zipFile, progress)
      } catch (err: any) {
        // Error handled by handleZipUpload or here
        toast.error('Failed to process folder', { description: err.message })
      } finally {
        isZipping.value = false
      }
    } else {
      // Normal file
      const file = e.dataTransfer?.files[0]
      if (file) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          await handleZipUpload(file)
        } else {
          await processFile(file)
        }
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

const handleZipUpload = async (file: File, existingProgress?: any) => {
    if (!spaceStore.currentSpaceId) return
    isUploading.value = true
    
    const progress = existingProgress || showProgressToast(`Analyzing ZIP: ${file.name}...`, 10);
    
    try {
        if (!existingProgress) progress.update(20, `Uploading ZIP...`);
        
        const formData = new FormData()
        formData.append('file', file)
        formData.append('spaceId', (spaceStore.currentSpaceId as unknown) as string)

        const res = await api.upload<any>('/import/upload-zip', formData)
        
        if (res.suggestions && res.suggestions.length > 0) {
            progress.success('ZIP analyzed');
            smartImportFiles.value = res.suggestions
            smartImportOpen.value = true
        } else {
            progress.dismiss();
            toast.warning('No processable files found in ZIP')
        }
    } catch (e: any) {
        progress.error('ZIP upload failed', e.message);
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

const handleNativeFolderUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement
    if (!target.files || target.files.length === 0) return

    const files = Array.from(target.files)
    isZipping.value = true
    const progress = showProgressToast(`Compressing folder...`, 10);
    try {
        const zip = new JSZip()
        
        for (const file of files) {
            // Use webkitRelativePath to maintain folder structure
            const path = (file as any).webkitRelativePath || file.name
            // Skip hidden files
            if (!file.name.startsWith('.')) {
                zip.file(path, file)
            }
        }
        
        const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
            progress.update(10 + (metadata.percent * 0.7), `Compressing: ${Math.round(metadata.percent)}%`);
        })
        
        // Use the first part of the relative path as the zip name
        const folderName = files[0] ? (files[0] as any).webkitRelativePath.split('/')[0] : 'folder'
        const zipFile = new window.File([content], `${folderName}.zip`, { type: 'application/zip' })
        
        await handleZipUpload(zipFile, progress)
    } catch (err: any) {
        toast.error('Failed to process folder', { description: err.message })
    } finally {
        isZipping.value = false
        target.value = ''
    }
}

const processFile = async (file: File) => {
  isUploading.value = true
  tempError.value = null

  try {
    if (destination.value === 'pegasus') {
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
      } else {
        tempError.value = (result.error as string) || 'Upload failed'
        return
      }
    } else {
      // Kusto Ingestion Flow
      const kustoConn = kustoConnections.value.find((c: any) => c.id === destination.value)
      if (!kustoConn || !kustoConn.kusto) {
        throw new Error('Selected Kusto cluster not found or misconfigured')
      }

      const clusterUrl = kustoConn.kusto.cluster
      const database = kustoConn.kusto.database
      // Simple table name from filename
      const table = (file as any).name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_')
      
      const progress = showProgressToast(`Ingesting into Kusto...`, 20, table);
      const result = await uploadFileToKusto(file, clusterUrl, database, table)
      
      if (result.success) {
        progress.success(`Successfully ingested into Kusto`, `Table: ${table}`);
        // We could also auto-configure the form to point to this new table
        props.connectionForm.provider = 'kusto'
        props.connectionForm.kusto = {
          ...kustoConn.kusto,
          table: table
        }
      } else {
        progress.error('Kusto ingestion failed', result.error);
        throw new Error(result.error || 'Kusto ingestion failed')
      }
    }
    
    // Auto-set connection name from filename
    if (!props.connectionForm.nickname && !props.connectionForm.alias) {
      // Strip extension, replace separators with spaces, title case basic
      const rawName = file.name.split('.')[0] ?? 'Untitled'
      const cleanName = rawName.replace(/[_-]/g, ' ').trim()
      
      props.connectionForm.nickname = cleanName
      props.connectionForm.alias = cleanName
    }
    emit('upload-success')
  } catch (e: any) {
    tempError.value = e.message || 'Upload failed'
    toast.error('Upload failed', { description: e.message })
  } finally {
    isUploading.value = false
  }
}

// Folder Handling - Drag Drop Only
</script>

<template>
  <div class="space-y-4">
      <div class="flex items-center justify-between">
          <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Upload File</label>
          <div v-if="kustoConnections.length > 0" class="flex items-center gap-2">
              <span class="text-[10px] text-muted-foreground">Destination:</span>
              <select 
                  v-model="destination"
                  class="text-[10px] bg-transparent border-none focus:ring-0 p-0 pr-6 h-auto font-medium text-primary cursor-pointer"
              >
                  <option value="pegasus">Pegasus Cloud (Default)</option>
                  <optgroup label="Your Kusto Clusters">
                      <option v-for="conn in kustoConnections" :key="conn.id" :value="conn.id">
                          {{ conn.name || conn.alias || 'Kusto Cluster' }}
                      </option>
                  </optgroup>
              </select>
          </div>
      </div>
      
      <input 
          type="file" 
          ref="fileInput"
          accept=".xlsx,.xml,.json,.sqlite,.db,.zip"
          @change="handleFileUpload"
          class="hidden"
      />

      <input 
          type="file" 
          ref="folderInput"
          webkitdirectory 
          directory
          @change="handleNativeFolderUpload"
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
          @dragenter.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @dragover.prevent
          @drop.prevent="handleDrop"
          class="group relative w-full h-36 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all duration-300"
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
             <template v-if="isZipping || isUploading">
                 <p class="text-sm font-medium text-foreground">
                    {{ isZipping ? 'Compressing folder...' : 'Uploading & Analyzing...' }}
                 </p>
             </template>
             <template v-else>
                 <div class="flex items-center gap-2 text-sm font-medium">
                    <button 
                        type="button"
                        @click="fileInput?.click()"
                        class="text-foreground hover:text-primary transition-colors border-b border-dashed border-foreground/30 hover:border-primary"
                    >
                        Select File
                    </button>
                    <span class="text-muted-foreground">or</span>
                    <button 
                        type="button"
                        @click="folderInput?.click()"
                        class="text-foreground hover:text-primary transition-colors border-b border-dashed border-foreground/30 hover:border-primary"
                    >
                        Select Folder
                    </button>
                 </div>
                 <p class="text-xs text-muted-foreground mt-2">
                     ... or drag & drop a folder here
                 </p>
             </template>
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
