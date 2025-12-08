<template>
  <button
    :class="[
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      isActive ? 'bg-background text-foreground shadow' : 'hover:bg-muted/50'
    ]"
    :disabled="disabled"
    @click="handleClick"
    role="tab"
    :aria-selected="isActive"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import type { Ref } from 'vue'

const props = defineProps<{
  value: string
  disabled?: boolean
}>()

const activeTab = inject<Ref<string>>('activeTab')
const setActiveTab = inject<(value: string) => void>('setActiveTab')

const isActive = computed(() => activeTab?.value === props.value)

const handleClick = () => {
  if (!props.disabled && setActiveTab) {
    setActiveTab(props.value)
  }
}
</script>
