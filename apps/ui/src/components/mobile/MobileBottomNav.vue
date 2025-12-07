<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-lg pb-safe">
    <div class="flex items-center justify-around h-16 px-2">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center justify-center w-full h-full gap-1 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        active-class="text-primary font-medium"
      >
        <component 
          :is="item.icon" 
          class="w-6 h-6"
          :class="{ 'stroke-[2.5px]': isActive(item.to) }" 
        />
        <span class="text-[10px]">{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Home, Info, Sparkles, MessageSquare, User } from 'lucide-vue-next'

defineOptions({ name: 'MobileBottomNav' })

const route = useRoute()

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/about', label: 'About', icon: Info },
  { to: '/releases', label: 'Releases', icon: Sparkles },
  { to: '/feedback', label: 'Feedback', icon: MessageSquare },
  { to: '/profile', label: 'Profile', icon: User },
]

const isActive = (path: string) => route.path === path
</script>

<style scoped>
/* Safe area padding for iPhone X+ */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
