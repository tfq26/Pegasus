<script setup lang="ts">
import { computed, ref } from 'vue'
import JsonViewer from '@/components/JsonViewer.vue'
import { ChevronDown, ChevronUp, Sparkles, Loader2, AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  content: string
  role: string
  meta?: any
}>()

const emit = defineEmits<{
  (e: 'generateInsights', payload: { query: string; results: any }): void
}>()

import { FileText, Database, StickyNote, Quote } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'

const isGeneratingInsights = ref(false)

const getIcon = (type: string) => {
  switch (type) {
    case 'file': return FileText
    case 'database': return Database
    case 'note': return StickyNote
    case 'chunk': return Quote
    default: return FileText
  }
}

const parsedContent = computed(() => {
  // Check for "Results: [...]" pattern at the end of the string
  // We use a regex that looks for "Results:" followed by a JSON array or object
  const resultsMatch = props.content.match(/Results:\s*(\[[\s\S]*\]|\{[\s\S]*\})$/)
  
  if (resultsMatch) {
    const textPart = props.content.substring(0, resultsMatch.index).trim()
    const jsonStr = resultsMatch[1]!
    
    try {
      const json = JSON.parse(jsonStr)
      return {
        text: textPart,
        results: json,
        hasResults: true
      }
    } catch (e) {
      // Failed to parse, return as plain text
      return { text: props.content, hasResults: false }
    }
  }
  
  return { text: props.content, hasResults: false }
})

const canGenerateInsights = computed(() => {
  return props.meta?.canGenerateInsights === true && !props.meta?.insightsGenerated
})

const handleGenerateInsights = () => {
  if (!props.meta?.resultPreview || !props.meta?.query) return
  isGeneratingInsights.value = true
  emit('generateInsights', {
    query: props.meta.query,
    results: props.meta.resultPreview
  })
}

const isTable = computed(() => {
  const results = parsedContent.value.results
  return Array.isArray(results) && results.length > 0 && typeof results[0] === 'object' && results[0] !== null
})

const columns = computed(() => {
  if (!isTable.value) return []
  const results = parsedContent.value.results as any[]
  // Get all unique keys from first few rows
  const keys = new Set<string>()
  results.slice(0, 10).forEach(row => {
    Object.keys(row).forEach(k => keys.add(k))
  })
  return Array.from(keys)
})

const showAll = ref(false)
const DISPLAY_LIMIT = 5

const displayedRows = computed(() => {
  if (!isTable.value) return []
  const results = parsedContent.value.results as any[]
  if (showAll.value) return results
  return results.slice(0, DISPLAY_LIMIT)
})

const formatValue = (val: any) => {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}
</script>

<template>
  <div class="space-y-3 w-full overflow-hidden">
    <!-- Text Part -->
    <div v-if="parsedContent.text" class="whitespace-pre-wrap break-words leading-relaxed">{{ parsedContent.text }}</div>
    
    <!-- Professional Disclaimer -->
    <div v-if="meta?.needsDisclaimer" class="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 flex gap-3 text-xs leading-normal text-amber-800 dark:text-amber-200/80 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <AlertTriangle class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div class="space-y-1">
        <p class="font-bold uppercase tracking-wider text-[10px]">Investment Disclaimer</p>
        <p>This information is for informational purposes only and does not constitute financial, investment, or legal advice. All investments carry risk. Please consult with a professional advisor before making any financial decisions.</p>
      </div>
    </div>
    <div v-if="canGenerateInsights" class="flex items-center gap-2">
      <button
        @click="handleGenerateInsights"
        :disabled="isGeneratingInsights"
        class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="isGeneratingInsights" class="w-3 h-3 animate-spin" />
        <Sparkles v-else class="w-3 h-3" />
        {{ isGeneratingInsights ? 'Generating...' : 'Generate Insights' }}
      </button>
    </div>
    
    <!-- Results Part -->
    <div v-if="parsedContent.hasResults" class="mt-2">
      <div class="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-lg bg-emerald-500"></span>
        Query Results
      </div>
      
      <!-- Table View -->
      <div v-if="isTable" class="rounded-md border border-border overflow-hidden bg-background/50 shadow-sm">
        <div class="overflow-x-auto max-w-full">
          <table class="w-full text-xs">
            <thead class="bg-muted/50 text-muted-foreground">
              <tr>
                <th v-for="col in columns" :key="col" class="px-3 py-2 text-left font-medium whitespace-nowrap border-b border-border">
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="(row, i) in displayedRows" :key="i" class="hover:bg-muted/30 transition-colors">
                <td v-for="col in columns" :key="col" class="px-3 py-2 whitespace-nowrap text-foreground max-w-[200px] truncate" :title="formatValue(row[col])">
                  {{ formatValue(row[col]) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Pagination/Expand -->
        <div v-if="(parsedContent.results as any[]).length > DISPLAY_LIMIT" class="bg-muted/30 px-3 py-2 text-xs flex justify-between items-center border-t border-border">
          <span class="text-muted-foreground">
            Showing {{ displayedRows.length }} of {{ (parsedContent.results as any[]).length }} rows
          </span>
          <button 
            @click="showAll = !showAll"
            class="text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
          >
            {{ showAll ? 'Show Less' : 'Show All' }}
            <ChevronUp v-if="showAll" class="w-3 h-3" />
            <ChevronDown v-else class="w-3 h-3" />
          </button>
        </div>
      </div>
      
      <!-- JSON View (if not table) -->
      <div v-else class="rounded-md border border-border bg-background/50 p-3 overflow-auto max-h-60 shadow-sm">
        <JsonViewer :data="parsedContent.results" />
      </div>
    </div>

    <!-- Context Chips -->
    <div v-if="meta?.contextUsed?.length" class="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/50">
      <span class="text-[10px] text-muted-foreground self-center mr-1">Sources:</span>
      
      <!-- List all sources if 4 or fewer -->
      <template v-if="meta.contextUsed.length <= 4">
        <Badge v-for="(ctx, i) in meta.contextUsed" :key="i" variant="outline" class="text-[10px] h-5 px-2 gap-1.5 font-normal bg-background/50 hover:bg-background transition-colors cursor-default">
          <component :is="getIcon(ctx.type)" class="w-3 h-3 text-muted-foreground" />
          {{ ctx.name || ctx.filename || ctx.title || 'Unknown Source' }}
        </Badge>
      </template>

      <!-- Show count summary if more than 4 -->
      <template v-else>
        <Badge variant="outline" class="text-[10px] h-5 px-2 gap-1.5 font-normal bg-background/50 hover:bg-background transition-colors cursor-default">
          <Database class="w-3 h-3 text-muted-foreground" />
          {{ meta.contextUsed.length }} Sources Used
        </Badge>
      </template>
    </div>
  </div>
</template>
