import { ref, computed } from 'vue'
import { useAuth } from './useAuth'
import { api } from '@/lib/apiClient'

// Subscription state (shared across all components)
const subscriptionTier = ref<'free' | 'pro' | 'pro_plus'>('free')
const subscriptionStatus = ref<'active' | 'canceled' | 'past_due' | null>(null)
const currentPeriodEnd = ref<Date | null>(null)
const isLoading = ref(false)
const lastFetched = ref<number>(0)

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000

export function useSubscription() {
    const { user } = useAuth()

    /**
     * Fetch subscription data from backend
     */
    const fetchSubscription = async (force = false) => {
        if (!user.value) {
            subscriptionTier.value = 'free'
            subscriptionStatus.value = null
            return
        }

        // Use cache if recent and not forced
        const now = Date.now()
        if (!force && lastFetched.value && (now - lastFetched.value) < CACHE_DURATION) {
            return
        }

        isLoading.value = true
        try {
            const data = await api.get<any>('/subscription-status')

            subscriptionTier.value = data.tier || 'free'
            subscriptionStatus.value = data.status || null

            if (data.currentPeriodEnd) {
                currentPeriodEnd.value = new Date(data.currentPeriodEnd * 1000)
            }

            lastFetched.value = now
        } catch (error) {
            console.error('[Subscription] Failed to fetch subscription:', error)
            // Fallback to free tier on error
            subscriptionTier.value = 'free'
            subscriptionStatus.value = null
        } finally {
            isLoading.value = false
        }
    }

    /**
     * Computed properties for tier checks
     */
    const isFree = computed(() => subscriptionTier.value === 'free')
    const isPro = computed(() => subscriptionTier.value === 'pro')
    const isProPlus = computed(() => subscriptionTier.value === 'pro_plus')
    const isPaid = computed(() => isPro.value || isProPlus.value)

    /**
     * Check if user has access to a specific tier
     */
    const hasTierAccess = (requiredTier: 'free' | 'pro' | 'pro_plus'): boolean => {
        const tierOrder = { free: 0, pro: 1, pro_plus: 2 }
        return tierOrder[subscriptionTier.value] >= tierOrder[requiredTier]
    }

    /**
     * Get tier limits
     */
    const tierLimits = computed(() => {
        const limits = {
            free: {
                connections: 4,
                tables: 20,
                dashboards: 1,
                storage: '100 MB',
                tokens: 60000
            },
            pro: {
                connections: Infinity,
                tables: Infinity,
                dashboards: 10,
                storage: '500 MB',
                tokens: 200000
            },
            pro_plus: {
                connections: Infinity,
                tables: Infinity,
                dashboards: Infinity,
                storage: '10 GB',
                tokens: 600000
            }
        }
        return limits[subscriptionTier.value]
    })

    /**
     * Get tier display name
     */
    const tierDisplayName = computed(() => {
        const names = {
            free: 'Free',
            pro: 'Pro',
            pro_plus: 'Pro+'
        }
        return names[subscriptionTier.value]
    })

    /**
     * Get upgrade target (what tier to upgrade to)
     */
    const upgradeTarget = computed(() => {
        if (isFree.value) return 'pro'
        if (isPro.value) return 'pro_plus'
        return null
    })

    /**
     * Get upgrade target display name
     */
    const upgradeTargetName = computed(() => {
        if (upgradeTarget.value === 'pro') return 'Pro'
        if (upgradeTarget.value === 'pro_plus') return 'Pro+'
        return null
    })

    /**
     * Check if subscription is in grace period (canceled but still active)
     */
    const isInGracePeriod = computed(() => {
        return subscriptionStatus.value === 'canceled' &&
            currentPeriodEnd.value &&
            currentPeriodEnd.value > new Date()
    })

    /**
     * Days remaining in grace period
     */
    const gracePeriodDaysRemaining = computed(() => {
        if (!isInGracePeriod.value || !currentPeriodEnd.value) return 0
        const diff = currentPeriodEnd.value.getTime() - Date.now()
        return Math.ceil(diff / (1000 * 60 * 60 * 24))
    })

    return {
        // State
        subscriptionTier,
        subscriptionStatus,
        currentPeriodEnd,
        isLoading,

        // Computed
        isFree,
        isPro,
        isProPlus,
        isPaid,
        tierLimits,
        tierDisplayName,
        upgradeTarget,
        upgradeTargetName,
        isInGracePeriod,
        gracePeriodDaysRemaining,

        // Methods
        fetchSubscription,
        hasTierAccess
    }
}
