```html
<template>
  <div class="w-full bg-background flex flex-col">
    <div class="flex-1">
      <div class="max-w-7xl mx-auto p-6 sm:p-10 space-y-8">
        
        <!-- Hero Card with Black Hole -->
        <div class="relative w-full h-[400px] rounded-3xl overflow-hidden shadow-2xl border border-border/50 bg-black/5 dark:bg-black/20">
          <BlackHoleBackground class="absolute inset-0">
            <div class="relative z-10 h-full flex flex-col items-center justify-center text-center p-6">
              <!-- <div
                class="w-24 h-24 mb-6 flex items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-lg shadow-primary/20 backdrop-blur-sm ring-1 ring-primary/20"
              >
                <img
                  src="/pegasus-white.svg"
                  alt="Pegasus Logo"
                  class="w-12 h-12 dark:invert-0 invert"
                />
              </div> -->
              
              <h1 class="text-4xl md:text-6xl font-bold text-foreground tracking-tight mb-4 drop-shadow-md">
                Pegasus
              </h1>
              <p class="text-lg md:text-xl text-foreground font-medium max-w-xl mx-auto">
                Insight with Intelligence and Ease, built to make your data soar.
              </p>
            </div>
          </BlackHoleBackground>
        </div>

        <!-- Main Content -->
        <div class="max-w-7xl mx-auto space-y-12 px-4">
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
          <div>
            <!-- <h2 class="text-2xl font-bold text-foreground mb-6 text-center">Key Features</h2> -->
            <div class="grid md:grid-cols-2 gap-6">
              <div
                v-for="(feature, index) in features"
                :key="index"
                @click="openFeatureModal(feature)"
                class="group p-6 rounded-2xl bg-card hover:bg-accent/50 border border-border hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer"
              >
                <div class="flex items-start gap-4">
                  <div class="p-3 rounded-xl bg-primary/10 text-primary shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <component :is="feature.icon" class="w-6 h-6" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                      {{ feature.title }}
                    </h3>
                    <p class="text-muted-foreground text-sm leading-relaxed">
                      {{ feature.description }}
                    </p>
                    <p class="text-xs text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to learn more →
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- About Page Footer -->
          <!-- <div class="border-t border-border pt-8 text-center space-y-4">
            <p class="text-lg text-muted-foreground italic font-serif">
              “Making system management effortless through data, AI, and cloud.”
            </p>
          </div> -->
        </div>
      </div>
    </div>

    <!-- Footer (same as Home page) -->
    <AppFooter />

    <!-- Feature Detail Modal -->
    <Dialog v-model:open="showFeatureModal">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-3 text-2xl">
            <component :is="selectedFeature?.icon" class="w-8 h-8 text-primary" />
            {{ selectedFeature?.title }}
          </DialogTitle>
          <DialogDescription>
            {{ selectedFeature?.description }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div v-for="(detail, index) in selectedFeature?.details" :key="index" class="space-y-2">
            <h4 class="font-semibold text-foreground flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
                {{ index + 1 }}
              </span>
              {{ detail.subtitle }}
            </h4>
            <p class="text-muted-foreground text-sm leading-relaxed pl-8">
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
import { MessageSquare, LayoutDashboard, Database, Activity } from 'lucide-vue-next'


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
    description:
      'Intelligent query generation and optimization powered by advanced AI models.',
    details: [
      {
        subtitle: 'Natural Language to SQL',
        content: 'Simply describe what data you need in plain English, and Pegasus will generate optimized SQL queries automatically. No need to remember complex syntax or table structures.'
      },
      {
        subtitle: 'Context-Aware Suggestions',
        content: 'The AI understands your database schema and query history to provide intelligent autocomplete suggestions and query improvements as you type.'
      },
      {
        subtitle: 'Query Optimization',
        content: 'Automatically analyzes and optimizes your queries for better performance, suggesting indexes and identifying potential bottlenecks before execution.'
      },
      {
        subtitle: 'Multi-Table Intelligence',
        content: 'When queries involve multiple tables, Pegasus prompts you for clarification to ensure accurate JOIN operations and data relationships.'
      }
    ]
  },
  {
    icon: Database,
    title: 'Intelligent Data Import',
    description:
      'Instantly convert JSON, CSV, and Excel files into queryable database tables.',
    details: [
      {
        subtitle: 'Drag & Drop Simplicity',
        content: 'Upload complete datasets just by dragging files into the app. Pegasus handles the parsing, schema detection, and import process automatically.'
      },
      {
        subtitle: 'Smart Schema Detection',
        content: 'Automatically identifies data types, headers, and structures from your files, ensuring your data is stored correctly and efficiently.'
      },
      {
        subtitle: 'Excel & JSON Support',
        content: 'Native support for complex Excel spreadsheets and nested JSON files. Preview and verify your data structure before importing.'
      },
      {
        subtitle: 'Instant Querying',
        content: 'Imported files become fully fully-featured database tables immediately, ready to be queried with SQL or visualized in dashboards.'
      }
    ]
  },
  {
    icon: LayoutDashboard,
    title: 'Visual Data Explorer',
    description:
      'A powerful, spreadsheet-like interface to view, search, and edit your data directly.',
    details: [
      {
        subtitle: 'Inline Editing',
        content: 'Edit database records directly in the grid view, just like a spreadsheet. Changes are validated and synced to your database in real-time.'
      },
      {
        subtitle: 'Advanced Filtering',
        content: 'Sort, search, and filter your data across millions of rows with high-performance client-side and server-side operations.'
      },
      {
        subtitle: 'Smart Headers',
        content: 'Automatically detects and manages table headers, allowing you to rename columns and restructure your view without altering the underlying data.'
      },
      {
        subtitle: 'Schema Management',
        content: 'View and modify table schemas, rename tables, and manage data types through an intuitive visual interface.'
      }
    ]
  },
  {
    icon: LayoutDashboard,
    title: 'Interactive Dashboards',
    description:
      'Turn your query results into beautiful, real-time visualizations in seconds.',
    details: [
      {
        subtitle: 'Smart Visualization',
        content: 'Pegasus analyzes your data and automatically recommends the best chart types - whether it\'s bar charts, line graphs, pie charts, or stat cards.'
      },
      {
        subtitle: 'Drag & Drop Layout',
        content: 'Easily customize your dashboard layout with an intuitive drag-and-drop interface. Resize and organize your widgets exactly how you want them.'
      },
      {
        subtitle: 'Real-Time Updates',
        content: 'Dashboards auto-refresh to keep your insights current with live data from your connected databases.'
      },
      {
        subtitle: 'Export & Share',
        content: 'Generate shareable links (coming soon) or export your dashboard views to share insights with your team.'
      }
    ]
  },
  {
    icon: Database,
    title: 'Universal Database Support',
    description:
      'Connect to any database provider with flexible, provider-agnostic architecture.',
    details: [
      {
        subtitle: 'Broad Compatibility',
        content: 'Seamlessly connect to MongoDB, PostgreSQL, MySQL, SQLite, SurrealDB, and more. Each connection is managed independently.'
      },
      {
        subtitle: 'Live Schema Discovery',
        content: 'Automatically detect databases, tables, and collections when you connect. For MongoDB, Pegasus previews sample documents to help you understand your data.'
      },
      {
        subtitle: 'Secure Connections',
        content: 'Support for SSL/TLS encryption, service principal authentication, and secure credential storage to ensure your data remains protected.'
      },
      {
        subtitle: 'Connection Health',
        content: 'Active monitoring of connection status with detailed error reporting and troubleshooting guidance to keep your integrations running smoothly.'
      }
    ]
  },
  {
    icon: Activity,
    title: 'Real-Time Monitoring',
    description:
      'Observe live metrics, logs, and system health with dynamic visual feedback.',
    details: [
      {
        subtitle: 'Live Query Execution',
        content: 'Watch your queries execute in real-time with progress indicators and streaming results. Cancel long-running queries with a single click.'
      },
      {
        subtitle: 'Performance Metrics',
        content: 'Track query execution times, row counts, and resource usage to identify performance bottlenecks.'
      },
      {
        subtitle: 'System Health',
        content: 'Monitor the status of all your database connections at a glance, with automatic reconnection logic.'
      },
      {
        subtitle: 'Activity History',
        content: 'Keep a complete history of all queries and operations, making it easy to revisit past work or debug issues.'
      }
    ]
  }
]
</script>
