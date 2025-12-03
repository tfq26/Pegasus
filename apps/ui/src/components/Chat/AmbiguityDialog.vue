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
  ambiguity: { message: string; choices: string[] } | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'resolve': [choice: string]
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
        <DialogTitle class="text-amber-500 dark:text-amber-400 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          Clarification Needed
        </DialogTitle>
        <DialogDescription class="text-muted-foreground pt-2">
          {{ ambiguity?.message }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2 py-4">
        <button
          v-for="(choice, index) in ambiguity?.choices || []"
          :key="index"
          @click="emit('resolve', choice)"
          class="w-full text-left px-4 py-3 rounded-lg bg-muted/50 border border-border hover:border-primary hover:bg-muted transition-all group flex items-center justify-between"
        >
          <span class="text-sm text-foreground group-hover:text-primary">{{ choice }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <DialogFooter>
        <p class="text-xs text-muted-foreground w-full text-center">
          Select an option to continue generating the query.
        </p>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
