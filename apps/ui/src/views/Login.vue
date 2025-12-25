<template>
  <div class="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
    <div class="max-w-md w-full">
      <!-- Logo/Branding -->
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-primary mb-2">Pegasus</h1>
        <p class="text-muted-foreground">You're a step away from flying with your data</p>
      </div>

      <!-- Login Card -->
      <div class="bg-card border border-border rounded-2xl p-8 shadow-lg">
        <div v-if="isLoading" class="text-center py-8">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p class="mt-4 text-muted-foreground">Checking authentication...</p>
        </div>

        <div v-else-if="user" class="text-center py-8">
          <div class="mb-4">
            <svg class="inline-block h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p class="text-foreground mb-4">You're already logged in!</p>
          <button
            @click="goToDashboard"
            class="w-full px-4 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all hover:scale-105 shadow-lg shadow-primary/20"
          >
            Go to Dashboard
          </button>
        </div>

        <div v-else>
          <button
            @click="login"
            class="w-full px-4 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all hover:scale-105 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            Sign in to Pegasus
          </button>

          <p class="mt-6 text-center text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

defineOptions({ name: 'LoginPage' })

const router = useRouter()
const { user, isLoading, isOnline, fetchUser, login, isTauri } = useAuth()

onMounted(() => {
  // Redirect to local auth only if Tauri AND offline
  if (isTauri() && !isOnline.value) {
    router.replace('/local-auth')
    return
  }
  fetchUser()
})

const goToDashboard = () => {
  router.push('/')
}
</script>
