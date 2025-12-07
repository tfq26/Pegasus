<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Navbar from './components/Navbar.vue'
import MobileShowcase from './components/MobileShowcase.vue'
import MobileHome from './views/mobile/MobileHome.vue'
import MobileAbout from './views/mobile/MobileAbout.vue'
import MobileHeader from './components/mobile/MobileHeader.vue'
import MobileFooter from './components/mobile/MobileFooter.vue'
import { Toaster } from '@/components/ui/sonner'
import { useMobileDetection } from '@/composables/useMobileDetection'
import { useAuth } from '@/composables/useAuth'
import 'vue-sonner/style.css'

const { isMobile } = useMobileDetection()
const { fetchUser } = useAuth()
const route = useRoute()

// Fetch user on app mount to check authentication status
onMounted(() => {
  fetchUser()
})


// Routes that allow the standard mobile layout (Header + Content)
const allowedMobileRoutes = [
  '/releases',
  '/feedback',
  '/profile',
  '/settings',
  '/login'
]

// Routes where we should hide the header (e.g. Auth flows that need full screen)
const hideHeaderRoutes = [
  '/register',
  '/callback'
]

const showMobileShowcase = computed(() => {
  if (!isMobile.value) return false
  if (route.path === '/' || route.path === '/about') return false
  // Allow auth routes to pass through to router-view without showcase
  if (hideHeaderRoutes.some(path => route.path.startsWith(path))) return false
  return !allowedMobileRoutes.some(path => route.path.startsWith(path))
})

const showMobileHeader = computed(() => {
  if (!isMobile.value) return false
  if (showMobileShowcase.value) return false // Showcase has own header
  if (hideHeaderRoutes.some(path => route.path.startsWith(path))) return false // Auth usually handles own layout
  return true
})
</script>

<template>
  <!-- Mobile Layout -->
  <div v-if="isMobile" class="h-full w-full bg-background text-foreground flex flex-col">
    <!-- Top Header (Contextual) -->
    <MobileHeader v-if="showMobileHeader" />

    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-auto flex flex-col">
      <div class="flex-1">
        <MobileHome v-if="route.path === '/'" />
        <MobileAbout v-else-if="route.path === '/about'" />
        <MobileShowcase v-else-if="showMobileShowcase" />
        <router-view v-else class="w-full" />
      </div>
      
      <!-- Mobile Footer -->
      <MobileFooter />
    </div>
    
    <Toaster position="top-center" richColors />
  </div>

  <!-- Standard Desktop App Layout -->
  <div v-else class="h-full w-full flex flex-col bg-background text-foreground transition-colors duration-300">
    <!-- Fixed Navbar -->
    <Navbar />

    <!-- Sonner Toasts -->
    <Toaster position="top-right" richColors />

    <!-- Main layout -->
    <div class="flex flex-1 overflow-hidden pt-16">
      <main class="flex-1 bg-background overflow-y-auto">
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
