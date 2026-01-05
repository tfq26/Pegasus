<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, FileText, ChevronLeft } from 'lucide-vue-next'
import { api } from '@/lib/apiClient'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  open: boolean
  slug?: string
  type: 'guide' | 'release'
}>()

const emit = defineEmits(['update:open'])

const content = ref('')
const isLoading = ref(false)
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

const fetchDoc = async () => {
  if (!props.slug) return
  
  isLoading.value = true
  try {
    const endpoint = props.type === 'guide' ? `/docs/guides/${props.slug}` : `/docs/releases/${props.slug}`
    const data = await api.get<any>(endpoint)
    
    if (props.type === 'guide') {
      content.value = md.render(data.content || '')
    } else {
      // For releases, we might want a custom renderer, but for now let's just JSON stringify or similar
      // Or better, the release JSON has a standard structure we can render
      content.value = `<div class="space-y-4">
        <h2 class="text-xl font-bold">${data.data.version || props.slug}</h2>
        <p class="text-muted-foreground">${data.data.date || ''}</p>
        <div class="prose prose-invert max-w-none">
          ${md.render(data.data.description || '')}
        </div>
      </div>`
    }
  } catch (e) {
    content.value = '<p class="text-destructive text-center py-10">Failed to load document.</p>'
  } finally {
    isLoading.value = false
  }
}

watch(() => props.open, (val) => {
  if (val) fetchDoc()
})

watch(() => props.slug, () => {
  if (props.open) fetchDoc()
})
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent size="lg" class="bg-card/95 backdrop-blur-xl border-border shadow-2xl overflow-y-auto max-h-[85vh]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-xl font-bold">
          <FileText class="w-5 h-5 text-violet-500" />
          {{ type === 'guide' ? 'Documentation' : 'Release Notes' }}
        </DialogTitle>
      </DialogHeader>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 class="w-10 h-10 animate-spin text-violet-500" />
        <p class="text-sm text-muted-foreground animate-pulse">Fetching content...</p>
      </div>

      <div v-else class="markdown-body prose dark:prose-invert max-w-none py-4" v-html="content"></div>

      <div class="mt-6 pt-6 border-t border-border flex justify-end">
        <button 
          @click="$emit('update:open', false)"
          class="px-5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
        >
          Close
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style>
.markdown-body h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 1.5rem; color: var(--foreground); }
.markdown-body h2 { font-size: 1.5rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; color: var(--foreground); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
.markdown-body h3 { font-size: 1.25rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; color: var(--foreground); }
.markdown-body p { color: var(--muted-foreground); line-height: 1.625; margin-bottom: 1rem; }
.markdown-body ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
.markdown-body ul li { margin-bottom: 0.5rem; color: var(--muted-foreground); }
.markdown-body ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
.markdown-body ol li { margin-bottom: 0.5rem; color: var(--muted-foreground); }
.markdown-body code { background: var(--muted); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.75rem; color: #a78bfa; }
.markdown-body pre { background: var(--muted); padding: 1rem; border-radius: 0.75rem; font-family: monospace; font-size: 0.75rem; overflow-x: auto; margin-bottom: 1.5rem; border: 1px solid rgba(var(--border), 0.5); }
.markdown-body strong { font-weight: 700; color: var(--foreground); }
.markdown-body blockquote { border-left: 4px solid rgba(139, 92, 246, 0.5); padding-left: 1rem; font-style: italic; margin: 1.5rem 0; color: var(--muted-foreground); background: rgba(139, 92, 246, 0.05); padding: 0.5rem 1rem; border-top-right-radius: 0.5rem; border-bottom-right-radius: 0.5rem; }
</style>
