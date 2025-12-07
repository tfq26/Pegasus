<template>
  <div class="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
    <!-- Header -->
    <div class="p-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img src="/pegasus-white.svg" alt="Pegasus" class="w-10 h-10 dark:invert-0 invert" />
          <div>
            <h1 class="text-xl font-bold text-foreground">Pegasus</h1>
            <p class="text-xs text-muted-foreground">AI-Powered Data Platform</p>
          </div>
        </div>
        <button
          v-if="user"
          @click="showMenu = !showMenu"
          class="p-2 rounded-lg hover:bg-muted transition"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Feature Showcase -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Hero Section -->
      <div class="text-center py-8 px-4">
        <h2 class="text-3xl font-bold text-foreground mb-3">
          AI-Powered<br />Data Analysis
        </h2>
        <p class="text-muted-foreground text-sm max-w-sm mx-auto">
          Query databases, generate formulas, and build dashboards with natural language
        </p>
      </div>

      <!-- Feature Cards -->
      <div class="space-y-3">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="p-5 rounded-xl border border-border bg-card hover:border-primary/50 transition-all"
        >
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-primary/10 shrink-0">
              <component :is="feature.icon" class="w-6 h-6 text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-foreground mb-1">{{ feature.title }}</h3>
              <p class="text-sm text-muted-foreground mb-3">{{ feature.description }}</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="tag in feature.tags"
                  :key="tag"
                  class="px-2 py-1 rounded-full text-xs bg-muted text-muted-foreground"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Screenshots Placeholder -->
      <div class="p-6 rounded-xl border border-border bg-card/50">
        <h3 class="font-semibold text-foreground mb-3 text-center">Desktop Experience</h3>
        <div class="aspect-video rounded-lg bg-muted flex items-center justify-center">
          <div class="text-center">
            <svg class="w-12 h-12 text-muted-foreground mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p class="text-sm text-muted-foreground">Multi-tab workspace</p>
          </div>
        </div>
      </div>

      <!-- CTA Section -->
      <div class="p-6 rounded-xl bg-primary/10 border border-primary/20 text-center">
        <h3 class="font-bold text-foreground mb-2">Ready for the Full Experience?</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Access all features including dashboards, query editor, and Excel-like spreadsheets
        </p>
        <div class="flex flex-col gap-2">
          <a
            href="mailto:?subject=Pegasus Desktop Link&body=Open this link on your desktop computer to access Pegasus"
            class="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm"
          >
            Email Desktop Link
          </a>
          <button
            @click="copyDesktopLink"
            class="px-4 py-2 rounded-lg border border-border bg-background text-foreground font-medium text-sm"
          >
            {{ copied ? 'Link Copied!' : 'Copy Link' }}
          </button>
        </div>
      </div>

      <!-- Limited Features Notice -->
      <div class="p-4 rounded-lg bg-muted/50 text-center">
        <p class="text-xs text-muted-foreground">
          Some features are hidden on mobile for optimal experience
        </p>
      </div>
    </div>

    <!-- Simple Menu Overlay -->
    <transition name="fade">
      <div
        v-if="showMenu"
        class="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 p-6"
        @click="showMenu = false"
      >
        <div class="flex flex-col h-full">
          <div class="flex items-center justify-between mb-8">
            <h2 class="text-xl font-bold text-foreground">Menu</h2>
            <button class="p-2 rounded-lg hover:bg-muted">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav class="space-y-2 flex-1">
            <RouterLink
              to="/"
              class="block p-3 rounded-lg hover:bg-muted transition"
              @click="showMenu = false"
            >
              <span class="font-medium">Home</span>
            </RouterLink>
            <RouterLink
              to="/about"
              class="block p-3 rounded-lg hover:bg-muted transition"
              @click="showMenu = false"
            >
              <span class="font-medium">About</span>
            </RouterLink>
            <RouterLink
              to="/support"
              class="block p-3 rounded-lg hover:bg-muted transition"
              @click="showMenu = false"
            >
              <span class="font-medium">Support</span>
            </RouterLink>
          </nav>

          <div class="border-t border-border pt-4 space-y-2">
            <RouterLink
              v-if="user"
              to="/profile"
              class="block p-3 rounded-lg hover:bg-muted transition"
              @click="showMenu = false"
            >
              <span class="font-medium">Profile</span>
            </RouterLink>
            <button
              v-if="user"
              @click="handleLogout"
              class="w-full text-left p-3 rounded-lg hover:bg-destructive/10 text-destructive transition"
            >
              <span class="font-medium">Logout</span>
            </button>
            <RouterLink
              v-else
              to="/login"
              class="block p-3 rounded-lg bg-primary text-primary-foreground text-center"
              @click="showMenu = false"
            >
              <span class="font-medium">Login</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { toast } from 'vue-sonner'
import { Database, Sparkles, BarChart3, Table2, MessageSquare, Zap } from 'lucide-vue-next'

defineOptions({ name: 'MobileShowcase' })

const { user, logout } = useAuth()
const showMenu = ref(false)
const copied = ref(false)

const features = [
  {
    icon: MessageSquare,
    title: 'Natural Language Queries',
    description: 'Ask questions in plain English and get SQL queries generated automatically',
    tags: ['AI-Powered', 'Easy to Use']
  },
  {
    icon: Table2,
    title: 'Excel-like Spreadsheets',
    description: 'Work with data in familiar spreadsheet interface with 50+ Excel functions',
    tags: ['Formulas', 'Point & Click']
  },
  {
    icon: Sparkles,
    title: 'AI Formula Generation',
    description: 'Describe what you want to calculate and AI creates the formula for you',
    tags: ['Smart', 'Time-Saving']
  },
  {
    icon: Database,
    title: 'Multi-Database Support',
    description: 'Connect to MySQL, PostgreSQL, MongoDB, Kusto, and more',
    tags: ['Flexible', 'Powerful']
  },
  {
    icon: BarChart3,
    title: 'Interactive Dashboards',
    description: 'Build beautiful dashboards with drag-and-drop visualizations',
    tags: ['Visual', 'Shareable']
  },
  {
    icon: Zap,
    title: 'Real-time Collaboration',
    description: 'Share queries, formulas, and dashboards with your team',
    tags: ['Team', 'Productive']
  }
]

const copyDesktopLink = async () => {
  try {
    await navigator.clipboard.writeText(window.location.origin)
    copied.value = true
    toast.success('Link copied to clipboard!')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    toast.error('Failed to copy link')
  }
}

const handleLogout = () => {
  showMenu.value = false
  logout()
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
