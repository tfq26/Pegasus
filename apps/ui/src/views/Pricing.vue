<template>
  <div class="min-h-screen bg-background py-20 px-4 relative overflow-hidden">
    <!-- Loading State -->
    <div v-if="isLoadingTier && user" class="flex flex-col items-center justify-center min-h-[80vh]">
      <div class="relative">
        <div class="h-24 w-24 rounded-full border-t-4 border-b-4 border-primary animate-spin"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
           <div class="h-16 w-16 rounded-full border-t-4 border-b-4 border-primary/30 animate-spin-slow"></div>
        </div>
      </div>
      <p class="mt-8 text-xl font-bold tracking-tight text-foreground animate-pulse">Checking Plan Status...</p>
      <p class="text-muted-foreground text-sm mt-2">Personalizing your pricing dashboard</p>
    </div>

    <template v-else>
      <!-- Background Decor -->
      <div class="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10 animate-pulse"></div>
      <div class="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px] -z-10"></div>


    <div class="max-w-7xl mx-auto">
      <!-- Hero -->
      <div class="text-center mb-20 space-y-4">
        <h1 class="text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
          Simple, Transparent Pricing
        </h1>
        <p class="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Choose the plan that fits your analysis needs. Scale your storage and AI capacity as your vault grows.
        </p>
      </div>

      <!-- Pricing Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
        <!-- Free Plan -->
        <div class="bg-card border border-border rounded-3xl p-8 flex flex-col hover:border-primary/20 transition-all duration-300 shadow-sm">
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-2">Free</h3>
            <div class="flex items-baseline gap-1 mb-4">
              <span class="text-4xl font-black">$0</span>
              <span class="text-muted-foreground">/mo</span>
            </div>
            <p class="text-sm text-muted-foreground">Perfect for exploring your first datasets.</p>
          </div>
          
          <ul class="space-y-4 mb-10 flex-1">
            <li class="flex items-start gap-3 text-sm">
              <svg class="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>60,000 Monthly Tokens</span>
            </li>
            <li class="flex items-start gap-3 text-sm">
              <svg class="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>100 MB Secure Storage</span>
            </li>
            <li class="flex items-start gap-3 text-sm">
              <svg class="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>Basic Data Cleanups</span>
            </li>
            <li class="flex items-start gap-3 text-sm opacity-50">
              <svg class="h-5 w-5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              <span>No Token Add-ons</span>
            </li>
          </ul>

          <button 
            v-if="user && subscriptionTier !== 'free'" 
            @click="handleDowngradeAlert('free')" 
            class="w-full py-4 rounded-2xl bg-secondary hover:bg-red-500/10 hover:text-red-500 border border-border font-bold transition-all"
          >
            Downgrade to Free
          </button>
          <button 
            v-else-if="!user"
            @click="router.push('/login')" 
            class="w-full py-4 rounded-2xl bg-secondary hover:bg-secondary/80 font-bold transition-all"
          >
            Get Started
          </button>
          <div v-else class="w-full py-4 rounded-2xl bg-secondary/20 text-muted-foreground font-bold text-center border border-dashed border-border">
            Current Plan
          </div>
        </div>

        <!-- Pro Plan -->
        <div class="bg-card border-2 border-primary rounded-3xl p-8 flex flex-col shadow-2xl shadow-primary/10 relative skew-y-0 hover:-translate-y-2 transition-transform duration-300">
          <div class="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full uppercase tracking-widest">
            Most Popular
          </div>
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-2">Pro</h3>
            <div class="flex items-baseline gap-1 mb-4">
              <span class="text-4xl font-black">$10</span>
              <span class="text-muted-foreground">/mo</span>
            </div>
            <p class="text-sm text-muted-foreground">Advanced analysis for professionals and power users.</p>
          </div>
          
          <ul class="space-y-4 mb-10 flex-1">
            <li class="flex items-start gap-3 text-sm font-medium">
              <svg class="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>200,000 Monthly Tokens</span>
            </li>
            <li class="flex items-start gap-3 text-sm font-medium">
              <svg class="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>500 MB Secure Storage</span>
            </li>
            <li class="flex items-start gap-3 text-sm font-medium">
              <svg class="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>Access to Token & Storage Add-ons</span>
            </li>
            <li class="flex items-start gap-3 text-sm font-medium">
              <svg class="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>Priority Processing</span>
            </li>
          </ul>

          <button 
            v-if="subscriptionTier === 'pro'" 
            @click="handleManageBilling" 
            class="w-full py-4 rounded-2xl bg-secondary hover:bg-red-500/10 hover:text-red-500 border border-border font-bold transition-all"
          >
            Cancel Subscription
          </button>
          <button 
            v-else-if="subscriptionTier === 'pro_plus'" 
            @click="handleDowngradeAlert('pro')" 
            class="w-full py-4 rounded-2xl bg-indigo-500/5 text-indigo-600 border border-indigo-500/20 font-bold transition-all hover:bg-indigo-500/10"
          >
            Downgrade to Pro
          </button>
          <button 
            v-else 
            @click="handleBuy('pro')" 
            class="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold transition-all shadow-lg hover:shadow-primary/20"
          >
            Go Pro
          </button>
        </div>

        <!-- Pro+ Plan -->
        <div class="bg-card border border-border rounded-3xl p-8 flex flex-col hover:border-purple-500/30 transition-all duration-300 shadow-sm relative overflow-hidden group">
          <!-- Glass effect on hover -->
          <div class="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-orange-500/0 group-hover:from-purple-500/5 group-hover:to-orange-500/5 transition-all duration-500 -z-10"></div>
          
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-2 flex items-center gap-2">
              Pro+
              <span class="text-[10px] bg-gradient-to-r from-purple-500/10 to-orange-500/10 text-purple-600 dark:text-orange-400 px-2 py-0.5 rounded-full uppercase tracking-tighter border border-purple-500/20">Value Bundle</span>
            </h3>
            <div class="flex items-baseline gap-1 mb-4">
              <span class="text-4xl font-black">$30</span>
              <span class="text-muted-foreground">/mo</span>
            </div>
            <p class="text-sm text-muted-foreground">The ultimate suite for large datasets and teams.</p>
          </div>
          
          <ul class="space-y-4 mb-10 flex-1">
            <li class="flex items-start gap-3 text-sm">
              <svg class="h-5 w-5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span class="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-orange-500">600,000 Monthly Tokens</span>
            </li>
            <li class="flex items-start gap-3 text-sm font-semibold">
              <svg class="h-5 w-5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>10 GB High-Speed Vault</span>
            </li>
            <li class="flex items-start gap-3 text-sm">
              <svg class="h-5 w-5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>Exclusive Beta Features Access</span>
            </li>
            <li class="flex items-start gap-3 text-sm">
              <svg class="h-5 w-5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span>10% Surcharge Waiver</span>
            </li>
          </ul>

          <button 
            v-if="subscriptionTier === 'pro_plus'" 
            @click="handleManageBilling" 
            class="w-full py-4 rounded-2xl bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 font-bold transition-all hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20"
          >
            Cancel Subscription
          </button>
          <button 
            v-else 
            @click="handleBuy('pro_plus')" 
            class="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-orange-500 hover:from-purple-500 hover:to-orange-400 text-white font-bold transition-all shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            {{ subscriptionTier === 'pro' ? 'Upgrade to Pro+' : 'Get Pro+' }}
          </button>
        </div>
      </div>

      <!-- Detail Comparison -->
      <div class="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
        <div class="p-8 border-b border-border bg-secondary/20">
          <h2 class="text-2xl font-bold">Feature Comparison</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="text-sm font-medium text-muted-foreground border-b border-border bg-secondary/10">
                <th class="py-4 px-8 w-1/4">Feature</th>
                <th class="py-4 px-8 w-1/4">Free</th>
                <th class="py-4 px-8 w-1/4">Pro</th>
                <th class="py-4 px-8 w-1/4">Pro+</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-6 px-8 font-medium">Monthly AI Tokens</td>
                <td class="py-6 px-8">60k</td>
                <td class="py-6 px-8 font-semibold">200k</td>
                <td class="py-6 px-8 font-bold text-indigo-600">600k</td>
              </tr>
              <tr>
                <td class="py-6 px-8 font-medium">Secure Storage</td>
                <td class="py-6 px-8">100 MB</td>
                <td class="py-6 px-8">500 MB</td>
                <td class="py-6 px-8 font-bold text-indigo-600">10 GB</td>
              </tr>
              <tr>
                <td class="py-6 px-8 font-medium">Token Add-on Access</td>
                <td class="py-6 px-8 text-muted-foreground">—</td>
                <td class="py-6 px-8">Included</td>
                <td class="py-6 px-8">Included</td>
              </tr>
              <tr>
                <td class="py-6 px-8 font-medium">Heavy Usage Threshold</td>
                <td class="py-6 px-8">Standard</td>
                <td class="py-6 px-8">Standard</td>
                <td class="py-6 px-8 font-semibold text-indigo-600">Increased (1.5M)</td>
              </tr>
              <tr>
                <td class="py-6 px-8 font-medium">Experimental Features</td>
                <td class="py-6 px-8 text-muted-foreground">—</td>
                <td class="py-6 px-8 text-muted-foreground">—</td>
                <td class="py-6 px-8">Early Access</td>
              </tr>
              <tr>
                <td class="py-6 px-8 font-medium">Customer Support</td>
                <td class="py-6 px-8 text-muted-foreground">Community</td>
                <td class="py-6 px-8">Email</td>
                <td class="py-6 px-8 font-semibold">Priority 24/7</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- FAQ Section -->
      <div class="mt-32 max-w-3xl mx-auto space-y-12">
        <h2 class="text-3xl font-bold text-center">Frequently Asked Questions</h2>
        <div class="space-y-8">
          <div class="space-y-2">
            <h4 class="text-lg font-bold">What are AI Tokens?</h4>
            <p class="text-muted-foreground leading-relaxed">Tokens are the currency used by our AI models to analyze your data. One token roughly equals 0.75 words. Pegasus uses top-tier models for high precision, and your monthly limit resets every billing cycle.</p>
          </div>
          <div class="space-y-2">
            <h4 class="text-lg font-bold">Can I upgrade or downgrade?</h4>
            <p class="text-muted-foreground leading-relaxed">Yes, you can change your plan at any time through the Profile settings. Downgrades take effect at the end of your billing cycle, while upgrades take effect immediately.</p>
          </div>
          <div class="space-y-2">
            <h4 class="text-lg font-bold">What is the Heavy Usage Surcharge?</h4>
            <p class="text-muted-foreground leading-relaxed">To maintain platform stability, a 25% sustainability fee applies to token purchases once an account's total capacity exceeds 1,000,000 tokens. Pro+ users enjoy an increased threshold of 1,500,000 tokens before this fee applies.</p>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { createCheckoutSession, createPortalSession, getUsageStats } from '@/lib/api'
import { toast } from '@/composables/useNotifications'

const router = useRouter()
const { user } = useAuth()
const subscriptionTier = ref('free')
const isLoadingTier = ref(true)

onMounted(async () => {
  if (user.value) {
    try {
      const stats = await getUsageStats() as any
      subscriptionTier.value = stats.tier || 'free'
    } catch (e) {
      console.error('Failed to fetch tier:', e)
    } finally {
      isLoadingTier.value = false
    }
  } else {
    isLoadingTier.value = false
  }
})

const handleBuy = async (tier: string) => {
  try {
    const priceId = tier === 'pro' ? 'price_pro_standard' : 'price_1SmdFaGUiKevQtleWObUU2sw'
    const result = await createCheckoutSession(priceId, tier)
    if (result && (result as any).url) {
      window.location.href = (result as any).url
    }
  } catch (e) {
    toast.error('Failed to initiate checkout. Please log in first.')
    router.push('/login')
  }
}

const handleManageBilling = async () => {
  try {
    const result: any = await createPortalSession()
    if (result && result.url) window.location.href = result.url
  } catch (e) {
    toast.error('Failed to open billing portal')
  }
}

const handleDowngradeAlert = (targetTier: string) => {
  const isFree = targetTier === 'free'
  
  // Phase 1: Initial Warning
  if (!window.confirm(isFree 
    ? "⚠️ CRITICAL WARNING: Returning to the Free plan will permanently remove your Pro features and EXTRA storage. Are you sure you want to proceed?"
    : "Are you sure you want to downgrade your performance tier?")) return

  // Phase 2: Data Loss / Retention Warning
  if (isFree) {
    if (!window.confirm("🔴 STOP: You currently have active datasets that exceed the Free tier limits. If you downgrade, your vault will be LOCKED until you manually delete your data or re-subscribe. Do you still want to proceed to the billing portal?")) return
  }

  // Phase 3: Final Friction (Verification)
  const code = Math.floor(1000 + Math.random() * 9000)
  const input = window.prompt(`To confirm you want to lose access to your premium vault features, please type the following security code: ${code}`)
  
  if (input === String(code)) {
    handleManageBilling()
  } else {
    toast.error("Incorrect code. Cancellation aborted.")
  }
}
</script>

<style scoped>
.bg-background {
  background: radial-gradient(circle at top, hsl(var(--secondary) / 0.1) 0%, hsl(var(--background)) 100%);
}

@keyframes spin-slow {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}
.animate-spin-slow {
  animation: spin-slow 3s linear infinite;
}
</style>
