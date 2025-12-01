<template>
  <footer
    class="flex items-center justify-end gap-3 border-t border-stone-800 bg-stone-900/90 px-4 py-2"
  >
    <button
      @click="$emit('run')"
      :disabled="loading"
      :class="[
        'px-4 py-1.5 rounded-md text-white text-sm font-medium transition flex items-center gap-2 justify-center',
        loading
          ? 'bg-violet-500/70 cursor-wait'
          : 'bg-violet-600 hover:bg-violet-500'
      ]"
    >
      <span v-if="loading" class="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"></span>
      {{ mode === 'chat' ? 'Send' : loading ? 'Executing…' : 'Execute' }}
    </button>
    <button
      @click="$emit('clear')"
      class="px-3 py-1.5 rounded-md border border-stone-700 text-stone-400 hover:bg-stone-800 hover:text-stone-200 text-sm transition"
    >
      Clear
    </button>
  </footer>
</template>

<script setup lang="ts">
defineProps<{ mode: 'chat' | 'write'; loading?: boolean }>()
</script>
