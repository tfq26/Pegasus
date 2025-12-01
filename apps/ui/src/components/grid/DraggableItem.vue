<template>
  <div
    ref="itemRef"
    class="draggable-item absolute transition-shadow duration-200"
    :class="{ 
      'z-10': isDragging || isResizing,
      'cursor-move': isDraggable && !isLocked,
      'cursor-default': !isDraggable || isLocked,
      'shadow-xl ring-2 ring-violet-500/50': isDragging || isResizing
    }"
    :style="style"
    @mousedown="onMouseDown"
  >
    <slot></slot>
    
    <!-- Resize Handle -->
    <div
      v-if="isResizable && !isLocked"
      class="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20"
      @mousedown.stop="onResizeStart"
    >
      <div class="absolute bottom-1 right-1 w-0 h-0 border-style-solid 
      border-width-0-0-8-8 border-color-transparent-transparent-violet-500-transparent
      opacity-50 hover:opacity-100 rounded-lg"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'

const props = defineProps<{
  x: number
  y: number
  w: number
  h: number
  colWidth: number
  rowHeight: number
  gap: number
  isDraggable?: boolean
  isResizable?: boolean
  isLocked?: boolean
  dragSelector?: string
  cols: number
}>()

const emit = defineEmits<{
  (e: 'drag-start', id: string): void
  (e: 'drag-move', id: string, x: number, y: number): void
  (e: 'drag-end', id: string, x: number, y: number): void
  (e: 'resize-start', id: string): void
  (e: 'resize-move', id: string, w: number, h: number): void
  (e: 'resize-end', id: string, w: number, h: number): void
}>()

const itemRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const isResizing = ref(false)

// Internal state for smooth dragging (pixels)
const localX = ref(0)
const localY = ref(0)
const localW = ref(0)
const localH = ref(0)

// Calculate position in pixels based on grid coordinates
const top = computed(() => props.y * (props.rowHeight + props.gap))
const left = computed(() => props.x * (props.colWidth + props.gap))
const width = computed(() => props.w * props.colWidth + (props.w - 1) * props.gap)
const height = computed(() => props.h * props.rowHeight + (props.h - 1) * props.gap)

const style = computed(() => {
  if (isDragging.value) {
    return {
      transform: `translate(${localX.value}px, ${localY.value}px)`,
      width: `${width.value}px`,
      height: `${height.value}px`,
      willChange: 'transform'
    }
  }
  
  if (isResizing.value) {
    return {
      transform: `translate(${left.value}px, ${top.value}px)`,
      width: `${localW.value}px`,
      height: `${localH.value}px`,
      willChange: 'width, height'
    }
  }

  return {
    transform: `translate(${left.value}px, ${top.value}px)`,
    width: `${width.value}px`,
    height: `${height.value}px`,
    transition: 'transform 0.2s ease, width 0.2s ease, height 0.2s ease'
  }
})

// --- Drag Logic ---
let startX = 0
let startY = 0
let initialLeft = 0
let initialTop = 0

const onMouseDown = (e: MouseEvent) => {
  if (!props.isDraggable || props.isLocked) return
  
  // Check drag selector if provided
  if (props.dragSelector) {
    const target = e.target as HTMLElement
    if (!target.closest(props.dragSelector)) return
  }

  e.preventDefault()
  isDragging.value = true
  
  startX = e.clientX
  startY = e.clientY
  initialLeft = left.value
  initialTop = top.value
  
  // Initialize local state
  localX.value = initialLeft
  localY.value = initialTop
  
  emit('drag-start', '')
  
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

const onDragMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  
  let newX = initialLeft + dx
  let newY = initialTop + dy
  
  // Constrain to grid bounds
  const maxWidth = props.cols * (props.colWidth + props.gap) - props.gap
  const itemWidth = props.w * props.colWidth + (props.w - 1) * props.gap
  
  // Clamp X: 0 <= x <= gridWidth - itemWidth
  newX = Math.max(0, Math.min(newX, maxWidth - itemWidth))
  
  // Clamp Y: 0 <= y
  newY = Math.max(0, newY)
  
  localX.value = newX
  localY.value = newY
  
  emit('drag-move', '', localX.value, localY.value)
}

const onDragEnd = () => {
  if (!isDragging.value) return
  
  isDragging.value = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  
  emit('drag-end', '', localX.value, localY.value)
}

// --- Resize Logic ---
let initialWidth = 0
let initialHeight = 0

const onResizeStart = (e: MouseEvent) => {
  if (!props.isResizable || props.isLocked) return
  
  e.preventDefault()
  e.stopPropagation() // Prevent drag start
  isResizing.value = true
  
  startX = e.clientX
  startY = e.clientY
  initialWidth = width.value
  initialHeight = height.value
  
  // Initialize local state
  localW.value = initialWidth
  localH.value = initialHeight
  
  emit('resize-start', '')
  
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

const onResizeMove = (e: MouseEvent) => {
  if (!isResizing.value) return
  
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  
  localW.value = Math.max(50, initialWidth + dx)
  localH.value = Math.max(50, initialHeight + dy)
  
  emit('resize-move', '', localW.value, localH.value)
}

const onResizeEnd = () => {
  if (!isResizing.value) return
  
  isResizing.value = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  
  emit('resize-end', '', localW.value, localH.value)
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
})
</script>

<style scoped>
.border-style-solid { border-style: solid; }
.border-width-0-0-8-8 { border-width: 0 0 8px 8px; }
.border-color-transparent-transparent-violet-500-transparent { border-color: transparent transparent rgba(139, 92, 246, 0.8) transparent; }
</style>
