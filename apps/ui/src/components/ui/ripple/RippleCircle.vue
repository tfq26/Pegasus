<template>
  <div :class="cn('absolute shadow-xl', 'animate-ripple-circle', props.class)" />
</template>

<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  size: { type: Number, required: false, default: 210 },
  class: { type: String, required: false },
  opacity: { type: Number, required: false, default: 0.24 },
  animationDelay: { type: Number, required: false },
  borderStyle: { type: String, required: false },
});
</script>

<style scoped>
.animate-ripple-circle {
  animation: ripple-effect var(--duration, 2s) ease-in-out
    calc(var(--i, 0) * 0.2s) infinite;
  border-width: 1px;
  top: 50%;
  left: 50%;
  width: v-bind('props.size + "px"');
  height: v-bind('props.size + "px"');
  animation-delay: v-bind('props.animationDelay + "ms"');
  opacity: v-bind("props.opacity");
  transform: translate(-50%, -50%) scale(1);
  border-style: v-bind("props.borderStyle");
}

@keyframes ripple-effect {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    transform: translate(-50%, -50%) scale(0.9);
  }
}
</style>
