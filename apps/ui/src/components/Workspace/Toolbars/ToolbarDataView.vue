<script setup lang="ts">
import { ref, computed } from 'vue'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  History,
  Check,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  Dna
} from 'lucide-vue-next'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  aiOptions: { model: string | null; temperature: number }
  availableModels: { id: string; name: string }[]
  isExecuting: boolean
  
  // Data View Specific
  title: string
  isExcelSource: boolean
  isSavedView: boolean
  stagedCount: number
  aiCommand: string
  isAIProcessing: boolean
  versions?: { version: number; table: string; created_at: string; reason?: string }[]
  currentVersion?: number
}>()

const emit = defineEmits<{
  'update:aiOptions': [value: { model: string | null; temperature: number }]
  'update:aiCommand': [value: string]
  'submit-ai-command': []
  'toggle-staging': []
  'delete': []
  'export': []
  'add-row': []
  'add-column': []
  'profile-table': []
  'version-change': [version: number]
}>()

const updateOption = (key: keyof typeof props.aiOptions, value: any) => {
  emit('update:aiOptions', { ...props.aiOptions, [key]: value })
}
</script>

<template>
  <div class="flex h-10 w-full items-center gap-3 px-1">
    <div class="flex-1 flex justify-center items-center gap-6 max-w-2xl mx-auto min-w-0 px-4">
      <div class="flex items-center gap-2 shrink-0">
        <span
          class="max-w-[180px] truncate rounded-full border border-border/70 bg-muted/35 px-3 py-1.5 text-xs font-medium text-muted-foreground"
          :title="title"
        >
          {{ title }}
        </span>

        <DropdownMenu v-if="versions && versions.length > 0">
          <DropdownMenuTrigger as-child>
            <button class="flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted">
              <History class="w-3 h-3 text-primary/50" />
              v{{ currentVersion ?? 0 }}
              <ChevronDown class="w-2.5 h-2.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-48">
            <DropdownMenuItem 
              v-for="v in versions" 
              :key="v.version"
              @click="emit('version-change', v.version)"
              :class="cn(v.version === currentVersion && 'bg-muted font-bold')"
            >
              <div class="flex flex-col gap-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-xs">Version {{ v.version === 0 ? 'Original' : v.version }}</span>
                  <Check v-if="v.version === currentVersion" class="w-3 h-3 text-emerald-500" />
                </div>
                <span v-if="v.reason" class="text-[10px] text-muted-foreground italic truncate">{{ v.reason }}</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="flex min-w-[320px] flex-1 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 shadow-inner transition-all focus-within:border-primary/30 focus-within:bg-background">
        <Sparkles class="w-3.5 h-3.5 text-primary/70" />
        <input 
          :value="aiCommand"
          @input="emit('update:aiCommand', ($event.target as HTMLInputElement).value)"
          @keydown.enter="emit('submit-ai-command')"
          :disabled="isAIProcessing"
          placeholder="AI Command: 'Group by status'..." 
          class="w-full border-none bg-transparent text-[11px] font-medium outline-none placeholder:text-muted-foreground/40 disabled:opacity-50"
        />
        <div v-if="isAIProcessing" class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <div class="flex items-center gap-0.5 rounded-xl border border-border/70 bg-background/70 p-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button 
                @click="emit('profile-table')"
                class="rounded-lg p-2 text-muted-foreground transition-all hover:bg-violet-500/10 hover:text-violet-500 active:scale-95"
              >
                <Dna class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-[10px] font-bold">Profile Table</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div class="flex items-center gap-1 rounded-xl border border-border/70 bg-background/70 p-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="emit('toggle-staging')"
                class="relative rounded-lg p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-90"
              >
                <History class="w-4 h-4" />
                <span v-if="stagedCount > 0" class="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-rose-500 text-[8px] font-black text-white">
                  {{ stagedCount }}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Change History</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="emit('delete')"
                class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Remove source</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <MoreHorizontal class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
