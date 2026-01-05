/**
 * Dashboard Cache Layer - Stale-While-Revalidate Pattern
 * 
 * 1. Load cached snapshot instantly
 * 2. Fetch latest from server in background
 * 3. Merge changes → update UI
 * 4. Save new snapshot to cache
 */

import { ref } from 'vue'

interface CachedDashboard {
    id: string
    data: any
    timestamp: number
    version: number
}

interface CacheEntry {
    dashboards: Record<string, CachedDashboard>
    version: number
}

const CACHE_KEY = 'pegasus_dashboard_cache'
const CACHE_VERSION = 1
const DEFAULT_TTL_MS = 15 * 60 * 1000 // 15 minutes

export function useDashboardCache() {
    const isRevalidating = ref(false)

    /**
     * Get cache from localStorage
     */
    const getCache = (): CacheEntry => {
        try {
            const raw = localStorage.getItem(CACHE_KEY)
            if (!raw) return { dashboards: {}, version: CACHE_VERSION }

            const parsed = JSON.parse(raw) as CacheEntry
            if (parsed.version !== CACHE_VERSION) {
                // Clear old cache versions
                localStorage.removeItem(CACHE_KEY)
                return { dashboards: {}, version: CACHE_VERSION }
            }

            return parsed
        } catch {
            return { dashboards: {}, version: CACHE_VERSION }
        }
    }

    /**
     * Save cache to localStorage
     */
    const saveCache = (cache: CacheEntry) => {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
        } catch (e) {
            console.warn('[DashboardCache] Failed to save cache:', e)
        }
    }

    /**
     * Get cached dashboard by ID
     */
    const getCachedDashboard = (id: string): any | null => {
        const cache = getCache()
        const entry = cache.dashboards[id]

        if (!entry) return null

        return entry.data
    }

    /**
     * Check if cache is stale (expired TTL)
     */
    const isStale = (id: string, ttlMs: number = DEFAULT_TTL_MS): boolean => {
        const cache = getCache()
        const entry = cache.dashboards[id]

        if (!entry) return true

        return Date.now() - entry.timestamp > ttlMs
    }

    /**
     * Cache a dashboard
     */
    const cacheDashboard = (id: string, data: any) => {
        const cache = getCache()

        cache.dashboards[id] = {
            id,
            data,
            timestamp: Date.now(),
            version: CACHE_VERSION
        }

        saveCache(cache)
    }

    /**
     * Invalidate cache for a dashboard
     */
    const invalidate = (id: string) => {
        const cache = getCache()
        delete cache.dashboards[id]
        saveCache(cache)
    }

    /**
     * Clear all cached dashboards
     */
    const clearAll = () => {
        localStorage.removeItem(CACHE_KEY)
    }

    /**
     * Get list of all cached dashboards with metadata
     */
    const getAllCached = (): Array<{ id: string, timestamp: number, size: number }> => {
        const cache = getCache()

        return Object.entries(cache.dashboards).map(([id, entry]) => ({
            id,
            timestamp: entry.timestamp,
            size: JSON.stringify(entry.data).length
        }))
    }

    /**
     * Stale-while-revalidate fetch helper
     * Returns cached data immediately, then fetches fresh data
     */
    const fetchWithSWR = async <T>(
        id: string,
        fetcher: () => Promise<T>,
        onUpdate: (data: T) => void,
        ttlMs: number = DEFAULT_TTL_MS
    ): Promise<T | null> => {
        const cached = getCachedDashboard(id) as T | null
        const stale = isStale(id, ttlMs)

        // If we have cache, return it immediately
        if (cached) {
            // If stale, revalidate in background
            if (stale) {
                isRevalidating.value = true
                fetcher()
                    .then(fresh => {
                        cacheDashboard(id, fresh)
                        onUpdate(fresh)
                    })
                    .catch(e => console.error('[DashboardCache] Revalidation failed:', e))
                    .finally(() => {
                        isRevalidating.value = false
                    })
            }
            return cached
        }

        // No cache, fetch fresh
        try {
            const fresh = await fetcher()
            cacheDashboard(id, fresh)
            return fresh
        } catch (e) {
            console.error('[DashboardCache] Fetch failed:', e)
            return null
        }
    }

    return {
        isRevalidating,
        getCachedDashboard,
        isStale,
        cacheDashboard,
        invalidate,
        clearAll,
        getAllCached,
        fetchWithSWR
    }
}
