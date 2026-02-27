<script setup lang="ts">
import { ref } from 'vue'
import { AlertTriangle, Check, X, Command, Play } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from '@/composables/useNotifications'

const props = defineProps<{
  open: boolean
  mutation: {
    method: string
    reasoning: string
    confirmation: string
    example_formula?: string
    query: any
  }
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'apply': [mutation: any]
}>()

const handleApply = () => {
  emit('apply', props.mutation)
  emit('update:open', false)
  toast.success('Mutation protocol initialized')
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-md bg-stone-950 border-stone-800 text-stone-100 p-0 overflow-hidden shadow-2xl shadow-violet-500/10">
      <DialogHeader class="px-6 py-4 border-b border-stone-800 bg-stone-900/50">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <AlertTriangle class="w-4 h-4" />
          </div>
          <div>
            <DialogTitle class="text-[13px] font-black  tracking-widest text-stone-100">Review Data Mutation</DialogTitle>
            <DialogDescription class="text-[10px] text-stone-500 font-mono">SAFETY PROTOCOL ACTIVE</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div class="p-6 space-y-6">
        <!-- Reasoning -->
        <div class="space-y-2">
          <h4 class="text-[10px] font-black  tracking-widest text-stone-500">AI Reasoning</h4>
          <p class="text-[13px] text-stone-300 leading-relaxed">{{ mutation.reasoning }}</p>
        </div>

        <!-- Formula / Transformation Example -->
        <div v-if="mutation.example_formula" class="p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl">
           <div class="flex items-center gap-2 mb-2">
             <Command class="w-3 h-3 text-violet-400" />
             <span class="text-[9px] font-black  tracking-widest text-violet-400">Transformation Logic</span>
           </div>
           <div class="text-[15px] font-mono font-bold text-stone-100">{{ mutation.example_formula }}</div>
        </div>

        <!-- Confirmation Message -->
        <div class="p-4 bg-stone-900/50 border border-stone-800 rounded-xl border-l-4 border-l-emerald-500">
          <p class="text-[13px] text-stone-400 italic">"{{ mutation.confirmation }}"</p>
        </div>

        <!-- Warning -->
        <div class="text-[10px] text-stone-500 flex items-start gap-2 bg-stone-900/30 p-3 rounded-lg border border-stone-800/50">
          <div class="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0"></div>
          <p>Applying this change will modify your live table. You can undo this by selecting a previous version in the Versioning tab afterward.</p>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-stone-800 bg-stone-900/30 flex justify-between items-center gap-3">
        <button 
          @click="emit('update:open', false)"
          class="px-4 py-2 border border-stone-800 hover:bg-stone-800 text-stone-400 text-[10px] font-black  tracking-widest rounded-lg transition-all"
        >
          Decline
        </button>
        <button 
          @click="handleApply"
          class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-stone-100 text-stone-950 hover:bg-white text-[10px] font-black  tracking-widest rounded-lg transition-all shadow-xl shadow-stone-950/20"
        >
          <Play class="w-3 h-3 fill-current" />
          <span>Execute Mutation</span>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>
