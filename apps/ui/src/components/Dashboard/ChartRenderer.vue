<template>
  <div class="w-full h-full relative">
    <!-- Stat Display -->
    <div v-if="type === 'stat'" class="flex flex-col items-center justify-center h-full p-4 text-center">
      <div class="text-4xl font-bold text-primary mb-2">{{ formatStatValue(data) }}</div>
      <div class="text-sm text-muted-foreground uppercase tracking-wider">{{ options?.label || '' }}</div>
      <div v-if="customization?.description" class="text-xs text-muted-foreground mt-2 max-w-[80%]">
        {{ customization.description }}
      </div>
    </div>
    
    <!-- Weather Display -->
    <div v-else-if="type === 'weather'" class="flex flex-col h-full p-4 overflow-auto">
      <div v-if="weatherData" class="space-y-4">
        <!-- Current Weather -->
        <div class="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
          <img 
            v-if="weatherData.icon" 
            :src="weatherData.icon" 
            alt="Weather icon"
            class="w-16 h-16"
          />
          <div class="flex-1">
            <div class="text-3xl font-bold">{{ formatTemp(weatherData.temp) }}</div>
            <div class="text-sm text-muted-foreground">{{ weatherData.condition }}</div>
          </div>
          <div class="text-right text-xs text-muted-foreground space-y-1">
            <div v-if="weatherData.feels_like">Feels like {{ formatTemp(weatherData.feels_like) }}</div>
            <div v-if="weatherData.humidity">Humidity {{ weatherData.humidity }}%</div>
            <div v-if="weatherData.wind_speed">Wind {{ weatherData.wind_speed }} mph</div>
          </div>
        </div>
        
        <!-- 5-Day Forecast -->
        <div v-if="weatherData.forecast && weatherData.forecast.length > 0" class="space-y-2">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">5-Day Forecast</h4>
          <div class="grid grid-cols-5 gap-2">
            <div 
              v-for="day in weatherData.forecast" 
              :key="day.date"
              class="flex flex-col items-center p-2 bg-muted/20 rounded-lg"
            >
              <div class="text-xs text-muted-foreground mb-1">{{ formatDate(day.date) }}</div>
              <img 
                v-if="day.icon" 
                :src="day.icon" 
                alt="Weather icon"
                class="w-8 h-8"
              />
              <div class="text-sm font-semibold">{{ formatTemp(day.temp) }}</div>
              <div class="text-xs text-muted-foreground truncate w-full text-center">{{ day.condition }}</div>
            </div>
          </div>
        </div>
        
        <!-- Cache Info -->
        <div v-if="weatherData.cached_at" class="text-xs text-muted-foreground text-center">
          Last updated: {{ formatTime(weatherData.cached_at) }}
        </div>
      </div>
      <div v-else class="flex items-center justify-center h-full text-muted-foreground">
        No weather data available
      </div>
    </div>
    
    <!-- Chart Display -->
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

// Weather data extraction
const weatherData = computed(() => {
  if (props.type !== 'weather' || !props.data) return null
  
  // Data might be in different formats depending on query result
  if (Array.isArray(props.data) && props.data.length > 0) {
    return props.data[0]
  }
  
  return props.data
})

// Format temperature
const formatTemp = (temp: number) => {
  if (temp === undefined || temp === null) return '—'
  return `${Math.round(temp)}°`
}

// Format date for forecast
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Format timestamp
const formatTime = (timestamp: string) => {
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit' 
  })
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

  // Add full label display in tooltip title (for truncated X-axis labels)
  const fullLabels = options.plugins?.fullLabels
  if (fullLabels && Array.isArray(fullLabels)) {
    if (!options.plugins) options.plugins = {}
    if (!options.plugins.tooltip) options.plugins.tooltip = {}
    if (!options.plugins.tooltip.callbacks) options.plugins.tooltip.callbacks = {}
    
    options.plugins.tooltip.callbacks.title = (tooltipItems: any[]) => {
      if (tooltipItems.length === 0) return ''
      const index = tooltipItems[0].dataIndex
      return fullLabels[index] || tooltipItems[0].label
    }
    
    // Remove fullLabels from plugins to avoid Chart.js warnings
    delete options.plugins.fullLabels
  }

  // Axis Visibility & Titles
  const hideAxes = !!props.customization?.hideAxes
  
  if (!options.scales) {
    // Only create scales if we are NOT a pie/doughnut chart (which don't use X/Y scales)
    if (props.type !== 'pie' && props.type !== 'doughnut') {
      options.scales = {
        x: { display: !hideAxes },
        y: { display: !hideAxes }
      }
    }
  } else {
    // Standard X/Y axes
    if (options.scales.x) {
      options.scales.x.display = !hideAxes
      // Fallback title for X axis if missing
      if (!hideAxes && !options.scales.x.title?.text && props.data?.labels?.length > 0) {
        if (!options.scales.x.title) options.scales.x.title = { display: true }
      }
    }
    if (options.scales.y) {
      options.scales.y.display = !hideAxes
      // Fallback title for Y axis if missing
      if (!hideAxes && !options.scales.y.title?.text && props.data?.datasets?.[0]?.label) {
        if (!options.scales.y.title) options.scales.y.title = { display: true, text: props.data.datasets[0].label }
      }
    }
    
    // Radial axis (Radar/PolarArea)
    if (options.scales.r) options.scales.r.display = !hideAxes
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
