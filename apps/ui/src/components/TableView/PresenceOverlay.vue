
<script setup lang="ts">
import { computed } from 'vue';
import { Engine } from './Engine/Engine';
import type { UserPresence } from './Engine/types';

const props = defineProps<{
  engine: Engine;
  rowHeight?: number;
  colWidth?: number;
  offsetX?: number;
  offsetY?: number;
  trigger?: number; // Force re-render
}>();

const emit = defineEmits<{
    'follow-user': [userId: string]
}>();

const rowHeight = computed(() => props.rowHeight || 24);
const colWidth = computed(() => props.colWidth || 100);
const offsetX = computed(() => props.offsetX || 40);
const offsetY = computed(() => props.offsetY || 0);

const users = computed(() => {
    // Dependency on trigger to force update if engine.presence changes without deep reactivity
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = props.trigger; 
    return Array.from(props.engine.presence.values()) as UserPresence[];
});
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-visible z-[5]">
     <div 
        v-for="user in users" 
        :key="user.userId"
        class="absolute transition-all duration-200 ease-in-out border-2 box-border shadow-sm"
        :style="{
            top: `${offsetY + (user.cursor.row * rowHeight)}px`,
            left: `${offsetX + (user.cursor.col * colWidth)}px`,
            width: `${colWidth}px`,
            height: `${rowHeight}px`,
            borderColor: user.color
        }"
     >
        <!-- Name Tag -->
        <div 
            class="absolute -top-5 -left-0.5 px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap rounded shadow-sm z-30 flex items-center gap-1 cursor-pointer pointer-events-auto hover:opacity-80 hover:scale-105 transition-all"
            :style="{ backgroundColor: user.color }"
            @click.stop="emit('follow-user', user.userId)"
            title="Click to Follow"
        >
            {{ user.userName }}
        </div>
     </div>
  </div>
</template>
