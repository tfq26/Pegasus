<template>
  <div v-if="analysisResult" class="p-6 bg-primary/5 border border-primary/20 rounded-lg mb-6 relative overflow-hidden group">
    <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
      <Sparkles class="w-12 h-12 text-primary" />
    </div>
    
    <div class="flex items-start gap-4">
      <div class="bg-primary/10 p-2 rounded-lg">
        <BrainCircuit class="w-6 h-6 text-primary" />
      </div>
      
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-bold text-primary flex items-center gap-2 mb-2">
          Pegasus AI Insights
          <span class="text-[10px] font-medium bg-primary/10 px-1.5 py-0.5 rounded text-primary uppercase">Automated</span>
        </h3>
        
        <div class="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {{ analysisResult }}
        </div>
      </div>
      
      <button 
        @click="generateDashboardSummary" 
        :disabled="isAnalyzing"
        class="shrink-0 p-2 hover:bg-primary/10 rounded-full transition-colors"
        title="Regenerate Insights"
      >
        <RefreshCw class="w-4 h-4 text-primary" :class="{ 'animate-spin': isAnalyzing }" />
      </button>
    </div>
  </div>
  
  <div v-else-if="isAnalyzing" class="p-8 bg-muted/30 border border-border rounded-lg mb-6 flex flex-col items-center justify-center text-center animate-pulse">
    <BrainCircuit class="w-8 h-8 text-muted-foreground/50 mb-4 animate-bounce" />
    <div class="text-sm font-medium text-muted-foreground">Pegasus is analyzing your dashboard data...</div>
    <div class="text-xs text-muted-foreground/60 mt-1">Crossing references across all elements</div>
  </div>
  

</template>

<script setup lang="ts">
import { useDashboardAnalysis } from '@/composables/useDashboardAnalysis'
import { BrainCircuit, Sparkles, RefreshCw } from 'lucide-vue-next'

const { isAnalyzing, analysisResult, generateDashboardSummary } = useDashboardAnalysis()
</script>
