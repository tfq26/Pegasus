<template>
  <div class="min-h-screen flex items-center justify-center bg-stone-950 text-stone-100">
    <div class="bg-stone-900 p-8 rounded-lg shadow-lg w-full max-w-md space-y-6">
      <div class="text-center">
        <img src="/pegasus.svg" alt="Pegasus" class="w-16 h-16 mx-auto mb-4" />
        <h2 class="text-2xl font-bold text-violet-400">Sign In</h2>
        <p class="text-stone-400 text-sm mt-2">Sign in to sync your data across devices</p>
      </div>

      <!-- Success State -->
      <div v-if="isSuccess" class="text-center space-y-6">
        <div class="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 class="text-xl font-semibold text-stone-100">Signed in successfully!</h3>
          <p class="text-stone-400 mt-2">Welcome, {{ authorizedUser?.email }}</p>
        </div>
        <button
          @click="goToDashboard"
          class="w-full py-3 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-semibold text-lg transition"
        >
          Continue to Dashboard
        </button>
      </div>
      
      <!-- Status Message with Code -->
      <div v-else-if="status" class="p-4 rounded-lg text-center" :class="statusClass">
        <p class="text-sm font-medium">{{ status }}</p>
        <div v-if="userCode" class="mt-3 flex items-center justify-center gap-2">
          <p class="text-2xl font-mono font-bold tracking-widest">{{ formattedCode }}</p>
          <button
            @click="copyCode"
            class="p-2 rounded-lg bg-stone-700 hover:bg-stone-600 transition-colors group"
            :title="copied ? 'Copied!' : 'Copy code'"
          >
            <svg v-if="!copied" class="w-5 h-5 text-stone-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <svg v-else class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
        <p v-if="copied" class="text-xs text-green-400 mt-2">Copied to clipboard!</p>
      </div>

      <!-- Error Message -->
      <div v-if="error && !isSuccess" class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p class="text-red-400 text-sm">{{ error }}</p>
      </div>

      <!-- Sign In Button -->
      <button
        v-if="!isPending && !isSuccess"
        class="w-full py-3 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-semibold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        :disabled="isLoading"
        @click="signInWithWorkOS"
      >
        <svg v-if="isLoading" class="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
        {{ isLoading ? 'Initializing...' : 'Sign in with SSO' }}
      </button>

      <!-- Cancel Button when polling -->
      <button
        v-if="isPending && !isSuccess"
        class="w-full py-3 px-4 rounded-md bg-stone-700 hover:bg-stone-600 text-white font-semibold transition"
        @click="cancelAuth"
      >
        Cancel
      </button>

      <!-- Skip for now (offline mode) -->
      <div v-if="!isPending && !isSuccess" class="text-center">
        <button
          class="text-stone-500 hover:text-stone-300 text-sm underline transition"
          @click="$router.push('/local-auth')"
        >
          Continue offline with local account
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '@/composables/useNotifications'

const router = useRouter()

const isLoading = ref(false)
const isPending = ref(false)
const isSuccess = ref(false)
const status = ref('')
const userCode = ref('')
const error = ref('')
const copied = ref(false)
const authorizedUser = ref<{ email?: string } | null>(null)
let abortController: AbortController | null = null

const formattedCode = computed(() => {
  if (!userCode.value) return ''
  return userCode.value.slice(0, 4) + '-' + userCode.value.slice(4)
})

const statusClass = computed(() => {
  if (isPending.value) return 'bg-violet-500/10 border border-violet-500/20'
  return 'bg-stone-800'
})

const goToDashboard = () => {
  window.location.href = '/dashboard'
}

const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(userCode.value)
    copied.value = true
    toast.success('Code copied to clipboard!')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (e) {
    toast.error('Failed to copy code')
  }
}

const signInWithWorkOS = async () => {
  // Check if we're in Tauri
  if (!('__TAURI_INTERNALS__' in window)) {
    toast.error('Desktop authentication only available in Tauri app')
    return
  }

  isLoading.value = true
  error.value = ''
  abortController = new AbortController()

  const API_URL = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'

  try {
    // Step 1: Request a device code from the backend
    status.value = 'Requesting device code...'
    const res = await fetch(`${API_URL}/auth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal
    })
    const data = await res.json()

    if (!data.device_code || !data.user_code) {
      throw new Error('Failed to get device code from server')
    }

    userCode.value = data.user_code
    isPending.value = true
    status.value = 'Open your browser and enter this code:'

    // Step 2: Open browser with the verification URL
    const { open } = await import('@tauri-apps/plugin-shell')
    const verificationUrl = `${data.verification_url}?code=${data.user_code}`
    console.log('[SignIn] Opening browser:', verificationUrl)
    await open(verificationUrl)

    toast.info('Browser opened. Complete sign-in there, then return to this app.')

    // Step 3: Poll for authorization
    const pollInterval = 2000 // 2 seconds
    const maxAttempts = Math.floor(data.expires_in / 2) || 300 // ~10 minutes

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (abortController?.signal.aborted) {
        throw new Error('cancelled')
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))

      const tokenRes = await fetch(`${API_URL}/auth/device/token?device_code=${data.device_code}`, {
        signal: abortController.signal
      })
      const tokenData = await tokenRes.json()

      if (tokenData.access_token) {
        // Success!
        console.log('[SignIn] Device authorized for:', tokenData.user?.email)
        localStorage.setItem('auth_token', tokenData.access_token)
        
        // Store authorized user for display
        authorizedUser.value = tokenData.user

        // Try to link to local account if we have one
        if (tokenData.user) {
          try {
            const { useDesktopAuth } = await import('@/composables/useDesktopAuth')
            const { localUser, linkToCloud } = useDesktopAuth()
            
            if (localUser.value) {
              await linkToCloud(tokenData.user.sub || tokenData.user.id, tokenData.user.email)
              toast.success('Account linked successfully!')
            }
          } catch (e) {
            console.warn('[SignIn] Could not link to local account:', e)
          }
        }

        // Show success state
        isSuccess.value = true
        isPending.value = false
        userCode.value = ''
        status.value = ''
        
        toast.success(`Signed in as ${tokenData.user?.email || 'user'}`)
        
        // Auto-redirect after a short delay
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 2000)
        
        return
      }

      if (tokenData.error && tokenData.error !== 'authorization_pending') {
        throw new Error(tokenData.error_description || tokenData.error)
      }

      // Still pending, continue polling
      status.value = `Waiting for browser sign-in... (${attempt + 1})`
    }

    throw new Error('Authorization timed out. Please try again.')
  } catch (e: any) {
    if (e.message === 'cancelled' || e.name === 'AbortError') {
      status.value = ''
      toast.info('Sign-in cancelled')
    } else {
      console.error('[SignIn] Cloud login failed:', e)
      error.value = e.message || 'Sign-in failed. Please try again.'
    }
  } finally {
    isLoading.value = false
    if (!isSuccess.value) {
      isPending.value = false
      userCode.value = ''
    }
  }
}

const cancelAuth = () => {
  abortController?.abort()
  isPending.value = false
  userCode.value = ''
  status.value = ''
}

onUnmounted(() => {
  abortController?.abort()
})
</script>
