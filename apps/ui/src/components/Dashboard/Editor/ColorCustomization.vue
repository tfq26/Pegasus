<template>
  <div class="space-y-6 h-full flex flex-col">
    <!-- Quick Themes -->
    <div class="space-y-2">
      <label class="text-sm font-medium">Quick Themes</label>
      <div class="grid grid-cols-3 gap-2">
        <button 
          v-for="theme in themes" 
          :key="theme.name"
          @click="applyTheme(theme.colors)"
          class="flex flex-col gap-2 p-2 rounded-md border border-border hover:bg-muted transition text-left"
        >
          <div class="flex gap-1 h-4 w-full rounded overflow-hidden">
            <div 
              v-for="color in theme.colors" 
              :key="color"
              :style="{ backgroundColor: color }"
              class="flex-1 h-full"
            />
          </div>
          <span class="text-xs font-medium">{{ theme.name }}</span>
        </button>
      </div>
    </div>

    <div class="relative">
      <div class="absolute inset-0 flex items-center">
        <span class="w-full border-t border-border" />
      </div>
      <div class="relative flex justify-center text-xs uppercase">
        <span class="bg-background px-2 text-muted-foreground">Or Customize</span>
      </div>
    </div>

    <!-- Custom Generator -->
    <div class="space-y-4 flex-1">
      <!-- Base Color -->
      <div class="flex gap-4">
        <div class="space-y-2 flex-1">
          <label class="text-sm font-medium">Base Color</label>
          <div class="flex gap-2">
            <input 
              type="color" 
              v-model="baseColor"
              @input="generatePalette"
              class="h-9 w-12 p-1 rounded-md border border-input cursor-pointer"
            />
            <input 
              type="text" 
              v-model="baseColor"
              @change="generatePalette"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors uppercase font-mono"
            />
          </div>
        </div>

        <!-- Mode Selector -->
        <div class="space-y-2 flex-[2]">
          <label class="text-sm font-medium">Palette Mode</label>
          <div class="flex p-1 bg-muted rounded-md">
            <button 
              v-for="mode in paletteModes" 
              :key="mode.id"
              @click="setMode(mode.id)"
              :class="[
                'flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-all',
                selectedMode === mode.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              ]"
            >
              {{ mode.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- Shade Count -->
      <div class="space-y-2">
        <div class="flex justify-between">
          <label class="text-sm font-medium">Shades</label>
          <span class="text-xs text-muted-foreground">{{ shadeCount }} colors</span>
        </div>
        <input 
          type="range" 
          v-model.number="shadeCount"
          @input="generatePalette"
          min="3" 
          max="12" 
          step="1"
          class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
        />
      </div>

      <!-- Generated Palette Preview -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Generated Palette</label>
        <div class="grid grid-cols-6 gap-2">
          <div 
            v-for="(color, i) in generatedPalette" 
            :key="i"
            class="group relative flex flex-col gap-1 items-center"
          >
            <div 
              :style="{ backgroundColor: color }"
              class="w-full aspect-square rounded-md border border-border shadow-sm cursor-pointer hover:scale-105 transition-transform"
              @click="copyColor(color)"
            />
            <span class="text-[10px] font-mono text-muted-foreground uppercase opacity-0 group-hover:opacity-100 transition-opacity">
              {{ color }}
            </span>
            <div v-if="copiedColor === color" class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-md text-white text-xs font-bold">
              Copied
            </div>
          </div>
        </div>
      </div>

      <button 
        @click="applyGeneratedPalette"
        class="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition shadow-sm"
      >
        Apply Palette to Chart
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { 
  generateMonochromatic, 
  generateTonal, 
  generateAnalogous,
  COLOR_THEMES 
} from '@/utils/colorPalette'
import { toast } from 'vue-sonner'

interface DashboardElement {
  id: string
  // ... other fields
  customization?: {
    colorPalette?: {
      mode: string
      baseColor?: string
      shades: string[]
      appliedTheme?: string
    }
  }
}

const props = defineProps<{
  modelValue: DashboardElement
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DashboardElement]
}>()

// State
const baseColor = ref('#3b82f6')
const selectedMode = ref('monochromatic')
const shadeCount = ref(5)
const generatedPalette = ref<string[]>([])
const copiedColor = ref<string | null>(null)

const themes = COLOR_THEMES
const paletteModes = [
  { id: 'monochromatic', name: 'Mono' },
  { id: 'tonal', name: 'Tonal' },
  { id: 'analogous', name: 'Analogous' }
]

// Initialize from existing config if available
onMounted(() => {
  const existingPalette = props.modelValue.customization?.colorPalette
  if (existingPalette) {
    if (existingPalette.baseColor) baseColor.value = existingPalette.baseColor
    if (existingPalette.mode && existingPalette.mode !== 'theme') selectedMode.value = existingPalette.mode
    if (existingPalette.shades) {
      shadeCount.value = existingPalette.shades.length
      generatedPalette.value = existingPalette.shades
    }
  } else {
    generatePalette()
  }
})

const setMode = (mode: string) => {
  selectedMode.value = mode
  generatePalette()
}

const generatePalette = () => {
  switch (selectedMode.value) {
    case 'monochromatic':
      generatedPalette.value = generateMonochromatic(baseColor.value, shadeCount.value)
      break
    case 'tonal':
      generatedPalette.value = generateTonal(baseColor.value, shadeCount.value)
      break
    case 'analogous':
      generatedPalette.value = generateAnalogous(baseColor.value, shadeCount.value)
      break
  }
}

const copyColor = (color: string) => {
  navigator.clipboard.writeText(color)
  copiedColor.value = color
  setTimeout(() => copiedColor.value = null, 1000)
}

const applyTheme = (colors: string[]) => {
  updateElementConfig({
    mode: 'theme',
    shades: colors
  })
}

const applyGeneratedPalette = () => {
  updateElementConfig({
    mode: selectedMode.value,
    baseColor: baseColor.value,
    shades: generatedPalette.value
  })
}

const updateElementConfig = (paletteConfig: any) => {
  const updatedElement = JSON.parse(JSON.stringify(props.modelValue))
  
  if (!updatedElement.customization) {
    updatedElement.customization = {}
  }
  
  updatedElement.customization.colorPalette = paletteConfig
  
  emit('update:modelValue', updatedElement)
  toast.success('Color palette applied')
}
</script>
