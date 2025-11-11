<script setup lang="ts">
import Navbar from './components/Navbar.vue'
</script>

<template>
  <div class="min-h-screen w-screen flex flex-col bg-stone-950 text-stone-100">
    <!-- Fixed Navbar -->
    <Navbar />

    <!-- Main layout -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Main content area with offset to avoid navbar clipping -->
      <main
        class="flex-1 bg-stone-950 overflow-y-auto pt-[64px] px-4"
      >
        <router-view class="w-full h-full" />
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
