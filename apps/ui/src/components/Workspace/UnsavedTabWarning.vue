<script setup lang="ts">
import { useWorkspaceStore } from '@/stores/workspace'

const workspaceStore = useWorkspaceStore()
const emit = defineEmits<{
  'migrate': []
}>()
</script>

<template>
  <div v-if="workspaceStore.hasUnsavedWork" class="bg-amber-900/50 border-b border-amber-800 px-4 py-2 flex items-center justify-between">
    <div class="flex items-center gap-2 text-amber-200">
       <span class="i-heroicons-exclamation-triangle w-4 h-4 flex-shrink-0" />
       <span class="text-xs sm:text-sm truncate">Unsaved files expire in 48h. Please migrate to a database connection.</span>
    </div>
    <button 
      @click="emit('migrate')" 
      class="text-xs ml-2 bg-amber-800 hover:bg-amber-700 text-amber-100 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
    >
      Migrate
    </button>
  </div>
</template>
