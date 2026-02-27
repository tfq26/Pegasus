<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>Add Dashboard Element</DialogTitle>
        <DialogDescription>
          Choose the type of element you want to add to your dashboard.
        </DialogDescription>
      </DialogHeader>

      <div class="grid grid-cols-2 gap-4 py-4">
        <!-- Visualization -->
        <button
          @click="selectType('visualization')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
            <BarChart2 class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">Visualization</h3>
            <p class="text-xs text-muted-foreground mt-1">Charts, graphs, and stats based on data queries</p>
          </div>
        </button>

        <!-- Table -->
        <button
          @click="selectType('table')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
            <Table class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">Data Table</h3>
            <p class="text-xs text-muted-foreground mt-1">Tabular data view from your database</p>
          </div>
        </button>

        <!-- Text Block -->
        <button
          @click="selectType('text')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-orange-500/10 text-orange-500 group-hover:scale-110 transition-transform">
            <Type class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">Text Block</h3>
            <p class="text-xs text-muted-foreground mt-1">Rich text, instructions, or markdown content</p>
          </div>
        </button>

        <!-- File Upload -->
        <button
          @click="selectType('file')"
          class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
        >
          <div class="p-3 rounded-lg bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
            <FileUp class="w-8 h-8" />
          </div>
          <div class="text-center">
            <h3 class="font-medium">File Attachment</h3>
            <p class="text-xs text-muted-foreground mt-1">Upload files or zip folders (Max 200MB)</p>
          </div>
        </button>
      </div>

      <!-- API Widgets Section -->
      <div class="border-t pt-4 mt-2">
        <h3 class="text-sm font-semibold mb-3 text-muted-foreground  tracking-wide">API Widgets</h3>
        <div class="grid grid-cols-2 gap-4">
          <!-- Weather Widget -->
          <button
            @click="selectWidget('weather')"
            class="flex flex-col items-center justify-center gap-3 p-6 border rounded-sm hover:bg-muted/50 hover:border-primary/50 transition-all group"
          >
            <div class="p-3 rounded-lg bg-cyan-500/10 text-cyan-500 group-hover:scale-110 transition-transform">
              <Cloud class="w-8 h-8" />
            </div>
            <div class="text-center">
              <h3 class="font-medium">Weather</h3>
              <p class="text-xs text-muted-foreground mt-1">Current weather and forecast</p>
            </div>
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <WeatherConfig
    v-model:open="showWeatherConfig"
    @save="handleWidgetConfig('weather', $event)"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { BarChart2, Table, Type, FileUp, Cloud } from 'lucide-vue-next'
import WeatherConfig from './WidgetConfig/WeatherConfig.vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'select': [type: 'visualization' | 'table' | 'text' | 'file']
  'select-widget': [widgetType: string, config: any]
}>()

const showWeatherConfig = ref(false)

const selectType = (type: 'visualization' | 'table' | 'text' | 'file') => {
  emit('select', type)
  emit('update:open', false)
}

const selectWidget = (widgetType: string) => {
  // Close main dialog
  emit('update:open', false)
  
  // Open appropriate config modal
  if (widgetType === 'weather') {
    showWeatherConfig.value = true
  }
}

const handleWidgetConfig = (widgetType: string, config: any) => {
  emit('select-widget', widgetType, config)
}
</script>
