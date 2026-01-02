<template>
  <footer class="py-6 text-center text-muted-foreground text-xs border-t border-border bg-background">
    <div class="flex items-center justify-center gap-4 mb-2 flex-wrap">
      <RouterLink to="/about" class="hover:text-primary transition-colors">About</RouterLink>
      <span>•</span>
      <RouterLink to="/support" class="hover:text-primary transition-colors">Support</RouterLink>
      <span>•</span>
      <RouterLink 
        to="/support" 
        class="px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono"
        title="View changelog"
      >
        {{ version }}
      </RouterLink>
      <span>•</span>
      <div class="flex items-center justify-center gap-1">
        <span>Icon by</span>
        <a
          href="https://iconscout.com/contributors/mark-aventura"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-primary underline decoration-dotted"
        >
          IconMark
        </a>
      </div>
    </div>
    <p>© {{ new Date().getFullYear() }} Pegasus — Intelligent Cloud Insight Platform</p>
  </footer>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineOptions({ name: 'AppFooter' })

const version = ref('v0.5.1')

// Fetch latest version from releases.json
onMounted(async () => {
  try {
    const response = await fetch('/api/docs')
    const data = await response.json()
    if (data.changelogs && data.changelogs.length > 0) {
      // Sort changelogs by version (valid semver comparison)
      const sorted = data.changelogs.sort((a: string, b: string) => {
        const partsA = a.replace('v', '').split('.').map(Number)
        const partsB = b.replace('v', '').split('.').map(Number)
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const valA = partsA[i] || 0
          const valB = partsB[i] || 0
          if (valA !== valB) return valB - valA
        }
        return 0
      })
      version.value = sorted[0]
    }
  } catch (error) {
    console.error('Failed to fetch version:', error)
    // Keep default version if fetch fails
  }
})
</script>
