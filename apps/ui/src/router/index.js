import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'



const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Unified entry for desktop and web app
    {
      path: '/',
      redirect: '/dashboard'
    },

    // Main query interface with multi-tab workspace
    {
      path: '/query',
      component: () => import('@/views/Chat.vue')
    },

    // Redirects from old chat routes to unified query view
    {
      path: '/chat',
      redirect: '/query'
    },
    {
      path: '/chat/conversation',
      redirect: '/query'
    },
    {
      path: '/chat/query',
      redirect: '/query'
    },
    {
      path: '/chat/spreadsheet',
      redirect: '/query'
    },
    { path: '/history', component: () => import('@/views/HistoryView.vue') },

    { path: '/dashboard', component: () => import('@/views/DashboardHome.vue') },
    { path: '/dashboard/:id', component: () => import('@/views/Dashboard.vue') },
    { path: '/dashboard/:id/fullscreen', component: () => import('@/views/DashboardFullscreen.vue') },
    { path: '/shared/dashboard/:token', component: () => import('../views/SharedDashboard.vue') },
    { path: '/profile', component: () => import('../views/profile.vue') },
    { path: '/settings', component: () => import('../views/settings/settings.vue') },
    { path: '/feedback', component: () => import('../views/Feedback.vue') },
    { path: '/support', component: () => import('../views/Support.vue') },
    { path: '/docs', component: () => import('../views/DocsView.vue') },
    { path: '/releases', component: () => import('../views/Releases.vue') },
    { path: '/login', component: () => import('../views/SignIn.vue') },
    { path: '/signin', component: () => import('../views/SignIn.vue') }, // Desktop device auth flow
    { path: '/signup', component: () => import('../views/SignUp.vue') },
    { path: '/admin', component: () => import('../views/Admin.vue') },
    // { path: '/stocks', component: () => import('../views/StockDashboard.vue') },
    { path: '/stocks', redirect: '/dashboard' },
    { path: '/error', component: () => import('../views/ErrorPage.vue') },
    // { path: '/wrangler', component: () => import('../views/WranglerView.vue') },
    { path: '/pricing', component: () => import('../views/Pricing.vue') },
    { path: '/auth/callback', component: () => import('../views/AuthCallback.vue') },

    // Prototypes (temporary experimental views)
    { path: '/prototype/data-tab', component: () => import('../views/prototypes/DataTabPrototype.vue') },
  ],
})

// Refresh user state after login redirects
router.beforeEach(async (to, from) => {
  const { user, isAuthenticated, fetchUser } = useAuth()

  // List of paths that require authentication
  const protectedPaths = ['/query', '/dashboard', '/profile', '/settings', '/feedback', '/admin']
  const isProtectedPath = protectedPaths.some(path => to.path.startsWith(path))

  // Public paths that should skip auth checks entirely
  const publicPaths = ['/login', '/signin', '/signup', '/pricing', '/docs', '/releases', '/error', '/shared', '/auth/callback']
  const isPublicPath = publicPaths.some(path => to.path.startsWith(path))

  // Redirect authenticated users away from login/signin
  if ((to.path === '/login' || to.path === '/signin' || to.path === '/signup') && isAuthenticated.value) {
    console.log('[Router] Already authenticated, redirecting to dashboard')
    return { path: '/dashboard' }
  }

  // Skip guard for public paths
  if (isPublicPath) return

  // Web: Check authentication for protected paths
  if (isProtectedPath && !isAuthenticated.value) {
    // Try to fetch user (in case they have a valid session cookie)
    await fetchUser()

    // After fetching, if still not authenticated, redirect to login
    if (!isAuthenticated.value) {
      console.log('[Router] Not authenticated, redirecting to login')
      return { path: '/login', query: { redirect: to.fullPath } }
    }
  }

  // Check if we're coming from a login flow
  const isComingFromLogin = from.path === '/login' || from.path === '/signin' || from.path === '/signup'
  const hasAuthParams = to.query.code || to.query.state || to.query.session_state || to.query.token

  if (isComingFromLogin || hasAuthParams) {
    console.log('[Router] Refreshing user state after login/OAuth redirect')
    await fetchUser()

    if (hasAuthParams) {
      const cleanQuery = { ...to.query }
      delete cleanQuery.code
      delete cleanQuery.state
      delete cleanQuery.session_state
      delete cleanQuery.token
      router.replace({ path: to.path, query: cleanQuery })
    }
  }
})

export default router
