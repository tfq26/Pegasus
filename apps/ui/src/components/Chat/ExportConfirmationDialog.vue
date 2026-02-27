<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, FileDown } from 'lucide-vue-next'
import { computed } from 'vue'

const props = defineProps<{
  open: boolean
  format: 'csv' | 'xlsx' | 'pdf'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const formatLabel = computed(() => {
    switch (props.format) {
        case 'csv': return 'CSV'
        case 'xlsx': return 'Excel'
        case 'pdf': return 'PDF'
        default: return props.format
    }
})
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[425px] bg-stone-950 border-stone-800 text-stone-100 p-0 overflow-hidden shadow-2xl shadow-violet-500/10">
      <DialogHeader class="px-6 py-4 border-b border-stone-800 bg-stone-900/50">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-500">
            <FileDown class="h-4 w-4" />
          </div>
          <div>
            <DialogTitle class="text-[13px] font-black  tracking-widest text-stone-100">Export to {{ formatLabel }}</DialogTitle>
            <DialogDescription class="text-[10px] text-stone-500 font-mono italic">DATA EXTRACTION PROTOCOL</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div class="p-6 space-y-4">
        <p class="text-[13px] text-stone-400 leading-relaxed">
          You are about to export this view as a <strong>disconnected copy</strong>.
        </p>

        <div class="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex gap-3 items-start">
          <AlertTriangle class="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p class="text-[12px] leading-relaxed text-stone-300">
            Live formulas and data connections will be replaced by static values. The resulting file will be independent of this workspace.
          </p>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-stone-800 bg-stone-900/30 flex justify-end items-center gap-3">
        <button 
          @click="isOpen = false"
          class="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-400 text-[10px] font-black  tracking-widest rounded-lg transition-all"
        >
          Cancel
        </button>
        <button 
          @click="emit('confirm')"
          class="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white hover:bg-violet-500 text-[10px] font-black  tracking-widest rounded-lg transition-all shadow-xl shadow-violet-950/20"
        >
          <span>Begin Export</span>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>
