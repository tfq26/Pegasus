<template>
  <div class="h-full min-h-[calc(100vh-64px)] w-full flex flex-col items-center justify-center bg-background text-foreground p-6 transition-colors duration-300">
    <div class="max-w-md w-full">
      <!-- Logo/Branding -->
      <div class="text-center mb-10">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/5 mb-4 shadow-sm border border-primary/10 overflow-hidden">
           <img src="/logo_new_purple.svg" alt="Pegasus Logo" class="w-12 h-12 object-contain" />
        </div>
        <h1 class="text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">Pegasus</h1>
        <p class="text-muted-foreground font-medium">You're a step away from flying with your data</p>
      </div>

      <!-- Login Content -->
      <div class="p-8 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm shadow-xl">
        <div v-if="isLoading" class="text-center py-8">
          <div class="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p class="mt-4 text-muted-foreground animate-pulse">Checking authentication...</p>
        </div>

        <div v-else-if="user" class="text-center py-6">
          <div class="mb-6 relative inline-block">
            <div class="absolute inset-0 bg-green-500/20 blur-xl rounded-full"></div>
            <svg class="relative inline-block h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-xl font-semibold mb-2">Welcome Back!</p>
          <p class="text-muted-foreground mb-8">You're already logged in as <span class="text-foreground font-medium">{{ user.email }}</span></p>
          <button
            @click="goToDashboard"
            class="w-full px-4 py-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/25"
          >
            Go to Dashboard
          </button>
        </div>

        <div v-else>
          <button
            @click="handleLogin"
            class="group w-full px-4 py-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/25 flex items-center justify-center gap-3"
          >
            <svg class="h-5 w-5 transition-transform group-hover:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign in to Pegasus
          </button>

          <div class="mt-8 flex items-center gap-4">
             <div class="h-px flex-1 bg-border/50"></div>
             <span class="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Secure Access</span>
             <div class="h-px flex-1 bg-border/50"></div>
          </div>

          <p class="mt-6 text-center text-[11px] text-muted-foreground leading-relaxed px-4">
            By signing in, you agree to our <a href="#" class="text-primary hover:underline">Terms of Service</a> and <a href="#" class="text-primary hover:underline">Privacy Policy</a>
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
  // Redirect all Tauri (desktop) apps to the unified sign-in page
  // SignIn.vue now handles both online (SSO) and offline (local) cases
  if (isTauri()) {
    router.replace('/signin')
    return
  }
  
  // Web: Check if already authenticated
  fetchUser().then(() => {
    if (user.value) {
      const params = new URLSearchParams(window.location.search)
      const redirect = params.get('redirect') || '/'
      router.replace(redirect)
    }
  })
})

const goToDashboard = () => {
  router.push('/')
}

// For web, use the standard OAuth redirect
const handleLogin = () => {
  if (isTauri()) {
    // Should not reach here due to onMounted redirect, but just in case
    router.push('/signin')
  } else {
    login()
  }
}
</script>
