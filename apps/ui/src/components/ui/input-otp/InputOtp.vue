<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: string
  maxLength?: number
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  'update:modelValue': [value: string]
  'complete': [value: string]
}>()

const inputs = ref<HTMLInputElement[]>([])
const length = props.maxLength || 6

const handleInput = (index: number, event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  
  // Update the input value with only the last character if multiple pasted
  if (value.length > 1) {
    target.value = value.charAt(value.length - 1)
  } else {
    target.value = value
  }
  
  // Update model value
  updateModelValue()
  
  // Move to next input
  if (value && index < length - 1) {
    nextTick(() => inputs.value[index + 1]?.focus())
  }
}

const handleKeydown = (index: number, event: KeyboardEvent) => {
  const target = event.target as HTMLInputElement
  
  if (event.key === 'Backspace' && !target.value && index > 0) {
    nextTick(() => inputs.value[index - 1]?.focus())
  }
  
  if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault()
    inputs.value[index - 1]?.focus()
  }
  
  if (event.key === 'ArrowRight' && index < length - 1) {
    event.preventDefault()
    inputs.value[index + 1]?.focus()
  }
}

const handlePaste = (event: ClipboardEvent) => {
  event.preventDefault()
  const pasted = event.clipboardData?.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length) || ''
  
  pasted.split('').forEach((char, i) => {
    if (inputs.value[i]) {
      inputs.value[i].value = char
    }
  })
  
  updateModelValue()
  
  // Focus the next empty input or the last one
  const nextEmpty = pasted.length
  if (nextEmpty < length) {
    inputs.value[nextEmpty]?.focus()
  } else {
    inputs.value[length - 1]?.focus()
  }
}

const updateModelValue = () => {
  const value = inputs.value.map(input => input?.value || '').join('')
  emits('update:modelValue', value)
  
  if (value.length === length) {
    emits('complete', value)
  }
}

// Watch for external model value changes
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    newValue.split('').forEach((char, i) => {
      if (inputs.value[i]) {
        inputs.value[i].value = char
      }
    })
  }
}, { immediate: true })

const setRef = (el: any, index: number) => {
  if (el) inputs.value[index] = el
}
</script>

<template>
  <div :class="cn('flex items-center gap-2', props.class)">
    <slot>
      <template v-for="(_, index) in length" :key="index">
        <!-- Separator at halfway point -->
        <div v-if="index === Math.floor(length / 2)" class="w-2 h-1 bg-border rounded-full mx-1" />
        
        <input
          :ref="(el) => setRef(el, index)"
          type="text"
          maxlength="1"
          :disabled="disabled"
          class="w-12 h-14 text-center text-xl font-mono font-bold uppercase bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          @input="handleInput(index, $event)"
          @keydown="handleKeydown(index, $event)"
          @paste="handlePaste"
        />
      </template>
    </slot>
  </div>
</template>
