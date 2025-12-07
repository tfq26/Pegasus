<template>
  <div class="relative flex min-h-full w-full flex-col items-center justify-center overflow-hidden bg-background text-foreground py-6">
    <!-- Stars Background -->
    <StarsBackground
      class="absolute inset-0"
      :factor="0.05"
      :speed="50"
      star-color="#7c3aed"
    />

    <div class="z-10 w-full flex flex-col items-center justify-between gap-10 px-6">
      <!-- Hero Section -->
      <div class="flex flex-col items-center text-center space-y-6">
        <h1 class="text-4xl font-extrabold text-foreground tracking-tight leading-tight">
          Data that reaches<br />
          <span class="text-primary">new heights</span>
        </h1>
        <p class="text-muted-foreground text-base max-w-sm leading-relaxed">
          Pegasus is the next generation of data management — security, insight, and AI in one workspace.
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col w-full max-w-xs gap-3">
          <RouterLink
            to="/about"
            class="w-full px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-xl text-secondary-foreground font-medium text-center border border-border transition"
          >
            Learn More
          </RouterLink>
          <div class="text-xs text-muted-foreground text-center mt-2">
            Use desktop for full dashboard access
          </div>
        </div>
      </div>

      <!-- Quick Actions Grid (Simplified) -->
      <div class="w-full grid grid-cols-1 gap-4">
        <div
          v-for="action in quickActions"
          :key="action.title"
          class="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50"
        >
          <div class="p-3 rounded-full bg-primary/10 text-primary shrink-0">
            <component :is="action.icon" class="w-5 h-5" />
          </div>
          <div class="text-left">
            <h3 class="font-medium text-foreground text-sm">{{ action.title }}</h3>
            <p class="text-muted-foreground text-xs">{{ action.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'
import StarsBackground from '@/components/ui/bg-stars/StarsBackground.vue'
import { MessageSquare, Database, LayoutDashboard, Activity } from 'lucide-vue-next'

defineOptions({ name: 'MobileHome' })

const { user } = useAuth()

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
    description: 'Visualize data instantly',
    icon: LayoutDashboard
  },
  {
    title: 'Real-time Monitoring',
    description: 'Bring your own data sources',
    icon: Activity
  }
]
</script>
