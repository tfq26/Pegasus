<script setup lang="ts">
import { computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AIAction } from '@/composables/grid/useFormulaBarAI'
import { Check, X, Sparkles, Table as TableIcon, Trash2, Palette } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  action: AIAction | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'apply'): void
  (e: 'discard'): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const summary = computed(() => {
  if (!props.action) return []
  const items = []

  if (props.action.cellChanges?.length) {
    items.push({
      icon: Check,
      color: 'text-blue-500',
      text: `Modify ${props.action.cellChanges.length} cells`
    })
  }

  if (props.action.newColumns?.length) {
    items.push({
      icon: TableIcon,
      color: 'text-emerald-500',
      text: `Add ${props.action.newColumns.length} columns: ${props.action.newColumns.map(c => c.header).join(', ')}`
    })
  }

  if (props.action.deletedColumns?.length) {
    items.push({
      icon: Trash2,
      color: 'text-red-500',
      text: `Remove ${props.action.deletedColumns.length} columns`
    })
  }

  if (props.action.formatting?.length) {
    items.push({
      icon: Palette,
      color: 'text-purple-500',
      text: `Apply formatting to ${props.action.formatting.length} ranges`
    })
  }

  return items
})
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[500px] border-primary/20 bg-background/95 backdrop-blur-md">
      <DialogHeader>
        <div class="flex items-center gap-2 mb-2">
          <div class="p-2 rounded-lg bg-primary/10 text-primary">
            <Sparkles class="w-5 h-5" />
          </div>
          <DialogTitle>AI Proposed Changes</DialogTitle>
        </div>
        <DialogDescription>
          {{ action?.description || 'The AI suggested the following modifications to your spreadsheet.' }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-6 space-y-4">
        <div v-for="(item, idx) in summary" :key="idx" class="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30">
          <div :class="['mt-0.5 p-1 rounded-md bg-background border border-border', item.color]">
            <component :is="item.icon" class="w-4 h-4" />
          </div>
          <p class="text-sm font-medium leading-relaxed">
            {{ item.text }}
          </p>
        </div>
      </div>

      <DialogFooter class="gap-2 sm:gap-0">
        <Button variant="ghost" @click="emit('discard')" class="flex-1 sm:flex-none">
          <X class="w-4 h-4 mr-2" />
          Discard
        </Button>
        <Button @click="emit('apply')" class="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
          <Check class="w-4 h-4 mr-2" />
          Apply Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
