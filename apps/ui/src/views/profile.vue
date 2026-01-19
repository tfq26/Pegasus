<template>
  <div class="min-h-screen bg-background text-foreground p-4 md:p-8 xl:p-12 transition-all duration-500">
    <ProfileTab />
  </div>
</template>

<script setup lang="ts">
import ProfileTab from './settings/ProfileTab.vue'

defineOptions({ name: 'ProfilePage' })
</script>
