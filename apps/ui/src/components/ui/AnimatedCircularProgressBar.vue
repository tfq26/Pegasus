<template>
  <div class="relative flex items-center justify-center" :style="{ width: size + 'px', height: size + 'px' }">
    <!-- Halo Backgrounds -->
    <div class="absolute inset-0 z-[-1] pointer-events-none">
       <div class="aurora-glow" />
       <div class="outer-ring" />
       <div class="inner-glow" />
    </div>

    <svg
      class="transform -rotate-90 relative z-10"
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
    >
      <!-- Background Circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="gaugeSecondaryColor"
        :stroke-width="circleStrokeWidth"
      />
      <!-- Progress Circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="gaugePrimaryColor"
        :stroke-width="circleStrokeWidth"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        stroke-linecap="round"
        class="transition-all ease-out"
        :style="{ transitionDuration: duration + 's' }"
      />
    </svg>
    <div v-if="showPercentage" class="absolute inset-0 flex items-center justify-center text-xs font-medium z-20">
      {{ Math.round(value) }}%
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: number
  min?: number
  max?: number
  size?: number
  circleStrokeWidth?: number
  duration?: number
  gaugePrimaryColor?: string
  gaugeSecondaryColor?: string
  showPercentage?: boolean
}>(), {
  min: 0,
  max: 100,
  size: 24,
  circleStrokeWidth: 3,
  duration: 0.5,
  gaugePrimaryColor: 'currentColor',
  gaugeSecondaryColor: 'rgba(128, 128, 128, 0.2)',
  showPercentage: false
})

const center = computed(() => props.size / 2)
const radius = computed(() => (props.size - props.circleStrokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)

const normalizedValue = computed(() => {
  const clamped = Math.min(Math.max(props.value, props.min), props.max)
  return (clamped - props.min) / (props.max - props.min)
})

const dashOffset = computed(() => {
  return circumference.value * (1 - normalizedValue.value)
})
</script>

<style scoped>
/* Halos */
.inner-glow,
.outer-ring,
.aurora-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  filter: blur(8px);
  opacity: 0.6;
}

.inner-glow { width: 140%; height: 140%; }
.outer-ring { width: 180%; height: 180%; opacity: 0.3; }
.aurora-glow { width: 220%; height: 220%; opacity: 0.2; }

/* Gradients */
.inner-glow::before,
.outer-ring::before,
.aurora-glow::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  transform: translate(-50%, -50%);
  background-repeat: no-repeat;
  background-position: center;
  border-radius: 50%;
  animation: rotate-halo 4s linear infinite;
}

.inner-glow::before {
  background-image: conic-gradient(from 0deg, transparent, var(--primary) 20%, transparent 50%, #d946ef 80%, transparent);
  animation-duration: 3s;
}

.outer-ring::before {
  background-image: conic-gradient(from 90deg, transparent, #4f46e5 30%, transparent 60%, #ec4899 90%, transparent);
  animation-duration: 5s;
  animation-direction: reverse;
}

.aurora-glow::before {
  background-image: conic-gradient(from 180deg, transparent, #8b5cf6 40%, transparent 70%, #ec4899 95%, transparent);
  animation-duration: 7s;
}

@keyframes rotate-halo {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
</style>
