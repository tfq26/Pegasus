<template>
  <div class="flex flex-col items-center justify-center bg-background text-foreground p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="text-center">
      <div class="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
      <p class="text-muted-foreground">Loading profile...</p>
    </div>

    <!-- Not Logged In -->
    <div v-else-if="!typedUser" class="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-lg text-center">
      <div class="mb-6">
        <svg class="inline-block h-16 w-16 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-foreground mb-2">Not Logged In</h2>
      <p class="text-muted-foreground mb-6">Please log in to view your profile</p>
      <button
        @click="goToLogin"
        class="w-full px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all hover:scale-105 shadow-lg shadow-primary/20"
      >
        Go to Login
      </button>
    </div>

    <!-- Profile Content -->
    <div v-else class="max-w-md w-full bg-card border border-border rounded-2xl p-6 shadow-lg">
      <div class="flex flex-col items-center mb-6">
        <img
          :src="typedUser.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${typedUser.email}`"
          class="h-24 w-24 rounded-full border border-primary mb-3 object-cover"
          alt="User Avatar"
        />
        <h2 class="text-xl font-semibold text-primary">{{ typedUser.firstName }} {{ typedUser.lastName }}</h2>
        <p class="text-sm text-muted-foreground">{{ typedUser.email }}</p>
      </div>

      <div class="space-y-3 text-sm text-foreground mb-6">
        <!-- User ID hidden for security -->
        <!-- <p><span class="font-medium text-muted-foreground">User ID:</span> {{ typedUser.sub }}</p> -->
        <p>
          <span class="font-medium text-muted-foreground">Organization: </span> 
          <span class="text-foreground font-medium">{{ typedUser.organizationName || 'None' }}</span>
        </p>
        <!-- Stripe subscription features commented out until implemented -->
        <div class="flex items-center justify-between pt-2 border-t border-border">
          <p><span class="font-medium text-muted-foreground">Plan:</span> <span class="capitalize text-primary font-semibold">{{ subscriptionTier }}</span></p>
          <div class="flex gap-2">
            <!-- Sync button - uncomment if needed
            <button 
              @click="handleSyncSubscription"
              :disabled="syncing"
              class="text-xs bg-muted hover:bg-muted/80 text-muted-foreground px-3 py-1.5 rounded-full font-medium transition-all disabled:opacity-50"
              title="Sync subscription status from Stripe"
            >
              {{ syncing ? 'Syncing...' : '↻ Sync' }}
            </button>
            -->
            <button 
              v-if="subscriptionTier === 'free'"
              @click="handleUpgrade"
              class="text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-3 py-1.5 rounded-full font-medium transition-all shadow-lg shadow-violet-900/20"
            >
              Upgrade to Pro
            </button>
            <button 
              v-else
              @click="handleManageSubscription"
              class="text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-1.5 rounded-full font-medium transition-all"
            >
              Manage Subscription
            </button>
          </div>
        </div>
      </div>



      <!-- Resource usage commented out until Stripe is implemented -->
      <div class="space-y-4 text-sm text-foreground mb-6 border-t border-border pt-4">
        <h3 class="font-semibold text-foreground">Resource Usage</h3>
        
        <div class="space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-muted-foreground">AI Tokens Used</span>
            <span class="font-medium">{{ usageStats.tokens.toLocaleString() }}</span>
          </div>
          <div class="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div class="h-full bg-primary" :style="{ width: Math.min((usageStats.tokens / 100000) * 100, 100) + '%' }"></div>
          </div>
          <p class="text-[10px] text-muted-foreground text-right">Target: 100k / month</p>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-muted-foreground">Storage Used</span>
            <span class="font-medium">{{ usageStats.storageFormatted }}</span>
          </div>
          <div class="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div class="h-full bg-blue-500" :style="{ width: Math.min((usageStats.storage / (500 * 1024 * 1024)) * 100, 100) + '%' }"></div>
          </div>
          <p class="text-[10px] text-muted-foreground text-right">Limit: 500 MB</p>
        </div>
      </div>

      <div class="flex gap-3">
        <button
          @click="logout"
          class="flex-1 px-4 py-2 rounded-lg bg-destructive hover:bg-destructive/90 text-white text-sm font-medium transition"
        >
          Logout
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { createCheckoutSession, createPortalSession, getSubscriptionStatus, getUsageStats, syncSubscription } from '@/lib/api'
import { toast } from 'vue-sonner'

defineOptions({ name: 'ProfilePage' })

const router = useRouter()
const { user, isLoading, fetchUser, logout } = useAuth()
const typedUser = computed(() => user.value as any)
const subscriptionTier = ref('free')
const usageStats = ref({ tokens: 0, storage: 0, storageFormatted: '0 MB' })
const syncing = ref(false)

onMounted(async () => {
  await fetchUser()
  if (typedUser.value) {
    // Auto-sync subscription from Stripe on page load
    try {
      syncing.value = true
      const result = await syncSubscription()
      if (result.tier) {
        subscriptionTier.value = result.tier
      }
    } catch (e) {
      console.error('Failed to sync subscription', e)
      // Fallback to cached status
      try {
        const status = await getSubscriptionStatus()
        subscriptionTier.value = status.tier
      } catch {}
    } finally {
      syncing.value = false
    }

    try {
      const usage = await getUsageStats()
      usageStats.value = usage
    } catch (e) {
      console.error('Failed to fetch usage stats', e)
    }
  }
})

const handleUpgrade = async () => {
  try {
    // Replace with your actual Stripe Price ID
    const priceId = 'price_1SgfIpGUiKevQtlewzMFASsm' 
    const { url } = await createCheckoutSession(priceId)
    if (url) window.location.href = url
  } catch (e) {
    toast.error('Failed to start checkout')
  }
}

const handleManageSubscription = async () => {
  try {
    const { url } = await createPortalSession()
    if (url) window.location.href = url
  } catch (e) {
    toast.error('Failed to open subscription portal')
  }
}

const handleSyncSubscription = async () => {
  syncing.value = true
  try {
    const result = await syncSubscription()
    if (result.success) {
      subscriptionTier.value = result.tier
      toast.success(`Synced! Your plan: ${result.tier}`)
    } else if (result.error) {
      toast.error(result.error)
    }
  } catch (e) {
    toast.error('Failed to sync subscription')
  } finally {
    syncing.value = false
  }
}

const goToLogin = () => {
  router.push('/login')
}

const goToDashboard = () => {
  router.push('/')
}
</script>
