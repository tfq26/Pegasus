import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

import Home from '../views/Home.vue'
import About from '../views/About.vue'
import Chat from '@/views/Chat.vue'
import DashboardHome from '@/views/DashboardHome.vue'
import Dashboard from '@/views/Dashboard.vue'
import Profile from '../views/profile.vue'
import Settings from '../views/settings/settings.vue'
import Login from '../views/Login.vue'
import SharedDashboard from '../views/SharedDashboard.vue'
import Releases from '../views/Releases.vue'
import Feedback from '../views/Feedback.vue'
import Support from '../views/Support.vue'
import WorkspaceTest from '../views/WorkspaceTest.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/query', component: Chat },
    { path: '/dashboard', component: DashboardHome },
    { path: '/dashboard/:id', component: Dashboard },
    { path: '/shared/dashboard/:token', component: SharedDashboard },
    { path: '/profile', component: Profile },
    { path: '/settings', component: Settings },
    { path: '/releases', component: Releases },
    { path: '/feedback', component: Feedback },
    { path: '/support', component: Support },
    { path: '/login', component: Login },
    { path: '/workspace-test', component: WorkspaceTest },
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

  if (isComingFromLogin || hasAuthParams) {
    // Refresh user state to update mobile navigation and other components
    await fetchUser()

    // Clean up auth query params from URL if present
    if (hasAuthParams) {
      const cleanQuery = { ...to.query }
      delete cleanQuery.code
      delete cleanQuery.state
      delete cleanQuery.session_state

      // Replace current route to remove auth params from URL
      router.replace({ path: to.path, query: cleanQuery })
    }
  }
})

export default router
