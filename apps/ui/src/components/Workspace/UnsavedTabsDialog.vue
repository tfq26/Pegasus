<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { computed } from 'vue'

const props = defineProps<{
  open: boolean
  targetConnectionName?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'move': []
  'discard': []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[425px] bg-background border-border text-foreground">
      <DialogHeader>
        <DialogTitle class="text-amber-500 flex items-center gap-2">
          <span class="i-heroicons-exclamation-circle w-5 h-5"></span>
          Unsaved Files
        </DialogTitle>
        <DialogDescription class="text-muted-foreground pt-2">
          You have unsaved tabs in your temporary workspace. Switching to 
          <span class="font-medium text-foreground">{{ targetConnectionName || 'another connection' }}</span> 
          will close them.
        </DialogDescription>
      </DialogHeader>

      <div class="py-4 text-sm text-muted-foreground">
        Would you like to move these tabs to the new connection or discard them?
      </div>

      <DialogFooter class="flex gap-2 sm:justify-end">
        <button 
          class="px-4 py-2 text-sm font-medium text-foreground bg-transparent hover:bg-muted rounded-md transition-colors" 
          @click="emit('discard')"
        >
          Discard
        </button>
        <button 
          class="px-4 py-2 text-sm font-medium text-stone-900 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors" 
          @click="emit('move')"
        >
          Move to Connection
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
