<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  FileSpreadsheet, Database, FileText, StickyNote, X, 
  Loader2, Sparkles, CheckCircle2, AlertCircle, ChevronDown
} from 'lucide-vue-next'
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select'
import { toast } from '@/composables/useNotifications'
import { api } from '@/lib/apiClient'

interface FileSuggestion {
  filename: string
  key: string
  size?: number
  suggested_action: 'spreadsheet' | 'database' | 'note' | 'file' | 'skip'
  reasoning: string
  options: any
  status?: 'pending' | 'processing' | 'success' | 'error'
}

const props = defineProps<{
  open: boolean
  files: Array<{ name: string; key: string; size: number }>
  spaceId?: string
}>()

const emit = defineEmits(['update:open', 'complete'])

const suggestions = ref<FileSuggestion[]>([])
const isLoading = ref(true)
const isImporting = ref(false)
const importResults = ref<any[]>([])

const analyzeFiles = async () => {
  isLoading.value = true
  try {
    const res = await api.post<any>('/import/analyze', {
      files: props.files,
      spaceId: props.spaceId
    })
    suggestions.value = res.suggestions.map((s: any) => ({
      ...s,
      key: props.files.find(f => f.name === s.filename)?.key || '',
      size: props.files.find(f => f.name === s.filename)?.size || 0,
      status: 'pending'
    }))
  } catch (e) {
    toast.error('Failed to analyze files')
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

const handleImport = async () => {
  isImporting.value = true
  try {
    const res = await api.post<any>('/import/execute', {
      actions: suggestions.value.map(s => ({
        type: s.suggested_action,
        filename: s.filename,
        key: s.key,
        size: s.size,
        options: s.options
      })),
      spaceId: props.spaceId
    })
    
    importResults.value = res.results
    toast.success('Import completed')
    emit('complete', res.results)
    emit('update:open', false)
  } catch (e) {
    toast.error('Import failed')
    console.error(e)
  } finally {
    isImporting.value = false
  }
}

const getIcon = (action: string) => {
  switch (action) {
    case 'spreadsheet': return FileSpreadsheet
    case 'database': return Database
    case 'note': return StickyNote
    case 'file': return FileText
    default: return X
  }
}

const getActionColor = (action: string) => {
  switch (action) {
    case 'spreadsheet': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    case 'database': return 'text-blue-500 bg-blue-500/10 border-blue-500/20'
    case 'note': return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
    case 'file': return 'text-violet-500 bg-violet-500/10 border-violet-500/20'
    case 'skip': return 'text-muted-foreground bg-muted border-border'
    default: return ''
  }
}

onMounted(() => {
  if (props.open && props.files.length > 0) {
    analyzeFiles()
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-border shadow-2xl">
      <DialogHeader class="p-6 pb-2">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles class="w-5 h-5 text-primary" />
          </div>
          <DialogTitle class="text-xl">Smart Import</DialogTitle>
        </div>
        <DialogDescription>
          Pegasus has analyzed your files and suggested the best way to organize them. Review and confirm below.
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 class="w-10 h-10 animate-spin text-primary" />
          <p class="text-sm font-medium text-muted-foreground animate-pulse">Analyzing files with AI...</p>
        </div>

        <div v-else class="space-y-3">
          <div 
            v-for="(s, i) in suggestions" 
            :key="i"
            class="group relative flex flex-col p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3 flex-1">
                <div :class="['p-2 rounded-lg border', getActionColor(s.suggested_action)]">
                  <component :is="getIcon(s.suggested_action)" class="w-5 h-5" />
                </div>
                <div class="space-y-1">
                  <p class="text-sm font-semibold truncate">{{ s.filename }}</p>
                  <p class="text-xs text-muted-foreground leading-relaxed">{{ s.reasoning }}</p>
                </div>
              </div>

              <div class="flex flex-col items-end gap-2">
                <Select v-model="s.suggested_action">
                  <SelectTrigger class="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spreadsheet">Spreadsheet</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="file">File</SelectItem>
                    <SelectItem value="skip">Skip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <!-- Action Specific Options -->
            <div v-if="s.suggested_action !== 'skip'" class="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-4">
              <div v-if="s.suggested_action === 'spreadsheet'" class="space-y-1.5">
                <label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Table Name</label>
                <Input v-model="s.options.tableName" class="h-8 text-xs bg-background" placeholder="table_name" />
              </div>
              <div v-if="s.suggested_action === 'note' || s.suggested_action === 'file'" class="space-y-1.5 col-span-2">
                <label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Display Title</label>
                <Input v-model="s.options.title" class="h-8 text-xs bg-background" placeholder="Enter title" />
              </div>
              <div v-if="s.suggested_action === 'database'" class="space-y-1.5">
                <label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nickname</label>
                <Input v-model="s.options.nickname" class="h-8 text-xs bg-background" placeholder="My Database" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="p-6 pt-2 border-t border-border flex items-center justify-between">
        <p class="text-xs text-muted-foreground">
          Ready to import <span class="font-bold text-foreground">{{ suggestions.filter(s => s.suggested_action !== 'skip').length }}</span> items.
        </p>
        <div class="flex gap-3">
          <Button variant="ghost" @click="emit('update:open', false)" :disabled="isImporting">Cancel</Button>
          <Button 
            @click="handleImport" 
            :disabled="isLoading || isImporting || suggestions.length === 0"
            class="gap-2 px-6"
          >
            <Loader2 v-if="isImporting" class="w-4 h-4 animate-spin" />
            <CheckCircle2 v-else class="w-4 h-4" />
            {{ isImporting ? 'Importing...' : 'Confirm & Import' }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.col-span-2 {
  grid-column: span 2 / span 2;
}
</style>
