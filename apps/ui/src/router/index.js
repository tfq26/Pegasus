import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/about', component: () => import('../views/About.vue') },

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

    { path: '/dashboard', component: () => import('@/views/DashboardHome.vue') },
    { path: '/dashboard/:id', component: () => import('@/views/Dashboard.vue') },
    { path: '/shared/dashboard/:token', component: () => import('../views/SharedDashboard.vue') },
    { path: '/profile', component: () => import('../views/profile.vue') },
    { path: '/settings', component: () => import('../views/settings/settings.vue') },
    // { path: '/releases', component: () => import('../views/Releases.vue') },
    { path: '/feedback', component: () => import('../views/Feedback.vue') },
    { path: '/support', component: () => import('../views/Support.vue') },
    { path: '/login', component: () => import('../views/Login.vue') },
    { path: '/workspace-test', component: () => import('../views/WorkspaceTest.vue') },
    { path: '/error', component: () => import('../views/ErrorPage.vue') },
  ],
})

// Refresh user state after login redirects
router.beforeEach(async (to, from) => {
  const { fetchUser, user } = useAuth()
  const token = localStorage.getItem('auth_token')

  // List of paths that require authentication
  const protectedPaths = ['/query', '/dashboard', '/profile', '/settings', '/feedback', '/support']
  const isProtectedPath = protectedPaths.some(path => to.path.startsWith(path))

  // Redirect to login if user is not authenticated and trying to access a protected path
  if (isProtectedPath && !token) {
    console.log('[Router] Unauthenticated access to protected path, redirecting to login:', to.path)
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // Check if we're coming from a login flow
  const isComingFromLogin = from.path === '/login'
  const hasAuthParams = to.query.code || to.query.state || to.query.session_state

  if (isComingFromLogin || hasAuthParams) {
    console.log('[Router] Refreshing user state after login/OAuth redirect')
    await fetchUser()

    if (hasAuthParams) {
      const cleanQuery = { ...to.query }
      delete cleanQuery.code
      delete cleanQuery.state
      delete cleanQuery.session_state
      router.replace({ path: to.path, query: cleanQuery })
    }
  }
})

export default router
