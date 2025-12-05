<script setup lang="ts">
import { ref, watch } from 'vue'
import { FunctionSquare } from 'lucide-vue-next'

const props = defineProps<{
  selectedCell: string // e.g. "A1"
  value: string
}>()

const emit = defineEmits<{
  (e: 'update:value', val: string): void
  (e: 'submit'): void
}>()

const localValue = ref(props.value)

watch(() => props.value, (newVal) => {
  localValue.value = newVal
})

const onInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  localValue.value = val
  emit('update:value', val)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    emit('submit')
    ;(e.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <div class="flex items-center gap-2 p-1.5 border-b border-border bg-background">
    <!-- Cell Address -->
    <div class="w-10 h-7 flex items-center justify-center bg-muted/30 border border-border rounded text-xs font-mono font-medium text-muted-foreground">
      {{ selectedCell || '' }}
    </div>

    <div class="h-4 w-px bg-border mx-1"></div>

    <!-- Function Icon -->
    <div class="text-muted-foreground">
      <FunctionSquare class="w-4 h-4" />
    </div>

    <!-- Formula Input -->
    <input
      type="text"
      :value="localValue"
      @input="onInput"
      @keydown="onKeydown"
      class="flex-1 h-7 px-2 text-sm bg-transparent border-none outline-none focus:bg-muted/20 rounded transition-colors font-mono"
      placeholder="Enter value or formula (e.g. =SUM(A1:A5))"
    />
  </div>
</template>
