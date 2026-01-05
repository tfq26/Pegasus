<script setup lang="ts">
import {
  Play,
  Square,
  Eraser,
  AlignLeft,
  Languages, 
  History,
  Info,
  Save
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
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  queryOptions: { timeout: number; limit: number; autoCommit: boolean }
  isExecuting: boolean
  queryHistory?: any[]
}>()

const emit = defineEmits<{
  'update:queryOptions': [value: { timeout: number; limit: number; autoCommit: boolean }]
  'run': []
  'stop': []
  'clear': []
  'format-sql': []
  'translate': []
  'explain-query': []
  'load-query': [query: string]
  'save': []
}>()

const updateOption = (key: keyof typeof props.queryOptions, value: any) => {
  emit('update:queryOptions', { ...props.queryOptions, [key]: value })
}
</script>

<template>
  <div class="flex items-center gap-3 w-full">
    <!-- Run / Stop Controls -->
    <div class="flex items-center gap-2">
      <button
        @click="emit('run')"
        :disabled="isExecuting"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-wait"
        title="Execute query (Ctrl+Enter)"
      >
        <Play v-if="!isExecuting" class="w-3.5 h-3.5 fill-current" />
        <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-lg animate-spin"></span>
        <span class="hidden md:inline">{{ isExecuting ? 'Running...' : 'Run' }}</span>
      </button>

      <button
        @click="emit('save')"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
        title="Save query (Ctrl+S)"
      >
        <Save class="w-3.5 h-3.5" />
        <span class="hidden md:inline">Save</span>
      </button>

      <button
        @click="emit('stop')" 
        v-if="isExecuting"
        class="p-1.5 rounded-md text-destructive hover:bg-muted hover:text-destructive/80 transition-colors"
        title="Stop execution"
      >
        <Square class="w-3.5 h-3.5 fill-current" />
      </button>
    </div>

    <!-- SQL Tools -->
    <div class="flex items-center gap-1 border-l border-border pl-2 ml-2">
       <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
               @click="emit('format-sql')"
               class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
             >
               <AlignLeft class="w-3.5 h-3.5" />
             </button>
          </TooltipTrigger>
          <TooltipContent>Format SQL</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
             <button
               @click="emit('translate')"
               class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
             >
               <Languages class="w-3.5 h-3.5" />
             </button>
          </TooltipTrigger>
          <TooltipContent>Translate Query</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
             <button
               @click="emit('explain-query')"
               class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
             >
               <Info class="w-3.5 h-3.5" />
             </button>
          </TooltipTrigger>
          <TooltipContent>Explain Query Plan</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- History Dropdown -->
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
           class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-1"
           title="Recent Queries"
         >
           <History class="w-3.5 h-3.5" />
         </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-64 max-h-60 overflow-y-auto">
         <template v-if="queryHistory && queryHistory.length">
             <DropdownMenuItem
                v-for="(q, i) in queryHistory.slice(0, 10)"
                :key="i"
                @click="emit('load-query', q.query)"
                class="text-xs truncate"
             >
                {{ q.query }}
             </DropdownMenuItem>
         </template>
         <div v-else class="p-2 text-xs text-muted-foreground text-center">No recent history</div>
      </DropdownMenuContent>
    </DropdownMenu>

    <div class="flex-1"></div>

    <!-- Query Options -->
    <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <div class="flex items-center gap-2" title="Query Timeout (seconds)">
            <span class="hidden md:inline text-[10px] uppercase tracking-wider font-semibold">Timeout</span>
            <input
                :value="queryOptions.timeout"
                @input="updateOption('timeout', Number(($event.target as HTMLInputElement).value))"
                type="number"
                min="1"
                max="300"
                class="w-12 px-1 py-0.5 rounded border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary text-center"
            />
        </div>

        <div class="flex items-center gap-2" title="Max Rows">
            <span class="hidden md:inline text-[10px] uppercase tracking-wider font-semibold">Limit</span>
            <input
                :value="queryOptions.limit"
                @input="updateOption('limit', Number(($event.target as HTMLInputElement).value))"
                type="number"
                min="1"
                max="100000"
                class="w-16 px-1 py-0.5 rounded border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary text-center"
            />
        </div>

        <div class="flex items-center gap-2" title="Auto-commit Transaction">
            <label class="flex items-center gap-2 cursor-pointer">
                <input
                :checked="queryOptions.autoCommit"
                @change="updateOption('autoCommit', ($event.target as HTMLInputElement).checked)"
                type="checkbox"
                class="rounded border-border bg-background text-primary focus:ring-primary w-3.5 h-3.5"
                />
                <span class="hidden md:inline text-[10px] uppercase tracking-wider font-semibold">Auto-commit</span>
            </label>
        </div>
    </div>

    <!-- Clear Button -->
     <div class="border-l border-border pl-2 ml-2">
        <button
        @click="emit('clear')"
        class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Clear editor"
        >
        <Eraser class="w-3.5 h-3.5" />
        </button>
    </div>
  </div>
</template>
