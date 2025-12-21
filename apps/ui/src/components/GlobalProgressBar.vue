<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useProgress } from '@/lib/progress'
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, X } from 'lucide-vue-next'

const { operations, history, hasActive, cancelOperation, groupedOperations } = useProgress()
const expanded = ref(false)
const activeTab = ref<'active' | 'history'>('active')
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
</script>

<template>
  <transition name="fade">
    <div ref="containerRef" class="relative mr-2">
       <button 
           @click="toggleExpanded"
           class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border border-primary/20 hover:border-primary/50 transition-colors shadow-sm cursor-pointer select-none"
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
               <div class="h-1.5 w-20 bg-muted/50 rounded-lg overflow-hidden">
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
                class="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover/95 backdrop-blur-sm shadow-xl z-50 overflow-hidden flex flex-col"
            >
                <!-- Tabs -->
                <div class="flex border-b border-border bg-muted/20">
                   <button 
                       @click="activeTab = 'active'"
                       class="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors"
                       :class="activeTab === 'active' ? 'text-primary bg-background border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/40'"
                   >
                       Active ({{ operations.length }})
                   </button>
                   <button 
                       @click="activeTab = 'history'"
                       class="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors"
                       :class="activeTab === 'history' ? 'text-primary bg-background border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted/40'"
                   >
                       History ({{ history.length }})
                   </button>
                </div>

                <!-- Stats Bar (Only for History) -->
                <div v-if="activeTab === 'history'" class="px-4 py-2 border-b border-border bg-muted/10 flex justify-between text-[10px] text-muted-foreground font-medium">
                   <span>Avg: {{ avgDuration }}s</span>
                   <span>Success: {{ successRate }}%</span>
                </div>
                
                <div class="max-h-[350px] overflow-y-auto py-1">
                   <template v-if="activeTab === 'active'">
                       <div v-if="groupedOperations.length === 0" class="py-12 text-center text-xs text-muted-foreground">
                           No active operations
                       </div>
                       <div 
                           v-for="item in groupedOperations" 
                           :key="item.id"
                           class="px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                       >
                           <div class="flex items-center justify-between mb-2">
                               <div class="flex items-center gap-2 truncate pr-2">
                                   <template v-if="'isGroup' in item">
                                        <div class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold uppercase">
                                            <ChevronDown v-if="expanded" class="h-2 w-2" />
                                            GRP
                                        </div>
                                   </template>
                                   <template v-else>
                                       <span v-if="item.category === 'query'" class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-bold uppercase">SQL</span>
                                       <span v-else-if="item.category === 'ai'" class="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 font-bold uppercase">AI</span>
                                       <span v-else-if="item.category === 'data'" class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold uppercase">DATA</span>
                                   </template>
                                   <span class="text-xs font-medium text-foreground truncate" :title="item.label">
                                       {{ item.label }}
                                       <span v-if="'isGroup' in item" class="ml-1 text-muted-foreground">({{ item.ops.length }})</span>
                                   </span>
                               </div>
                               <div class="flex items-center gap-1.5">
                                   <button 
                                       v-if="!('isGroup' in item) && item.cancellable && (item.status === 'running' || item.status === 'pending')"
                                       @click.stop="cancelOperation(item.id)"
                                       class="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors mr-1"
                                       title="Cancel operation"
                                   >
                                       <X class="h-3 w-3" />
                                   </button>
                                   <Loader2 v-if="item.status === 'running' || item.status === 'pending'" class="h-3 w-3 text-primary animate-spin" />
                                   <CheckCircle2 v-else-if="item.status === 'completed'" class="h-3 w-3 text-emerald-500" />
                                   <XCircle v-else class="h-3 w-3 text-destructive" />
                                   <span class="text-xs font-mono text-muted-foreground w-8 text-right">{{ Math.round(item.progress) }}%</span>
                               </div>
                           </div>
                           
                           <div class="h-1 w-full bg-muted rounded-lg overflow-hidden">
                               <div 
                                   class="h-full transition-all duration-300"
                                   :class="{
                                       'bg-primary': item.status === 'running' || item.status === 'pending',
                                       'bg-emerald-500': item.status === 'completed',
                                       'bg-destructive': item.status === 'error'
                                   }"
                                   :style="{ width: `${item.progress}%` }"
                               ></div>
                           </div>
                           
                           <div v-if="!('isGroup' in item) && (item.details || item.error)" class="mt-1.5 text-[10px] truncate" :class="item.error ? 'text-destructive' : 'text-muted-foreground'">
                               {{ item.error || item.details }}
                           </div>
                           
                           <div v-if="'isGroup' in item" class="mt-1.5 flex gap-1 overflow-x-hidden">
                               <div v-for="op in item.ops.slice(0, 5)" :key="op.id" 
                                    class="h-1 flex-1 rounded-full transition-all duration-300"
                                    :class="{
                                        'bg-primary/40': op.status === 'running' || op.status === 'pending',
                                        'bg-emerald-500/40': op.status === 'completed',
                                        'bg-destructive/40': op.status === 'error'
                                    }"
                               ></div>
                               <span v-if="item.ops.length > 5" class="text-[8px] text-muted-foreground">+{{ item.ops.length - 5 }}</span>
                           </div>
                       </div>
                   </template>

                   <template v-else>
                       <div v-if="history.length === 0" class="py-12 text-center text-xs text-muted-foreground">
                           No history yet
                       </div>
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
                   </template>
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
