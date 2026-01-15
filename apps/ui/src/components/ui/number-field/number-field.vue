<script setup lang="ts">
import { NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput, NumberFieldRoot } from 'reka-ui'
import { Plus, Minus } from 'lucide-vue-next'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  label?: string
  id?: string
  placeholder?: string
}>(), {
  modelValue: 0
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const localValue = computed({
  get: () => props.modelValue,
  set: (val: number) => emit('update:modelValue', val)
})
</script>

<template>
  <NumberFieldRoot
    :id="id"
    v-model="localValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
  >
    <label
      v-if="label"
      :for="id"
      class="text-stone-700 dark:text-white font-medium text-sm block mb-1.5"
    >
      {{ label }}
    </label>
    <div class="flex items-center border border-border bg-background hover:bg-muted/50 rounded-lg shadow-sm h-10 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30">
      <NumberFieldDecrement class="p-2.5 disabled:opacity-20 hover:text-primary transition-colors cursor-pointer disabled:cursor-not-allowed">
        <Minus class="w-4 h-4" />
      </NumberFieldDecrement>
      <NumberFieldInput 
        :placeholder="placeholder"
        class="bg-transparent flex-1 tabular-nums text-center focus:outline-none p-1 text-sm font-semibold" 
      />
      <NumberFieldIncrement class="p-2.5 disabled:opacity-20 hover:text-primary transition-colors cursor-pointer disabled:cursor-not-allowed">
        <Plus class="w-4 h-4" />
      </NumberFieldIncrement>
    </div>
  </NumberFieldRoot>
</template>