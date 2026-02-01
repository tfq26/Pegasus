<script lang="ts" setup>
import NumberFlow from "@number-flow/vue";
import { useColorMode } from "@vueuse/core";
import { motion, MotionConfig, AnimatePresence } from "motion-v";
import { computed, ref, watch } from "vue";
import { useProgress } from "@/lib/progress";
import AnimatedCircularProgressBar from "@/components/ui/AnimatedCircularProgressBar.vue";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-vue-next";

// Integrate with global progress system
const { activeOperations, finishOperation, cancelOperation } = useProgress();

// We track the *primary* active operation to display
// If multiple generic operations are running, we just pick the first one or the most "important"
const currentOp = computed(() => {
    // Prioritize 'query' (AI is now handled by HaloSearch)
    const queryOp = activeOperations.value.find(op => op.category === 'query');
    if (queryOp) return queryOp;
    
    // Fallback for other types, explicitly excluding 'ai'
    return activeOperations.value.find(op => op.category !== 'ai') || null;
});

const isVisible = computed(() => !!currentOp.value);
const progressValue = computed(() => currentOp.value?.progress || 0);
const title = computed(() => currentOp.value?.label || "Processing...");
const status = computed(() => currentOp.value?.details || "Working...");

// Auto-expand/collapse logic
const expanded = ref(false);
const toggleExpand = () => expanded.value = !expanded.value;

// Auto-open if it's a new long-running task? 
// For now, keep it collapsed by default unless it has interesting details
watch(currentOp, (newOp, oldOp) => {
    if (newOp && !oldOp) {
        expanded.value = false; // Reset on new task start
    }
});

const isDark = computed(() => useColorMode().value === "dark");

const handleCancel = (e: MouseEvent) => {
    e.stopPropagation();
    if (currentOp.value) {
        cancelOperation(currentOp.value.id);
    }
}
</script>

<template>
  <AnimatePresence>
    <MotionConfig
      v-if="isVisible"
      :transition="{
        duration: 0.5,
        type: 'spring',
        bounce: 0.3,
      }"
    >
      <div class="fixed top-6 left-1/2 z-[9999] -translate-x-1/2 perspective-[1000px]">
        <motion.div
           initial="{ opacity: 0, y: -20, scale: 0.9 }"
           animate="{ opacity: 1, y: 0, scale: 1 }"
           exit="{ opacity: 0, y: -20, scale: 0.9 }"
        >
            <div
            class="bg-background/80 backdrop-blur-xl border border-border shadow-2xl rounded-[24px] overflow-hidden transition-colors duration-300"
            :class="[expanded ? 'w-[320px]' : 'w-[280px]']"
            @click="toggleExpand"
            >
            <motion.div
                layout
                class="relative flex flex-col cursor-pointer"
            >
                <!-- Header / Collapsed View -->
                <header class="flex h-12 items-center gap-3 px-4 w-full">
                
                <!-- Icon / Progress -->
                <div class="relative flex items-center justify-center w-6 h-6 shrink-0">
                    <AnimatedCircularProgressBar
                        v-if="progressValue < 100"
                        :value="progressValue"
                        :min="0"
                        :max="100"
                        :size="24"
                        :circle-stroke-width="3"
                        :gauge-secondary-color="isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'"
                        :gauge-primary-color="isDark ? '#fff' : '#000'"
                    />
                    <CheckCircle2 v-else class="w-5 h-5 text-green-500" />
                </div>

                <!-- Text Info -->
                <div class="flex flex-col grow min-w-0">
                    <h1 class="text-sm font-semibold truncate leading-tight">{{ title }}</h1>
                    <div class="flex items-center gap-2 overflow-hidden">
                        <span class="text-xs text-muted-foreground truncate">{{ status }}</span>
                    </div>
                </div>

                <!-- Percentage / Actions -->
                <div class="flex items-center gap-2 shrink-0">
                    <NumberFlow
                        v-if="progressValue < 100"
                        :value="progressValue / 100"
                        :format="{ style: 'percent' }"
                        class="text-xs font-mono font-medium text-muted-foreground"
                    />
                    
                    <!-- Expand chevron or Cancel X -->
                    <button 
                        v-if="expanded"
                        class="p-1 rounded-full hover:bg-muted/50 transition-colors"
                    >
                         <ChevronUp class="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button 
                        v-else-if="currentOp?.cancellable"
                        @click="handleCancel"
                        class="p-1 rounded-full hover:bg-muted/50 transition-colors group"
                        title="Cancel"
                    >
                         <XCircle class="w-4 h-4 text-muted-foreground group-hover:text-red-500 transition-colors" />
                    </button>
                </div>
                </header>

                <!-- Expanded Details -->
                <motion.div
                v-if="expanded"
                initial="{ opacity: 0, height: 0 }"
                animate="{ opacity: 1, height: 'auto' }"
                exit="{ opacity: 0, height: 0 }"
                class="px-4 pb-4 pt-0 flex flex-col gap-2"
                >
                    <div class="h-px w-full bg-border/50 my-1"></div>
                    
                    <!-- Step History / Logs (Mocked for now based on details) -->
                    <div class="flex flex-col gap-2 max-h-[150px] overflow-y-auto text-xs text-muted-foreground custom-scrollbar">
                         <div class="flex items-start gap-2">
                             <div class="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0 opacity-50"></div>
                             <span>Task started</span>
                         </div>
                         <div v-if="progressValue > 10" class="flex items-start gap-2">
                             <div class="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0 opacity-50"></div>
                             <span>Analyzing context...</span>
                         </div>
                         <div v-if="progressValue > 30" class="flex items-start gap-2">
                             <div class="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0 opacity-50"></div>
                             <span>Executing tools...</span>
                         </div>
                         <div class="flex items-start gap-2 text-foreground font-medium animate-pulse">
                             <div class="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                             <span>{{ status }}</span>
                         </div>
                    </div>

                    <div class="mt-2 flex justify-end">
                       <button 
                          v-if="currentOp?.cancellable"
                          @click="handleCancel"
                          class="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
                        >
                          Cancel Task
                        </button>
                    </div>
                </motion.div>
            </motion.div>
            </div>
        </motion.div>
      </div>
    </MotionConfig>
  </AnimatePresence>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 20px;
}
</style>
