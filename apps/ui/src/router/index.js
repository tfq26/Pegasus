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
    { path: '/login', component: Login },
  ],
})

export default router
