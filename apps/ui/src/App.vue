<script setup lang="ts">
import { onMounted } from 'vue'
import Navbar from './components/Navbar.vue'
import { Toaster } from '@/components/ui/sonner'
import { useAuth } from '@/composables/useAuth'
import { usePrefetch } from '@/composables/usePrefetch'
import 'vue-sonner/style.css'

// Enable McMaster-Carr style link prefetching
usePrefetch()

const { fetchUser } = useAuth()

// Fetch user on app mount to check authentication status
onMounted(() => {
  fetchUser()
})

</script>

<template>
  <!-- Unified App Layout (Phone, Tablet & Desktop) -->
  <div class="h-full w-full flex flex-col bg-background text-foreground transition-colors duration-300">
    <!-- Fixed Navbar (Glassy) -->
    <Navbar />

    <!-- Sonner Toasts -->
    <Toaster position="top-right" richColors />

    <!-- Main layout -->
    <div class="flex flex-1 overflow-hidden pt-16">
      <main class="flex-1 bg-background overflow-y-auto w-full">
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
