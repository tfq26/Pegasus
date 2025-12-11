<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { Moon, Sun, Monitor } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'

const mode = useColorMode({
  emitAuto: true,
  selector: 'html',
  attribute: 'class',
  storageKey: 'pegasus-theme',
})

// Initialize to auto mode if no preference is set
onMounted(() => {
  const stored = localStorage.getItem('pegasus-theme')
  if (!stored) {
    mode.value = 'auto'
  }
})

const toggleTheme = () => {
  // Cycle through: auto -> light -> dark -> auto
  if (mode.value === 'auto') {
    mode.value = 'light'
  } else if (mode.value === 'light') {
    mode.value = 'dark'
  } else {
    mode.value = 'auto'
  }
}

const currentIcon = computed(() => {
  if (mode.value === 'auto') return 'monitor'
  if (mode.value === 'dark') return 'moon'
  return 'sun'
})
</script>

<template>
  <button
    @click="toggleTheme"
    class="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    :title="`Theme: ${mode}`"
  >
    <Sun
      v-show="currentIcon === 'sun'"
      class="h-[1.2rem] w-[1.2rem] transition-all"
    />
    <Moon
      v-show="currentIcon === 'moon'"
      class="h-[1.2rem] w-[1.2rem] transition-all"
    />
    <Monitor
      v-show="currentIcon === 'monitor'"
      class="h-[1.2rem] w-[1.2rem] transition-all"
    />
    <span class="sr-only">Toggle theme ({{ mode }})</span>
  </button>
</template>
