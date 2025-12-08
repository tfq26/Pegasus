<template>
  <div v-if="isActive" class="tabs-content" role="tabpanel">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import type { Ref } from 'vue'

const props = defineProps<{
  value: string
}>()

const activeTab = inject<Ref<string>>('activeTab')

const isActive = computed(() => activeTab?.value === props.value)
</script>
