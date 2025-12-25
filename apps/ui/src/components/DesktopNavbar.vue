<template>
  <!-- Desktop-only compact navbar -->
  <nav class="w-full border-b border-border bg-background/95 backdrop-blur-sm text-foreground fixed top-0 z-50 h-12">
    <div class="flex items-center justify-between px-4 h-full">
      <!-- Left: Logo + Navigation -->
      <div class="flex items-center gap-6">


        <!-- Navigation Links -->
        <div class="flex items-center gap-1">
          <button
            v-for="link in links"
            :key="link.to"
            @click="handleNavClick(link)"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            :class="[
              isLinkActive(link.to)
                ? 'text-foreground bg-muted'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            ]"
          >
            <component :is="link.icon" class="w-4 h-4 inline mr-1.5" />
            {{ link.label }}
          </button>
        </div>
      </div>

      <!-- Right: Status + Profile -->
      <div class="flex items-center gap-3">
        <!-- Connection Status -->
        <div class="flex items-center gap-2 px-2.5 py-1 rounded-md bg-muted/50 border border-border/50">
          <div 
            :class="isOnline ? 'bg-green-500' : 'bg-yellow-500'" 
            class="w-2 h-2 rounded-full"
          />
          <span class="text-xs font-medium text-muted-foreground">
            {{ isOnline ? 'Connected' : 'Offline' }}
          </span>
        </div>

        <!-- Progress Bar -->
        <GlobalProgressBar />

        <!-- Notification Bell -->
        <NotificationCenter />

        <!-- Profile Dropdown -->
        <div ref="dropdownRef" class="relative">
          <!-- Not Logged In -->
          <button
            v-if="!user"
            @click="handleLogin"
            class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <LogIn class="h-4 w-4" />
            Sign In
          </button>

          <!-- Logged In -->
          <button
            v-else
            @click="toggleDropdown"
            class="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors"
          >
            <img
              :src="user.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${user.email}`"
              alt="Profile"
              class="h-6 w-6 rounded-md object-cover border border-border"
            />
            <span class="text-sm font-medium text-foreground">{{ user.firstName || 'User' }}</span>
            <ChevronDown
              class="h-3 w-3 text-muted-foreground transition-transform duration-200"
              :class="{ 'rotate-180': showDropdown }"
            />
          </button>

          <!-- Dropdown Menu -->
          <transition name="dropdown-fade">
            <div
              v-if="showDropdown && user"
              class="absolute right-0 top-10 w-44 rounded-lg border border-border bg-popover shadow-lg py-1 z-50"
            >
              <RouterLink
                v-for="item in dropdownItems"
                :key="item.to"
                :to="item.to"
                class="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
                @click="showDropdown = false"
              >
                <component :is="item.icon" class="w-4 h-4" />
                {{ item.label }}
              </RouterLink>
              <div class="h-px bg-border my-1" />
              <button
                @click="handleLogout"
                class="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition"
              >
                <LogOut class="w-4 h-4" />
                Logout
              </button>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import NotificationCenter from './NotificationCenter.vue'
import GlobalProgressBar from './GlobalProgressBar.vue'
import {
  LayoutDashboard,
  MessageSquare,
  User,
  Settings,
  CircleHelp,
  LogOut,
  LogIn,
  ChevronDown,
  BookOpen
} from 'lucide-vue-next'

defineOptions({ name: 'DesktopNavbar' })

const route = useRoute()
const router = useRouter()
const { user, logout, login } = useAuth()

const isOnline = ref(navigator.onLine)
const showDropdown = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// Navigation links for desktop
const links = [
  { to: '/query', label: 'Query', icon: MessageSquare },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

const dropdownItems = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/support', label: 'Support', icon: CircleHelp },
  { to: '/docs', label: 'Docs', icon: BookOpen }
]

// Check if a link is currently active
const isLinkActive = (path: string) => {
  return route.path === path || route.path.startsWith(path + '/')
}

// Handle navigation with smart dashboard redirect
const handleNavClick = (link: { to: string }) => {
  if (link.to === '/dashboard') {
    // Check for last viewed dashboard
    const lastDashboard = localStorage.getItem('pegasus-last-dashboard')
    if (lastDashboard) {
      router.push(`/dashboard/${lastDashboard}`)
    } else {
      router.push('/dashboard')
    }
  } else {
    router.push(link.to)
  }
}

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}

const handleLogin = () => {
  login()
}

const handleLogout = () => {
  showDropdown.value = false
  logout()
}

// Watch online status
const updateOnlineStatus = () => {
  isOnline.value = navigator.onLine
}

// Close dropdown on outside click
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    showDropdown.value = false
  }
}

onMounted(() => {
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineStatus)
  window.removeEventListener('offline', updateOnlineStatus)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.15s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
