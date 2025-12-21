<template>
  <div class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-foreground">
    <StarsBackground
      class="absolute inset-0"
      :factor="0.05"
      :speed="50"
      star-color="#7c3aed"
    />
    
    <!-- Mobile Home View -->
    <div v-if="isPhone" class="z-10 w-full flex flex-col min-h-full overflow-y-auto px-6 py-12 space-y-12">
      <!-- Hero Section -->
      <div class="flex flex-col items-center text-center space-y-4 pt-4">
        <h1 class="text-4xl font-extrabold tracking-tight text-white animate-fadeInUp">
          Pegasus
        </h1>
        <p class="text-primary text-sm max-w-xs leading-relaxed animate-fadeInUp" style="animation-delay: 0.1s">
          The next generation of high-density data management, now optimized for your informational access.
        </p>
      </div>

      <!-- Quick Actions Grid (Condensed) -->
      <div class="grid grid-cols-2 gap-4 animate-fadeInUp" style="animation-delay: 0.2s">
        <div
          v-for="action in quickActions"
          :key="action.title"
          class="flex flex-col items-center text-center p-4 rounded-sm border border-border bg-black/20 backdrop-blur-sm"
        >
          <div class="p-2 rounded-md bg-primary/10 text-primary mb-2">
            <component :is="action.icon" class="w-4 h-4" />
          </div>
          <h3 class="text-[10px] font-bold uppercase tracking-widest text-foreground">{{ action.title }}</h3>
        </div>
      </div>

      <!-- Desktop Handoff Tool -->
      <div class="w-full space-y-8 animate-fadeInUp" style="animation-delay: 0.3s">
        <!-- QR Code -->
        <div class="flex flex-col items-center gap-4">
          <div class="p-2 bg-white rounded-md shadow-sm border border-border">
            <img :src="qrCodeUrl" alt="QR Code" class="w-20 h-20" />
          </div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scan to scale up to Desktop</p>
        </div>

        <!-- Share Actions -->
        <div class="flex flex-col gap-2">
          <button
            @click="handleShare"
            class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-sm bg-primary text-primary-foreground font-bold text-[10px] uppercase tracking-widest transition-all hover:opacity-90"
          >
            <Share2 class="w-4 h-4" />
            Share Workspace
          </button>
          <a
            :href="emailLink"
            class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-sm border border-border bg-black/40 text-foreground font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-black/60"
          >
            <Mail class="w-4 h-4" />
            Email Desktop Link
          </a>
        </div>
      </div>
    </div>

    <!-- Tablet/Desktop View -->
    <div v-else class="z-10 w-full flex flex-col justify-between h-full">
      <div class="flex flex-col items-center justify-center grow text-center px-10 select-none">
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
            class="p-3 rounded-lg bg-primary/10 text-primary group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300"
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

      <AppFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import StarsBackground from '@/components/ui/bg-stars/StarsBackground.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useMobileDetection } from '@/composables/useMobileDetection'
import { toast } from 'vue-sonner'
import { 
  MessageSquare, 
  Database, 
  LayoutDashboard, 
  Activity,
  Share2,
  Mail
} from 'lucide-vue-next'

defineOptions({ name: 'HomePage' })

const { isPhone } = useMobileDetection()

const siteUrl = window.location.origin
const qrCodeUrl = computed(() => `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(siteUrl)}`)
const emailLink = computed(() => `mailto:?subject=Pegasus Desktop Access&body=Open this link on your computer to access the Pegasus workspace: ${siteUrl}`)

const quickActions = [
  {
    title: 'Natural Query',
    description: 'Ask questions in plain English',
    icon: MessageSquare
  },
  {
    title: 'Visual Explorer',
    description: 'Browse tables and schemas',
    icon: Database
  },
  {
    title: 'Interactive Viz',
    description: 'Visualize data with drag-and-drop',
    icon: LayoutDashboard
  },
  {
    title: 'BYOD',
    description: 'Bring your own data sources',
    icon: Activity
  }
]

const handleShare = async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Pegasus Workspace',
        text: 'Access the Pegasus data platform from your desktop.',
        url: siteUrl
      })
      toast.success('Successfully shared!')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast.error('Failed to share')
      }
    }
  } else {
    try {
      await navigator.clipboard.writeText(siteUrl)
      toast.success('Link copied to clipboard')
    } catch (err) {
      toast.error('Link copy failed')
    }
  }
}
</script>

<style scoped>
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeInUp {
  opacity: 0;
  animation: fadeInUp 0.6s ease-out forwards;
}
</style>