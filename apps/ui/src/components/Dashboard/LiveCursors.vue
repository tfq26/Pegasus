
<template>
  <div class="absolute inset-0 pointer-events-none z-50 overflow-hidden">
    <div 
      v-for="(cursor, socketId) in cursors" 
      :key="socketId"
      class="absolute transition-transform duration-100 ease-out flex items-start gap-1"
      :style="{ 
        transform: `translate(${cursor.x}px, ${cursor.y}px)`,
      }"
    >
      <!-- Cursor Icon -->
      <svg 
        width="24" height="24" viewBox="0 0 24 24" 
        fill="currentColor" 
        class="text-primary drop-shadow-md"
        style="color: var(--color-primary)"
      >
        <path d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19138L15.9495 12.3673H5.65376Z" />
      </svg>
      
      <!-- User Label -->
      <div 
        class="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-lg font-medium whitespace-nowrap shadow-sm"
      >
        {{ cursor.user?.firstName || 'Guest' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cursors: Record<string, { x: number, y: number, user: any }>
}>()
</script>
