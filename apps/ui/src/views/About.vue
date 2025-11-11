<template>
  <section
    class="w-full h-full overflow-y-auto px-6 py-16 text-center  text-stone-100"
  >
    <transition name="fade-slide" appear>
      <div class="max-w-3xl mx-auto">
        <!-- Logo & Title -->
        <div class="flex flex-col items-center mb-10 space-y-4">
          <div
            class="w-16 h-16 flex items-center justify-center rounded-2xl bg-violet-500/20 text-violet-400 text-4xl font-bold shadow-lg shadow-violet-500/20"
          >
            <img
              src="/pegasus-white.svg"
              alt="Pegasus Logo"
              class="w-10 h-10 animate-float"
            />
          </div>
          <h1
            class="text-4xl font-bold text-violet-400 tracking-wide drop-shadow-[0_0_15px_rgba(139,92,246,0.25)]"
          >
            About Pegasus
          </h1>
        </div>

        <!-- Description -->
        <p class="text-stone-300 leading-relaxed mb-6">
          <strong>Pegasus</strong> is an intelligent cloud management and insight platform
          designed to help developers, engineers, and organizations interact with their
          data and infrastructure faster, smarter, and more intuitively.
        </p>

        <p class="text-stone-400 leading-relaxed mb-10">
          Inspired by the workflow of SQL Server Management Studio (SMSS) and enhanced
          through modern cloud architecture, Pegasus bridges performance, awareness, and
          intelligence in one unified workspace. It enables resource visualization,
          database exploration, log inspection, and real-time monitoring—all inside a fast,
          responsive, and AI-powered interface.
        </p>

        <!-- Feature Highlights -->
        <div class="grid sm:grid-cols-2 gap-6 text-left">
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="group p-5 rounded-xl bg-stone-900 hover:bg-stone-800/70 transition-all duration-300 hover:translate-y-[-2px] border border-stone-800/70 hover:border-violet-500/30"
          >
            <h3
              class="text-violet-400 font-semibold mb-2 group-hover:translate-x-1 transition-transform"
            >
              {{ feature.title }}
            </h3>
            <p class="text-stone-400 text-sm leading-relaxed">
              {{ feature.description }}
            </p>
          </div>
        </div>

        <!-- Footer Quote -->
        <div class="mt-16 border-t border-stone-800 pt-6 text-stone-500 italic text-sm">
          “Pegasus brings together the power of data, AI, and cloud to make system
          management effortless.”
        </div>

        <!-- Attribution -->
        <p class="mt-4 text-xs text-stone-500">
          <a
            href="https://iconscout.com/icons/pegasus"
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:text-violet-400"
          >
            Pegasus
          </a>
          icon by
          <a
            href="https://iconscout.com/contributors/mark-aventura"
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:text-violet-400"
          >
            IconMark
          </a>
          on
          <a
            href="https://iconscout.com"
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:text-violet-400"
          >
            IconScout
          </a>
        </p>
      </div>
    </transition>
  </section>
</template>

<script setup lang="ts">
defineOptions({ name: 'AboutView' })

const features = [
  {
    title: '⚡ Unified Cloud Insight',
    description:
      'Connect, visualize, and control distributed systems from a single, intuitive interface.'
  },
  {
    title: '🤖 AI-Powered Assistance',
    description:
      'Context-aware suggestions and automation make debugging and optimization effortless.'
  },
  {
    title: '🧩 Modular Architecture',
    description:
      'Each component of Pegasus—UI, API, and AI engine—is independently scalable and built for flexibility.'
  },
  {
    title: '🛰️ Real-Time Monitoring',
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
