<template>
  <div class="absolute inset-0">
    <RippleCircle
      v-for="index in numberOfCircles"
      :key="index"
      :opacity="baseCircleOpacity - index * circleOpacityDowngradeRatio"
      :size="baseCircleSize + index * spaceBetweenCircle"
      :animation-delay="index * waveSpeed"
      :border-style="index === numberOfCircles - 1 ? 'dashed' : 'solid'"
      :class="circleClass"
    />
  </div>
</template>

<script setup>
defineProps({
  baseCircleSize: { type: Number, required: false, default: 210 },
  baseCircleOpacity: { type: Number, required: false, default: 0.24 },
  spaceBetweenCircle: { type: Number, required: false, default: 70 },
  circleOpacityDowngradeRatio: { type: Number, required: false, default: 0.03 },
  circleClass: { type: String, required: false },
  waveSpeed: { type: Number, required: false, default: 80 },
  numberOfCircles: { type: Number, required: false, default: 7 },
});
</script>
