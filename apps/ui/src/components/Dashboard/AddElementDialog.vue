<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>Add Dashboard Element</DialogTitle>
        <DialogDescription>
          Choose the type of element you want to add to your dashboard.
        </DialogDescription>
      </DialogHeader>

      <div class="grid grid-cols-2 gap-4 py-4">
        <!-- Visualization -->
        <button
          @click="selectType('visualization')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
            <BarChart2 class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">Visualization</h3>
            <p class="text-xs text-muted-foreground mt-1">Charts, graphs, and stats based on data queries</p>
          </div>
        </button>

        <!-- Table -->
        <button
          @click="selectType('table')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
            <Table class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">Data Table</h3>
            <p class="text-xs text-muted-foreground mt-1">Tabular data view from your database</p>
          </div>
        </button>

        <!-- Text Block -->
        <button
          @click="selectType('text')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-orange-500/10 text-orange-500 group-hover:scale-110 transition-transform">
            <Type class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">Text Block</h3>
            <p class="text-xs text-muted-foreground mt-1">Rich text, instructions, or markdown content</p>
          </div>
        </button>

        <!-- File Upload -->
        <button
          @click="selectType('file')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
            <FileUp class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">File Attachment</h3>
            <p class="text-xs text-muted-foreground mt-1">Upload files or zip folders (Max 200MB)</p>
          </div>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { BarChart2, Table, Type, FileUp } from 'lucide-vue-next'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'select': [type: 'visualization' | 'table' | 'text' | 'file']
}>()

const selectType = (type: 'visualization' | 'table' | 'text' | 'file') => {
  emit('select', type)
  emit('update:open', false)
}
</script>
