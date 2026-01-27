<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  Zap,
  Eraser,
  Download,
  Wand2,
  ChevronUp,
  ChevronDown,

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

const isCollapsed = ref(false)


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

// Ensure a model is selected
onMounted(() => {
  if (!props.aiOptions.model && aiModels.value.length > 0) {
    updateOption('model', aiModels.value[0]?.value)
  }
})

const updateOption = (key: keyof typeof props.aiOptions, value: any) => {
  emit('update:aiOptions', { ...props.aiOptions, [key]: value })
}

// Mock context usage for now (random 30-70%)
 
</script>

<template>
  <div class="flex flex-col w-full bg-background/50 backdrop-blur-sm border-b border-border/40 transition-all duration-300 ease-in-out">
    
    <!-- Main Header Row (Visible when NOT collapsed) -->
    <div v-if="!isCollapsed" class="flex items-center justify-between px-3 py-1 gap-3 animate-in slide-in-from-top-2 duration-200">
      
      <!-- Left: Model & Context -->
      <div class="flex items-center gap-3 flex-1">
        <!-- Model Selector (Wider & Slimmer) -->
        <Select 
          :model-value="aiOptions.model"
          @update:model-value="updateOption('model', $event)"
        >
          <SelectTrigger class="w-[260px] h-7 text-xs bg-muted/30 border-border/50 hover:bg-muted/50 transition-colors focus:ring-0 shadow-sm rounded-md px-2">
            <div class="flex items-center gap-2 truncate">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)] shrink-0"></div>
              <SelectValue class="truncate" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="model in aiModels"
              :key="model.value"
              :value="model.value"
            >
              <div class="flex items-center gap-2">
                <span class="font-medium text-xs">{{ model.label }}</span>
                <span v-if="model.value.includes('pro')" class="ml-auto text-[9px] bg-violet-500/10 text-violet-500 px-1 py-0.5 rounded uppercase font-bold tracking-wider">Pro</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Vertical Divider -->
        <div class="h-4 w-px bg-border/40"></div>

        <!-- Parameters Group (Ultra Compact) -->
        <div class="flex items-center gap-3">
          <!-- Temperature -->
          <div class="flex items-center gap-2">
             <span class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 hidden sm:inline-block" title="Temperature">Temp</span>
             <TooltipProvider>
              <Tooltip>
                <TooltipTrigger as-child>
                   <input
                    :value="aiOptions.temperature"
                    @input="updateOption('temperature', Number(($event.target as HTMLInputElement).value))"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    class="w-[60px] h-1 bg-muted rounded-full appearance-none cursor-pointer accent-violet-500 hover:accent-violet-400 transition-colors"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p class="text-xs">Creativity: {{ aiOptions.temperature }}</p>
                </TooltipContent>
              </Tooltip>
             </TooltipProvider>
          </div>


        </div>
      </div>

      <!-- Right: Actions -->
      <div class="flex items-center gap-1">
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="emit('clear')"
                class="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-all group"
              >
                <Eraser class="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                <span class="text-[10px] font-semibold">Clear</span>
              </button>
            </TooltipTrigger>
            <TooltipContent class="text-xs">Clear conversation history</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div class="h-3 w-px bg-border/40 mx-1"></div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="emit('toggle-wrangler')"
                class="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:bg-violet-500/10 hover:text-violet-500 transition-all font-medium"
              >
                <Wand2 class="w-3.5 h-3.5" />
                <span class="text-[10px]">Wrangler</span>
              </button>
            </TooltipTrigger>
            <TooltipContent class="text-xs">Open Data Wrangler</TooltipContent>
          </Tooltip>
        </TooltipProvider>



        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="emit('export-chat')"
                class="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:bg-muted transition-all"
              >
                <Download class="w-3.5 h-3.5" />
                <span class="text-[10px] font-medium hidden sm:inline">Export</span>
              </button>
            </TooltipTrigger>
            <TooltipContent class="text-xs">Export transcript</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <div class="h-3 w-px bg-border/40 mx-1"></div>

        <!-- Collapse Toggle -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="isCollapsed = true"
                class="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
              >
                <ChevronUp class="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent class="text-xs">Collapse Toolbar</TooltipContent>
          </Tooltip>
        </TooltipProvider>

      </div>
    </div>

    <!-- Collapsed State (Active when isCollapsed) -->
    <div 
      v-else 
      @click="isCollapsed = false"
      class="flex items-center justify-center py-0.5 cursor-pointer hover:bg-muted/50 transition-colors group h-3"
      title="Show Toolbar"
    >
      <ChevronDown class="w-3 h-3 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
    </div>

  </div>
</template>
