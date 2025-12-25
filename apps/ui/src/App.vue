<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Navbar from './components/Navbar.vue'
import DesktopNavbar from './components/DesktopNavbar.vue'
import { Toaster } from '@/components/ui/sonner'
import { useAuth } from '@/composables/useAuth'
import { usePrefetch } from '@/composables/usePrefetch'
import { useConnections } from '@/composables/useConnections'
import { useDesktopMenu } from '@/composables/useDesktopMenu'
import 'vue-sonner/style.css'

// Check if running in Tauri
const isTauri = () => '__TAURI_INTERNALS__' in window
const isDesktop = ref(false)

// Enable McMaster-Carr style link prefetching
usePrefetch()

// Enable desktop menu event handling (only active in Tauri)
useDesktopMenu()

const { fetchUser } = useAuth()
const { loadConnections } = useConnections()

// Fetch user on app mount - skip for Tauri when offline
onMounted(async () => {
  // Detect if running in Tauri
  isDesktop.value = isTauri()

  // Initialize connections globally
  loadConnections()

  if (isTauri() && !navigator.onLine) {
    // Tauri offline: use local auth (handled by router guard)
    console.log('[App] Running in Tauri offline - using local auth')
  } else {
    // Web or Tauri online: use WorkOS auth
    fetchUser()
  }
})

</script>

<template>
  <!-- Unified App Layout (Phone, Tablet & Desktop) -->
  <div class="h-full w-full flex flex-col bg-background text-foreground transition-colors duration-300">
    <!-- Navbar: Desktop version for Tauri, regular for web -->
    <DesktopNavbar v-if="isDesktop" />
    <Navbar v-else />

    <!-- Sonner Toasts -->
    <Toaster position="top-right" richColors />

    <!-- Main layout: Adjust padding for navbar height -->
    <div class="flex flex-1 overflow-hidden" :class="isDesktop ? 'pt-12' : 'pt-16'">
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
