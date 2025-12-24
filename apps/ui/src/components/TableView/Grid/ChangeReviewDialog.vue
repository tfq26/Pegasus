<script setup lang="ts">
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import type { RowDiff } from '../Engine/types';
import { 
  Plus, 
  Minus, 
  ArrowRight, 
  AlertCircle,
  Database,
  History,
  X
} from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
  diffs: RowDiff[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'commit'): void;
}>();

const formatValue = (val: any) => {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'string') return `"${val}"`;
  return String(val);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 border-stone-800 bg-stone-950 text-stone-100 ring-1 ring-white/10">
      <DialogHeader class="p-6 border-b border-white/5 relative bg-stone-950">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/20 shadow-[0_0_20px_-5px_theme(colors.violet.500/0.3)]">
            <History class="w-6 h-6" />
          </div>
          <div class="space-y-1">
            <DialogTitle class="text-2xl font-black tracking-tight uppercase italic">Review Changes</DialogTitle>
            <DialogDescription class="text-stone-500 font-medium">
              Verify your modifications before committing to the database.
            </DialogDescription>
          </div>
        </div>
        
        <button 
          @click="emit('update:open', false)"
          class="absolute top-6 right-6 p-2 rounded-lg hover:bg-stone-900 text-stone-500 hover:text-stone-100 transition-all"
        >
          <X class="w-5 h-5" />
        </button>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-950/20">
        <div v-if="diffs.length === 0" class="flex flex-col items-center justify-center py-20 text-stone-600">
          <Database class="w-16 h-16 mb-4 opacity-10 animate-pulse" />
          <p class="font-black uppercase tracking-widest text-xs">No pending changes found</p>
        </div>

        <div v-for="(diff, index) in diffs" :key="index" class="group relative rounded-2xl border border-white/5 bg-stone-900/40 hover:bg-stone-900 transition-all overflow-hidden shadow-xl">
          <!-- Row Header Indicator -->
          <div :class="[
            'absolute top-0 left-0 bottom-0 w-1',
            diff.type === 'create' ? 'bg-emerald-500' : diff.type === 'update' ? 'bg-blue-500' : 'bg-rose-500'
          ]"></div>

          <div class="px-5 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Row {{ diff.row }}</span>
              <div class="h-1 w-1 rounded-full bg-stone-700"></div>
              <span v-if="diff.rowId" class="text-[10px] font-mono text-stone-600 tracking-tighter">REF: {{ diff.rowId }}</span>
              
              <div v-if="diff.type === 'create'" class="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                Created
              </div>
              <div v-else-if="diff.type === 'update'" class="ml-2 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[9px] font-black uppercase tracking-widest border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                Modified
              </div>
              <div v-else-if="diff.type === 'delete'" class="ml-2 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[9px] font-black uppercase tracking-widest border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]">
                Deleted
              </div>
            </div>
          </div>

          <div class="p-5 space-y-4">
            <!-- Update Flow -->
            <template v-if="diff.type === 'update'">
              <div class="space-y-3">
                <div v-for="(change, col) in diff.changes" :key="col" class="grid grid-cols-[1fr,auto,1fr] gap-4 items-center group/item">
                  <div class="flex flex-col gap-2">
                    <span class="text-[10px] font-black uppercase tracking-widest text-stone-600 group-hover/item:text-stone-400 transition-colors">{{ col }}</span>
                    <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-stone-950 border border-white/5 text-stone-500 text-sm italic line-through shadow-inner">
                      <Minus class="w-3.5 h-3.5 opacity-30" />
                      {{ formatValue(change.before) }}
                    </div>
                  </div>
                  
                  <div class="mt-6 flex items-center justify-center">
                    <div class="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center border border-white/5">
                      <ArrowRight class="w-4 h-4 text-stone-500" />
                    </div>
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-violet-500/5 border border-violet-500/10 text-violet-100 text-sm font-medium shadow-2xl shadow-violet-500/5">
                      <Plus class="w-3.5 h-3.5 text-violet-400" />
                      {{ formatValue(change.after) }}
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Create/Delete Flow -->
            <template v-else>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div v-for="(val, col) in diff.data" :key="col" class="flex flex-col gap-1.5 p-3 rounded-xl bg-stone-950 border border-white/5 hover:border-white/10 transition-colors group/cell shadow-inner">
                  <span class="text-[9px] font-black uppercase tracking-widest text-stone-600 group-hover/cell:text-stone-500 transition-colors">{{ col }}</span>
                  <span :class="[
                    'text-xs font-medium truncate',
                    diff.type === 'create' ? 'text-emerald-400' : 'text-rose-400/60 italic line-through'
                  ]">
                    {{ formatValue(val) }}
                  </span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <DialogFooter class="p-6 border-t border-white/5 bg-stone-950">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-3 text-stone-600 group cursor-help">
            <div class="w-8 h-8 rounded-full bg-orange-500/5 border border-orange-500/10 flex items-center justify-center text-orange-500 shadow-lg shadow-orange-500/5">
              <AlertCircle class="w-4 h-4" />
            </div>
            <span class="text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">IRREVERSIBLE OPERATION</span>
          </div>
          
          <div class="flex items-center gap-4">
            <button 
              @click="emit('update:open', false)"
              class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 hover:text-stone-100 transition-all hover:bg-white/5"
            >
              Cancel
            </button>
            <button 
              @click="emit('commit')"
              :disabled="loading || diffs.length === 0"
              class="relative flex items-center gap-3 px-8 py-3 rounded-2xl bg-white text-stone-950 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-stone-200 transition-all shadow-2xl shadow-white/10 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed group"
            >
              <span v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white rounded-2xl">
                <div class="w-4 h-4 border-2 border-stone-300 border-t-stone-950 rounded-full animate-spin"></div>
              </span>
              <template v-else>
                <Database class="w-4 h-4" />
                <span>Execute Commit</span>
                <ArrowRight class="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </template>
            </button>
          </div>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/* Custom scrollbar for stone theme */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.1);
}

.shadow-inner {
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.4);
}
</style>
