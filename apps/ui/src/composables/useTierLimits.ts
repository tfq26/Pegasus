import { ref, computed } from 'vue'
import { api } from '@/lib/apiClient'
import { useAuth } from './useAuth'

export interface TierUsage {
    connections: {
        current: number
        limit: number
        percentage: number
    }
    tables: {
        current: number
        limit: number
        percentage: number
    }
    dashboards: {
        current: number
        limit: number
        percentage: number
    }
}

export interface TierLimitCheck {
    allowed: boolean
    current?: number
    limit?: number
    message?: string
    tier?: string
    upgradeRequired?: boolean
}

export function useTierLimits() {
    const { user } = useAuth()
    const tierUsage = ref<TierUsage | null>(null)
    const isLoading = ref(false)

    const currentTier = computed(() => {
        // This will be populated from usage stats
        return tierUsage.value ? 'free' : 'free' // Default to free, will be updated
    })

    /**
     * Fetch current tier usage from backend
     */
    const fetchTierUsage = async () => {
        if (!user.value) return

        try {
            isLoading.value = true
            const data = await api.get<any>('/usage')
            tierUsage.value = data.tierUsage
            return data
        } catch (error) {
            console.error('[TierLimits] Failed to fetch usage:', error)
            return null
        } finally {
            isLoading.value = false
        }
    }

    /**
     * Check if user can create a new connection
     */
    const canCreateConnection = computed(() => {
        if (!tierUsage.value) return true // Optimistic
        const { current, limit } = tierUsage.value.connections
        return current < limit || limit === Infinity
    })

    /**
     * Check if user can create a new dashboard
     */
    const canCreateDashboard = computed(() => {
        if (!tierUsage.value) return true // Optimistic
        const { current, limit } = tierUsage.value.dashboards
        return current < limit || limit === Infinity
    })

    /**
     * Check if user can add more tables
     */
    const canAddTables = computed(() => {
        if (!tierUsage.value) return true // Optimistic
        const { current, limit } = tierUsage.value.tables
        return current < limit || limit === Infinity
    })

    /**
     * Get connection usage info
     */
    const connectionUsage = computed(() => tierUsage.value?.connections)

    /**
     * Get dashboard usage info
     */
    const dashboardUsage = computed(() => tierUsage.value?.dashboards)

    /**
     * Get table usage info
     */
    const tableUsage = computed(() => tierUsage.value?.tables)

    /**
     * Handle API limit error responses
     * Returns upgrade modal config if limit hit, null otherwise
     */
    const handleLimitError = (error: any): {
        show: boolean
        limitType: string
        currentUsage?: number
        limit?: number
        tier?: string
    } | null => {
        if (error?.upgradeRequired) {
            // Determine limit type from error message
            let limitType = 'connections'
            if (error.message?.includes('dashboard')) limitType = 'dashboards'
            if (error.message?.includes('table')) limitType = 'tables'
            if (error.message?.includes('token')) limitType = 'tokens'
            if (error.message?.includes('storage')) limitType = 'storage'

            return {
                show: true,
                limitType,
                currentUsage: error.current,
                limit: error.limit,
                tier: error.tier
            }
        }
        return null
    }

    return {
        // State
        tierUsage,
        isLoading,
        currentTier,

        // Computed checks
        canCreateConnection,
        canCreateDashboard,
        canAddTables,
        connectionUsage,
        dashboardUsage,
        tableUsage,

        // Methods
        fetchTierUsage,
        handleLimitError
    }
}
