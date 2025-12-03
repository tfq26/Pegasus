<script setup lang="ts">
import Navbar from './components/Navbar.vue'
import { Toaster } from '@/components/ui/sonner'
import 'vue-sonner/style.css' // vue-sonner v2 requires this import
</script>

<template>
  <div class="h-full w-full flex flex-col bg-background text-foreground transition-colors duration-300">
    <!-- Fixed Navbar -->
    <Navbar />

    <!-- Sonner Toasts -->
    <Toaster position="top-right" richColors />

    <!-- Main layout -->
    <div class="flex flex-1 overflow-hidden pt-16">
      <!-- Main content area with offset to avoid navbar clipping -->
      <main
        class="flex-1 bg-background overflow-y-auto"
      >
        <router-view class="w-full" />
      </main>
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>
