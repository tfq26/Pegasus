<script setup lang="ts">
import { computed } from 'vue'
import { 
  Zap, 
  AlertTriangle, 
  Lightbulb, 
  CheckCircle2, 
  Copy, 
  ExternalLink,
  Clock,
  Gauge
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { toast } from '@/composables/useNotifications'

interface Bottleneck {
  type: string
  table: string
  impact: 'High' | 'Medium' | 'Low'
  description: string
}

interface Suggestion {
  title: string
  description: string
  query?: string
}

interface AnalysisResult {
  performanceScore: number
  bottlenecks: Bottleneck[]
  suggestions: Suggestion[]
  estimatedImprovement: string
  explanation: string
  explainPlan?: any
}

const props = defineProps<{
  analysis: AnalysisResult | null
  loading: boolean
}>()

const scoreColor = computed(() => {
  const score = props.analysis?.performanceScore || 0
  if (score >= 80) return 'text-green-500'
  if (score >= 50) return 'text-yellow-500'
  return 'text-red-500'
})

const getImpactColor = (impact: string) => {
  switch (impact) {
    case 'High': return 'destructive'
    case 'Medium': return 'secondary'
    default: return 'outline'
  }
}

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  toast.success("SQL Copied", {
    description: "Optimization script copied to clipboard",
  })
}
</script>

<template>
  <div class="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
    <div v-if="loading" class="flex flex-col items-center justify-center py-12 space-y-4">
      <div class="relative w-16 h-16">
        <div class="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse"></div>
        <div class="absolute inset-0 rounded-full border-t-4 border-primary animate-spin"></div>
      </div>
      <p class="text-sm text-muted-foreground animate-pulse">AI is analyzing execution plan...</p>
    </div>

    <template v-else-if="analysis">
      <!-- Header Summary -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card class="bg-card/40 backdrop-blur-sm border-border/50">
          <CardContent class="pt-6">
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Performance Score</p>
                <h2 :class="['text-4xl font-bold font-mono', scoreColor]">{{ analysis.performanceScore }}%</h2>
              </div>
              <div class="p-3 rounded-full bg-primary/10">
                <Gauge class="w-8 h-8 text-primary" />
              </div>
            </div>
            <p class="mt-4 text-sm text-muted-foreground italic">"{{ analysis.estimatedImprovement }}"</p>
          </CardContent>
        </Card>

        <Card class="bg-card/40 backdrop-blur-sm border-border/50">
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium flex items-center gap-2">
              <Clock class="w-4 h-4" />
              AI Insight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-xs text-muted-foreground leading-relaxed">
              {{ analysis.explanation }}
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- Bottlenecks -->
      <div class="space-y-3">
        <h3 class="text-sm font-bold flex items-center gap-2 px-1">
          <AlertTriangle class="w-4 h-4 text-yellow-500" />
          Detected Bottlenecks
        </h3>
        <div v-if="analysis.bottlenecks.length === 0" class="p-4 rounded-xl border border-dashed border-border/60 text-center">
          <p class="text-xs text-muted-foreground">No critical performance issues detected.</p>
        </div>
        <div 
          v-for="(b, i) in analysis.bottlenecks" :key="i"
          class="group p-4 rounded-xl bg-card border border-border/40 hover:border-border/80 transition-all"
        >
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <Badge :variant="getImpactColor(b.impact)" class="text-[10px]">{{ b.impact }} Impact</Badge>
                <p class="text-sm font-semibold">{{ b.type }} on <span class="text-primary">{{ b.table }}</span></p>
              </div>
              <p class="text-xs text-muted-foreground">{{ b.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Suggestions -->
      <div class="space-y-3">
        <h3 class="text-sm font-bold flex items-center gap-2 px-1">
          <Lightbulb class="w-4 h-4 text-primary" />
          AI Recommendations
        </h3>
        <div 
          v-for="(s, i) in analysis.suggestions" :key="i"
          class="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3"
        >
          <div class="flex items-start gap-4">
            <div class="mt-1 p-2 bg-primary/20 rounded-lg">
              <Zap class="w-4 h-4 text-primary" />
            </div>
            <div class="space-y-1">
              <p class="text-sm font-bold">{{ s.title }}</p>
              <p class="text-xs text-muted-foreground">{{ s.description }}</p>
            </div>
          </div>
          <div v-if="s.query" class="relative group">
            <pre class="bg-black/40 p-3 rounded-lg text-[11px] font-mono overflow-x-auto border border-white/5">{{ s.query }}</pre>
            <Button 
              variant="secondary" 
              size="icon" 
              class="absolute top-2 right-2 w-7 h-7 bg-white/10 hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
              @click="copyToClipboard(s.query)"
            >
              <Copy class="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground italic">
      <Zap class="w-12 h-12 mb-4 opacity-20" />
      <p>No optimization data available.</p>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(var(--primary), 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--primary), 0.2);
}
</style>
