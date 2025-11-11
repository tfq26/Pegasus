<template>
  <div class="w-full h-full flex flex-col text-stone-100">
    <!-- Header -->
    <header class="flex items-center justify-end gap-4 px-4 mt-4">

      <button
        @click="showAddModal = true"
        class="px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium shadow-md shadow-violet-600/20 transition"
      >
        +
      </button>
    </header>

    <!-- Main Grid -->
    <div class="flex-1 overflow-auto p-6">
      <GridLayout
        v-model:layout="layout"
        :col-num="12"
        :row-height="30"
        :is-draggable="true"
        :is-resizable="true"
        :responsive="responsive"
        :use-css-transforms="true"
        :vertical-compact="false"
        @layout-updated="syncPositions"
        class="min-h-[500px]"
      >
        <GridItem
          v-for="card in dashboardCards"
          :key="card.i"
          :i="card.i"
          :x="card.x"
          :y="card.y"
          :w="card.w"
          :h="card.h"
          class="rounded-xl bg-stone-900 border border-stone-700 hover:border-violet-500/60 shadow hover:shadow-violet-500/20 transition-all"
        >
          <!-- Card Content -->
          <div class="p-4 w-full h-full flex flex-col justify-between select-none">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-violet-400 font-semibold mb-1">{{ card.title }}</h3>
                <p class="text-stone-400 text-xs">{{ card.subtitle }}</p>
              </div>
              <button
                @click.stop="removeElement(card.i)"
                class="text-stone-500 hover:text-violet-400 text-xs transition"
                title="Remove"
              >
                ✕
              </button>
            </div>

            <div
              class="flex-1 flex items-center justify-center bg-stone-800 rounded-lg text-stone-500 text-sm mt-3"
            >
              {{ card.preview }}
            </div>
          </div>
        </GridItem>
      </GridLayout>

      <!-- Empty State -->
      <div
        v-if="!dashboardCards.length"
        class="flex flex-col items-center justify-center h-full text-stone-400 mt-10"
      >
        <p>No dashboard elements yet.</p>
        <button
          @click="showAddModal = true"
          class="mt-3 px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium shadow-md shadow-violet-600/20 transition"
        >
          + Add Your First Element
        </button>
      </div>
    </div>

    <!-- Add Element Modal -->
    <transition name="fade-zoom">
      <div
        v-if="showAddModal"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
        @click.self="showAddModal = false"
      >
        <div class="bg-stone-900 border border-stone-700 rounded-2xl shadow-xl p-6 w-[90%] max-w-3xl">
          <h2 class="text-xl font-semibold text-violet-400 mb-4">Add Dashboard Element</h2>

          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="el in elementTemplates"
              :key="el.id"
              class="rounded-xl border border-stone-700 hover:border-violet-500/60 p-4 cursor-pointer transition"
              @click="addElement(el)"
            >
              <h3 class="text-violet-400 font-medium mb-2">{{ el.title }}</h3>
              <p class="text-stone-400 text-xs mb-3">{{ el.subtitle }}</p>
              <div
                class="flex items-center justify-center bg-stone-800 rounded-lg h-20 text-stone-500 text-sm"
              >
                {{ el.preview }}
              </div>
            </div>
          </div>

          <button
            class="mt-6 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-md text-stone-300 text-sm"
            @click="showAddModal = false"
          >
            Close
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import VueGridLayout from 'vue3-grid-layout'

// ✅ Correct destructure
const { GridLayout, GridItem } = VueGridLayout

defineOptions({ name: 'DashboardPage' })

interface DashboardCard {
  i: string
  title: string
  subtitle: string
  preview: string
  description: string
  x: number
  y: number
  w: number
  h: number
}

const showAddModal = ref(false)
const responsive = ref(true)

// Widget templates
const elementTemplates = [
  { id: 'T1', title: 'User Growth', subtitle: 'Active vs New Users', preview: '📈 Line Chart', description: 'Shows user growth trends.' },
  { id: 'T2', title: 'Log Volume', subtitle: 'Error vs Info Logs', preview: '📊 Bar Chart', description: 'Daily log distribution.' },
  { id: 'T3', title: 'CPU Utilization', subtitle: 'Resource Load', preview: '🖥️ Area Chart', description: 'System performance tracking.' },
  { id: 'T4', title: 'Revenue Projection', subtitle: 'AI Predictions', preview: '💡 Projection Graph', description: 'Revenue growth forecast.' },
  { id: 'T5', title: 'Query Latency', subtitle: 'Avg Response Time', preview: '⏱️ Metrics', description: 'Latency analytics.' },
  { id: 'T6', title: 'Data Integrity', subtitle: 'Consistency Check', preview: '🧩 Donut Chart', description: 'Validation results across datasets.' }
]

// Load from localStorage or defaults
const dashboardCards = ref<DashboardCard[]>(
  JSON.parse(localStorage.getItem('pegasus-layout') || 'null') || [
    { i: '1', ...elementTemplates[0], x: 0, y: 0, w: 4, h: 6 },
    { i: '2', ...elementTemplates[1], x: 4, y: 0, w: 4, h: 6 },
    { i: '3', ...elementTemplates[2], x: 8, y: 0, w: 4, h: 6 }
  ]
)

// Reactive layout for Grid
const layout = ref(
  dashboardCards.value.map((c) => ({
    i: c.i,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h
  }))
)

// ➕ Add Element
const addElement = (el: any) => {
  const newId = crypto.randomUUID()
  const newItem = {
    i: newId,
    ...el,
    x: Math.floor(Math.random() * 8),
    y: Infinity,
    w: 4,
    h: 6
  }
  dashboardCards.value.push(newItem)
  layout.value.push({
    i: newItem.i,
    x: newItem.x,
    y: newItem.y,
    w: newItem.w,
    h: newItem.h
  })
  showAddModal.value = false
  saveLayout()
}

// ❌ Remove Element
const removeElement = (id: string) => {
  dashboardCards.value = dashboardCards.value.filter((c) => c.i !== id)
  layout.value = layout.value.filter((l) => l.i !== id)
  saveLayout()
}

// 🔄 Sync layout positions after drag/resize
const syncPositions = (newLayout: any[]) => {
  newLayout.forEach((l) => {
    const card = dashboardCards.value.find((c) => c.i === l.i)
    if (card) Object.assign(card, l)
  })
  saveLayout()
}

// 💾 Persist layout
const saveLayout = () => {
  localStorage.setItem('pegasus-layout', JSON.stringify(dashboardCards.value))
}

// Auto-save whenever layout updates
watch(layout, saveLayout, { deep: true })
</script>

<style scoped>
.fade-zoom-enter-active,
.fade-zoom-leave-active {
  transition: all 0.3s ease;
}
.fade-zoom-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.fade-zoom-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
