<template>
  <footer class="w-full border-t border-border py-6 mt-auto bg-background/80 backdrop-blur-sm">
    <div class="flex flex-col items-center gap-2">
      <RouterLink 
        to="/support" 
        class="px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono text-xs"
        title="View changelog"
      >
        {{ version }}
      </RouterLink>
      <p class="text-center text-xs text-muted-foreground">
        © {{ new Date().getFullYear() }} Pegasus
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineOptions({ name: 'MobileFooter' })

const version = ref('v0.5.1')

// Fetch latest version from releases.json
onMounted(async () => {
  try {
    const response = await fetch('/releases.json')
    const data = await response.json()
    const latestRelease = data.releases.find((r: any) => r.isLatest)
    if (latestRelease) {
      version.value = `v${latestRelease.version}`
    }
  } catch (error) {
    console.error('Failed to fetch version:', error)
    // Keep default version if fetch fails
  }
})
</script>
