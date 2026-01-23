<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useProgress } from '@/lib/progress'
import { useEntitlements } from '@/composables/useEntitlements'
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, X, History } from 'lucide-vue-next'

const { history, groupedOperations } = useProgress()
const { subscriptionTier } = useEntitlements()
const expanded = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const toggleExpanded = () => expanded.value = !expanded.value

const handleClickOutside = (e: MouseEvent) => {
    if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
        expanded.value = false
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    // Ensure entitlements are loaded to show correct tier colors
    const { fetchEntitlements } = useEntitlements()
    fetchEntitlements()
})
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

const avgDuration = computed(() => {
    if (history.value.length === 0) return 0
    const total = history.value.reduce((acc, op) => acc + (op.duration || 0), 0)
    return (total / history.value.length / 1000).toFixed(1)
})

const successRate = computed(() => {
    if (history.value.length === 0) return 0
    const successful = history.value.filter(op => op.status === 'completed').length
    return Math.round((successful / history.value.length) * 100)
})

const tierGradientClass = computed(() => {
    switch (subscriptionTier.value) {
        case 'pro': return 'bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600'
        case 'pro_plus': return 'bg-gradient-to-r from-violet-600 via-purple-500 to-orange-500'
        case 'teams': return 'bg-gradient-to-r from-violet-600 via-purple-500 to-red-500'
        default: return 'bg-gradient-to-r from-violet-600 via-fuchsia-500 to-teal-500'
    }
})

const tierAccentClass = computed(() => {
    switch (subscriptionTier.value) {
        case 'pro': return 'text-blue-500'
        case 'pro_plus': return 'text-orange-500'
        case 'teams': return 'text-red-500'
        default: return 'text-teal-500'
    }
})
</script>

<template>
   <transition name="fade">
    <div ref="containerRef" class="relative mr-2">
       <button 
           @click="toggleExpanded"
           class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border border-border hover:bg-muted/50 transition-colors shadow-sm cursor-pointer select-none"
           :class="{'bg-muted/50': expanded}"
       >
           <div class="relative flex items-center justify-center">
               <History class="h-4 w-4 text-muted-foreground" />
           </div>
           
           <div class="flex flex-col items-start">
               <div class="text-[10px] uppercase font-bold text-muted-foreground leading-none">
                   History
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
                class="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover/95 backdrop-blur-sm shadow-xl z-50 overflow-hidden flex flex-col"
            >
                <div class="px-4 py-3 border-b border-border flex items-center justify-between">
                    <span class="text-xs font-semibold">Operation History</span>
                    <div class="flex gap-3 text-[10px] text-muted-foreground font-medium">
                        <span>Avg: {{ avgDuration }}s</span>
                        <span>Success: {{ successRate }}%</span>
                    </div>
                </div>

                <div class="max-h-[350px] overflow-y-auto py-1">
                       <div 
                           v-for="op in history" 
                           :key="op.id"
                           class="px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors opacity-80"
                       >
                           <div class="flex items-center justify-between mb-1">
                               <div class="flex items-center gap-2 truncate pr-2">
                                   <span v-if="op.category === 'query'" class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-bold uppercase">SQL</span>
                                   <span v-else-if="op.category === 'ai'" class="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 font-bold uppercase">AI</span>
                                   <span class="text-xs font-medium text-foreground truncate" :title="op.label">
                                       {{ op.label }}
                                   </span>
                               </div>
                               <div class="flex items-center gap-1.5">
                                   <CheckCircle2 v-if="op.status === 'completed'" class="h-3 w-3 text-emerald-500" />
                                   <XCircle v-else class="h-3 w-3 text-destructive" />
                               </div>
                           </div>
                           
                           <div class="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                               <span>{{ op.status === 'completed' ? 'Succeeded' : 'Failed' }}</span>
                               <span>•</span>
                               <span>{{ (op.duration || 0) > 1000 ? ((op.duration || 0) / 1000).toFixed(1) + 's' : (op.duration || 0) + 'ms' }}</span>
                               <span>•</span>
                               <span>{{ new Date(op.completedAt || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
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
