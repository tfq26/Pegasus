<template>
  <div class="absolute inset-0 pointer-events-none z-50 overflow-hidden">
    <transition-group name="cursor">
      <div 
        v-for="(cursor, socketId) in activeCursors" 
        :key="socketId"
        class="absolute will-change-transform flex items-start gap-1 cursor-container"
        :style="{ 
          transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
          '--user-color': getUserColor(String(socketId))
        }"
      >
        <!-- Premium Cursor Icon -->
        <div class="relative">
          <svg 
            width="22" height="22" viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            class="filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
          >
            <path 
              d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19138L15.9495 12.3673H5.65376Z" 
              fill="var(--user-color)"
              stroke="white"
              stroke-width="1.5"
            />
          </svg>
          <div class="absolute inset-0 bg-[var(--user-color)] opacity-20 blur-sm rounded-full"></div>
        </div>
        
        <!-- User Label -->
        <div 
          class="user-label px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight shadow-lg border border-white/20 whitespace-nowrap"
          :style="{ 
            backgroundColor: 'var(--user-color)',
            color: 'white'
          }"
        >
          {{ cursor.user?.firstName || 'Guest' }}
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  cursors: Record<string, { x: number, y: number, user: any, lastUpdated: number }>
}>()

const now = ref(Date.now())
let interval: any = null

onMounted(() => {
  interval = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (interval) clearInterval(interval)
})

// Only show cursors active in the last 3 seconds
const activeCursors = computed(() => {
  const result: any = {}
  for (const [id, data] of Object.entries(props.cursors)) {
    if (now.value - data.lastUpdated < 3000) {
      result[id] = data
    }
  }
  return result
})

// Consistent color generation based on socket ID
const getUserColor = (id: string) => {
  const colors = [
    '#FF3B30', // Red
    '#34C759', // Green
    '#007AFF', // Blue
    '#FF9500', // Orange
    '#AF52DE', // Purple
    '#5856D6', // Indigo
    '#FF2D55', // Pink
    '#30B0C7', // Teal
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
</script>

<style scoped>
.cursor-container {
  /* Using a custom quintic bezier for buttery smooth motion */
  transition: transform 250ms cubic-bezier(0.23, 1, 0.32, 1), opacity 400ms ease;
  z-index: 1000;
}

.user-label {
  animation: label-appear 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes label-appear {
  from { opacity: 0; transform: translateY(4px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.cursor-enter-active,
.cursor-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.cursor-enter-from,
.cursor-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>
