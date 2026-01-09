import { ref, computed } from 'vue'
import { identityService } from './identityService'
import { api } from '@/lib/apiClient'

export type Tier = 'free' | 'pro' | 'pro_plus'

class EntitlementService {
    private _tier = ref<Tier>('free')
    private _status = ref<'active' | 'canceled' | 'past_due' | null>(null)
    private _usage = ref<any>(null)
    private _details = ref<any>(null)
    private _isLoading = ref(false)
    private _lastFetched = 0
    private CACHE_DURATION = 5 * 60 * 1000

    // Reactive getters
    get tier() { return this._tier.value }
    get status() { return this._status.value }
    get usage() { return this._usage.value }
    get details() { return this._details.value }
    get isLoading() { return this._isLoading.value }

    // Computed-like helpers (for use in components)
    get isPro() { return this._tier.value === 'pro' }
    get isProPlus() { return this._tier.value === 'pro_plus' }
    get isPaid() { return this.isPro || this.isProPlus }

    async fetch(force = false) {
        if (!identityService.isAuthenticated) {
            this.reset()
            return
        }

        const now = Date.now()
        if (!force && this._lastFetched && (now - this._lastFetched) < this.CACHE_DURATION) {
            return
        }

        this._isLoading.value = true
        try {
            const [subData, usageData] = await Promise.all([
                api.get<any>('/subscription-status').catch(() => ({ tier: 'free', status: null })),
                api.get<any>('/usage').catch(() => ({ tierUsage: null }))
            ])

            this._tier.value = subData.tier || 'free'
            this._status.value = subData.status || null
            this._details.value = subData
            this._usage.value = usageData.tierUsage || null
            this._lastFetched = now
        } catch (e) {
            console.error('[EntitlementService] Fetch failed:', e)
        } finally {
            this._isLoading.value = false
        }
    }

    reset() {
        this._tier.value = 'free'
        this._status.value = null
        this._details.value = null
        this._usage.value = null
        this._lastFetched = 0
    }

    /**
     * Check if a specific limit is reached
     */
    can(type: 'connections' | 'tables' | 'dashboards') {
        if (!this._usage.value) return true
        const { current, limit } = this._usage.value[type]
        return current < limit || limit === Infinity
    }
}

export const entitlementService = new EntitlementService()
