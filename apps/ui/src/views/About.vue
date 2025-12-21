```html
<template>
  <div class="w-full bg-background flex flex-col min-h-screen">
    <div class="flex-1">
      <div class="max-w-6xl mx-auto p-4 sm:p-8 space-y-12">
        
        <!-- Hero Section -->
        <div class="relative w-full h-[320px] rounded-sm overflow-hidden border border-border/50 bg-muted/20">
          <BlackHoleBackground class="absolute inset-0">
            <div class="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
              <h1 class="text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-3">
                Pegasus
              </h1>
              <div class="h-1 w-12 bg-primary/40 rounded-full mb-4"></div>
              <p class="text-base md:text-lg text-muted-foreground font-medium max-w-2xl mx-auto">
                Advanced Intelligence for Enterprise Data Management
              </p>
            </div>
          </BlackHoleBackground>
        </div>

        <!-- Main Content -->
        <div class="space-y-16">
          <!-- Mission & Vision -->
          <div class="grid md:grid-cols-2 gap-12 items-start text-left">
            <div class="space-y-4">
              <h2 class="text-xs font-bold uppercase tracking-widest text-primary/70">The Mission</h2>
              <p class="text-xl font-medium leading-relaxed text-foreground">
                Where security, insight, and AI converge into one seamless, collaborative workspace.
              </p>
            </div>
            <div class="space-y-4">
              <p class="text-sm text-muted-foreground leading-relaxed">
                Inspired by high-performance data management systems and enhanced through powerful AI inference, 
                Pegasus bridges the gap between raw information and actionable intelligence. 
                We provide a fast, technical, yet intuitive interface for resource visualization and real-time collaboration.
              </p>
              <div class="flex items-center gap-6 pt-2">
                <div class="flex flex-col">
                  <span class="text-xl font-bold text-foreground">100%</span>
                  <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Secure</span>
                </div>
                <div class="h-8 w-px bg-border"></div>
                <div class="flex flex-col">
                  <span class="text-xl font-bold text-foreground">Real-time</span>
                  <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Analytics</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Features Section -->
          <section class="space-y-8">
            <div class="flex items-center gap-4">
              <h2 class="text-lg font-bold tracking-tight text-foreground">Core Capabilities</h2>
              <div class="flex-1 h-px bg-border/60"></div>
            </div>

            <div class="grid md:grid-cols-3 gap-4">
              <div
                v-for="(feature, index) in features"
                :key="index"
                @click="openFeatureModal(feature)"
                class="group p-5 rounded-sm bg-card border border-border hover:border-primary/40 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer flex flex-col items-start gap-4"
              >
                <div class="p-2.5 rounded-sm bg-primary/5 text-primary border border-primary/10 group-hover:bg-primary/10 transition-colors">
                  <component :is="feature.icon" class="w-5 h-5" />
                </div>
                <div class="space-y-2">
                  <h3 class="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {{ feature.title }}
                  </h3>
                  <p class="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {{ feature.description }}
                  </p>
                </div>
                <div class="mt-auto pt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                  Detailed view <ArrowRight class="w-3 h-3" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <AppFooter />

    <!-- Feature Detail Modal -->
    <Dialog v-model:open="showFeatureModal">
      <DialogContent class="sm:max-w-xl bg-background border border-border rounded-sm shadow-2xl">
        <DialogHeader class="border-b border-border pb-6">
          <DialogTitle class="flex items-center gap-3 text-xl font-bold">
            <div class="p-2 rounded-sm bg-primary/10 text-primary border border-primary/20">
              <component :is="selectedFeature?.icon" class="w-6 h-6" />
            </div>
            {{ selectedFeature?.title }}
          </DialogTitle>
          <DialogDescription class="text-muted-foreground text-sm mt-2">
            {{ selectedFeature?.description }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-6 py-6 overflow-y-auto max-h-[60vh] custom-scrollbar px-1">
          <div v-for="(detail, index) in selectedFeature?.details" :key="index" class="relative pl-6 space-y-1">
            <div class="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-primary/40"></div>
            <h4 class="text-sm font-bold text-foreground">
              {{ detail.subtitle }}
            </h4>
            <p class="text-xs text-muted-foreground leading-relaxed">
              {{ detail.content }}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BlackHoleBackground from '@/components/ui/bg-black-hole/BlackHoleBackground.vue'
import AppFooter from '@/components/AppFooter.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { MessageSquare, LayoutDashboard, Database, Activity, ArrowRight } from 'lucide-vue-next'

defineOptions({ name: 'AboutView' })

const showFeatureModal = ref(false)
const selectedFeature = ref<typeof features[0] | null>(null)

const openFeatureModal = (feature: typeof features[0]) => {
  selectedFeature.value = feature
  showFeatureModal.value = true
}

const features = [
  {
    icon: MessageSquare,
    title: 'AI Query Automation',
    description: 'Intelligent query generation and optimization powered by advanced AI models.',
    details: [
      {
        subtitle: 'Natural Language to SQL',
        content: 'Simply describe what data you need in plain English, and Pegasus will generate optimized SQL queries automatically.'
      },
      {
        subtitle: 'Context-Aware Suggestions',
        content: 'The AI understands your database schema and query history to provide intelligent autocomplete suggestions.'
      },
      {
        subtitle: 'Query Optimization',
        content: 'Automatically analyzes and optimizes your queries for better performance.'
      }
    ]
  },
  {
    icon: Database,
    title: 'Intelligent Data Import',
    description: 'Instantly convert JSON, CSV, and Excel files into queryable database tables.',
    details: [
      {
        subtitle: 'Smart Schema Detection',
        content: 'Automatically identifies data types, headers, and structures from your files ensuring data is stored correctly.'
      },
      {
        subtitle: 'Multi-Format Support',
        content: 'Native support for complex Excel spreadsheets and nested JSON files.'
      }
    ]
  },
  {
    icon: LayoutDashboard,
    title: 'Visual Data Explorer',
    description: 'A powerful, spreadsheet-like interface to view, search, and edit your data directly.',
    details: [
      {
        subtitle: 'Inline Editing',
        content: 'Edit database records directly in the grid view with real-time sync.'
      },
      {
        subtitle: 'Advanced Filtering',
        content: 'Sort, search, and filter your data across millions of rows with high performance.'
      }
    ]
  },
  {
    icon: LayoutDashboard,
    title: 'Interactive Dashboards',
    description: 'Turn your query results into beautiful, real-time visualizations in seconds.',
    details: [
      {
        subtitle: 'Smart Visualization',
        content: 'Pegasus recommends the best chart types - bar charts, line graphs, pie charts, or stat cards.'
      },
      {
        subtitle: 'Drag & Drop Layout',
        content: 'Easily customize your dashboard layout with an intuitive drag-and-drop interface.'
      }
    ]
  },
  {
    icon: Database,
    title: 'Universal Connectivity',
    description: 'Connect to any database provider with flexible, provider-agnostic architecture.',
    details: [
      {
        subtitle: 'Broad Compatibility',
        content: 'Connect to MongoDB, PostgreSQL, MySQL, SQLite, SurrealDB, and more.'
      },
      {
        subtitle: 'Live Schema Discovery',
        content: 'Automatically detect databases, tables, and collections upon connection.'
      }
    ]
  },
  {
    icon: Activity,
    title: 'Operational Monitoring',
    description: 'Observe live metrics, logs, and system health with dynamic visual feedback.',
    details: [
      {
        subtitle: 'Performance Metrics',
        content: 'Track query execution times, row counts, and resource usage.'
      },
      {
        subtitle: 'System Health',
        content: 'Monitor the status of all your database connections at a glance.'
      }
    ]
  }
]
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
</style>
