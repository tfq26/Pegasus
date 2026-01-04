<template>
  <div v-if="analysisResult && !isDismissed" class="p-6 bg-primary/5 border border-primary/20 rounded-lg mb-6 relative overflow-hidden group transition-all duration-300 shadow-sm hover:shadow-md">
    <div class="absolute -top-6 -right-6 p-4 opacity-[0.03] group-hover:opacity-[0.07] transition-all duration-500 transform group-hover:rotate-6 pointer-events-none">
       <img src="/pegasus-purple.svg" class="w-48 h-48" />
    </div>
    
    <div class="flex items-start gap-4 relative z-10">
      <div class="bg-primary/10 p-2 rounded-lg shrink-0">
        <BrainCircuit class="w-6 h-6 text-primary" />
      </div>
      
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-primary flex items-center gap-2">
              Pegasus AI Insights
              <span class="text-[10px] font-medium bg-primary/10 px-1.5 py-0.5 rounded text-primary uppercase tracking-wider">Automated</span>
            </h3>
            
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  @click="toggleCollapse"
                  class="p-1.5 hover:bg-primary/10 rounded-md transition-colors text-primary/60 hover:text-primary"
                  :title="isCollapsed ? 'Expand' : 'Collapse'"
                >
                  <ChevronDown v-if="isCollapsed" class="w-4 h-4" />
                  <ChevronUp v-else class="w-4 h-4" />
                </button>
                
                <button 
                  @click="generateDashboardSummary" 
                  :disabled="isAnalyzing"
                  class="p-1.5 hover:bg-primary/10 rounded-md transition-colors text-primary/60 hover:text-primary"
                  title="Regenerate Insights"
                >
                  <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isAnalyzing }" />
                </button>

                <button 
                  @click="dismiss"
                  class="p-1.5 hover:bg-primary/10 rounded-md transition-colors text-primary/60 hover:text-primary"
                  title="Dismiss Insights"
                >
                  <X class="w-4 h-4" />
                </button>
            </div>
        </div>
        
        <div v-if="!isCollapsed" class="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-top-2 duration-300">
          {{ analysisResult }}
        </div>
      </div>
    </div>
  </div>
  
  <div v-else-if="isAnalyzing && !isDismissed" class="p-8 bg-muted/30 border border-border rounded-lg mb-6 flex flex-col items-center justify-center text-center animate-pulse">
    <div class="relative">
        <BrainCircuit class="w-10 h-10 text-primary/40 mb-4 animate-bounce" />
        <div class="absolute -top-2 -right-2">
            <Loader2 class="w-5 h-5 text-primary animate-spin" />
        </div>
    </div>
    <div class="text-sm font-semibold text-primary/70">Pegasus is analyzing your data...</div>
    <div class="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">Correlating trends and anomalies across your dashboard elements</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDashboardAnalysis } from '@/composables/useDashboardAnalysis'
import { BrainCircuit, RefreshCw, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-vue-next'

const { isAnalyzing, analysisResult, generateDashboardSummary } = useDashboardAnalysis()

const isDismissed = ref(false)
const isCollapsed = ref(false)

const dismiss = () => {
  isDismissed.value = true
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// Re-show if new analysis is explicitly triggered (e.g. from dashboard toolbar)
watch(isAnalyzing, (val) => {
    if (val) {
        isDismissed.value = false
        isCollapsed.value = false
    }
})
</script>
