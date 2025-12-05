<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  selectedCell: string
  value: string
  aiMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
  (e: 'submit'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

// Focus input when selected cell changes
watch(() => props.selectedCell, () => {
  // Optional: focus input? Maybe not, might steal focus from grid.
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    emit('submit')
  }
}
</script>

<template>
  <div class="h-10 border-b border-border flex items-center px-2 gap-2 bg-background">
    <!-- Name Box -->
    <div class="w-24 h-7 border border-input rounded px-2 flex items-center text-sm font-medium text-muted-foreground bg-muted/20">
      {{ selectedCell }}
    </div>

    <!-- Divider -->
    <div class="w-px h-6 bg-border mx-1"></div>

    <!-- Function Icon -->
    <div class="text-muted-foreground font-serif italic font-bold text-lg px-1 select-none">
      fx
    </div>

    <!-- Formula Input -->
    <input
      ref="inputRef"
      :value="value"
      @input="emit('update:value', ($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
      class="flex-1 h-7 border border-input rounded px-2 text-sm outline-none focus:border-primary bg-background text-foreground"
      :placeholder="aiMode ? 'Ask AI to edit...' : 'Enter value or formula'"
      :class="{ 'border-purple-500 ring-1 ring-purple-500': aiMode }"
    />
  </div>
</template>
