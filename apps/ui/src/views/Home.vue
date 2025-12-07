<template>
  <div
    class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-foreground"
  >
    <StarsBackground
      class="absolute inset-0"
      :factor="0.05"
      :speed="50"
      star-color="#7c3aed"
    />
    <div class="z-10 w-full flex flex-col justify-between h-full">
      <div
        class="flex flex-col items-center justify-center grow text-center px-10 select-none"
      >

        <h1
          class="text-5xl font-extrabold mb-4 text-black dark:text-white tracking-wide drop-shadow-sm animate-fadeInUp"
          style="animation-delay: 0.2s"
        >
          Data that reaches new heights
        </h1>
        <p
          class="text-primary text-lg max-w-2xl mb-10 leading-relaxed animate-fadeInUp"
          style="animation-delay: 0.3s"
        >
          Pegasus is the next generation of data management — where security, insight, and AI
          converge into one seamless, collaborative workspace.
        </p>

        <div class="flex gap-4 animate-fadeInUp" style="animation-delay: 0.4s">
          <RouterLink
            to="/dashboard"
            class="px-6 py-3 bg-primary rounded-xl hover:bg-primary/90 text-primary-foreground font-medium text-sm tracking-wide shadow-md shadow-primary/20 transition"
          >
            Open Dashboard
          </RouterLink>
          <RouterLink
            to="/query"
            class="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-xl text-secondary-foreground font-medium text-sm border border-border transition"
          >
            Query Pegasus →
          </RouterLink>
        </div>
      </div>

      <div
        class="w-full max-w-5xl mx-auto px-6 pb-12 grid grid-cols-2 md:grid-cols-4 gap-8 animate-fadeInUp"
        style="animation-delay: 0.5s"
      >
        <div
          v-for="(action, index) in quickActions"
          :key="action.title"
          class="group flex flex-col items-center text-center gap-3 p-4 rounded-xl hover:bg-white/5 transition-all duration-300 cursor-pointer"
          :style="`animation-delay: ${0.6 + index * 0.1}s`"
        >
          <div
            class="p-3 rounded-full bg-primary/10 text-primary group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300"
          >
            <component :is="action.icon" class="w-5 h-5" />
          </div>
          <div>
            <h3 class="font-medium text-foreground text-sm">{{ action.title }}</h3>
            <p class="text-muted-foreground text-xs mt-1">
              {{ action.description }}
            </p>
          </div>
        </div>
      </div>

      <footer class="py-6 text-center text-muted-foreground text-xs border-t border-border bg-background animate-fadeInUp" style="animation-delay: 1s">
        <div class="flex items-center justify-center gap-4 mb-2">
          <RouterLink to="/about" class="hover:text-primary transition-colors">About</RouterLink>
          <span>•</span>
          <RouterLink to="/support" class="hover:text-primary transition-colors">Support</RouterLink>
        </div>
        <p>© {{ new Date().getFullYear() }} Pegasus — Intelligent Cloud Insight Platform</p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
// Ensure the StarsBackground component is correctly imported
import StarsBackground from '@/components/ui/bg-stars/StarsBackground.vue' 
defineOptions({ name: 'HomePage' })

import { MessageSquare, Database, LayoutDashboard, Activity } from 'lucide-vue-next'

const quickActions = [
  {
    title: 'Natural Language Querying',
    description: 'Ask questions in plain English',
    icon: MessageSquare
  },
  {
    title: 'Visual Data Explorer',
    description: 'Browse tables and schemas',
    icon: Database
  },
  {
    title: 'Interactive Dashboards',
    description: 'Visualize data with drag-and-drop',
    icon: LayoutDashboard
  },
  {
    title: 'BYOD',
    description: 'Bring your own data sources',
    icon: Activity
  }
]
</script>

<style scoped>
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeInUp {
  opacity: 0;
  animation: fadeInUp 0.8s ease-out forwards;
}
</style>