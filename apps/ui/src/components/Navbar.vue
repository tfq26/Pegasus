<template>
  <nav
    class="w-full border-b border-stone-800 bg-stone-950/90 backdrop-blur-md text-stone-100 shadow-md shadow-black/20 fixed top-0 z-50"
  >
    <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
      <!-- Left: Logo -->
      <RouterLink to="/" class="flex items-center gap-3 group">
        <img
          src="/pegasus-white.svg"
          alt="Pegasus Logo"
          class="h-8 w-8 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110"
        />
        <span
          class="text-lg font-semibold tracking-wide text-violet-400 group-hover:text-violet-300 transition-colors"
        >
          Pegasus
        </span>
      </RouterLink>

      <!-- Center: Desktop Links -->
      <div class="hidden md:flex items-center gap-8">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="relative text-sm font-medium text-stone-300 transition-all duration-200 hover:text-violet-400"
          active-class="text-violet-400 font-semibold"
        >
          {{ link.label }}
          <span
            class="absolute left-0 -bottom-1 h-0.5 w-0 bg-violet-500 opacity-0 transition-all duration-300"
          ></span>
        </RouterLink>
      </div>

      <!-- Right: Mobile Toggle + Profile -->
      <div class="flex items-center gap-4">
        <!-- Mobile Toggle -->
        <button
          @click="mobileOpen = true"
          class="md:hidden text-stone-300 hover:text-violet-400 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <!-- Profile -->
        <div ref="dropdownRef" class="relative">
          <!-- Loading State -->
          <div v-if="isLoading" class="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-900 px-3 py-1">
            <div class="h-7 w-7 rounded-full bg-stone-800 animate-pulse"></div>
            <div class="hidden sm:block h-4 w-16 bg-stone-800 rounded animate-pulse"></div>
          </div>

          <!-- Not Logged In -->
          <RouterLink
            v-else-if="!user"
            to="/login"
            class="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-900 px-3 py-1 text-sm text-stone-300 hover:border-violet-500 hover:text-violet-400 transition-all"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span class="hidden sm:inline font-medium">Login</span>
          </RouterLink>

          <!-- Logged In -->
          <button
            v-else
            @click="toggleDropdown"
            class="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-900 px-3 py-1 text-sm text-stone-300 hover:border-violet-500 hover:text-violet-400 transition-all"
          >
            <img
              :src="user.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${user.email}`"
              alt="Profile"
              class="h-7 w-7 rounded-full border border-stone-700 object-cover"
            />
            <span class="hidden sm:inline font-medium">{{ user.firstName || 'User' }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
              stroke-width="1.5" stroke="currentColor" class="h-4 w-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <!-- Dropdown -->
          <transition name="fade">
            <div
              v-if="showDropdown && user"
              class="absolute right-0 top-12 w-48 rounded-xl border border-stone-700 bg-stone-900 shadow-lg shadow-black/30 py-2 z-50"
            >
              <RouterLink
                to="/profile"
                class="block w-full text-left px-4 py-2 text-sm text-stone-300 hover:bg-stone-800 hover:text-violet-400 transition"
                @click="showDropdown = false"
              >
                View Profile
              </RouterLink>
              <RouterLink
                to="/settings"
                class="block w-full text-left px-4 py-2 text-sm text-stone-300 hover:bg-stone-800 hover:text-violet-400 transition"
                @click="showDropdown = false"
              >
                Settings
              </RouterLink>
              <button
                @click="handleLogout"
                class="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-stone-800 transition"
              >
                Logout
              </button>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- Backdrop -->
    <transition name="fade">
      <div
        v-if="mobileOpen"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        @click="mobileOpen = false"
      ></div>
    </transition>

    <!-- Drawer -->
    <transition name="slide">
      <aside
        v-if="mobileOpen"
        class="fixed top-0 left-0 z-50 h-full w-64 bg-stone-950 border-r border-stone-800 p-6 flex flex-col gap-6 shadow-lg shadow-black/40"
      >
        <div class="flex items-center justify-between mb-4">
          <span class="text-lg font-semibold text-violet-400">Pegasus</span>
          <button @click="mobileOpen = false" class="text-stone-400 hover:text-violet-400">
            ✕
          </button>
        </div>

        <div class="flex flex-col gap-4">
          <RouterLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="text-sm font-medium text-stone-300 hover:text-violet-400 transition"
            active-class="text-violet-400 font-semibold"
            @click="mobileOpen = false"
          >
            {{ link.label }}
          </RouterLink>
        </div>

        <div class="mt-auto border-t border-stone-800 pt-4">
          <RouterLink
            to="/settings"
            class="block text-sm text-stone-400 hover:text-violet-400 transition"
          >
            Settings
          </RouterLink>
          <button
            @click="handleLogout"
            class="w-full text-left text-sm text-red-400 hover:text-red-300 transition"
          >
            Logout
          </button>
        </div>
      </aside>
    </transition>
  </nav>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useAuth } from '@/composables/useAuth'

defineOptions({ name: 'AppNavbar' })

const { user, isLoading, fetchUser, logout } = useAuth()

const links = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/query', label: 'Query' },
]

const showDropdown = ref(false)
const mobileOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const toggleDropdown = () => (showDropdown.value = !showDropdown.value)

const handleLogout = () => {
  showDropdown.value = false
  mobileOpen.value = false
  logout()
}

// Close dropdown when clicking outside
const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showDropdown.value = false
  }
}

onMounted(() => {
  fetchUser()
  document.addEventListener('click', handleClickOutside)
})
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))
</script>

<style scoped>
a.router-link-active span,
a:hover span {
  width: 100%;
  opacity: 1;
}
.fade-enter-active,
.fade-leave-active {
  transition: all 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}
.slide-enter-from {
  transform: translateX(-100%);
}
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
