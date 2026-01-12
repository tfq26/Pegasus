<script setup lang="ts">
import { computed } from 'vue'
import {
  Zap,
  Eraser,
  Download,
  Wand2,
} from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const props = defineProps<{
  aiOptions: { model: string | null; temperature: number }
  availableModels: { id: string; name: string }[]
  isExecuting: boolean
}>()

const emit = defineEmits<{
  'update:aiOptions': [value: { model: string | null; temperature: number }]
  'run': []
  'clear': []
  'export-chat': []
  'toggle-wrangler': []
}>()

const defaultModels = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-pro', label: 'Gemini Pro' },
]

const aiModels = computed(() => {
  if (props.availableModels && props.availableModels.length > 0) {
    return props.availableModels.map(m => ({
      value: m.id,
      label: m.name
    }))
  }
  return defaultModels
})

const updateOption = (key: keyof typeof props.aiOptions, value: any) => {
  emit('update:aiOptions', { ...props.aiOptions, [key]: value })
}

// Mock context usage for now (random 30-70%)
const contextUsage = 45 
</script>

<template>
  <div class="flex items-center gap-3 w-full">
    <!-- Model Selection -->
    <div class="flex items-center gap-2">
      <span class="hidden md:inline text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Model</span>
      <Select 
        :model-value="aiOptions.model"
        @update:model-value="updateOption('model', $event)"
      >
        <SelectTrigger class="w-[180px] h-8 text-xs text-muted-foreground bg-background border-border focus:ring-primary focus:border-primary">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="model in aiModels"
            :key="model.value"
            :value="model.value"
          >
            {{ model.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    
    <!-- Temperature Slider -->
    <div class="flex items-center gap-2">
       <span class="hidden md:inline text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Temp</span>
       <input
        :value="aiOptions.temperature"
        @input="updateOption('temperature', Number(($event.target as HTMLInputElement).value))"
        type="range"
        min="0"
        max="1"
        step="0.1"
        class="w-24 h-2 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer accent-primary"
        :title="`Temperature: ${aiOptions.temperature}`"
      />
    </div>

    <!-- Context Usage Indicator -->
    <div class="flex items-center gap-2 px-2 border-l border-border ml-2" title="Context Token Usage">
        <span class="hidden md:inline text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Context</span>
        <div class="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
                class="h-full bg-blue-500/70 rounded-full transition-all duration-500" 
                :style="{ width: `${contextUsage}%` }"
            ></div>
        </div>
    </div>

    <div class="flex-1"></div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <!-- Run Button Removed as requested -->
      <!-- <button
        @click="emit('run')"
        :disabled="isExecuting"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-wait"
      >
        <Zap v-if="!isExecuting" class="w-3.5 h-3.5" />
        <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-lg animate-spin"></span>
        <span class="hidden md:inline">{{ isExecuting ? 'Running...' : 'Run' }}</span>
      </button> -->
      
      <!-- Clear -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('clear')"
              class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Eraser class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear Chat</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- Data Wrangler -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('toggle-wrangler')"
              class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-violet-500 transition-colors"
            >
              <Wand2 class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Data Wrangler</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- Export -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('export-chat')"
              class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Download class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Export Chat History</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
</template>
