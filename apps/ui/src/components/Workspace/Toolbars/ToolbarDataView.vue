<script setup lang="ts">
import { ref, computed } from 'vue'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  Database,
  Grid,
  History,
  Check,
  Trash2,
  Download,
  MoreHorizontal,
  Plus,
  PlusCircle,
  Columns,
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
  isCompact?: boolean
  versions?: { version: number; table: string; created_at: string; reason?: string }[]
  currentVersion?: number
}>()

const emit = defineEmits<{
  'update:aiOptions': [value: { model: string | null; temperature: number }]
  'update:aiCommand': [value: string]
  'submit-ai-command': []
  'save-view': []
  'toggle-staging': []
  'delete': []
  'export': []
  'update:isCompact': [value: boolean]
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
  <div class="flex items-center gap-2 w-full h-9 px-1">
    <!-- Left: Model & Source -->
    <div class="flex items-center gap-2 shrink-0 px-2">
      <Sparkles class="w-3.5 h-3.5 text-purple-500" />
      <span class="text-[11px] font-black tracking-tighter uppercase text-purple-500/80">Pegasus AI</span>
      <div class="w-px h-4 bg-border ml-1"></div>
    </div>

    <!-- Center: AI Command Bar & Title (Matches Chat handling) -->
    <div class="flex-1 flex justify-center items-center gap-6 max-w-2xl mx-auto min-w-0 px-4">
      <!-- Title Area -->
      <div class="flex items-center gap-2 shrink-0">
        <span 
          class="text-xs font-medium text-muted-foreground truncate max-w-[180px]"
          :title="title"
        >
          {{ title }}
        </span>

        <!-- Version Selector -->
        <DropdownMenu v-if="versions && versions.length > 0">
          <DropdownMenuTrigger as-child>
            <button class="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/40 hover:bg-muted text-[10px] font-bold text-muted-foreground/60 transition-colors">
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

      <!-- Command Bar -->
      <div class="flex-1 flex items-center gap-2 bg-muted/30 border border-border/50 rounded-full px-3 py-1 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/10 transition-all group shadow-inner min-w-[300px]">
        <Sparkles class="w-3.5 h-3.5 text-purple-500/70" />
        <input 
          :value="aiCommand"
          @input="emit('update:aiCommand', ($event.target as HTMLInputElement).value)"
          @keydown.enter="emit('submit-ai-command')"
          :disabled="isAIProcessing"
          placeholder="AI Command: 'Group by status'..." 
          class="bg-transparent border-none outline-none text-[11px] w-full placeholder:text-muted-foreground/40 disabled:opacity-50 font-medium"
        />
        <div v-if="isAIProcessing" class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>

    <!-- Right: Actions -->
    <div class="flex items-center gap-1 shrink-0">
      <div class="flex items-center gap-0.5 mr-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button 
                @click="emit('add-row')"
                class="p-1.5 rounded-lg text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-500 transition-all active:scale-95"
              >
                <PlusCircle class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-[10px] font-bold">Add Row</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button 
                @click="emit('profile-table')"
                class="p-1.5 rounded-lg text-muted-foreground hover:bg-violet-500/10 hover:text-violet-500 transition-all active:scale-95"
              >
                <Dna class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-[10px] font-bold">Profile Table</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <button 
                @click="emit('add-column')"
                class="p-1.5 rounded-lg text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 transition-all active:scale-95"
              >
                <Columns class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="text-[10px] font-bold">Add Column</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div class="w-px h-4 bg-border mr-1"></div>
      <button 
        @click="emit('save-view')"
        :class="['px-3 py-1 rounded-lg text-xs font-black tracking-wider transition-all flex items-center gap-1.5 border shadow-sm active:scale-95', isSavedView ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-background hover:bg-muted text-foreground border-border']"
      >
        <Check v-if="isSavedView" class="w-3 h-3" />
        <Sparkles v-else class="w-3 h-3" />
        {{ isSavedView ? 'View Saved' : 'Save View' }}
      </button>
      
      <button 
        @click="emit('update:isCompact', !isCompact)"
        :class="['px-3 py-1 rounded-lg text-xs font-black  tracking-wider transition-all flex items-center gap-1.5 border shadow-sm active:scale-95', isCompact ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted text-foreground border-border']"
      >
        <Grid class="w-3 h-3" />
        {{ isCompact ? 'Compact' : 'Normal' }}
      </button>

      <div class="w-px h-4 bg-border mx-1"></div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('toggle-staging')"
              class="relative p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-all active:scale-90"
            >
              <History class="w-4 h-4" />
              <span v-if="stagedCount > 0" class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] flex items-center justify-center rounded-full border border-background font-black">
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
              class="p-1.5 rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Remove source</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <button class="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground">
        <MoreHorizontal class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
