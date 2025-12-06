<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useProgress } from '@/lib/progress'
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-vue-next'

const { operations, hasActive } = useProgress()
const expanded = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const toggleExpanded = () => expanded.value = !expanded.value

const handleClickOutside = (e: MouseEvent) => {
    if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
        expanded.value = false
    }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

const totalProgress = computed(() => {
  if (operations.value.length === 0) return 0
  const total = operations.value.reduce((acc, op) => acc + op.progress, 0)
  return Math.round(total / operations.value.length)
})

const activeCount = computed(() => operations.value.filter(op => op.status === 'running' || op.status === 'pending').length)
</script>

<template>
  <transition name="fade">
    <div ref="containerRef" class="relative mr-2">
       <button 
           @click="toggleExpanded"
           class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-primary/20 hover:border-primary/50 transition-colors shadow-sm cursor-pointer select-none"
           :class="{'animate-pulse border-primary/50': activeCount > 0, 'bg-muted/50': expanded}"
       >
           <div class="relative flex items-center justify-center">
               <Loader2 
                   v-if="activeCount > 0" 
                   class="h-4 w-4 text-primary animate-spin" 
               />
               <CheckCircle2 
                   v-else 
                   class="h-4 w-4 text-muted-foreground" 
               />
           </div>
           
           <div class="flex flex-col items-start min-w-[80px]">
               <div class="text-[10px] uppercase font-bold text-muted-foreground leading-none mb-0.5">
                   {{ activeCount > 0 ? `${activeCount} Active` : 'Ready' }}
               </div>
               <div class="h-1.5 w-20 bg-muted/50 rounded-full overflow-hidden">
                   <div 
                       class="h-full bg-primary transition-all duration-300 ease-out"
                       :style="{ width: `${totalProgress}%` }"
                   ></div>
               </div>
           </div>

           <ChevronDown 
                class="h-3 w-3 text-muted-foreground opacity-50 transition-transform duration-200"
                :class="{ 'rotate-180': expanded }"
            />
       </button>

       <!-- Dropdown -->
       <transition name="scale">
            <div 
                v-if="expanded"
                class="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover/95 backdrop-blur-sm shadow-xl z-50 overflow-hidden"
            >
                <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
                    <span class="text-xs font-semibold text-foreground">Operations</span>
                    <span class="text-[10px] text-muted-foreground">{{ operations.length }} Total</span>
                </div>
                
                <div class="max-h-[300px] overflow-y-auto py-1">
                    <div 
                        v-for="op in operations" 
                        :key="op.id"
                        class="px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-foreground truncate max-w-[180px]" :title="op.label">
                                {{ op.label }}
                            </span>
                            <div class="flex items-center gap-1.5">
                                <Loader2 v-if="op.status === 'running' || op.status === 'pending'" class="h-3 w-3 text-primary animate-spin" />
                                <CheckCircle2 v-else-if="op.status === 'completed'" class="h-3 w-3 text-emerald-500" />
                                <XCircle v-else class="h-3 w-3 text-destructive" />
                                <span class="text-xs font-mono text-muted-foreground w-8 text-right">{{ Math.round(op.progress) }}%</span>
                            </div>
                        </div>
                        
                        <div class="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div 
                                class="h-full transition-all duration-300"
                                :class="{
                                    'bg-primary': op.status === 'running' || op.status === 'pending',
                                    'bg-emerald-500': op.status === 'completed',
                                    'bg-destructive': op.status === 'error'
                                }"
                                :style="{ width: `${op.progress}%` }"
                            ></div>
                        </div>
                        
                        <div v-if="op.details || op.error" class="mt-1.5 text-xs truncate" :class="op.error ? 'text-destructive' : 'text-muted-foreground'">
                            {{ op.error || op.details }}
                        </div>
                    </div>
                </div>
            </div>
       </transition>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.scale-enter-active,
.scale-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
  transform-origin: top right;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
