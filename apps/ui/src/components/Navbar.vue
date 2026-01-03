<template>
  <nav
    class="w-full border-b border-border bg-background text-foreground shadow-sm fixed top-0 z-50 transition-all duration-300"
  >
    <div class="flex items-center justify-between px-4 py-3 sm:px-8 h-16 w-full">
      <!-- Left: Logo -->
      <RouterLink to="/" class="flex items-center gap-3 group">
        <img
          src="/pegasus-purple.svg"
          alt="Pegasus Logo"
          class="h-8 w-8 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110"
        />
        <span class="text-xl font-bold tracking-tight text-foreground hidden sm:block">Pegasus</span>
      </RouterLink>

      <!-- Center: Desktop Links -->
      <div class="hidden sm:flex items-center gap-8">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="relative text-sm font-medium text-muted-foreground hover:text-foreground transition-all duration-200"
          active-class="text-foreground font-semibold"
        >
          {{ link.label }}
          <span
            class="absolute left-0 -bottom-1 h-0.5 w-0 bg-primary opacity-0 transition-all duration-300"
          ></span>
        </RouterLink>
      </div>

      <!-- Right: Mobile Toggle + Profile -->
      <div class="flex items-center gap-4">

        <button
          @click="mobileOpen = true"
          class="sm:hidden p-2.5 rounded-md hover:bg-muted/50 active:bg-muted transition-colors text-foreground"
          aria-label="Open menu"
        >
          <Menu class="h-6 w-6" />
        </button>

        <!-- Desktop Connection Status -->
        <div v-if="isDesktop && !isPhone" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
          <div 
            :class="isOnline ? 'bg-green-500' : 'bg-yellow-500'" 
            class="w-2 h-2 rounded-full animate-pulse"
          />
          <span class="text-xs font-medium text-muted-foreground">
            {{ isOnline ? 'Connected' : 'Offline' }}
          </span>
        </div>

        <!-- Global Notifications -->
        <NotificationCenter v-if="!isPhone" />

        <!-- Global Progress Bar -->
        <GlobalProgressBar v-if="!isPhone" />

        <!-- Profile -->
        <div v-if="!isPhone" ref="dropdownRef" class="relative">
          <!-- Loading State -->
          <div
            v-if="isLoading"
            class="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1"
          >
            <div class="h-7 w-7 rounded-lg bg-muted animate-pulse"></div>
            <div class="hidden sm:block h-4 w-16 bg-muted rounded animate-pulse"></div>
          </div>

          <!-- Not Logged In -->
          <RouterLink
            v-else-if="!user"
            to="/login"
            class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-all"
          >
            <LogIn class="h-5 w-5" />
            <span class="hidden sm:inline font-medium">Login</span>
          </RouterLink>

          <!-- Logged In -->
          <button
            v-else
            @click="toggleDropdown"
            class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-all"
          >
            <img
              :src="user.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${user.email}`"
              alt="Profile"
              class="h-7 w-7 rounded-lg object-cover transition-all"
              :class="isPro ? 'border-2 border-primary ring-2 ring-primary/20' : 'border border-border'"
            />
            <span class="hidden sm:inline font-medium flex items-center gap-1">
              {{ user.firstName || 'User' }}
              <span
                v-if="isPro"
                class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase border border-primary/20"
              >
                PRO
              </span>
            </span>
            <ChevronDown
              class="h-4 w-4 transition-transform duration-200"
              :class="{ 'rotate-180': showDropdown }"
            />
          </button>

          <!-- Dropdown -->
          <transition name="dropdown-fade">
            <div
              v-if="showDropdown && user"
              class="absolute right-0 top-12 w-48 rounded-xl border border-border bg-popover shadow-lg shadow-black/10 dark:shadow-black/30 py-2 z-50 overflow-hidden"
            >
              <div class="px-4 py-2 border-b border-border mb-1 sm:hidden">
                <p class="text-xs font-bold text-foreground truncate">
                  {{ user.firstName }} {{ user.lastName }}
                </p>
                <p class="text-[10px] text-muted-foreground truncate">{{ user.email }}</p>
              </div>
              <RouterLink
                v-for="item in dropdownItems"
                :key="item.to"
                :to="item.to"
                class="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
                @click="showDropdown = false"
              >
                <component :is="item.icon" class="w-4 h-4" />
                {{ item.label }}
              </RouterLink>
              <div class="h-px bg-border my-1"></div>
              <button
                @click="toggleTheme"
                class="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <Sun v-if="currentIcon === 'sun'" class="w-4 h-4" />
                <Moon v-else-if="currentIcon === 'moon'" class="w-4 h-4" />
                <Monitor v-else class="w-4 h-4" />
                <span>Theme: {{ mode }}</span>
              </button>
              <div class="h-px bg-border my-1"></div>
              <button
                @click="handleLogout"
                class="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition"
              >
                <LogOut class="w-4 h-4" />
                Logout
              </button>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- Mobile Menu Overlay -->
    <div class="sm:hidden">
      <!-- Backdrop -->
      <transition name="fade">
        <div
          v-if="mobileOpen"
          class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          @click="mobileOpen = false"
        ></div>
      </transition>

      <!-- Drawer Panel -->
      <transition name="slide">
        <aside
          v-if="mobileOpen"
          class="fixed right-0 top-0 z-50 h-full w-[86%] max-w-[360px]
                 bg-card border-l border-border shadow-2xl
                 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]
                 flex flex-col"
          role="dialog"
          aria-modal="true"
        >
          <!-- Handle -->
          <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted"></div>

          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <RouterLink to="/" class="flex items-center gap-2" @click="mobileOpen = false">
              <img src="/pegasus-purple.svg" class="h-7 w-7" />
              <span class="text-sm font-bold tracking-tight text-foreground">Pegasus</span>
            </RouterLink>

            <button
              @click="mobileOpen = false"
              class="p-2 rounded-lg hover:bg-muted transition text-muted-foreground"
              aria-label="Close menu"
            >
              <X class="h-5 w-5" />
            </button>
          </div>

          <!-- Navigation -->
          <nav class="space-y-2 flex-1 overflow-y-auto min-h-0 py-2">
            <RouterLink
              v-for="link in filteredLinks"
              :key="link.to"
              :to="link.to"
              class="group flex items-center gap-3 p-3 rounded-xl border border-transparent
                     hover:bg-muted/60 hover:border-border transition flex-shrink-0"
              active-class="bg-muted/70 border-border text-foreground"
              @click="mobileOpen = false"
            >
              <component
                :is="link.icon"
                class="w-4 h-4 text-muted-foreground group-[.router-link-active]:text-primary"
              />
              <div class="flex-1">
                <div class="text-xs font-bold uppercase tracking-widest text-foreground">
                  {{ link.label }}
                </div>
                <div class="text-[10px] text-muted-foreground leading-tight">
                  {{ link.to }}
                </div>
              </div>
              <ArrowRight class="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition" />
            </RouterLink>
          </nav>

          <!-- Footer -->
          <div class="mt-auto pt-5 border-t border-border space-y-3 flex-shrink-0">
            <template v-if="user">
              <div class="flex items-center gap-3 px-1">
                <img
                  :src="user.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${user.email}`"
                  class="w-11 h-11 rounded-xl border border-border bg-muted object-cover"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-foreground truncate">
                      {{ user.firstName }} {{ user.lastName }}
                    </span>
                    <span
                      v-if="isPro"
                      class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase border border-primary/20"
                    >
                      PRO
                    </span>
                  </div>
                  <div class="text-[10px] text-muted-foreground truncate">
                    {{ user.email }}
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <RouterLink
                  to="/profile"
                  class="flex items-center justify-center gap-2 p-3 rounded-xl border border-border bg-background
                         text-foreground font-bold text-[10px] uppercase tracking-widest transition hover:bg-muted"
                  @click="mobileOpen = false"
                >
                  <User class="w-3.5 h-3.5" />
                  Profile
                </RouterLink>
              </div>

              <button
                @click="handleLogout"
                class="w-full flex items-center justify-center gap-2 p-3 rounded-xl
                       border border-destructive/20 bg-destructive/5 text-destructive
                       font-bold text-[10px] uppercase tracking-widest transition hover:bg-destructive/10"
              >
                <LogOut class="w-3.5 h-3.5" />
                Logout
              </button>
            </template>

            <template v-else>
              <RouterLink
                to="/login"
                class="w-full flex items-center justify-center gap-2 p-3 rounded-xl
                       bg-primary text-primary-foreground
                       font-bold text-[10px] uppercase tracking-widest transition hover:opacity-90"
                @click="mobileOpen = false"
              >
                <LogIn class="w-3.5 h-3.5" />
                Sign In to System
              </RouterLink>
            </template>
          </div>
        </aside>
      </transition>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { usePlatform, isTauri as isTauriRef, isOnline as isOnlineRef } from '@/composables/usePlatform'
import { useColorMode } from '@vueuse/core'
import { getSubscriptionStatus } from '@/lib/api'
import NotificationCenter from './NotificationCenter.vue'
import GlobalProgressBar from './GlobalProgressBar.vue'
import {
  Home,
  Info,
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  User,
  Settings,
  CircleHelp,
  LogOut,
  LogIn,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
  Sun,
  Moon,
  Monitor,
  BookOpen
} from 'lucide-vue-next'

defineOptions({ name: 'AppNavbar' })

const route = useRoute()
const { isPhone } = usePlatform()
const marketingUrl = import.meta.env.VITE_MARKETING_URL || 'http://localhost:3000'
const { user, isLoading, fetchUser, logout } = useAuth()

interface NavLink {
  to: string
  label: string
  icon: any
  webOnly?: boolean
}

const links: NavLink[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, webOnly: false },
  { to: '/query', label: 'Query', icon: MessageSquare, webOnly: false },
]

// Use centralized platform detection
const isDesktop = isTauriRef
const isOnline = isOnlineRef

const filteredLinks = computed(() => {
  let result = links

  // Desktop: hide web-only pages (Home, About)
  if (isTauriRef.value) {
    result = result.filter((link) => !link.webOnly)
  }

  // Phone: show only Home and About
  if (isPhone.value) {
    result = links.filter((link) => ['Home', 'About'].includes(link.label))
  }

  return result
})

const dropdownItems = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/support', label: 'Support', icon: CircleHelp },
  { to: '/docs', label: 'Docs', icon: BookOpen }
]

const showDropdown = ref(false)
const mobileOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const isPro = ref(false)

const toggleDropdown = () => (showDropdown.value = !showDropdown.value)

const handleLogout = () => {
  showDropdown.value = false
  mobileOpen.value = false
  logout()
}

// Theme toggle
const mode = useColorMode({
  emitAuto: true,
  selector: 'html',
  attribute: 'class',
  storageKey: 'pegasus-theme',
})

const toggleTheme = () => {
  if (mode.value === 'auto') {
    mode.value = 'light'
  } else if (mode.value === 'light') {
    mode.value = 'dark'
  } else {
    mode.value = 'auto'
  }
}

const currentIcon = computed(() => {
  if (mode.value === 'auto') return 'monitor'
  if (mode.value === 'dark') return 'moon'
  return 'sun'
})

// Close dropdown when clicking outside
const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showDropdown.value = false
  }
}

const checkSubscription = async () => {
  if (user.value) {
    try {
      const status = (await getSubscriptionStatus()) as any
      isPro.value = status.tier === 'pro'
    } catch (e) {
      console.error('Failed to check subscription', e)
    }
  } else {
    isPro.value = false
  }
}

onMounted(async () => {
  await fetchUser()
  await checkSubscription()
  document.addEventListener('click', handleClickOutside)
})

// Re-check subscription when user changes
watch(user, () => {
  checkSubscription()
})

// Close drawer on route change
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  }
)

// Lock body scroll when drawer is open
watch(mobileOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}
.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(105%);
}
.slide-enter-to,
.slide-leave-from {
  transform: translateX(0);
}
</style>
