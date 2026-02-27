<script setup lang="ts">
import { ref, computed, onMounted, onErrorCaptured, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Navbar from './components/Navbar.vue'
import DesktopNavbar from './components/DesktopNavbar.vue'
import { usePegasusTheme } from '@/composables/usePegasusTheme'
import { Toaster } from '@/components/ui/sonner'
import { identityService } from '@/services/identityService'
import { entitlementService } from '@/services/entitlementService'
import { useAuth } from '@/composables/useAuth'
import { usePrefetch } from '@/composables/usePrefetch'
import { useConnectionStore } from '@/stores/connection'
import { useDesktopMenu } from '@/composables/useDesktopMenu'
import { usePlatform } from '@/composables/usePlatform'
import { useColorMode } from '@vueuse/core'
import { useFeatureFlags } from '@/composables/useFeatureFlags'
import { usePisces } from '@/composables/usePisces'
import ErrorPage from '@/views/ErrorPage.vue'
import AILoadingIsland from '@/components/AILoadingIsland.vue'
import PiscesDialog from '@/components/Support/PiscesDialog.vue'
import 'vue-sonner/style.css'

const { isTauri } = usePlatform()
const { setUser } = useFeatureFlags()
const { triggerAutoReport } = usePisces()
const isDesktop = ref(false)
const route = useRoute()

// Global Error State
const capturedError = ref<{
    code: string | number
    title: string
    message: string
    details: string
    fatal: boolean
} | null>(null)

// Error Handling
const handleGlobalError = (error: any, info?: string) => {
    console.error('[App] Global error captured:', error, info)
    
    // Ignore harmless known warnings/errors if needed
    if (error?.message?.includes('ResizeObserver')) return false
    if (error?.message?.includes('VersionRetrievalFailure')) return false
    if (error?.message?.includes('ERR_CONNECTION_REFUSED')) return false
    if (String(error).includes('VersionRetrievalFailure')) return false
    
    // Ignore null errors if they don't have enough context
    if (error === null && info === 'Window Error') {
        console.warn('[App] Ignoring null Window Error')
        return false
    }

    // Format error for display
    capturedError.value = {
        code: error?.code || 'RUNTIME_ERR',
        title: 'Application Error',
        message: error?.message || (error === null ? 'Unknown Window Error' : String(error)),
        details: `${error?.stack || String(error)}\n\nContext: ${info || 'Global Scope'}`,
        fatal: true
    }

    // Automatically trigger BugSage analysis for fatal errors
    if (!error?.message?.includes('ResizeObserver')) {
        triggerAutoReport(error);
    }
    
    return false // propagate if needed, or false to stop propagation in onErrorCaptured
}

// Vue Component Errors
onErrorCaptured((err, instance, info) => {
    return handleGlobalError(err, info)
})

// Window/Promise Errors
const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    handleGlobalError(event.reason, 'Unhandled Promise Rejection')
}

const handleWindowError = (event: ErrorEvent) => {
    handleGlobalError(event.error, 'Window Error')
}

// Routes that should be minimal (no navbar)
const minimalRoutes = ['/auth/device', '/signin', '/local-auth']
const isMinimalRoute = computed(() => {
  // Check for fullscreen dashboard route specifically
  if (route.path.includes('/fullscreen')) return true
  // Check for exact matches and sub-routes of minimal screens
  return minimalRoutes.some(r => route.path === r || route.path.startsWith(r + '/'))
})

// Enable McMaster-Carr style link prefetching
usePrefetch()

// Enable desktop menu event handling (only active in Tauri)
useDesktopMenu()

const { fetchUser } = useAuth()
const connectionStore = useConnectionStore()

// Fetch user on app mount - skip for Tauri when offline
onMounted(async () => {
  // IdentityService initialization MUST happen first to capture tokens from URL
  if (!(isTauri.value && !navigator.onLine)) {
    console.log('[App] Initializing Identity service...')
    await identityService.init()
    
    if (identityService.isAuthenticated) {
        setUser(identityService.user as any)
        entitlementService.fetch()
        // Only load connections if we have a valid authenticated session
        connectionStore.loadConnections()
    } else {
        console.log('[App] Not authenticated, skipping connection load')
    }
  } else {
    console.log('[App] Running in Tauri offline - skipping Identity service init')
    // In offline mode, try to load connections anyway (might have local/cached data)
    connectionStore.loadConnections()
  }

  // Setup Global Listeners
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  window.addEventListener('error', handleWindowError)

  // Detect if running in Tauri
  isDesktop.value = isTauri.value
})

/**
 * THEME MANAGEMENT (Centralized)
 * This ensures the theme class on <html> is maintained regardless of which navbar is mounted.
 */
const themeMode = usePegasusTheme()

const toggleTheme = () => {
  if (themeMode.value === 'auto') {
    themeMode.value = 'light'
  } else if (themeMode.value === 'light') {
    themeMode.value = 'dark'
  } else {
    themeMode.value = 'auto'
  }
}


onUnmounted(() => {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    window.removeEventListener('error', handleWindowError)
})

</script>

<template>
  <!-- Minimal layout for auth pages -->
  <div v-if="isMinimalRoute" class="h-full w-full bg-black">
    <AILoadingIsland />
    <Toaster position="top-right" richColors />
    <!-- For minimal routes, we still overlay the error entirely if it happens -->
    <ErrorPage 
      v-if="capturedError" 
      :code="capturedError.code"
      :title="capturedError.title"
      :message="capturedError.message"
      :details="capturedError.details"
      :fatal="capturedError.fatal"
      class="fixed inset-0 z-[100] bg-black"
    />
    <router-view v-else class="w-full h-full" />
  </div>

  <!-- Full App Layout (Phone, Tablet & Desktop) -->
  <div v-else class="h-full w-full flex flex-col bg-background text-foreground transition-colors duration-300">
    <!-- Navbar: Desktop version for Tauri, regular for web -->
    <DesktopNavbar v-if="isDesktop" :theme-mode="themeMode" :toggle-theme="toggleTheme" />
    <Navbar v-else :theme-mode="themeMode" :toggle-theme="toggleTheme" />

    <!-- Sonner Toasts -->
    <AILoadingIsland />
    <Toaster position="top-right" richColors />

    <!-- Main layout: Adjust padding for navbar height -->
    <div class="flex flex-1 overflow-hidden" :class="isDesktop ? 'pt-12' : 'pt-16'">
      <main 
        class="flex-1 bg-background overflow-y-auto w-full relative"
        :class="{ 'is-desktop': isTauri }"
      >
        <ErrorPage 
            v-if="capturedError" 
            :code="capturedError.code"
            :title="capturedError.title"
            :message="capturedError.message"
            :details="capturedError.details"
            :fatal="capturedError.fatal"
        />
        <router-view v-else class="w-full" />
      </main>
    </div>
  </div>

  <!-- Smart BugSage Reporting -->
  <PiscesDialog />
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
