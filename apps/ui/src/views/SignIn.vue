<template>
  <div class="min-h-screen flex items-center justify-center bg-[#050505] text-white p-4 font-sans antialiased overflow-hidden relative">
    
    <!-- Decorative Background Elements -->
    <div class="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>
    <div class="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>

    <div class="w-full max-w-[400px] relative z-10 transition-all duration-700 ease-out" :class="isSuccess ? 'scale-95 opacity-0' : 'scale-100 opacity-100'">
      
      <!-- User Logo/Brand -->
      <div class="text-center mb-10">
        <div class="relative inline-flex items-center justify-center w-24 h-24 rounded-[2rem] bg-gradient-to-br from-white/10 to-transparent border border-white/10 shadow-2xl backdrop-blur-xl mb-8 group overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <img src="/logo_new_purple.svg" alt="Pegasus Logo" class="w-16 h-16 object-contain relative z-10 drop-shadow-[0_0_15px_rgba(151,55,255,0.4)]" />
        </div>
        <h1 class="text-4xl font-bold tracking-tight mb-3 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">Pegasus</h1>
        <p class="text-zinc-400 text-sm font-medium tracking-wide">Next-generation data intelligence</p>
      </div>

      <!-- Main Auth Section -->
      <div class="bg-white/[0.03] border border-white/10 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl space-y-8">
        
        <!-- Offline Banner -->
        <div v-if="!isOnline" class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-500">
          <svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span class="text-amber-500 text-[10px] uppercase font-bold tracking-wider">Offline - Local Access Only</span>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p class="text-red-400 text-xs text-center font-medium">{{ error }}</p>
        </div>

        <div class="space-y-4">
          <!-- Primary SSO Button -->
          <button 
            v-if="isOnline && !showLocalAuth"
            @click="handleSSO('authkit')"
            :disabled="loading"
            class="group relative w-full h-14 bg-white text-black rounded-2xl font-bold text-base transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 overflow-hidden shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            <span class="relative z-10 flex items-center justify-center gap-3">
              Continue to Pegasus
              <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
          </button>

          <!-- Local Auth Fallback (Minimal) -->
          <div v-if="!isOnline || showLocalAuth" class="space-y-4 animate-in fade-in zoom-in duration-500">
            <div class="space-y-3">
              <input v-model="username" placeholder="Username" class="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm focus:outline-none focus:border-primary/50 transition-all placeholder:text-zinc-600" />
              <input v-model="password" type="password" placeholder="Password" class="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm focus:outline-none focus:border-primary/50 transition-all placeholder:text-zinc-600" @keyup.enter="handleLocalAuth" />
              
              <button 
                @click="handleLocalAuth"
                :disabled="isLocalLoading || !username || !password"
                class="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {{ localAuthMode === 'login' ? 'Sign In Locally' : 'Create Local Account' }}
              </button>
            </div>
            
            <div class="flex justify-between px-1">
              <button @click="localAuthMode = localAuthMode === 'login' ? 'register' : 'login'" class="text-[10px] text-zinc-500 hover:text-white transition-colors uppercase font-bold tracking-widest">
                {{ localAuthMode === 'login' ? 'Need an account?' : 'Already have one?' }}
              </button>
              <button v-if="isOnline" @click="showLocalAuth = false" class="text-[10px] text-zinc-500 hover:text-white transition-colors uppercase font-bold tracking-widest">
                Back
              </button>
            </div>
          </div>

          <!-- Secondary Link -->
          <div v-if="isOnline && !showLocalAuth" class="text-center pt-2">
            <button 
              @click="showLocalAuth = true" 
              class="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase font-bold tracking-widest"
            >
              Use local account
            </button>
          </div>
        </div>
      </div>

      <p class="text-center mt-8 text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
        Secure. Managed. Connected.
      </p>
    </div>

    <!-- Success Overlay -->
    <div v-if="isSuccess" class="absolute inset-0 flex flex-col items-center justify-center animate-in zoom-in fade-in duration-700 bg-black">
      <div class="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(151,55,255,0.3)]">
        <svg class="w-12 h-12 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 class="text-3xl font-bold mb-2">Authenticated</h2>
      <p class="text-zinc-400">Welcome to the future of data.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '@/composables/useNotifications'
import { useInAppAuth } from '@/composables/useInAppAuth'
import { useDesktopAuth } from '@/composables/useDesktopAuth'
import { isOnline as platformIsOnline } from '@/composables/usePlatform'

const router = useRouter()
const { login: ssoLogin } = useInAppAuth()
const { createAccount, login: localLogin } = useDesktopAuth()

// State
const isOnline = platformIsOnline
const showLocalAuth = ref(false)
const localAuthMode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const isLocalLoading = ref(false)
const loading = ref(false)
const error = ref('')
const isSuccess = ref(false)

onMounted(() => {
  if (!isOnline.value) {
    showLocalAuth.value = true
  }
})

const handleSSO = async (provider: string) => {
  error.value = ''
  loading.value = true
  
  const result = await ssoLogin(provider)
  
  if (result.success) {
    isSuccess.value = true
    toast.success('Successfully authenticated!')
    setTimeout(() => {
      window.location.href = '/dashboard'
    }, 1500)
  } else if (result.error && result.error !== 'Login cancelled') {
    error.value = result.error
    toast.error(result.error)
  }
  
  loading.value = false
}

const handleLocalAuth = async () => {
  if (!username.value || !password.value) return
  
  isLocalLoading.value = true
  error.value = ''
  
  try {
    if (localAuthMode.value === 'register') {
      const response = await createAccount(username.value, password.value)
      if (response.success) {
        toast.success('Local account created!')
        isSuccess.value = true
        setTimeout(() => { router.push('/dashboard') }, 1500)
      } else {
        error.value = response.message
      }
    } else {
      const response = await localLogin(username.value, password.value)
      if (response.success) {
        toast.success('Locally signed in!')
        isSuccess.value = true
        setTimeout(() => { router.push('/dashboard') }, 1500)
      } else {
        error.value = response.message
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Auth failed'
    toast.error(error.value)
  } finally {
    isLocalLoading.value = false
  }
}
</script>

<style scoped>
.font-sans {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}
</style>
