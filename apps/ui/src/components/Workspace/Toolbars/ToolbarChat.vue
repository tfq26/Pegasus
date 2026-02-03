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
  chatName?: string
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
  <div class="flex items-center gap-2 w-full">
    <!-- Model Selection -->
    <div class="flex items-center gap-1">
      <Select 
        :model-value="aiOptions.model"
        @update:model-value="updateOption('model', $event)"
      >
        <SelectTrigger class="min-w-[140px] w-auto h-7 text-xs border-none bg-transparent hover:bg-muted/50 focus:ring-0 px-2 shadow-none">
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
    <div class="flex items-center gap-2 px-2">
       <span class="text-[10px] text-muted-foreground w-3">T:</span>
       <input
        :value="aiOptions.temperature"
        @input="updateOption('temperature', Number(($event.target as HTMLInputElement).value))"
        type="range"
        min="0"
        max="1"
        step="0.1"
        class="w-16 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
        :title="`Temperature: ${aiOptions.temperature}`"
      />
    </div>

    <!-- Context Usage Indicator -->
    <div class="flex items-center gap-2 px-2" title="Context Token Usage">
        <span class="text-[10px] text-muted-foreground w-3">C:</span>
        <div class="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
                class="h-full bg-blue-500/70 rounded-full transition-all duration-500" 
                :style="{ width: `${contextUsage}%` }"
            ></div>
        </div>
    </div>

    <!-- Chat Name -->
    <div class="flex-1 flex justify-center items-center px-4 min-w-0">
        <span 
          v-if="chatName" 
          class="text-xs font-medium text-muted-foreground truncate max-w-[200px]"
          :title="chatName"
        >
            {{ chatName }}
        </span>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1">
      
      <!-- Clear -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('clear')"
              class="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors"
            >
              <Eraser class="w-4 h-4" />
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
              class="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-violet-500 transition-colors"
            >
              <Wand2 class="w-4 h-4" />
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
