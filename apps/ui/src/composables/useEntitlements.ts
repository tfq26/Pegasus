import { computed } from 'vue'
import { entitlementService } from '@/services/entitlementService'
import { identityService } from '@/services/identityService'

export function useEntitlements() {
    // Reactive wrappers around entitlementService state
    const subscriptionTier = computed(() => entitlementService.tier)
    const subscriptionStatus = computed(() => entitlementService.status)
    const tierUsage = computed(() => entitlementService.usage)
    const isLoading = computed(() => entitlementService.isLoading)

    // Derived compute-arounds (preserving legacy API for stability)
    const isFree = computed(() => subscriptionTier.value === 'free')
    const isPro = computed(() => entitlementService.isPro)
    const isProPlus = computed(() => entitlementService.isProPlus)
    const isPaid = computed(() => entitlementService.isPaid)

    const tierDisplayName = computed(() => {
        const names = { free: 'Free', pro: 'Pro', pro_plus: 'Pro+' }
        return names[subscriptionTier.value] || 'Free'
    })

    const connectionUsage = computed(() => tierUsage.value?.connections)
    const dashboardUsage = computed(() => tierUsage.value?.dashboards)
    const tableUsage = computed(() => tierUsage.value?.tables)

    return {
        // State
        subscriptionTier,
        subscriptionStatus,
        tierUsage,
        isLoading,

        // Computed
        isFree,
        isPro,
        isProPlus,
        isPaid,
        tierDisplayName,
        connectionUsage,
        dashboardUsage,
        tableUsage,

        // Methods
        fetchEntitlements: (force?: boolean) => entitlementService.fetch(force),
        canCreateConnection: computed(() => entitlementService.can('connections')),
        canCreateDashboard: computed(() => entitlementService.can('dashboards')),
        canAddTables: computed(() => entitlementService.can('tables')),

        // Failsafe for missing legacy methods
        handleLimitError: (error: any) => {
            console.warn('[useEntitlements] handleLimitError placeholder called');
            return null;
        },
        resetState: () => entitlementService.reset()
    }
}
