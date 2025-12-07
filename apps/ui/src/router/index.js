import { createRouter, createWebHistory } from 'vue-router'

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

export default router
