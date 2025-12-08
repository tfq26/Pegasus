<template>
  <div class="w-full h-full relative">
    <div v-if="type === 'stat'" class="flex flex-col items-center justify-center h-full p-4 text-center">
      <div class="text-4xl font-bold text-primary mb-2">{{ formatStatValue(data) }}</div>
      <div class="text-sm text-muted-foreground uppercase tracking-wider">{{ options?.label || '' }}</div>
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
  const data = JSON.parse(JSON.stringify(props.data))
  
  if (props.customization?.colorPalette?.shades && data.datasets?.[0]) {
    const shades = props.customization.colorPalette.shades
    data.datasets[0].backgroundColor = shades
    data.datasets[0].borderColor = shades
  }
  
  return data
})

const computedOptions = computed(() => {
  return props.options
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
