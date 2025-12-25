<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <div class="w-full max-w-md space-y-8">
      <!-- Logo & Title -->
      <div class="text-center">
        <img src="/pegasus.svg" alt="Pegasus" class="w-16 h-16 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-foreground">Welcome to Pegasus</h1>
        <p class="text-muted-foreground text-sm mt-2">
          {{ isLoginMode ? 'Sign in to your local account' : 'Create a local account to get started' }}
        </p>
      </div>

      <!-- Auth Form -->
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Username -->
        <div class="space-y-2">
          <label for="username" class="text-sm font-medium text-foreground">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            required
            autocomplete="username"
            class="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Enter your username"
          />
        </div>

        <!-- Email (signup only) -->
        <div v-if="!isLoginMode" class="space-y-2">
          <label for="email" class="text-sm font-medium text-foreground">Email (optional)</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            class="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="your@email.com"
          />
        </div>

        <!-- Password -->
        <div class="space-y-2">
          <label for="password" class="text-sm font-medium text-foreground">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Enter your password"
          />
        </div>

        <!-- Confirm Password (signup only) -->
        <div v-if="!isLoginMode" class="space-y-2">
          <label for="confirmPassword" class="text-sm font-medium text-foreground">Confirm Password</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            required
            autocomplete="new-password"
            class="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Confirm your password"
          />
        </div>

        <!-- Error Message -->
        <div v-if="error" class="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {{ error }}
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-3 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="isLoading" class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {{ isLoginMode ? 'Signing in...' : 'Creating account...' }}
          </span>
          <span v-else>{{ isLoginMode ? 'Sign In' : 'Create Account' }}</span>
        </button>
      </form>

      <!-- Toggle Mode -->
      <div class="text-center">
        <button
          @click="toggleMode"
          class="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          {{ isLoginMode ? "Don't have an account? Create one" : 'Already have an account? Sign in' }}
        </button>
      </div>

      <!-- Offline Notice -->
      <div v-if="!isOnline" class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <div class="w-2 h-2 rounded-full bg-yellow-500"></div>
        Offline Mode - Your data is stored locally
      </div>

      <!-- Cloud Link Prompt -->
      <div v-if="isOnline && !isLoginMode" class="text-center text-xs text-muted-foreground">
        You can link to cloud later for sync & backup
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDesktopAuth } from '@/composables/useDesktopAuth'
import { toast } from '@/composables/useNotifications'

const router = useRouter()
const { createAccount, login, isLoading, error: authError, isOnline } = useDesktopAuth()

const isLoginMode = ref(true)
const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref<string | null>(null)

const toggleMode = () => {
  isLoginMode.value = !isLoginMode.value
  error.value = null
}

const handleSubmit = async () => {
  error.value = null

  // Validation
  if (!username.value.trim()) {
    error.value = 'Username is required'
    return
  }
  if (password.value.length < 6) {
    error.value = 'Password must be at least 6 characters'
    return
  }
  if (!isLoginMode.value && password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  try {
    if (isLoginMode.value) {
      const response = await login(username.value, password.value)
      if (response.success) {
        toast.success('Welcome back!')
        router.push('/')
      } else {
        error.value = response.message
      }
    } else {
      const response = await createAccount(username.value, password.value, email.value || undefined)
      if (response.success) {
        toast.success('Account created! Welcome to Pegasus.')
        router.push('/')
      } else {
        error.value = response.message
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'An error occurred'
  }
}
</script>
