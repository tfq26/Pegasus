<template>
  <div class="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_12%_18%,rgba(139,92,246,0.28),rgba(139,92,246,0)_42%),radial-gradient(circle_at_88%_2%,rgba(124,58,237,0.2),rgba(124,58,237,0)_38%),linear-gradient(180deg,#faf8ff_0%,#eef0ff_56%,#e9ecfb_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_16%_20%,rgba(139,92,246,0.28),rgba(139,92,246,0)_46%),radial-gradient(circle_at_84%_0%,rgba(167,139,250,0.2),rgba(167,139,250,0)_40%),linear-gradient(180deg,#05060b_0%,#0a0b16_52%,#06070f_100%)] dark:text-zinc-100">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -left-24 top-1/2 h-[44rem] w-[44rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(108,74,255,0.14)_0%,_rgba(255,255,255,0)_68%)] blur-2xl dark:bg-[radial-gradient(circle,_rgba(108,74,255,0.24)_0%,_rgba(7,9,18,0)_68%)]"></div>
      <div class="absolute -right-40 -top-20 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,_rgba(124,58,237,0.18)_0%,_rgba(255,255,255,0)_70%)] blur-2xl dark:bg-[radial-gradient(circle,_rgba(167,139,250,0.22)_0%,_rgba(7,9,18,0)_70%)]"></div>
      <div class="absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.34)_0%,rgba(168,139,250,0.08)_30%,rgba(124,58,237,0.07)_70%,rgba(99,102,241,0.14)_100%)] opacity-75 dark:bg-[linear-gradient(130deg,rgba(167,139,250,0.16)_0%,rgba(139,92,246,0.04)_30%,rgba(99,102,241,0.06)_70%,rgba(255,255,255,0.04)_100%)] dark:opacity-45"></div>
    </div>

    <div class="relative z-10 flex min-h-full items-center justify-center px-6 py-24">
      <div class="w-full max-w-[32rem]">
        <!-- Glassmorphism Card Container -->
        <div class="rounded-3xl border border-slate-300/60 bg-white/60 p-8 shadow-[0_20px_50px_rgba(15,23,42,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-black/45 dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          
          <div class="mb-8 text-center">
            <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-300/70 bg-white/75 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.35)] dark:border-white/20 dark:bg-black/50 dark:shadow-none">
              <img src="/logo_new_purple.svg" alt="Pegasus" class="h-10 w-10" />
            </div>
            <h1 class="text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">Create your account</h1>
            <p class="mt-3 text-sm text-slate-600 dark:text-zinc-400">
              Get started instantly with WorkOS authentication
            </p>
          </div>

          <!-- Singular Premium Signup Button -->
          <div class="space-y-4">
            <button
              type="button"
              :disabled="isSigningUp"
              class="relative group inline-flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-[0_12px_30px_-12px_rgba(130,90,255,0.9)] transition-all hover:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-60"
              @click="handleWorkOSSignup"
            >
              <Loader2 v-if="isSigningUp" class="h-5 w-5 animate-spin" />
              <span v-else class="flex items-center gap-2">
                <span>Signup</span>
                <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </button>

            <div class="text-center text-sm mt-6">
              <span class="text-slate-600 dark:text-zinc-400">Already have an account?</span>
              <button
                type="button"
                @click="goToSignIn"
                class="ml-1.5 font-semibold text-slate-900 underline decoration-slate-400/70 underline-offset-4 transition hover:decoration-slate-700 dark:text-zinc-100 dark:decoration-white/40 dark:hover:decoration-white"
              >
                Log in
              </button>
            </div>
          </div>

          <div class="mt-8 border-t border-slate-300/40 pt-6 text-center text-xs text-slate-500 dark:border-white/10 dark:text-zinc-500">
            By signing up, you agree to our
            <a href="/docs" class="font-medium hover:underline text-slate-700 dark:text-zinc-400">Terms of Service</a>
            and
            <a href="/docs" class="font-medium hover:underline text-slate-700 dark:text-zinc-400">Privacy Policy</a>.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loader2, ArrowRight } from 'lucide-vue-next'
import { identityService } from '@/services/identityService'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const route = useRoute()
const { isAuthenticated } = useAuth()

const isSigningUp = ref(false)

const redirectTarget = computed(() => {
  const redirect = route.query.redirect
  if (typeof redirect !== 'string' || !redirect) return '/'

  try {
    const parsed = new URL(redirect, window.location.origin)
    if (parsed.origin !== window.location.origin) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return redirect.startsWith('/') ? redirect : '/'
  }
})

const redirectAfterAuth = () => {
  router.push(redirectTarget.value)
}

async function handleWorkOSSignup() {
  if (isSigningUp.value) return
  isSigningUp.value = true
  try {
    await identityService.login('authkit')
  } catch (error) {
    console.error('WorkOS redirection failed', error)
  } finally {
    isSigningUp.value = false
  }
}

function goToSignIn() {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect) {
    router.push({ path: '/signin', query: { redirect } })
    return
  }
  router.push('/signin')
}

watch(
  isAuthenticated,
  (value) => {
    if (value) {
      redirectAfterAuth()
    }
  },
  { immediate: true }
)
</script>
