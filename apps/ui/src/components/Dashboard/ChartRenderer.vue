<template>
  <div class="w-full h-full relative transition-all duration-500 ease-in-out">
    <!-- Stat Display -->
    <div 
      v-if="type === 'stat'" 
      class="flex flex-col h-full p-4 animate-in fade-in zoom-in duration-500"
      :style="{
        justifyContent: 'center',
        alignItems: customization?.textAlign === 'left' ? 'flex-start' : customization?.textAlign === 'right' ? 'flex-end' : 'center',
        textAlign: customization?.textAlign || 'center'
      }"
    >
      <div 
        class="font-bold mb-2 tabular-nums tracking-tight"
        :style="{
          fontSize: (customization?.fontSize || 36) + 'px',
          color: customization?.textColor || 'hsl(var(--primary))',
          lineHeight: '1.2'
        }"
      >
        {{ formatStatValue(data) }}
      </div>
      <div class="text-sm text-muted-foreground  tracking-widest opacity-80 font-medium">{{ options?.label || '' }}</div>
      <div v-if="customization?.description" class="text-xs text-muted-foreground mt-3 max-w-[85%] leading-relaxed">
        {{ customization.description }}
      </div>
    </div>
    
    <!-- Weather Display -->
    <div v-else-if="type === 'weather'" class="flex flex-col h-full p-4 overflow-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div v-if="weatherData" class="space-y-4">
        <!-- Current Weather -->
        <div class="flex items-center gap-4 p-5 bg-muted/30 rounded-xl border border-border/50 shadow-sm backdrop-blur-sm">
          <img 
            v-if="weatherData.icon" 
            :src="weatherData.icon" 
            alt="Weather icon"
            class="w-16 h-16 drop-shadow-md"
          />
          <div class="flex-1">
            <div class="text-4xl font-bold tracking-tighter">{{ formatTemp(weatherData.temp) }}</div>
            <div class="text-sm font-medium text-muted-foreground">{{ weatherData.condition }}</div>
          </div>
          <div class="text-right text-xs text-muted-foreground space-y-1 font-medium">
            <div v-if="weatherData.feels_like">Feels like {{ formatTemp(weatherData.feels_like) }}</div>
            <div v-if="weatherData.humidity">Humidity {{ weatherData.humidity }}%</div>
            <div v-if="weatherData.wind_speed">Wind {{ weatherData.wind_speed }} mph</div>
          </div>
        </div>
        
        <!-- 5-Day Forecast -->
        <div v-if="weatherData.forecast && weatherData.forecast.length > 0" class="space-y-3">
          <h4 class="text-[10px] font-bold  tracking-[0.2em] text-muted-foreground/70 px-1">5-Day Forecast</h4>
          <div class="grid grid-cols-5 gap-2">
            <div 
              v-for="day in weatherData.forecast" 
              :key="day.date"
              class="flex flex-col items-center p-2.5 bg-muted/20 hover:bg-muted/40 transition-colors rounded-lg border border-border/30"
            >
              <div class="text-[10px] font-medium text-muted-foreground mb-1">{{ formatDate(day.date, { weekday: 'short' }) }}</div>
              <img 
                v-if="day.icon" 
                :src="day.icon" 
                alt="Weather icon"
                class="w-10 h-10 filter brightness-110"
              />
              <div class="text-sm font-bold mt-1">{{ formatTemp(day.temp) }}</div>
            </div>
          </div>
        </div>
        
        <!-- Cache Info -->
        <div v-if="weatherData.cached_at" class="text-[10px] text-muted-foreground/60 text-center font-medium pt-2">
          Synced: {{ formatTime(weatherData.cached_at) }}
        </div>
      </div>
      <div v-else class="flex items-center justify-center h-full text-muted-foreground italic text-sm">
        Weather data unavailable
      </div>
    </div>
    
    <!-- Chart Display -->
    <div v-else class="w-full h-full animate-in fade-in duration-700">
      <component :is="chartComponent" :data="computedData" :options="computedOptions" />
    </div>
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
import { useChartConfig } from '@/composables/useChartConfig'
import { formatDate, formatTime, formatTemp, formatNumber } from '@/utils/formatters'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement, RadialLinearScale, Filler)

const props = defineProps<{
  type: string
  data: any
  options: any
  customization?: any
}>()

const emit = defineEmits<{
  (e: 'drill-down', data: { label: string, value: any, datasetLabel: string, index: number }): void
}>()

const { computedData, computedOptions } = useChartConfig(props, emit)

const formatStatValue = (val: any) => {
  if (typeof val === 'object' && val !== null) {
      if (val.datasets && val.datasets[0] && val.datasets[0].data) {
          return formatNumber(val.datasets[0].data[0], props.customization?.decimals || 0)
      }
      if (val.value !== undefined) return formatNumber(val.value, props.customization?.decimals || 0)
  }
  return typeof val === 'number' ? formatNumber(val, props.customization?.decimals || 0) : val
}

// Weather data extraction
const weatherData = computed(() => {
  if (props.type !== 'weather' || !props.data) return null
  return Array.isArray(props.data) ? props.data[0] : props.data
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
