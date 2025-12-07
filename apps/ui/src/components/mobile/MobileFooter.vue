<template>
  <footer class="w-full border-t border-border py-6 mt-auto bg-background/80 backdrop-blur-sm">
    <p class="text-center text-xs text-muted-foreground">
      © {{ new Date().getFullYear() }} Pegasus
    </p>
  </footer>
</template>

<script setup lang="ts">
defineOptions({ name: 'MobileFooter' })
</script>
