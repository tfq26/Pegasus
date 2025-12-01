<template>
  <header
    class="flex items-center justify-between border-b border-stone-800 bg-stone-900/90 px-4 py-2"
  >
    <h2 class="font-semibold text-stone-200 tracking-wide">Query Editor</h2>
    <div class="flex items-center gap-2 text-sm">
      <span
        class="px-3 py-1 rounded-md cursor-pointer transition-colors"
        :class="mode === 'chat'
          ? 'bg-violet-600 text-white'
          : 'text-stone-400 hover:text-violet-400'"
        @click="$emit('update:mode', 'chat')"
      >
        Chat
      </span>
      <span
        class="px-3 py-1 rounded-md cursor-pointer transition-colors"
        :class="mode === 'write'
          ? 'bg-violet-600 text-white'
          : 'text-stone-400 hover:text-violet-400'"
        @click="$emit('update:mode', 'write')"
      >
        Write
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ mode: 'chat' | 'write' }>()
</script>
