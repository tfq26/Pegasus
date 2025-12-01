/* Sidebar slide transition */
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s;
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
.sidebar-slide-enter-to,
.sidebar-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}
<template>
  <transition name="sidebar-slide">
    <aside v-if="visible" class="w-64 shrink-0 border-r border-stone-800 overflow-y-auto relative bg-stone-950">
      <button
        class="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-l-lg bg-stone-900/80 text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-all"
        @click="$emit('toggle')"
        aria-label="Toggle sidebar"
      >
        <svg v-if="side === 'left'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </button>
      <Explorer />
    </aside>
  </transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Explorer from '../Explorer.vue'

const props = withDefaults(defineProps<{ visible?: boolean }>(), { visible: true })

const side = ref<'left' | 'right'>('left') // 'left' or 'right'
</script>
