<template>
  <div class="w-full min-h-screen bg-background pb-10">
    <!-- Hero Image Area -->
    <div class="relative w-full h-64 overflow-hidden">
      <!-- Black Hole Background -->
      <BlackHoleBackground class="absolute inset-0" />
      
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-10">
        <h1 class="text-3xl font-bold text-white tracking-tight mb-2 drop-shadow-md">
          Pegasus
        </h1>
        <p class="text-base text-white/90 font-medium max-w-xs mx-auto">
          Insight with Intelligence and Ease.
        </p>
      </div>
    </div>

    <!-- Content -->
    <div class="px-6 -mt-6 relative z-20 space-y-8">
      <!-- Mission Card -->
      <div class="bg-card border border-border rounded-xl p-6 shadow-lg">
        <p class="text-base text-foreground font-medium leading-relaxed mb-4">
          The next generation of data management.
        </p>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Inspired by SSMS and enhanced with modern AI, Pegasus bridges performance and intelligence in a unified workspace.
        </p>
      </div>

      <!-- Features List (Stacked Accordions) -->
      <div>
        <h2 class="text-xl font-bold text-foreground mb-4">Key Features</h2>
        <div class="space-y-3">
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="rounded-xl border border-border bg-card overflow-hidden"
          >
            <button
              @click="toggleFeature(index)"
              class="w-full flex items-center justify-between p-4 text-left"
            >
              <div class="flex items-center gap-3">
                <component :is="feature.icon" class="w-5 h-5 text-primary" />
                <span class="font-semibold text-foreground text-sm">{{ feature.title }}</span>
              </div>
              <svg 
                class="w-4 h-4 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': expandedFeature === index }"
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div v-show="expandedFeature === index" class="px-4 pb-4 pt-0 text-sm text-muted-foreground border-t border-border/50 bg-muted/20">
              <p class="mt-3 mb-3">{{ feature.description }}</p>
              <ul class="space-y-2 pl-2">
                <li v-for="(detail, i) in feature.details" :key="i" class="flex gap-2 text-xs">
                  <span class="text-primary">•</span>
                  <span>{{ detail.subtitle }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { MessageSquare, LayoutDashboard, Database, Activity } from 'lucide-vue-next'
import BlackHoleBackground from '@/components/ui/bg-black-hole/BlackHoleBackground.vue'


defineOptions({ name: 'MobileAbout' })

const expandedFeature = ref<number | null>(null)

const toggleFeature = (index: number) => {
  expandedFeature.value = expandedFeature.value === index ? null : index
}

const features = [
  {
    icon: MessageSquare,
    title: 'AI Query Automation',
    description: 'Intelligent query generation and optimization powered by advanced AI models.',
    details: [
      { subtitle: 'Natural Language to SQL' },
      { subtitle: 'Context-Aware Suggestions' },
      { subtitle: 'Query Optimization' },
      { subtitle: 'Multi-Table Intelligence' }
    ]
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboard Generation',
    description: 'Automatically create beautiful, interactive dashboards from your query results.',
    details: [
      { subtitle: 'Smart Visualization Selection' },
      { subtitle: 'Drag & Drop Layout' },
      { subtitle: 'Real-Time Updates' },
      { subtitle: 'Share & Collaborate' }
    ]
  },
  {
    icon: Database,
    title: 'Universal Database Support',
    description: 'Connect to any database provider with flexible, provider-agnostic architecture.',
    details: [
      { subtitle: 'Multiple Database Types' },
      { subtitle: 'Live Schema Discovery' },
      { subtitle: 'Secure Connections' }
    ]
  },
  {
    icon: Activity,
    title: 'Real-Time Monitoring',
    description: 'Observe live metrics, logs, and system health with dynamic visual feedback.',
    details: [
      { subtitle: 'Live Query Execution' },
      { subtitle: 'Performance Metrics' },
      { subtitle: 'Connection Health' }
    ]
  }
]
</script>
