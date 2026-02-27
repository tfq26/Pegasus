<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Trash2,
  Download,
  FileJson,
  FileText,
  ChevronDown,
  Sparkles,
} from 'lucide-vue-next'
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
  'delete-chat': []
  'export-chat': [format: 'json' | 'text']
}>()

const updateOption = (key: keyof typeof props.aiOptions, value: any) => {
  emit('update:aiOptions', { ...props.aiOptions, [key]: value })
}

// Download dropdown state
const downloadOpen = ref(false)

const contextUsage = 45
</script>

<template>
  <div class="flex items-center gap-2 w-full">
    <!-- Model Selection -->
    <div class="flex items-center gap-2 px-2 shrink-0">
      <Sparkles class="w-3.5 h-3.5 text-purple-500" />
      <span class="text-[11px] font-black tracking-tighter uppercase text-purple-500/80">Pegasus AI</span>
      <div class="w-px h-4 bg-border ml-1"></div>
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
      
      <!-- Delete Chat -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('delete-chat')"
              class="p-1.5 rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete Chat</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- Download Dropdown -->
      <div class="relative">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="downloadOpen = !downloadOpen"
                class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-0.5"
              >
                <Download class="w-3.5 h-3.5" />
                <ChevronDown class="w-2.5 h-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Download Chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <!-- Dropdown Menu -->
        <Transition
          enter-active-class="transition duration-100 ease-out"
          enter-from-class="opacity-0 scale-95 translate-y-1"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition duration-75 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 translate-y-1"
        >
          <div
            v-if="downloadOpen"
            v-click-outside="() => downloadOpen = false"
            class="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border border-border bg-popover shadow-xl overflow-hidden"
          >
            <div class="px-3 py-2 border-b border-border/50">
              <p class="text-[10px] font-black tracking-[0.15em] text-muted-foreground">DOWNLOAD AS</p>
            </div>
            <button
              @click="emit('export-chat', 'json'); downloadOpen = false"
              class="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left group"
            >
              <FileJson class="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
              <div>
                <p class="text-[12px] font-semibold text-foreground">Raw JSON</p>
                <p class="text-[10px] text-muted-foreground leading-tight">Full conversation with schema (column names & types, no actual data rows)</p>
              </div>
            </button>
            <button
              @click="emit('export-chat', 'text'); downloadOpen = false"
              class="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left group"
            >
              <FileText class="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p class="text-[12px] font-semibold text-foreground">Plain Text</p>
                <p class="text-[10px] text-muted-foreground leading-tight">Questions and AI responses only, no metadata</p>
              </div>
            </button>
          </div>
        </Transition>
      </div>

    </div>
  </div>

  <!-- Click outside directive shim -->
  <teleport to="body">
    <div
      v-if="downloadOpen"
      class="fixed inset-0 z-40"
      @click="downloadOpen = false"
    />
  </teleport>
</template>
