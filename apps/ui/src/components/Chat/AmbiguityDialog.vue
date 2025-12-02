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
    <DialogContent class="sm:max-w-[425px] bg-stone-950 border-stone-800 text-stone-100">
      <DialogHeader>
        <DialogTitle class="text-amber-400 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          Clarification Needed
        </DialogTitle>
        <DialogDescription class="text-stone-400 pt-2">
          {{ ambiguity?.message }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2 py-4">
        <button
          v-for="(choice, index) in ambiguity?.choices || []"
          :key="index"
          @click="emit('resolve', choice)"
          class="w-full text-left px-4 py-3 rounded-lg bg-stone-900 border border-stone-800 hover:border-violet-500 hover:bg-stone-800 transition-all group flex items-center justify-between"
        >
          <span class="text-sm text-stone-200 group-hover:text-white">{{ choice }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-stone-500 group-hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <DialogFooter>
        <p class="text-xs text-stone-500 w-full text-center">
          Select an option to continue generating the query.
        </p>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
