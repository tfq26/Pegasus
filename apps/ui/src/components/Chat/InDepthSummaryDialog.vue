<script setup lang="ts">
import { ref, computed } from 'vue'
import { Copy, Check } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from '@/composables/useNotifications'
import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{
  open: boolean
  text: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const copied = ref(false)

// Render markdown
const renderedContent = computed(() => renderMarkdown(props.text))

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
    toast.success('Summary copied to clipboard')
  } catch (err) {
    toast.error('Failed to copy')
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <!-- Remove X button by not using DialogClose, just custom close-on-click-outside -->
    <DialogContent class="max-w-2xl bg-stone-950 border-stone-800 text-stone-100 p-0 overflow-hidden [&>button]:hidden">
      <DialogHeader class="px-6 py-4 border-b border-stone-800 bg-stone-900/50">
        <div class="flex items-center justify-between w-full">
          <div>
            <DialogTitle class="text-sm font-black uppercase tracking-widest text-violet-400">In-Depth Analysis</DialogTitle>
            <DialogDescription class="text-[10px] text-stone-500 font-mono mt-1">PEGASUS INTELLIGENCE REPORT</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div class="px-6 py-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
        <div 
          class="prose prose-invert prose-stone max-w-none 
                 prose-p:text-stone-300 prose-p:text-[15px] prose-p:leading-7 prose-p:mb-4
                 prose-strong:text-violet-300 prose-strong:font-semibold
                 prose-li:text-stone-300 prose-li:mb-2
                 prose-ul:space-y-2 prose-ul:my-4
                 prose-headings:text-stone-100 prose-headings:mb-3"
          v-html="renderedContent"
        />
      </div>

      <div class="px-6 py-4 border-t border-stone-800 bg-stone-900/30 flex justify-end gap-3">
        <button 
          @click="copyToClipboard"
          class="flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 hover:text-stone-100 hover:border-stone-600 text-[10px] font-bold uppercase tracking-wider transition-all"
        >
          <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" />
          <span>{{ copied ? 'Copied' : 'Copy All' }}</span>
        </button>
        <button 
          @click="emit('update:open', false)"
          class="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
        >
          Close Report
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #292524;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #44403c;
}
</style>
