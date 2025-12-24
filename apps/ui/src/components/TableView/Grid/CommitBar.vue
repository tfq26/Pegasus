<script setup lang="ts">
import { computed } from 'vue';
import { 
  CheckCircle2, 
  Trash2, 
  RotateCcw, 
  ChevronRight, 
  Database,
  AlertTriangle
} from 'lucide-vue-next';

const props = defineProps<{
  modifiedCount: number;
  deletedCount: number;
  addedCount: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'review'): void;
  (e: 'discard'): void;
  (e: 'commit'): void;
}>();

const hasChanges = computed(() => {
  return props.modifiedCount > 0 || props.deletedCount > 0 || props.addedCount > 0;
});

const totalChanges = computed(() => {
  return props.modifiedCount + props.deletedCount + props.addedCount;
});
</script>

<template>
  <Transition name="slide-up">
    <div v-if="hasChanges" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-2xl px-4">
      <div class="relative overflow-hidden rounded-2xl bg-stone-900 border border-stone-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <!-- Accent Glow -->
        <div class="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-emerald-500/5 pointer-events-none"></div>
        
        <div class="relative flex items-center justify-between p-4 px-6">
          <!-- Summary Section -->
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-stone-800 flex items-center justify-center text-violet-400 border border-stone-700">
              <Database class="w-5 h-5 shadow-[0_0_15px_-3px_theme(colors.violet.500)]" />
            </div>
            
            <div class="flex flex-col">
              <div class="flex items-center gap-2">
                <span class="text-xs font-black uppercase tracking-widest text-stone-200">Pending Changes</span>
                <div class="px-1.5 py-0.5 rounded-md bg-violet-500 text-white text-[9px] font-black uppercase tracking-tighter shadow-lg shadow-violet-500/20">
                  {{ totalChanges }} OPS
                </div>
              </div>
              
              <div class="flex items-center gap-3 mt-1">
                <div v-if="modifiedCount > 0" class="flex items-center gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  <span class="text-[10px] font-mono text-stone-500">{{ modifiedCount }} <span class="hidden sm:inline">Modified</span></span>
                </div>
                <div v-if="deletedCount > 0" class="flex items-center gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                  <span class="text-[10px] font-mono text-stone-500">{{ deletedCount }} <span class="hidden sm:inline">Deleted</span></span>
                </div>
                <div v-if="addedCount > 0" class="flex items-center gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span class="text-[10px] font-mono text-stone-500">{{ addedCount }} <span class="hidden sm:inline">Added</span></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions Section -->
          <div class="flex items-center gap-2 sm:gap-3">
            <button 
              @click="emit('discard')"
              class="group flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
            >
              <RotateCcw class="w-3.5 h-3.5 group-hover:-rotate-45 transition-transform" />
              <span class="hidden sm:inline">Discard All</span>
            </button>
            
            <button 
              @click="emit('review')"
              class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-stone-100 transition-all border border-stone-700"
            >
              <Trash2 class="w-3.5 h-3.5" v-if="false" /> <!-- Placeholder -->
              <span>Review</span>
            </button>

            <button 
              @click="emit('commit')"
              :disabled="loading"
              class="group relative flex items-center gap-2 px-4 sm:px-6 py-2 rounded-xl overflow-hidden bg-stone-100 text-stone-950 font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all shadow-2xl shadow-stone-950/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="loading" class="absolute inset-0 flex items-center justify-center bg-stone-100">
                <div class="w-4 h-4 border-2 border-stone-400 border-t-stone-950 rounded-full animate-spin"></div>
              </span>
              <template v-else>
                <Database class="w-3.5 h-3.5" />
                <span>Commit</span>
                <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </template>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translate(-50%, 100%) translateY(24px);
  opacity: 0;
}
</style>
