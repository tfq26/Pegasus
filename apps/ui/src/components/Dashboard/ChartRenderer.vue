<template>
  <div class="w-full h-full relative">
    <div v-if="type === 'stat'" class="flex flex-col items-center justify-center h-full p-4 text-center">
      <div class="text-4xl font-bold text-primary mb-2">{{ formatStatValue(data) }}</div>
      <div class="text-sm text-muted-foreground uppercase tracking-wider">{{ options?.label || '' }}</div>
      <div v-if="customization?.description" class="text-xs text-muted-foreground mt-2 max-w-[80%]">
        {{ customization.description }}
      </div>
    </div>
    <component v-else :is="chartComponent" :data="computedData" :options="computedOptions" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale,
  Filler
} from 'chart.js'
import { Bar, Line, Pie, Doughnut, Radar, PolarArea, Scatter, Bubble } from 'vue-chartjs'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement, RadialLinearScale, Filler)

const props = defineProps<{
  type: string
  data: any
  options: any
  customization?: any
}>()

const formatStatValue = (val: any) => {
  if (typeof val === 'object' && val !== null) {
      if (val.datasets && val.datasets[0] && val.datasets[0].data) {
          return val.datasets[0].data[0]
      }
      if (val.value !== undefined) return val.value
  }
  return val
}

const computedData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] }
  const data = JSON.parse(JSON.stringify(props.data))
  
  // Apply custom labels (overrides axis/category labels)
  if (props.customization?.labels && data.labels) {
    data.labels = data.labels.map((label: string, index: number) => {
      return props.customization.labels?.[index] || label
    })
  }
  
  if (props.customization?.colorPalette?.shades && data.datasets?.[0]) {
    const shades = props.customization.colorPalette.shades
    data.datasets[0].backgroundColor = shades
    data.datasets[0].borderColor = shades
  }
  
  return data
})

const emit = defineEmits<{
  (e: 'drill-down', data: { label: string, value: any, datasetLabel: string, index: number }): void
}>()

const computedOptions = computed(() => {
  const options = JSON.parse(JSON.stringify(props.options || {}))
  
  // Add drill-down handler
  options.onClick = (event: any, elements: any[]) => {
    if (elements.length > 0) {
      const chart = event.chart
      const firstElement = elements[0]
      const index = firstElement.index
      const label = chart.data.labels[index]
      const value = chart.data.datasets[firstElement.datasetIndex].data[index]
      const datasetLabel = chart.data.datasets[firstElement.datasetIndex].label
      
      console.log(`[ChartRenderer] Drill-down clicked: ${label} = ${value}`)
      emit('drill-down', { label, value, datasetLabel, index })
    }
  }

  // Add hover notes to tooltip
  if (props.customization?.notes) {
    if (!options.plugins) options.plugins = {}
    if (!options.plugins.tooltip) options.plugins.tooltip = {}
    if (!options.plugins.tooltip.callbacks) options.plugins.tooltip.callbacks = {}
    
    options.plugins.tooltip.callbacks.footer = (tooltipItems: any[]) => {
      const notes: string[] = []
      tooltipItems.forEach((item) => {
        const index = item.dataIndex
        const note = props.customization.notes?.[index]
        if (note) notes.push(`Note: ${note}`)
      })
      return notes.join('\n')
    }
  }
  
  return options
})

const chartComponent = computed(() => {
  switch (props.type) {
    case 'bar': return Bar
    case 'line': return Line
    case 'pie': return Pie
    case 'doughnut': return Doughnut
    case 'radar': return Radar
    case 'polarArea': return PolarArea
    case 'scatter': return Scatter
    case 'bubble': return Bubble
    default: return Bar
  }
})
</script>
