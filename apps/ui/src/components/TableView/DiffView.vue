<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { computed, ref, onMounted, watch } from 'vue'
import { ArrowRight, GitMerge, FilePlus, FileMinus, FileDiff, AlertTriangle } from 'lucide-vue-next'
import { Engine } from './Engine/Engine'

const props = defineProps<{
  open: boolean
  privateEngine: Engine
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm-merge': []
  'cancel': []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

interface ChangeItem {
    type: 'update' | 'create' | 'delete' | 'add_column' | 'drop_column'
    id?: number
    column?: string
    changes?: Record<string, any>
    data?: Record<string, any>
}

// State
const changes = ref<ChangeItem[]>([])
const isLoading = ref(false)

// Logic to compute diff
const computeDiff = () => {
    isLoading.value = true
    try {
        const ops = props.privateEngine.getPendingOperations()
        changes.value = ops
    } catch (e) {
        console.error("Failed to compute diff", e)
    } finally {
        isLoading.value = false
    }
}

watch(() => props.open, (newVal) => {
    if (newVal) {
        computeDiff()
    }
})

// Helper to get original value for visual diff
const getOriginalValue = (rowId: number, colName: string) => {
    // This is tricky because Engine doesn't expose easy lookup by ID for original data yet in a simple way
    // without iterating everything. For prototype, we might skip showing "Old Value" perfectly
    // or we can implement a lookup if needed.
    // For now, we'll try to find it in originalData if row mapping exists
    return "..." 
}

</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[800px] max-h-[85vh] flex flex-col bg-background border-border text-foreground">
      <DialogHeader class="shrink-0 border-b pb-4">
        <DialogTitle class="flex items-center gap-2 text-primary">
          <GitMerge class="w-5 h-5" />
          Review Changes
        </DialogTitle>
        <DialogDescription class="text-muted-foreground">
          Review your private changes before merging into the live dashboard.
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div v-if="isLoading" class="flex justify-center py-8 text-muted-foreground">
             Computing diff...
        </div>
        
        <div v-else-if="changes.length === 0" class="text-center py-12 text-muted-foreground">
            <div class="flex justify-center mb-2">
                <AlertTriangle class="w-8 h-8 opacity-50" />
            </div>
            <p>No changes detected.</p>
        </div>

        <div v-else class="space-y-4">
            <div v-for="(change, idx) in changes" :key="idx" class="border rounded-lg p-3 bg-card">
                
                <!-- UPDATE -->
                <div v-if="change.type === 'update'" class="flex flex-col gap-2">
                    <div class="flex items-center gap-2 text-sm font-medium text-amber-500">
                        <FileDiff class="w-4 h-4" />
                        <span>Row Modified</span>
                        <span class="text-xs text-muted-foreground font-mono">ID: {{change.id}}</span>
                    </div>
                    <div class="ml-6 space-y-1">
                        <div v-for="(val, key) in change.changes" :key="key" class="grid grid-cols-[120px_1fr] gap-2 text-sm">
                             <div class="text-muted-foreground">{{ key }}:</div>
                             <div class="flex items-center gap-2">
                                <span class="bg-muted px-1.5 py-0.5 rounded text-muted-foreground strike-through decoration-slate-400 opacity-70">
                                   <!-- TODO: Show original value -->
                                   Previous
                                </span>
                                <ArrowRight class="w-3 h-3 text-muted-foreground" />
                                <span class="text-amber-600 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded">{{ val }}</span>
                             </div>
                        </div>
                    </div>
                </div>

                <!-- CREATE -->
                <div v-else-if="change.type === 'create'" class="flex flex-col gap-2">
                    <div class="flex items-center gap-2 text-sm font-medium text-emerald-500">
                        <FilePlus class="w-4 h-4" />
                        <span>Row Added</span>
                    </div>
                    <div class="ml-6 text-sm text-foreground space-y-1">
                         <div v-for="(val, key) in change.data" :key="key" class="flex gap-2">
                             <span class="text-muted-foreground">{{ key }}:</span>
                             <span>{{ val }}</span>
                         </div>
                    </div>
                </div>

                <!-- DELETE -->
                 <div v-else-if="change.type === 'delete'" class="flex flex-col gap-2">
                    <div class="flex items-center gap-2 text-sm font-medium text-red-500">
                        <FileMinus class="w-4 h-4" />
                        <span>Row Deleted</span>
                        <span class="text-xs text-muted-foreground font-mono">ID: {{change.id}}</span>
                    </div>
                </div>
                
                 <!-- COLUMN OP -->
                 <div v-else-if="change.type === 'add_column' || change.type === 'drop_column'" class="flex flex-col gap-2">
                    <div class="flex items-center gap-2 text-sm font-medium" :class="change.type === 'add_column' ? 'text-emerald-500' : 'text-red-500'">
                        <component :is="change.type === 'add_column' ? FilePlus : FileMinus" class="w-4 h-4" />
                        <span>{{ change.type === 'add_column' ? 'Column Added' : 'Column Deleted' }}</span>
                    </div>
                    <div class="ml-6 font-mono text-sm bg-muted inline-block px-2 rounded">
                        {{ change.column }}
                    </div>
                </div>

            </div>
        </div>
      </div>

      <DialogFooter class="shrink-0 gap-2 pt-4 border-t">
        <button
          @click="isOpen = false"
          class="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          @click="emit('confirm-merge')"
          :disabled="changes.length === 0"
          class="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <GitMerge class="w-4 h-4" />
          Merge Changes
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
