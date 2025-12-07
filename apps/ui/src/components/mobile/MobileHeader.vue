<template>
  <header class="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
    <div class="flex h-14 items-center justify-between px-4">
      <!-- Logo & Title -->
      <RouterLink to="/" class="flex items-center gap-2">
        <img src="/pegasus-purple.svg" alt="Pegasus" class="h-8 w-8 dark:invert-0 invert" />
      </RouterLink>

      <!-- Hamburger Menu Button -->
      <button
        @click="toggleMenu"
        class="p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Menu"
      >
        <svg class="w-6 h-6 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  </header>

  <!-- Slide-out Menu Overlay -->
  <transition name="fade">
    <div
      v-if="isMenuOpen"
      class="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
      @click="closeMenu"
    ></div>
  </transition>

  <!-- Slide-out Menu Drawer -->
  <transition name="slide">
    <div
      v-if="isMenuOpen"
      class="fixed top-0 right-0 bottom-0 w-72 bg-background border-l border-border z-50 shadow-2xl"
      @click.stop
    >
      <div class="flex flex-col h-full">
        <!-- Menu Header -->
        <div class="flex items-center justify-between p-4 border-b border-border">
          <h2 class="text-lg font-bold text-foreground">Menu</h2>
          <button
            @click="closeMenu"
            class="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close menu"
          >
            <svg class="w-6 h-6 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Navigation Links -->
        <nav class="flex-1 overflow-y-auto p-4 space-y-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            @click="closeMenu"
            class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-muted"
            active-class="bg-primary/10 text-primary font-semibold"
          >
            <component :is="item.icon" class="w-5 h-5" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <!-- User Section -->
        <div class="border-t border-border p-4 space-y-1">
          <RouterLink
            v-if="user"
            to="/profile"
            @click="closeMenu"
            class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-muted"
          >
            <User class="w-5 h-5" />
            <span>Profile</span>
          </RouterLink>
          <button
            v-if="user"
            @click="handleLogout"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-destructive/10 text-destructive"
          >
            <LogOut class="w-5 h-5" />
            <span>Logout</span>
          </button>
          <RouterLink
            v-else
            to="/login"
            @click="closeMenu"
            class="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold"
          >
            <LogIn class="w-5 h-5" />
            <span>Login</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { Home, Info, Sparkles, MessageSquare, User, LogOut, LogIn } from 'lucide-vue-next'

defineOptions({ name: 'MobileHeader' })

const { user, logout } = useAuth()
const isMenuOpen = ref(false)

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/about', label: 'About', icon: Info },
  { to: '/releases', label: 'Releases', icon: Sparkles },
  { to: '/feedback', label: 'Feedback', icon: MessageSquare },
]

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const closeMenu = () => {
  isMenuOpen.value = false
}

const handleLogout = () => {
  closeMenu()
  logout()
}
</script>

<style scoped>
/* Fade transition for overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide transition for drawer */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
