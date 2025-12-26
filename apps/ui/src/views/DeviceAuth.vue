<template>
  <div class="min-h-screen flex items-center justify-center bg-stone-950 p-6">
    <div class="max-w-md w-full space-y-8">
      <!-- Logo -->
      <div class="text-center">
        <img src="/pegasus.svg" alt="Pegasus" class="w-16 h-16 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-stone-100">Link Your Device</h1>
        <p class="text-stone-400 mt-2">
          {{ hasValidCode ? 'Click below to authorize your desktop app' : 'Enter the code shown in your desktop app' }}
        </p>
      </div>

      <!-- Code Entry -->
      <div v-if="!hasValidCode && !isSuccess" class="space-y-6">
        <InputOtp
          v-model="code"
          :max-length="8"
          @complete="verifyCode"
          class="justify-center"
        />
        
        <p v-if="error" class="text-red-400 text-sm text-center">{{ error }}</p>
        
        <button
          @click="verifyCode"
          :disabled="code.length !== 8 || isLoading"
          class="w-full py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <svg v-if="isLoading" class="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          {{ isLoading ? 'Verifying...' : 'Continue' }}
        </button>
      </div>

      <!-- Authorize Device -->
      <div v-else-if="hasValidCode && !isSuccess" class="space-y-6">
        <div class="p-6 bg-stone-900 border border-stone-800 rounded-xl text-center">
          <p class="text-sm text-stone-400 mb-2">Authorizing code</p>
          <p class="text-3xl font-mono font-bold tracking-widest text-violet-400">{{ displayCode }}</p>
        </div>

        <!-- User already logged in -->
        <div v-if="user" class="space-y-4">
          <div class="p-4 bg-stone-900 border border-stone-800 rounded-lg flex items-center gap-3">
            <img v-if="user.profilePictureUrl" :src="user.profilePictureUrl" class="w-10 h-10 rounded-full" />
            <div v-else class="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold">
              {{ user.email?.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-stone-100 font-medium truncate">{{ user.firstName }} {{ user.lastName }}</p>
              <p class="text-stone-400 text-sm truncate">{{ user.email }}</p>
            </div>
          </div>
          
          <button
            @click="authorizeDevice"
            :disabled="isLoading"
            class="w-full py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg v-if="isLoading" class="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            {{ isLoading ? 'Authorizing...' : 'Authorize Desktop App' }}
          </button>
        </div>

        <!-- Need to sign in first -->
        <div v-else class="space-y-4">
          <p class="text-stone-400 text-sm text-center">Sign in to authorize</p>
          
          <button
            @click="signInAndAuthorize"
            :disabled="isLoading"
            class="w-full py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
            </svg>
            Sign in with WorkOS
          </button>
        </div>

        <p v-if="error" class="text-red-400 text-sm text-center">{{ error }}</p>
      </div>

      <!-- Success State -->
      <div v-else-if="isSuccess" class="text-center space-y-6">
        <div class="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-semibold text-stone-100">Success!</h2>
          <p class="text-stone-400 mt-2">Your desktop app is now linked.</p>
        </div>
        <p class="text-sm text-stone-500">You can close this window and return to the app.</p>
      </div>

      <!-- Minimal footer -->
      <p class="text-center text-xs text-stone-600">
        Pegasus Desktop Authentication
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { InputOtp } from '@/components/ui/input-otp'

const route = useRoute()
const { user, fetchUser, login: authLogin } = useAuth()

const API_URL = import.meta.env.VITE_QUERY_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`

const code = ref('')
const isLoading = ref(false)
const isSuccess = ref(false)
const error = ref('')
const validCode = ref('')

const hasValidCode = computed(() => validCode.value.length === 8)
const displayCode = computed(() => validCode.value.slice(0, 4) + '-' + validCode.value.slice(4))

const verifyCode = async () => {
  if (code.value.length !== 8) return
  
  error.value = ''
  isLoading.value = true
  
  try {
    const res = await fetch(`${API_URL}/auth/device/verify?code=${code.value.toUpperCase()}`)
    const data = await res.json()
    
    if (data.valid) {
      validCode.value = data.code
    } else {
      error.value = 'Invalid or expired code. Please try again.'
    }
  } catch (e) {
    error.value = 'Failed to verify code. Please try again.'
  } finally {
    isLoading.value = false
  }
}

const authorizeDevice = async () => {
  if (!validCode.value || !user.value) return
  
  error.value = ''
  isLoading.value = true
  
  try {
    const token = localStorage.getItem('auth_token')
    const res = await fetch(`${API_URL}/auth/device/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_code: validCode.value,
        token: token,
        user: user.value
      })
    })
    
    const data = await res.json()
    if (data.success) {
      isSuccess.value = true
    } else {
      error.value = data.error || 'Failed to authorize device'
    }
  } catch (e) {
    error.value = 'Failed to authorize device'
  } finally {
    isLoading.value = false
  }
}

const signInAndAuthorize = () => {
  // Store the device code so we can complete authorization after login
  sessionStorage.setItem('device_auth_code', validCode.value)
  // Redirect to WorkOS login
  authLogin()
}

onMounted(async () => {
  // Check for code in URL
  const urlCode = route.query.code as string
  if (urlCode) {
    code.value = urlCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
    if (code.value.length === 8) {
      await verifyCode()
    }
  }
  
  // Fetch current user
  await fetchUser()
  
  // Check if we're returning from OAuth with a pending device code
  const pendingCode = sessionStorage.getItem('device_auth_code')
  if (pendingCode && user.value) {
    validCode.value = pendingCode
    sessionStorage.removeItem('device_auth_code')
    // Auto-authorize since we just signed in
    await authorizeDevice()
  }
})
</script>
