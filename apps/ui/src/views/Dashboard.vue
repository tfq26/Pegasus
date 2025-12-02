<template>
  <div class="w-full h-full flex flex-col text-stone-100">
    <!-- Header -->
    <header class="flex items-center justify-between gap-4 px-6 py-2 border-b border-stone-800 bg-stone-950/50 backdrop-blur-sm z-10">
      <div class="flex items-center gap-4">
        <h1 class="text-lg font-bold text-violet-400">Dashboard</h1>
        
        <!-- Layout Controls -->
        <div class="flex items-center gap-2 px-3 py-1 bg-stone-900/50 rounded-lg border border-stone-800">
          <button
            @click="isCompact = !isCompact"
            class="p-1.5 rounded hover:bg-stone-800 transition text-xs flex items-center gap-1.5"
            :class="isCompact ? 'text-violet-400' : 'text-stone-500'"
            title="Toggle Compact Mode"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2h12v4H2V2zm0 6h12v6H2V8z" opacity="0.8"/>
            </svg>
            Compact
          </button>
          
          <div class="w-px h-4 bg-stone-800"></div>
          
          <button
            @click="showGrid = !showGrid"
            class="p-1.5 rounded hover:bg-stone-800 transition text-xs flex items-center gap-1.5"
            :class="showGrid ? 'text-violet-400' : 'text-stone-500'"
            title="Toggle Grid"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2h12v12H2V2zm1 1v10h10V3H3z" opacity="0.8"/>
            </svg>
            Grid
          </button>
          
          <div class="w-px h-4 bg-stone-800"></div>
          
          <button
            @click="isLocked = !isLocked"
            class="p-1.5 rounded hover:bg-stone-800 transition text-xs flex items-center gap-1.5"
            :class="isLocked ? 'text-amber-400' : 'text-stone-500'"
            title="Lock Layout"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path v-if="isLocked" d="M8 1a4 4 0 00-4 4v2H3v8h10V7h-1V5a4 4 0 00-4-4zm0 2a2 2 0 012 2v2H6V5a2 2 0 012-2z"/>
              <path v-else d="M11 5V4a3 3 0 00-6 0v1H4v9h8V5h-1zm-1 0H6V4a2 2 0 014 0v1z"/>
            </svg>
            {{ isLocked ? 'Locked' : 'Unlocked' }}
          </button>
        </div>
      </div>


    </header>

    <!-- Main Grid -->
    <div 
      class="flex-1 overflow-auto p-4 relative transition-colors duration-300"
      :class="{ 'bg-grid-pattern': showGrid }"
      :style="gridStyle"
    >
      <DraggableGrid
        v-model:items="layout"
        :cols="12"
        :row-height="30"
        :gap="8"
        :is-draggable="!isLocked"
        :is-resizable="!isLocked"
        :is-locked="isLocked"
        :vertical-compact="isCompact"
        drag-selector=".drag-handle"
        @layout-updated="onLayoutUpdated"
      >
        <template #item="{ item }">
          <div 
            class="dashboard-card w-full h-full flex flex-col"
            :class="{ 'pointer-events-none': isLocked }"
          >
            <!-- Card Content -->
            <div class="card-content">
              <div class="card-header">
                <div class="card-title-section">
                  <!-- Combined Drag/Delete Handle -->
                  <div 
                    v-if="!isLocked"
                    class="transition-all duration-200 rounded-md p-1 flex items-center justify-center"
                    :class="[
                      isCtrlPressed 
                        ? 'bg-red-500/10 text-red-500 cursor-pointer hover:bg-red-500/20' 
                        : 'drag-handle cursor-move text-stone-600 hover:text-violet-500 hover:bg-violet-500/10'
                    ]"
                    :title="isCtrlPressed ? 'Click to remove' : 'Drag to move'"
                    @click.stop="isCtrlPressed ? removeElement(item.i) : null"
                  >
                    <!-- Delete Icon -->
                    <svg v-if="isCtrlPressed" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                    <!-- Drag Icon -->
                    <svg v-else width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                    </svg>
                  </div>
                  <div>
                    <h3 class="card-title">{{ getElement(item.i)?.title }}</h3>
                    <p class="card-subtitle text-xs text-stone-500 truncate max-w-[200px]">{{ getElement(item.i)?.query }}</p>
                  </div>
                </div>
              </div>

              <div class="card-body relative overflow-hidden">
                <ChartRenderer 
                  v-if="getElement(item.i)"
                  :type="getElement(item.i)!.type"
                  :data="getElement(item.i)!.config.data"
                  :options="{ ...getElement(item.i)!.config.options, maintainAspectRatio: false, responsive: true }"
                  class="w-full h-full"
                />
              </div>
            </div>
          </div>
        </template>
      </DraggableGrid>


      <!-- Empty State -->
      <div
        v-if="!layout.length && !isLoading"
        class="empty-state"
      >
        <div class="empty-state-icon">📊</div>
        <h2 class="empty-state-title">No dashboard elements yet</h2>
        <p class="empty-state-text">Ask AI in Chat to "Create a dashboard element" from your query results.</p>
      </div>
      
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import DraggableGrid from '@/components/grid/DraggableGrid.vue'
import ChartRenderer from '@/components/Dashboard/ChartRenderer.vue'
import { toast } from 'vue-sonner'
import { fetchDashboardElements, deleteDashboardElement } from '@/lib/api'

defineOptions({ name: 'DashboardPage' })

interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

interface DashboardElement {
  id: string
  title: string
  type: string
  config: any
  query: string
}

const layout = ref<LayoutItem[]>([])
const elements = ref<Map<string, DashboardElement>>(new Map())
const isLoading = ref(true)

// Layout State
const isCompact = ref(false)
const isLocked = ref(false)
const showGrid = ref(false)

// Computed grid style for background pattern
const gridStyle = computed(() => {
  if (!showGrid.value) return {}
  return {
    backgroundImage: `
      linear-gradient(to right, rgba(139, 92, 246, 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(139, 92, 246, 0.05) 1px, transparent 1px)
    `,
    backgroundSize: `calc((100% - 8px) / 12) 38px`,
    backgroundPosition: '8px 8px'
  }
})

const getElement = (id: string) => elements.value.get(id)

const loadDashboard = async () => {
  isLoading.value = true
  try {
    const data = await fetchDashboardElements()
    
    // Clear existing
    layout.value = []
    elements.value.clear()
    
    // Map to layout
    // For now, we'll just auto-layout them if no specific layout is saved
    // Ideally, we should save layout positions in the backend too.
    // The current schema doesn't have layout info per element, so we'll just stack them.
    
    let yOffset = 0
    data.forEach((el: any, index: number) => {
      const id = el.id.toString()
      layout.value.push({
        i: id,
        x: (index % 2) * 6, // 2 columns
        y: Math.floor(index / 2) * 8,
        w: 6,
        h: 8
      })
      
      elements.value.set(id, {
        id: id,
        title: el.title,
        type: el.type,
        config: typeof el.config === 'string' ? JSON.parse(el.config) : el.config,
        query: el.query
      })
    })
    
  } catch (e) {
    console.error('Failed to load dashboard:', e)
    toast.error('Failed to load dashboard')
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadDashboard()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

const removeElement = async (id: string) => {
  try {
    await deleteDashboardElement(id)
    layout.value = layout.value.filter(item => item.i !== id)
    elements.value.delete(id)
    toast.success('Element removed')
  } catch (e) {
    toast.error('Failed to remove element')
  }
}

const onLayoutUpdated = (newLayout: LayoutItem[]) => {
  layout.value = newLayout
  // TODO: Save layout positions to backend
}

// Track Control/Command key state
const isCtrlPressed = ref(false)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = true
  }
}

const handleKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = false
  }
}
</script>

<style scoped>
/* Dashboard Card Styles */
.dashboard-card {
  background: linear-gradient(135deg, rgba(28, 25, 23, 0.95) 0%, rgba(41, 37, 36, 0.95) 100%);
  border: 1px solid rgb(68, 64, 60);
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  overflow: hidden;
}

.dashboard-card:hover {
  border-color: rgba(139, 92, 246, 0.6);
  box-shadow: 0 10px 15px -3px rgba(139, 92, 246, 0.2), 0 4px 6px -2px rgba(139, 92, 246, 0.1);
}

.card-content {
  padding: 1rem;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-title-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.drag-handle {
  cursor: move;
  color: rgb(87, 83, 78);
  transition: color 0.2s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border-radius: 0.375rem;
}

.drag-handle:hover {
  color: rgb(139, 92, 246);
  background: rgba(139, 92, 246, 0.1);
}

.card-title {
  color: rgb(196, 181, 253);
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.25;
}

.card-subtitle {
  color: rgb(168, 162, 158);
  font-size: 0.75rem;
  margin: 0;
  line-height: 1.25;
}

.remove-btn {
  color: rgb(120, 113, 108);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.375rem;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.remove-btn:hover {
  color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.1);
}

.card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.card-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: rgba(28, 25, 23, 0.5);
  border-radius: 0.5rem;
  font-size: 3rem;
  color: rgb(168, 162, 158);
}

/* Grid Layout Customization */
:deep(.vue-grid-item.vue-grid-placeholder) {
  background: rgba(139, 92, 246, 0.15) !important;
  border: 2px dashed rgba(139, 92, 246, 0.5) !important;
  border-radius: 1rem;
  opacity: 1;
}

:deep(.vue-grid-item.resizing),
:deep(.vue-grid-item.dragging) {
  opacity: 0.9;
  z-index: 100;
  transition: none;
}

:deep(.vue-grid-item > .vue-resizable-handle) {
  opacity: 0;
  transition: opacity 0.2s ease;
  width: 20px;
  height: 20px;
  bottom: 0;
  right: 0;
}

:deep(.vue-grid-item:hover > .vue-resizable-handle) {
  opacity: 1;
}

:deep(.vue-resizable-handle::after) {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 12px 12px;
  border-color: transparent transparent rgba(139, 92, 246, 0.8) transparent;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
  padding: 2rem;
}

.empty-state-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state-title {
  color: rgb(214, 211, 209);
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.empty-state-text {
  color: rgb(168, 162, 158);
  font-size: 0.875rem;
  margin: 0 0 1.5rem 0;
}

.empty-state-btn {
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  background: rgb(124, 58, 237);
  color: white;
  border: none;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);
  transition: all 0.2s ease;
}

.empty-state-btn:hover {
  background: rgb(109, 40, 217);
  transform: translateY(-1px);
  box-shadow: 0 6px 8px -1px rgba(124, 58, 237, 0.4);
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-content {
  background: linear-gradient(135deg, rgb(28, 25, 23) 0%, rgb(41, 37, 36) 100%);
  border: 1px solid rgb(68, 64, 60);
  border-radius: 1.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3);
  padding: 2rem;
  width: 100%;
  max-width: 56rem;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.modal-title {
  color: rgb(196, 181, 253);
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.modal-close {
  color: rgb(120, 113, 108);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.5rem;
  transition: all 0.2s ease;
}

.modal-close:hover {
  color: rgb(196, 181, 253);
  background: rgba(139, 92, 246, 0.1);
}

.modal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.element-card {
  background: rgba(28, 25, 23, 0.5);
  border: 1px solid rgb(68, 64, 60);
  border-radius: 0.75rem;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.element-card:hover {
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(41, 37, 36, 0.8);
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(139, 92, 246, 0.2);
}

.element-preview {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.element-title {
  color: rgb(196, 181, 253);
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

.element-subtitle {
  color: rgb(168, 162, 158);
  font-size: 0.75rem;
  margin: 0;
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}

/* Grid Pattern */
.bg-grid-pattern {
  background-attachment: local;
}
</style>
