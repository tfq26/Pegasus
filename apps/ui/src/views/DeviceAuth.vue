<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-6">
    <div class="max-w-md w-full space-y-8">
      <!-- Logo -->
      <div class="text-center">
        <img src="/pegasus.svg" alt="Pegasus" class="w-16 h-16 mx-auto mb-4" />
        <h1 class="text-2xl font-bold text-foreground">Link Your Device</h1>
        <p class="text-muted-foreground mt-2">
          {{ hasCode ? 'Sign in to authorize your desktop app' : 'Enter the code shown in your desktop app' }}
        </p>
      </div>

      <!-- Code Entry (if no code in URL) -->
      <div v-if="!hasCode && !isAuthenticated" class="space-y-4">
        <div class="flex gap-2 justify-center">
          <input
            v-for="(_, i) in 8"
            :key="i"
            :ref="el => inputs[i] = el"
            v-model="codeChars[i]"
            type="text"
            maxlength="1"
            class="w-10 h-12 text-center text-xl font-mono uppercase bg-secondary border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            @input="handleInput(i)"
            @keydown="handleKeydown(i, $event)"
            @paste="handlePaste"
          />
        </div>
        <p v-if="error" class="text-destructive text-sm text-center">{{ error }}</p>
        <button
          @click="verifyCode"
          :disabled="code.length !== 8 || isLoading"
          class="w-full py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {{ isLoading ? 'Verifying...' : 'Continue' }}
        </button>
      </div>

      <!-- Sign In (if code is valid) -->
      <div v-else-if="hasCode && !isAuthenticated" class="space-y-4">
        <div class="p-4 bg-secondary/50 rounded-lg text-center">
          <p class="text-sm text-muted-foreground">Authorizing code</p>
          <p class="text-2xl font-mono font-bold tracking-widest">{{ displayCode }}</p>
        </div>
        
        <button
          @click="login"
          :disabled="isLoading"
          class="w-full py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
          </svg>
          {{ isLoading ? 'Signing in...' : 'Sign in with WorkOS' }}
        </button>
      </div>

      <!-- Success State -->
      <div v-else-if="isSuccess" class="text-center space-y-4">
        <div class="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
          <svg class="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-foreground">Success!</h2>
        <p class="text-muted-foreground">Your desktop app is now linked.</p>
        <p class="text-sm text-muted-foreground">You can close this window and return to the app.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const { user, fetchUser, login: authLogin } = useAuth()

const API_URL = import.meta.env.VITE_QUERY_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`

const codeChars = ref<string[]>(Array(8).fill(''))
const inputs = ref<(HTMLInputElement | null)[]>([])
const isLoading = ref(false)
const isSuccess = ref(false)
const error = ref('')
const validCode = ref('')

const code = computed(() => codeChars.value.join('').toUpperCase())
const hasCode = computed(() => validCode.value.length === 8)
const displayCode = computed(() => validCode.value.slice(0, 4) + '-' + validCode.value.slice(4))
const isAuthenticated = computed(() => !!user.value || isSuccess.value)

const handleInput = (index: number) => {
  if (codeChars.value[index] && index < 7) {
    inputs.value[index + 1]?.focus()
  }
}

const handleKeydown = (index: number, e: KeyboardEvent) => {
  if (e.key === 'Backspace' && !codeChars.value[index] && index > 0) {
    inputs.value[index - 1]?.focus()
  }
}

const handlePaste = (e: ClipboardEvent) => {
  e.preventDefault()
  const pasted = e.clipboardData?.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)
  if (pasted) {
    for (let i = 0; i < 8; i++) {
      codeChars.value[i] = pasted[i] || ''
    }
  }
}

const verifyCode = async () => {
  error.value = ''
  isLoading.value = true
  
  try {
    const res = await fetch(`${API_URL}/auth/device/verify?code=${code.value}`)
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

const login = () => {
  // Store the device code in session storage so callback can use it
  sessionStorage.setItem('device_auth_code', validCode.value)
  // Redirect to WorkOS login
  authLogin()
}

// Check if we're returning from OAuth with a token
const completeDeviceAuth = async () => {
  const deviceCode = sessionStorage.getItem('device_auth_code')
  const token = localStorage.getItem('auth_token')
  
  if (deviceCode && token && user.value) {
    isLoading.value = true
    try {
      const res = await fetch(`${API_URL}/auth/device/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_code: deviceCode,
          token: token,
          user: user.value
        })
      })
      
      const data = await res.json()
      if (data.success) {
        isSuccess.value = true
        sessionStorage.removeItem('device_auth_code')
      } else {
        error.value = data.error || 'Failed to authorize device'
      }
    } catch (e) {
      error.value = 'Failed to authorize device'
    } finally {
      isLoading.value = false
    }
  }
}

onMounted(async () => {
  // Check for code in URL
  const urlCode = route.query.code as string
  if (urlCode) {
    codeChars.value = urlCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().split('').slice(0, 8)
    await verifyCode()
  }
  
  // Check if user is already logged in and we have a pending device code
  await fetchUser()
  if (user.value && sessionStorage.getItem('device_auth_code')) {
    await completeDeviceAuth()
  }
})
</script>
