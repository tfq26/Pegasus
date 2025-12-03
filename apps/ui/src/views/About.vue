<template>
  <div class="w-full min-h-full bg-background">
    <div class="max-w-5xl mx-auto p-6 sm:p-10 space-y-8">
      
      <!-- Hero Card with Black Hole -->
      <transition name="fade-slide" appear>
        <div class="relative w-full h-[400px] rounded-3xl overflow-hidden shadow-2xl border border-border/50 bg-black/5 dark:bg-black/20">
          <BlackHoleBackground class="absolute inset-0">
            <div class="relative z-10 h-full flex flex-col items-center justify-center text-center p-6">
              <div
                class="w-24 h-24 mb-6 flex items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-lg shadow-primary/20 backdrop-blur-sm ring-1 ring-primary/20"
              >
                <img
                  src="/pegasus-white.svg"
                  alt="Pegasus Logo"
                  class="w-12 h-12 animate-float dark:invert-0 invert"
                />
              </div>
              
              <h1 class="text-4xl md:text-6xl font-bold text-foreground tracking-tight mb-4 drop-shadow-md">
                Pegasus
              </h1>
              <p class="text-lg md:text-xl text-muted-foreground font-medium max-w-xl mx-auto">
                Intelligent Cloud Insight Platform
              </p>
            </div>
          </BlackHoleBackground>
        </div>
      </transition>

      <!-- Main Content -->
      <transition name="fade-slide" appear>
        <div class="max-w-4xl mx-auto space-y-12 px-4" style="transition-delay: 100ms">
          <!-- Mission Statement -->
          <div class="text-center space-y-6">
            <p class="text-xl text-foreground font-medium leading-relaxed">
              The next generation of data management — where security, insight, and AI
              converge into one seamless, collaborative workspace.
            </p>
            <p class="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Inspired by the workflow of SQL Server Management Studio (SMSS) and enhanced
              through modern cloud architecture, Pegasus bridges performance, awareness, and
              intelligence. It enables resource visualization, database exploration, log inspection, 
              and real-time monitoring—all inside a fast, responsive, and AI-powered interface.
            </p>
          </div>

          <!-- Features Grid -->
          <div class="grid md:grid-cols-2 gap-6">
            <div
              v-for="(feature, index) in features"
              :key="index"
              class="group p-6 rounded-2xl bg-card hover:bg-accent/50 border border-border hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <div class="flex items-start gap-4">
                <div class="p-3 rounded-xl bg-primary/10 text-2xl shrink-0 group-hover:scale-110 transition-transform duration-300">
                  {{ feature.icon }}
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {{ feature.title }}
                  </h3>
                  <p class="text-muted-foreground text-sm leading-relaxed">
                    {{ feature.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-border pt-8 text-center space-y-4">
            <p class="text-lg text-muted-foreground italic font-serif">
              “Making system management effortless through data, AI, and cloud.”
            </p>
            
            <div class="flex items-center justify-center gap-1 text-xs text-muted-foreground/60">
              <span>Icon by</span>
              <a
                href="https://iconscout.com/contributors/mark-aventura"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-primary underline decoration-dotted"
              >
                IconMark
              </a>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import BlackHoleBackground from '@/components/ui/bg-black-hole/BlackHoleBackground.vue'
defineOptions({ name: 'AboutView' })

const features = [
  {
    icon: '⚡',
    title: 'Unified Cloud Insight',
    description:
      'Connect, visualize, and control distributed systems from a single, intuitive interface.'
  },
  {
    icon: '🤖',
    title: 'AI-Powered Assistance',
    description:
      'Context-aware suggestions and automation make debugging and optimization effortless.'
  },
  {
    icon: '🧩',
    title: 'Modular Architecture',
    description:
      'Each component of Pegasus—UI, API, and AI engine—is independently scalable and built for flexibility.'
  },
  {
    icon: '🛰️',
    title: 'Real-Time Monitoring',
    description:
      'Observe live metrics, logs, and system health with dynamic visual feedback and intelligent alerting.'
  }
]
</script>

<style scoped>
/* Fade + Slide entrance */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.6s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(30px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-30px);
}

/* Floating animation for logo */
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
.animate-float {
  animation: float 3s ease-in-out infinite;
}
</style>
