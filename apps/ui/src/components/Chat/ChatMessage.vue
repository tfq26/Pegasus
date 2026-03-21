<script setup lang="ts">
import { computed, ref } from 'vue'
import JsonViewer from '@/components/JsonViewer.vue'
import ChatTable from '@/components/Chat/ChatTable.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { ChevronDown, ChevronUp, Sparkles, Loader2, AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  content: string
  role: string
  meta?: any
  isTruncated?: boolean
}>()

const emit = defineEmits<{
  (e: 'generateInsights', payload: { query: string; results: any }): void
  (e: 'add-to-dashboard', config: any): void
  (e: 'refine', prompt: string): void
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
  let content = props.content
  
  // NEW: Detect if the content itself is a JSON-stringified structured response
  if (typeof content === 'string' && content.startsWith('{') && content.endsWith('}')) {
    try {
      const outerParsed = JSON.parse(content)
      if (outerParsed.message || outerParsed.analysis || outerParsed.text) {
        content = outerParsed.message || outerParsed.analysis || outerParsed.text
      }
    } catch (e) {
      // Not a valid JSON or not a structured response we recognize, continue with original content
    }
  }

  const lowerContent = content.toLowerCase()
  
  // Find the best marker for JSON results
  let resultsIndex = -1
  const markers = ['results:', 'result:', 'data:']
  for (const marker of markers) {
    const idx = lowerContent.lastIndexOf(marker)
    if (idx > resultsIndex) resultsIndex = idx
  }
  
  let textBefore = content
  let potentialJson = ''
  let startIndexOffset = 0
  
  if (resultsIndex !== -1) {
    // We found a tag!
    textBefore = content.substring(0, resultsIndex).trim()
    const afterResults = content.substring(resultsIndex)
    
    // Find the first occurrence of [ or { after the marker
    const startMatch = afterResults.match(/(\[|\{)/)
    if (startMatch) {
      startIndexOffset = startMatch.index!
      potentialJson = afterResults.substring(startIndexOffset)
    }
  } else {
    // FALLBACK: Look for any [ or { that starts a JSON block towards the end
    // Useful if AI forgets the "Results:" tag
    const allMatches = content.match(/(\[|\{)/g)
    const lastChar = allMatches ? allMatches[allMatches.length - 1] : null
    if (lastChar) {
      const lastIndex = content.lastIndexOf(lastChar)
      // Only treat it as results if it's a significant block (more than 20 chars) 
      // or appears in an AI message role
      if (content.length - lastIndex > 10) {
        textBefore = content.substring(0, lastIndex).trim()
        potentialJson = content.substring(lastIndex)
        startIndexOffset = 0
      }
    }
  }

  if (potentialJson) {
    const startChar = potentialJson[0]
    const endChar = startChar === '[' ? ']' : '}'
    
    // Find the balancing end character
    let balance = 0
    let endIndex = -1
    
    for (let i = 0; i < potentialJson.length; i++) {
      const char = potentialJson[i]
      if (char === startChar) balance++
      else if (char === endChar) {
        balance--
        if (balance === 0) {
          endIndex = i
          break
        }
      }
    }
    
    if (endIndex !== -1) {
      let jsonStr = potentialJson.substring(0, endIndex + 1)
      const textAfter = potentialJson.substring(endIndex + 1).trim()
      
      try {
        // Clean up potential markdown wrappers
        let cleanJson = jsonStr.replace(/^```json\s*|\s*```$/g, '').trim()
        const json = JSON.parse(cleanJson)
        
        // SMART TRUNCATION: If isTruncated is true, we shorten the textBefore and hide textAfter
        let finalBefore = textBefore
        let finalAfter = textAfter
        
        if (props.isTruncated) {
          if (finalBefore.length > 500) {
            finalBefore = finalBefore.substring(0, 480) + '...'
          }
          finalAfter = '' // Hide footnotes when truncated
        }

        return {
          textBefore: finalBefore,
          textAfter: finalAfter,
          results: json,
          hasResults: true
        }
      } catch (e) {}
    }
    
    // Fallback for truncated JSON (repair mechanism)
    if (startChar === '[') {
      const lastBrace = potentialJson.lastIndexOf('}')
      if (lastBrace !== -1) {
        try {
          const repaired = potentialJson.substring(0, lastBrace + 1) + ']'
          const json = JSON.parse(repaired)
          return {
            textBefore,
            textAfter: '',
            results: json,
            hasResults: true
          }
        } catch (e) {}
      }
    }
  }
  
  let finalBefore = props.content
  if (props.isTruncated && finalBefore.length > 800) {
      finalBefore = finalBefore.substring(0, 750) + '...'
  }
  return { textBefore: finalBefore, textAfter: '', hasResults: false }
})

const handleAddToDashboard = () => {
  if (!parsedContent.value.hasResults) return
  
  emit('add-to-dashboard', {
    type: 'table',
    title: props.meta?.queryTitle || 'Table from Chat',
    query: props.meta?.query || '',
    connectionId: props.meta?.connectionId || '',
    data: parsedContent.value.results
  })
}

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

const formatValue = (val: any) => {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

const refinementSuggestions = computed(() => {
  return Array.isArray(props.meta?.refinementSuggestions)
    ? props.meta.refinementSuggestions.filter((item: unknown) => typeof item === 'string' && item.trim().length > 0)
    : []
})
</script>

<template>
  <div class="space-y-3 w-full overflow-hidden">
    <!-- Text Before -->
    <div v-if="parsedContent.textBefore" class="markdown-chat">
      <MarkdownRenderer :content="parsedContent.textBefore" />
    </div>
    
    <!-- Professional Disclaimer -->
    <div v-if="meta?.needsDisclaimer" class="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 flex gap-3 text-xs leading-normal text-amber-800 dark:text-amber-200/80 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <AlertTriangle class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div class="space-y-1">
        <p class="font-bold  tracking-wider text-[10px]">Investment Disclaimer</p>
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
    <div v-if="parsedContent.hasResults" class="mt-2 text-foreground">
      <!-- New Rich Table View -->
      <div v-if="Array.isArray(parsedContent.results) && parsedContent.results.length > 0 && typeof parsedContent.results[0] === 'object'">
        <ChatTable 
          :data="parsedContent.results" 
          :title="meta?.queryTitle" 
          show-add-to-dashboard
          @add-to-dashboard="handleAddToDashboard"
        />
      </div>
      
      <!-- JSON View (if not table) -->
      <div v-else class="rounded-md border border-border bg-background/50 p-3 overflow-auto max-h-60 shadow-sm">
        <JsonViewer :data="parsedContent.results" />
      </div>
    </div>

    <!-- Text After -->
    <div v-if="parsedContent.textAfter" class="markdown-chat opacity-70">
      <MarkdownRenderer :content="parsedContent.textAfter" />
    </div>

    <div v-if="refinementSuggestions.length" class="flex flex-wrap items-center gap-2 pt-2">
      <span class="text-[10px] text-muted-foreground">Refine:</span>
      <button
        v-for="suggestion in refinementSuggestions"
        :key="suggestion"
        @click="emit('refine', suggestion)"
        class="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-1.5 text-[11px] font-medium text-foreground/80 transition-colors hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-400"
      >
        {{ suggestion }}
      </button>
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

<style scoped>
/* Markdown Chat Styling */
.markdown-chat :deep(p) { margin-bottom: 0.75rem; }
.markdown-chat :deep(p:last-child) { margin-bottom: 0; }
.markdown-chat :deep(strong) { color: var(--foreground); font-weight: 700; }
.markdown-chat :deep(ul) { list-style: disc; padding-left: 1.25rem; margin-bottom: 0.75rem; }
.markdown-chat :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin-bottom: 0.75rem; }
.markdown-chat :deep(li) { margin-bottom: 0.25rem; }
.markdown-chat :deep(code) { 
  background: rgba(139, 92, 246, 0.1); 
  padding: 0.125rem 0.25rem; 
  border-radius: 0.25rem; 
  font-family: monospace; 
  font-size: 0.85em; 
  color: var(--violet-500);
}
.markdown-chat :deep(pre) { 
  background: var(--muted); 
  padding: 0.75rem; 
  border-radius: 0.5rem; 
  margin: 0.75rem 0; 
  overflow-x: auto; 
  border: 1px solid var(--border);
}

.markdown-chat :deep(table) {
  width: 100%;
  margin-bottom: 1rem;
  border-collapse: collapse;
  font-size: 0.85em;
}

.markdown-chat :deep(th),
.markdown-chat :deep(td) {
  padding: 0.5rem;
  border: 1px solid hsl(var(--border) / 0.5);
  text-align: left;
}

.markdown-chat :deep(th) {
  background-color: hsl(var(--muted) / 0.5);
  font-weight: 600;
}
</style>
