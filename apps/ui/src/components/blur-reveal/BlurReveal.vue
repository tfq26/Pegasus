<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  duration?: number
  delay?: number
  blur?: string
  yOffset?: number
  class?: string
  /** Key to trigger re-animation when content changes */
  triggerKey?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  duration: 0.6,
  delay: 0,
  blur: '10px',
  yOffset: 20,
})

const isVisible = ref(false)
const animationKey = ref(0)

// Watch for triggerKey changes to re-trigger animation
watch(() => props.triggerKey, () => {
  isVisible.value = false
  animationKey.value++
  // Small delay before showing to allow CSS reset
  setTimeout(() => {
    isVisible.value = true
  }, 50)
}, { immediate: true })

// Initial animation trigger
setTimeout(() => {
  isVisible.value = true
}, props.delay * 1000)
</script>

<template>
  <div
    :key="animationKey"
    :class="[
      'blur-reveal-container transition-all ease-out',
      isVisible ? 'blur-reveal-visible' : 'blur-reveal-hidden',
      props.class
    ]"
    :style="{
      '--blur-amount': props.blur,
      '--y-offset': `${props.yOffset}px`,
      '--duration': `${props.duration}s`,
      '--delay': `${props.delay}s`
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.blur-reveal-container {
  transition-duration: var(--duration);
  transition-delay: var(--delay);
  transition-property: opacity, filter, transform;
}

.blur-reveal-hidden {
  opacity: 0;
  filter: blur(var(--blur-amount));
  transform: translateY(var(--y-offset));
}

.blur-reveal-visible {
  opacity: 1;
  filter: blur(0px);
  transform: translateY(0);
}
</style>
