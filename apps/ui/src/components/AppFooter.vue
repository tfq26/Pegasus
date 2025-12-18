<template>
  <footer class="py-6 text-center text-muted-foreground text-xs border-t border-border bg-background">
    <div class="flex items-center justify-center gap-4 mb-2 flex-wrap">
      <RouterLink to="/about" class="hover:text-primary transition-colors">About</RouterLink>
      <span>•</span>
      <RouterLink to="/support" class="hover:text-primary transition-colors">Support</RouterLink>
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
defineOptions({ name: 'AppFooter' })
</script>
