<template>
  <section
    class="w-full h-full flex flex-col justify-between text-stone-100 overflow-hidden"
  >
    <!-- Hero Section -->
    <div
      class="flex flex-col items-center justify-center flex-grow text-center px-10 select-none"
    >
      <div
        class="w-20 h-20 mb-6 flex items-center justify-center rounded-2xl bg-violet-600/20 text-violet-400 shadow-lg shadow-violet-500/20"
      >
        <img src="/pegasus-white.svg" alt="Pegasus Logo" class="w-10 h-10" />
      </div>

      <h1
        class="text-5xl font-extrabold mb-4 text-violet-400 tracking-wide drop-shadow-[0_0_20px_rgba(139,92,246,0.25)]"
      >
        Pegasus
      </h1>
      <p
        class="text-stone-400 text-lg max-w-2xl mb-10 leading-relaxed animate-fadeIn"
      >
        The next generation of data management — where security, insight, and AI
        converge into one seamless, collaborative workspace.
      </p>

      <div class="flex gap-4">
        <RouterLink
          to="/dashboard"
          class="px-6 py-3 bg-violet-600 rounded-xl hover:bg-violet-500 text-white font-medium text-sm tracking-wide shadow-md shadow-violet-600/20 transition"
        >
          Open Dashboard
        </RouterLink>
        <RouterLink
          to="/chat"
          class="px-6 py-3 bg-stone-800 hover:bg-stone-700 rounded-xl text-stone-200 font-medium text-sm border border-stone-700 transition"
        >
          Query Pegasus →
        </RouterLink>
      </div>
    </div>

    <!-- Quick Actions / Highlights -->
    <div
      class="bg-stone-950/80 backdrop-blur-md py-10 px-20 grid grid-cols-4 gap-8"
    >
      <div
        v-for="action in quickActions"
        :key="action.title"
        class="group flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-stone-800 bg-stone-900 hover:bg-stone-800/70 hover:border-violet-500/30 transition-all duration-300 cursor-pointer"
      >
        <div
          class="text-3xl mb-3 text-violet-400 group-hover:scale-110 transition-transform"
        >
          {{ action.icon }}
        </div>
        <h3 class="font-semibold text-violet-400 mb-2">{{ action.title }}</h3>
        <p class="text-stone-400 text-sm leading-relaxed">
          {{ action.description }}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <footer class="py-4 text-center text-stone-600 text-xs border-t border-stone-800">
      © {{ new Date().getFullYear() }} Pegasus — Intelligent Cloud Insight Platform
    </footer>
  </section>
</template>

<script setup lang="ts">
defineOptions({ name: 'HomePage' })

const quickActions = [
  {
    title: 'Chat with Pegasus',
    description: 'Ask AI for insights, guidance, and system intelligence.',
    icon: '💬'
  },
  {
    title: 'View Data',
    description: 'Explore databases, schemas, and performance metrics.',
    icon: '🗄️'
  },
  {
    title: 'Run Queries',
    description: 'Execute intelligent queries with AI-assisted suggestions.',
    icon: '⚙️'
  },
  {
    title: 'System Monitor',
    description: 'Track resource utilization, health, and runtime logs.',
    icon: '📊'
  }
]
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.8s ease-out forwards;
}
</style>
