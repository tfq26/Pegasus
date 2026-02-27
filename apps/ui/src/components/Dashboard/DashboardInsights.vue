<template>
  <div v-if="analysisResult && !isDismissed" class="p-6 bg-primary/5 border border-primary/20 rounded-lg mb-6 relative overflow-hidden group transition-all duration-300 shadow-sm hover:shadow-md">
    <div class="absolute -top-6 -right-6 p-4 opacity-[0.03] group-hover:opacity-[0.07] transition-all duration-500 transform group-hover:rotate-6 pointer-events-none">
       <img src="/logo_new_purple.svg" class="w-48 h-48" />
    </div>
    
    <div class="flex items-start gap-4 relative z-10">
      <div class="bg-primary/10 p-2 rounded-lg shrink-0">
        <BrainCircuit class="w-6 h-6 text-primary" />
      </div>
      
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-primary flex items-center gap-2">
              Pegasus AI Insights
              <span class="text-[10px] font-medium bg-primary/10 px-1.5 py-0.5 rounded text-primary  tracking-wider">Automated</span>
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
        
        <div 
          v-if="!isCollapsed" 
          class="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300 insights-render"
          v-html="renderedInsights"
        ></div>
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
import { ref, watch, computed } from 'vue'
import { useDashboardAnalysis } from '@/composables/useDashboardAnalysis'
import { BrainCircuit, RefreshCw, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'

const { isAnalyzing, analysisResult, generateDashboardSummary } = useDashboardAnalysis()

const md = new MarkdownIt({
  breaks: true,
  linkify: true,
  html: false
})

const renderedInsights = computed(() => {
  if (!analysisResult.value) return ''
  return md.render(analysisResult.value)
})

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

<style scoped>
.insights-render :deep(p) {
  margin-bottom: 1rem;
}

.insights-render :deep(ul), .insights-render :deep(ol) {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

.insights-render :deep(li) {
  margin-bottom: 0.375rem;
}

.insights-render :deep(li:last-child) {
  margin-bottom: 0;
}

.insights-render :deep(h1), .insights-render :deep(h2), .insights-render :deep(h3) {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  color: var(--primary);
}
</style>
