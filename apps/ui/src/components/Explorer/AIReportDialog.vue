<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Sparkles, X } from 'lucide-vue-next'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

defineProps<{
  open: boolean
  title: string
  content: string
  loading?: boolean
}>()

const emit = defineEmits(['update:open'])
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="bg-card border-border text-foreground max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden shadow-2xl">
      <DialogHeader class="p-6 border-b border-border bg-muted/20">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0">
            <Sparkles class="w-5 h-5" />
          </div>
          <div>
            <DialogTitle class="text-xl font-bold">{{ title }}</DialogTitle>
            <DialogDescription class="text-muted-foreground">AI Generated Report</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto p-6">
        <div v-if="loading" class="flex flex-col items-center justify-center h-48 gap-4 text-muted-foreground animate-pulse">
            <Sparkles class="w-8 h-8 opacity-50" />
            <p class="text-sm font-medium">Generating insights...</p>
        </div>
        <div v-else class="prose dark:prose-invert prose-sm max-w-none">
          <MarkdownRenderer :content="content" />
        </div>
      </div>

      <DialogFooter class="p-4 border-t border-border bg-muted/20">
        <button 
          @click="emit('update:open', false)"
          class="px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors text-sm font-semibold"
        >
          Close
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
