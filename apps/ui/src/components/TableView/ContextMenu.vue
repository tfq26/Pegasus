<template>
  <div 
    v-if="visible"
    class="fixed z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg rounded-lg py-1 min-w-[200px] context-menu"
    :style="{ top: `${y}px`, left: `${x}px` }"
    @contextmenu.prevent
    @mousedown.stop
  >
    <div 
      v-for="(item, index) in options" 
      :key="index"
    >
        <!-- Divider -->
        <div v-if="item.type === 'divider'" class="h-px bg-zinc-100 dark:bg-zinc-700 my-1"></div>

        <!-- Action Item -->
        <button 
            v-else
            @click="handleSelect(item)"
            :disabled="item.disabled"
            class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-200"
            :class="{ 'text-red-500 dark:text-red-400': item.variant === 'destructive' }"
        >
            <component :is="item.icon" v-if="item.icon" class="w-4 h-4" />
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.shortcut" class="text-xs text-zinc-400">{{ item.shortcut }}</span>
        </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';

export interface ContextMenuItem {
    label?: string;
    action?: string;
    type?: 'action' | 'divider';
    icon?: any;
    shortcut?: string;
    disabled?: boolean;
    variant?: 'default' | 'destructive';
}

const props = defineProps<{
    visible: boolean;
    x: number;
    y: number;
    options: ContextMenuItem[];
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'select', action: string): void;
}>();

const handleSelect = (item: ContextMenuItem) => {
    if (item.disabled || !item.action) return;
    emit('select', item.action);
    emit('close');
};

const close = () => {
    emit('close');
};

// Close on click outside
const onClickOutside = (e: MouseEvent) => {
    if (props.visible) {
        close();
    }
};

// Adjust position if it goes off screen
const adjustPosition = () => {
    // Basic bounds checking logic could go here if needed
    // For now we trust the x,y passed in, or rely on CSS fixed positioning
};

watch(() => props.visible, (newVal) => {
    if (newVal) {
        window.addEventListener('mousedown', onClickOutside);
        window.addEventListener('scroll', close, true); // Close on scroll
    } else {
        window.removeEventListener('mousedown', onClickOutside);
        window.removeEventListener('scroll', close, true);
    }
});

onUnmounted(() => {
    window.removeEventListener('mousedown', onClickOutside);
    window.removeEventListener('scroll', close, true);
});
</script>

<style scoped>
.context-menu {
    animation: fadeIn 0.1s ease-out;
}
@keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
}
</style>
