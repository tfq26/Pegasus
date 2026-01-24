<script setup lang="ts">
import { ref } from 'vue'
import type { ConnectionFormState } from '@/views/settings/types'
import { FileCode, Upload, X, Info } from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref<string>('')

const triggerFileSelect = () => {
    fileInput.value?.click()
}

const handleFileSelect = async (event: Event) => {
    const input = event.target as HTMLInputElement
    if (input.files && input.files[0]) {
        const file = input.files[0]
        fileName.value = file.name
        
        // Read file content as text
        const reader = new FileReader()
        reader.onload = (e) => {
            const content = e.target?.result as string
            props.connectionForm.bigquery.credentials = content
        }
        reader.readAsText(file)
    }
}

const clearFile = () => {
    fileName.value = ''
    props.connectionForm.bigquery.credentials = ''
    if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-2">
      <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project ID</label>
      <input
        v-model="props.connectionForm.bigquery.projectId"
        type="text"
        placeholder="my-gcp-project-id"
        class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground font-mono"
      />
      <p class="text-[10px] text-muted-foreground">The project ID from your Google Cloud Console.</p>
    </div>

    <div class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service Account Key (JSON)</label>
        
        <div v-if="!fileName" class="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-muted/30 transition-colors cursor-pointer" @click="triggerFileSelect">
             <div class="p-3 rounded-full bg-primary/10 text-primary mb-1">
                 <FileCode class="w-6 h-6" />
             </div>
             <div class="text-sm font-medium">Upload Key File</div>
             <div class="text-xs text-muted-foreground text-center max-w-[200px]">Drag and drop or click to select your service-account.json</div>
        </div>

        <div v-else class="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
             <div class="flex items-center gap-3">
                 <div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                     <FileCode class="w-4 h-4" />
                 </div>
                 <div class="text-sm font-medium truncate max-w-[200px]">{{ fileName }}</div>
             </div>
             <button type="button" @click="clearFile" class="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors">
                 <X class="w-4 h-4" />
             </button>
        </div>

        <input
            ref="fileInput"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleFileSelect"
        />

        <div class="text-[10px] text-muted-foreground mt-1">
            <span class="font-semibold text-amber-500">Security Note:</span> The key file is used locally or sent securely to the backend. It allows Pegasus to query your BigQuery datasets.
        </div>
    </div>

    <!-- Live Cache Toggle -->
    <div class="mt-4 border p-3 rounded-lg bg-muted/20 space-y-4">
        <div class="flex items-center justify-between space-x-2">
            <div class="space-y-0.5">
                <div class="text-xs font-medium">Enable Live Cache</div>
                <p class="text-[10px] text-muted-foreground">Polls database periodically for live dashboard data.</p>
            </div>
            <Switch :checked="props.connectionForm.bigquery.enableLiveCache" @update:checked="(v) => props.connectionForm.bigquery.enableLiveCache = v" />
        </div>
        
        <div v-if="props.connectionForm.bigquery.enableLiveCache" class="space-y-3">
              <div class="space-y-1.5">
                <label class="text-[10px] uppercase tracking-wide text-muted-foreground">Polling Interval (seconds)</label>
                <input 
                    v-model.number="props.connectionForm.bigquery.pollingInterval" 
                    type="number"
                    min="10"
                    placeholder="300" 
                    class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary transition-colors" 
                />
                <p class="text-[10px] text-muted-foreground">Minimum 10 seconds. Default 300 (5 mins).</p>
              </div>

              <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex gap-3 items-start">
                <Info class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div class="space-y-1">
                    <p class="text-xs font-medium text-green-500">Live Dashboard Ready</p>
                    <p class="text-[10px] text-muted-foreground leading-relaxed">
                        Data will be cached in Pegasus Cloud. Dashboards will stream updates in real-time.
                    </p>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>
