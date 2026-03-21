<script setup lang="ts">
import { ref } from 'vue'
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

const downloadOpen = ref(false)
</script>

<template>
  <div class="flex w-full items-center gap-2.5">
    <div class="flex shrink-0 items-center rounded-[16px] border border-border/60 bg-background/70 p-2">
      <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-muted/35 text-primary">
        <Sparkles class="h-3.5 w-3.5" />
      </div>
    </div>

    <div class="flex min-w-0 flex-1 justify-center px-1">
      <div
        v-if="props.chatName"
        class="max-w-[260px] rounded-full border border-border/60 bg-muted/25 px-4 py-1.5 text-center text-[13px] font-medium text-foreground/85"
        :title="props.chatName"
      >
        <span class="block truncate">{{ props.chatName }}</span>
      </div>
    </div>

    <div class="flex items-center gap-1 rounded-[16px] border border-border/60 bg-background/70 px-1.5 py-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('delete-chat')"
              class="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete Chat</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div class="relative">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="downloadOpen = !downloadOpen"
                class="flex items-center gap-1 rounded-xl px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Download class="h-3.5 w-3.5" />
                <ChevronDown class="h-2.5 w-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Export Chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>

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
            class="absolute right-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-border/70 bg-popover/95 shadow-xl backdrop-blur-xl"
          >
            <button
              @click="emit('export-chat', 'json'); downloadOpen = false"
              class="group flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <FileJson class="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
              <div>
                <p class="text-[12px] font-medium text-foreground">Raw JSON</p>
                <p class="text-[10px] leading-tight text-muted-foreground">Conversation with metadata.</p>
              </div>
            </button>
            <button
              @click="emit('export-chat', 'text'); downloadOpen = false"
              class="group flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <FileText class="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <div>
                <p class="text-[12px] font-medium text-foreground">Plain Text</p>
                <p class="text-[10px] leading-tight text-muted-foreground">Questions and responses only.</p>
              </div>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </div>

  <teleport to="body">
    <div
      v-if="downloadOpen"
      class="fixed inset-0 z-40"
      @click="downloadOpen = false"
    />
  </teleport>
</template>
