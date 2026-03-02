<template>
  <div class="fixed inset-0 bg-background text-foreground selection:bg-primary/30 flex flex-col items-center justify-center p-6 overflow-hidden">
    
    <!-- Premium Background Depth -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent blur-[120px]"></div>
      <div class="absolute -bottom-48 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]"></div>
    </div>

    <!-- Dynamic Content -->
    <LoadingScreen 
      v-if="isAuthenticated" 
      class="relative z-20"
      title="Identity Verified" 
      message="" 
    />

    <template v-else>
      <!-- Branding Section -->
      <div class="mb-12 text-center relative z-10 animate-in fade-in slide-in-from-top-4 duration-1000">
        <div class="relative inline-flex items-center justify-center group">
          <img 
            src="/logo_new_purple.svg" 
            alt="Pegasus" 
            class="w-16 h-16 relative z-10 drop-shadow-[0_0_20px_rgba(var(--primary),0.3)] group-hover:scale-105 transition-transform duration-700" 
          />
          <div class="absolute inset-0 bg-primary/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        </div>
      </div>

      <!-- Auth Container -->
      <div class="w-full max-w-[360px] relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150 p-8">
        
        <!-- Custom Auth Form -->
        <form @submit.prevent="handlePasswordLogin" class="space-y-6">
          <div class="space-y-4">
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-muted-foreground ml-1">Email</label>
              <div class="relative">
                <input 
                  v-model="email"
                  type="email" 
                  placeholder="name@company.com"
                  required
                  class="w-full bg-card/40 backdrop-blur-md border border-border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:opacity-20 cursor-text"
                />
              </div>
            </div>
            
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-muted-foreground ml-1">Password</label>
              <div class="relative">
                <input 
                  v-model="password"
                  type="password" 
                  placeholder="••••••••"
                  required
                  class="w-full bg-card/40 backdrop-blur-md border border-border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:opacity-20 cursor-text"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            :disabled="isLoggingIn"
            class="w-full h-14 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50 overflow-hidden relative group cursor-pointer"
          >
            <span class="relative z-10 flex items-center justify-center gap-2 pointer-events-none">
              {{ isLoggingIn ? 'Synchronizing' : 'Sign In' }}
              <Loader2 v-if="isLoggingIn" class="w-4 h-4 animate-spin" />
            </span>
            <div class="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500 pointer-events-none"></div>
          </button>

          <!-- Social Providers -->
          <div class="pt-2 space-y-4">
            <div class="relative flex items-center justify-center">
              <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-border"></div></div>
              <span class="relative bg-background px-3 text-xs font-medium text-muted-foreground">or enter via</span>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <button 
                v-for="provider in socialProviders"
                :key="provider.id"
                @click="handleSocialLogin(provider.id)"
                type="button"
                class="flex items-center justify-center h-12 border border-border bg-card/40 backdrop-blur-md rounded-xl hover:bg-primary/5 hover:border-primary/30 transition-all group relative overflow-hidden cursor-pointer"
                :title="provider.name"
              >
                <img 
                  :src="provider.icon" 
                  :alt="provider.name"
                  class="w-5 h-5 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all pointer-events-none filter brightness-100" 
                />
                <div class="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              </button>
            </div>
          </div>
        </form>

        <!-- Footer Action -->
        <div class="mt-8 text-center animate-in fade-in duration-1000 delay-500">
          <button 
            @click="identityService.login()"
            class="group text-xs font-medium text-muted-foreground hover:text-foreground transition-all flex items-center gap-2 mx-auto cursor-pointer"
          >
            <span class="border-b border-transparent group-hover:border-white/40 pb-0.5">Enterprise SSO</span>
            <ArrowRight class="w-3 h-3 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { identityService } from '@/services/identityService'
import { useAuth } from '@/composables/useAuth'
import { useNotifications } from '@/composables/useNotifications'
import { Check, Loader2, ArrowRight } from 'lucide-vue-next'
import { useColorMode } from '@vueuse/core'
import LoadingScreen from '@/components/ui/LoadingScreen.vue'

const router = useRouter()
const { isAuthenticated } = useAuth()
const { notifications } = useNotifications()
import { toast } from '@/composables/useNotifications'

const mode = useColorMode({
  selector: 'html',
  attribute: 'class',
  storageKey: 'pegasus-theme',
})

const email = ref('')
const password = ref('')
const isLoggingIn = ref(false)

const socialProviders = computed(() => [
  { id: 'google', name: 'Google', icon: "/icons/google/google-color-svgrepo-com.svg" },
  { id: 'microsoft', name: 'Microsoft', icon: "/icons/microsoft/microsoft-colored.svg" },
  { id: 'github', name: 'GitHub', icon: mode.value === 'light' ? "/icons/github/github-142-svgrepo-com.svg" : "/icons/github/github-white.svg" }
])

async function handlePasswordLogin() {
  if (isLoggingIn.value) return
  isLoggingIn.value = true
  
  try {
    const result = await identityService.loginWithPassword(email.value, password.value)
    if (result.success) {
      setTimeout(() => router.push('/'), 1000)
    } else {
      // Handle error display if needed
    }
  } catch (e) {
    console.error('Login failed:', e)
  } finally {
    isLoggingIn.value = false
  }
}

function handleSocialLogin(provider: string) {
  identityService.login(provider)
}

watch(isAuthenticated, (val) => {
  if (val) {
    setTimeout(() => router.push('/'), 1500)
  }
}, { immediate: true })
</script>

<style scoped>
@keyframes progress {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

.animate-progress {
  animation: progress 2s infinite ease-in-out;
}

input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--color-foreground);
  -webkit-box-shadow: 0 0 0px 1000px var(--color-background) inset;
  transition: background-color 5000s ease-in-out 0s;
}
</style>
