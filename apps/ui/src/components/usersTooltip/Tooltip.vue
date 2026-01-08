<script setup lang="ts">
import { Motion } from "motion-v";
import { computed, ref } from "vue";

interface Item {
  id: number;
  name: string;
  designation: string;
  image: string;
  color?: string; // Optional color for glowing effects
}

defineProps<{
  items: Item[];
}>();

const hoveredIndex = ref<number | null>(null);
const mouseX = ref<number>(0);

// Calculate rotation and translation based on mouse position
const rotation = computed<number>(() => {
  const x = mouseX.value;
  return (x / 100) * 50;
});

const translation = computed<number>(() => {
  const x = mouseX.value;
  return (x / 100) * 50;
});

// Handle initial mouse position and hover
function handleMouseEnter(event: MouseEvent, itemId: number) {
  hoveredIndex.value = itemId;
  // Calculate initial position immediately
  const rect = (event.target as HTMLElement)?.getBoundingClientRect();
  const halfWidth = rect.width / 2;
  mouseX.value = event.clientX - rect.left - halfWidth;
}

// Handle mouse movement
function handleMouseMove(event: MouseEvent) {
  const rect = (event.target as HTMLElement)?.getBoundingClientRect();
  const halfWidth = rect.width / 2;
  mouseX.value = event.clientX - rect.left - halfWidth;
}
</script>

<template>
  <div
    v-for="item in items"
    :key="item.id"
    class="group relative -mr-2 last:mr-0"
    @mouseenter="(e) => handleMouseEnter(e, item.id)"
    @mouseleave="hoveredIndex = null"
    @mousemove="handleMouseMove"
  >
    <!-- Tooltip -->
    <Motion
      v-if="hoveredIndex === item.id"
      :initial="{
        opacity: 0,
        y: -10,
        scale: 0.8,
      }"
      :animate="{
        opacity: 1,
        y: 0,
        scale: 1,
      }"
      :transition="{
        type: 'spring',
        stiffness: 300,
        damping: 15,
      }"
      :exit="{
        opacity: 0,
        y: -10,
        scale: 0.8,
      }"
      :style="{
        translateX: `${translation}px`,
        rotate: `${rotation}deg`,
      }"
      class="absolute top-full mt-3 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center justify-center rounded-lg bg-black px-3 py-1.5 text-xs whitespace-nowrap shadow-2xl border border-white/10 backdrop-blur-md"
    >
      <!-- Glowing Background -->
      <div 
        v-if="item.color"
        class="absolute inset-0 rounded-lg opacity-20 blur-xl pointer-events-none"
        :style="{ backgroundColor: item.color }"
      ></div>

      <!-- Gradient Accents -->
      <div
        class="absolute right-1/2 -top-px z-30 h-px w-2/5 translate-x-1/2 bg-gradient-to-r from-transparent to-transparent"
        :style="{ '--tw-gradient-via': item.color || '#10b981', backgroundImage: 'linear-gradient(to right, var(--tw-gradient-from), var(--tw-gradient-via), var(--tw-gradient-to))' }"
      />
      <div
        class="absolute -top-px left-1/2 z-30 h-px w-2/5 -translate-x-1/2 bg-gradient-to-r from-transparent via-red-500 to-transparent"
        :style="{ '--tw-gradient-via': item.color || '#ef4444', backgroundImage: 'linear-gradient(to right, var(--tw-gradient-from), var(--tw-gradient-via), var(--tw-gradient-to))' }"
      />

      <div class="relative z-30 text-sm font-bold text-white">
        {{ item.name }}
      </div>
      <div class="relative z-30 text-[10px] text-white/70">{{ item.designation }}</div>
    </Motion>
 
    <!-- Avatar Image -->
    <img
      :src="item.image"
      :alt="item.name"
      class="relative !m-0 size-8 rounded-full border-2 border-background object-cover object-top !p-0 transition duration-300 group-hover:z-50 group-hover:scale-110 shadow-sm"
      :style="{ borderColor: hoveredIndex === item.id ? (item.color || 'white') : 'var(--color-background)' }"
    />
  </div>
</template>

