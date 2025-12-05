<script setup lang="ts">
import { 
  Bold, 
  Italic, 
  Underline, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Type,
  PaintBucket,
  Undo,
  Redo
} from 'lucide-vue-next'

defineProps<{
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  (e: 'format', type: string, value?: any): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()
</script>

<template>
  <div class="flex items-center gap-1 p-1 border-b border-border bg-muted/30 overflow-x-auto">
    <!-- History -->
    <div class="flex items-center gap-0.5 pr-2 border-r border-border/50">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
        :disabled="!canUndo"
        @click="emit('undo')"
        title="Undo (Ctrl+Z)"
      >
        <Undo class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
        :disabled="!canRedo"
        @click="emit('redo')"
        title="Redo (Ctrl+Y)"
      >
        <Redo class="w-4 h-4" />
      </button>
    </div>

    <!-- Text Style -->
    <div class="flex items-center gap-0.5 px-2 border-r border-border/50">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'bold')"
        title="Bold (Ctrl+B)"
      >
        <Bold class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'italic')"
        title="Italic (Ctrl+I)"
      >
        <Italic class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'underline')"
        title="Underline (Ctrl+U)"
      >
        <Underline class="w-4 h-4" />
      </button>
    </div>

    <!-- Alignment -->
    <div class="flex items-center gap-0.5 px-2 border-r border-border/50">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'align', 'left')"
        title="Align Left"
      >
        <AlignLeft class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'align', 'center')"
        title="Align Center"
      >
        <AlignCenter class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'align', 'right')"
        title="Align Right"
      >
        <AlignRight class="w-4 h-4" />
      </button>
    </div>

    <!-- Colors -->
    <div class="flex items-center gap-0.5 px-2">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground relative group"
        title="Text Color"
      >
        <Type class="w-4 h-4" />
        <div class="h-0.5 w-3 bg-foreground absolute bottom-1 left-1.5 rounded-full"></div>
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground relative group"
        title="Fill Color"
      >
        <PaintBucket class="w-4 h-4" />
        <div class="h-0.5 w-3 bg-transparent border border-foreground/50 absolute bottom-1 left-1.5 rounded-full"></div>
      </button>
    </div>
  </div>
</template>
