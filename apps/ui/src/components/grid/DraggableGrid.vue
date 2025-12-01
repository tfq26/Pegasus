<template>
  <div 
    ref="containerRef" 
    class="draggable-grid relative w-full h-full"
    :style="{ height: containerHeight + 'px' }"
  >
    <DraggableItem
      v-for="item in items"
      :key="item.i"
      :x="item.x"
      :y="item.y"
      :w="item.w"
      :h="item.h"
      :col-width="colWidth"
      :row-height="rowHeight"
      :gap="gap"
      :is-draggable="isDraggable"
      :is-resizable="isResizable"
      :is-locked="isLocked"
      :drag-selector="dragSelector"
      :cols="cols"
      @drag-end="(id, x, y) => onDragEnd(item, x, y)"
      @resize-end="(id, w, h) => onResizeEnd(item, w, h)"
    >
      <slot name="item" :item="item"></slot>
    </DraggableItem>
    
    <slot name="placeholder"></slot>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import DraggableItem from './DraggableItem.vue'

interface GridItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

const props = withDefaults(defineProps<{
  items: GridItem[]
  cols?: number
  rowHeight?: number
  gap?: number
  isDraggable?: boolean
  isResizable?: boolean
  isLocked?: boolean
  dragSelector?: string
  verticalCompact?: boolean
}>(), {
  cols: 12,
  rowHeight: 30,
  gap: 8,
  isDraggable: true,
  isResizable: true,
  isLocked: false,
  verticalCompact: false
})

const emit = defineEmits<{
  (e: 'update:items', items: GridItem[]): void
  (e: 'layout-updated', items: GridItem[]): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const colWidth = ref(100)

// Calculate container height based on lowest item
const containerHeight = computed(() => {
  const maxY = Math.max(...props.items.map(i => i.y + i.h), 0)
  return maxY * (props.rowHeight + props.gap) + 100 // Add some buffer
})

// Resize Observer to update column width
let resizeObserver: ResizeObserver | null = null

const updateColWidth = () => {
  if (containerRef.value) {
    const width = containerRef.value.clientWidth
    colWidth.value = (width - (props.cols - 1) * props.gap) / props.cols
  }
}

onMounted(() => {
  updateColWidth()
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(updateColWidth)
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})

// --- Compaction Logic ---

const compact = (items: GridItem[]): GridItem[] => {
  if (!props.verticalCompact) return items

  // Clone items to avoid mutating props directly during calculation
  const sorted = [...items].sort((a, b) => {
    if (a.y === b.y) return a.x - b.x
    return a.y - b.y
  })

  const placed: GridItem[] = []

  for (const item of sorted) {
    let newY = 0
    while (newY < item.y) {
      const candidate = { ...item, y: newY }
      if (!collidesWithAny(candidate, placed)) {
        // Found a valid spot higher up?
        // Actually we need to find the *highest* valid spot.
        // Simple approach: start at 0 and go down until it fits.
        break 
      }
      newY++
    }
    
    // The above loop is slightly wrong. We want to start at 0 and find the first Y that fits.
    // But we also want to preserve x.
    
    let compactedY = 0
    while (true) {
      const candidate = { ...item, y: compactedY }
      if (!collidesWithAny(candidate, placed)) {
        item.y = compactedY
        break
      }
      compactedY++
    }
    
    placed.push(item)
  }

  return placed
}

const collidesWithAny = (item: GridItem, others: GridItem[]) => {
  return others.some(other => collides(item, other))
}

const collides = (a: GridItem, b: GridItem) => {
  if (a.i === b.i) return false
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

// Watch for verticalCompact prop change to trigger compaction
watch(() => props.verticalCompact, (newVal) => {
  if (newVal) {
    const compacted = compact(props.items.map(i => ({ ...i })))
    emit('update:items', compacted)
    emit('layout-updated', compacted)
  }
})

// --- Snapping Logic ---

const onDragEnd = (item: GridItem, pixelX: number, pixelY: number) => {
  // Calculate new grid coordinates
  const newX = Math.round(pixelX / (colWidth.value + props.gap))
  const newY = Math.round(pixelY / (props.rowHeight + props.gap))
  
  // Constrain to grid bounds
  const constrainedX = Math.max(0, Math.min(newX, props.cols - item.w))
  const constrainedY = Math.max(0, newY)
  
  if (constrainedX !== item.x || constrainedY !== item.y) {
    let newItems = props.items.map(i => {
      if (i.i === item.i) {
        return { ...i, x: constrainedX, y: constrainedY }
      }
      return i
    })
    
    if (props.verticalCompact) {
      newItems = compact(newItems)
    }
    
    emit('update:items', newItems)
    emit('layout-updated', newItems)
  }
}

const onResizeEnd = (item: GridItem, pixelW: number, pixelH: number) => {
  // Calculate new grid dimensions
  const newW = Math.round((pixelW + props.gap) / (colWidth.value + props.gap))
  const newH = Math.round((pixelH + props.gap) / (props.rowHeight + props.gap))
  
  // Apply constraints
  const minW = item.minW || 1
  const minH = item.minH || 1
  const maxW = Math.min(item.maxW || props.cols, props.cols - item.x)
  const maxH = item.maxH || Infinity
  
  const constrainedW = Math.max(minW, Math.min(newW, maxW))
  const constrainedH = Math.max(minH, Math.min(newH, maxH))
  
  if (constrainedW !== item.w || constrainedH !== item.h) {
    let newItems = props.items.map(i => {
      if (i.i === item.i) {
        return { ...i, w: constrainedW, h: constrainedH }
      }
      return i
    })

    if (props.verticalCompact) {
      newItems = compact(newItems)
    }

    emit('update:items', newItems)
    emit('layout-updated', newItems)
  }
}
</script>
