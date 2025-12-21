/**
 * usePrefetch - McMaster-Carr style link prefetching
 * Prefetches route chunks on link hover/focus for instant navigation
 */
import { onMounted, onUnmounted } from 'vue'

// Track prefetched routes to avoid duplicate fetches
const prefetchedRoutes = new Set<string>()

// Route to dynamic import mapping (mirrors router/index.js)
const routeImports: Record<string, () => Promise<unknown>> = {
    '/': () => import('@/views/Home.vue'),
    '/about': () => import('@/views/About.vue'),
    '/query': () => import('@/views/Chat.vue'),
    '/dashboard': () => import('@/views/DashboardHome.vue'),
    '/profile': () => import('@/views/profile.vue'),
    '/settings': () => import('@/views/settings/settings.vue'),
    '/releases': () => import('@/views/Releases.vue'),
    '/feedback': () => import('@/views/Feedback.vue'),
    '/support': () => import('@/views/Support.vue'),
    '/login': () => import('@/views/Login.vue'),
    '/error': () => import('@/views/ErrorPage.vue'),
}

/**
 * Prefetch a route's JavaScript chunk
 */
export const prefetchRoute = (path: string) => {
    // Normalize path
    const normalizedPath = path.split('?')[0] // Remove query params

    // Skip if already prefetched or no import defined
    if (prefetchedRoutes.has(normalizedPath)) return

    const importer = routeImports[normalizedPath]
    if (!importer) return

    // Mark as prefetched immediately to prevent race conditions
    prefetchedRoutes.add(normalizedPath)

    // Prefetch using requestIdleCallback if available, else setTimeout
    const prefetch = () => {
        importer().catch(() => {
            // Remove from set if prefetch fails so it can be retried
            prefetchedRoutes.delete(normalizedPath)
        })
    }

    if ('requestIdleCallback' in window) {
        requestIdleCallback(prefetch, { timeout: 2000 })
    } else {
        setTimeout(prefetch, 100)
    }
}

/**
 * Vue composable to enable automatic link prefetching
 * Attaches listeners to all internal links to prefetch on hover/focus
 */
export const usePrefetch = () => {
    const handleMouseEnter = (e: Event) => {
        const target = e.target as HTMLElement
        // Safety check: only Element nodes have closest()
        if (!target || typeof target.closest !== 'function') return
        const anchor = target.closest('a[href^="/"]') as HTMLAnchorElement | null
        if (anchor) {
            prefetchRoute(anchor.getAttribute('href') || '')
        }
    }

    const handleFocus = (e: FocusEvent) => {
        const target = e.target as HTMLElement
        if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('/')) {
            prefetchRoute(target.getAttribute('href') || '')
        }
    }

    onMounted(() => {
        // Use event delegation for efficiency
        document.addEventListener('mouseenter', handleMouseEnter, true)
        document.addEventListener('focusin', handleFocus, true)
    })

    onUnmounted(() => {
        document.removeEventListener('mouseenter', handleMouseEnter, true)
        document.removeEventListener('focusin', handleFocus, true)
    })
}

/**
 * Prefetch visible links using Intersection Observer
 * Call this for critical navigation areas
 */
export const usePrefetchVisible = (containerRef: { value: HTMLElement | null }) => {
    let observer: IntersectionObserver | null = null

    onMounted(() => {
        if (!containerRef.value) return

        observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const href = (entry.target as HTMLAnchorElement).getAttribute('href')
                        if (href) prefetchRoute(href)
                        observer?.unobserve(entry.target)
                    }
                })
            },
            { rootMargin: '50px' }
        )

        const links = containerRef.value.querySelectorAll('a[href^="/"]')
        links.forEach((link) => observer?.observe(link))
    })

    onUnmounted(() => {
        observer?.disconnect()
    })
}
