import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/about', component: () => import('../views/About.vue') },
    { path: '/query', component: () => import('@/views/Chat.vue') },
    { path: '/dashboard', component: () => import('@/views/DashboardHome.vue') },
    { path: '/dashboard/:id', component: () => import('@/views/Dashboard.vue') },
    { path: '/shared/dashboard/:token', component: () => import('../views/SharedDashboard.vue') },
    { path: '/profile', component: () => import('../views/profile.vue') },
    { path: '/settings', component: () => import('../views/settings/settings.vue') },
    { path: '/releases', component: () => import('../views/Releases.vue') },
    { path: '/feedback', component: () => import('../views/Feedback.vue') },
    { path: '/support', component: () => import('../views/Support.vue') },
    { path: '/login', component: () => import('../views/Login.vue') },
    { path: '/workspace-test', component: () => import('../views/WorkspaceTest.vue') },
  ],
})

// Refresh user state after login redirects
router.beforeEach(async (to, from) => {
  const { fetchUser } = useAuth()

  // Check if we're coming from a login flow
  // This handles cases where:
  // 1. User navigates away from /login page
  // 2. User is redirected back from OAuth provider (check for auth query params)
  const isComingFromLogin = from.path === '/login'
  const hasAuthParams = to.query.code || to.query.state || to.query.session_state

  console.log('[Router] Navigation:', {
    from: from.path,
    to: to.path,
    isComingFromLogin,
    hasAuthParams,
    query: to.query
  })

  if (isComingFromLogin || hasAuthParams) {
    console.log('[Router] Refreshing user state after login/OAuth redirect')
    // Refresh user state to update mobile navigation and other components
    await fetchUser()

    // Clean up auth query params from URL if present
    if (hasAuthParams) {
      const cleanQuery = { ...to.query }
      delete cleanQuery.code
      delete cleanQuery.state
      delete cleanQuery.session_state

      console.log('[Router] Cleaning auth params from URL')
      // Replace current route to remove auth params from URL
      router.replace({ path: to.path, query: cleanQuery })
    }
  }
})

export default router
