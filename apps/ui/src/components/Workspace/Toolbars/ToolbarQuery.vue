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
  <div class="flex items-center gap-2 w-full">
    <!-- Run / Save Controls -->
    <div class="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('run')"
              :disabled="isExecuting"
              class="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-wait"
            >
              <Play v-if="!isExecuting" class="w-3.5 h-3.5 fill-current" />
              <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span class="hidden md:inline">{{ isExecuting ? 'Running...' : 'Run' }}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Execute query (Ctrl+Enter)</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('save')"
              class="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors"
            >
              <Save class="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Save query (Ctrl+S)</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider v-if="isExecuting">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('stop')" 
              class="p-1.5 rounded text-destructive hover:bg-muted hover:text-destructive/80 transition-colors"
            >
              <Square class="w-3.5 h-3.5 fill-current" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop execution</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- SQL Tools -->
    <div class="flex items-center gap-1 border-l border-border pl-1 ml-1 h-4">
       <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
               @click="emit('format-sql')"
               class="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors"
             >
               <AlignLeft class="w-4 h-4" />
             </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Format SQL</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
             <button
               @click="emit('translate')"
               class="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors"
             >
               <Languages class="w-4 h-4" />
             </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Translate Query</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
             <button
               @click="emit('explain-query')"
               class="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors"
             >
               <Info class="w-4 h-4" />
             </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Explain Query Plan</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- History Dropdown -->
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <DropdownMenuTrigger as-child>
                <button class="p-1.5 rounded text-muted-foreground hover:bg-muted transition-colors">
                   <History class="w-4 h-4" />
                 </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Recent Queries</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
    </div>

    <div class="flex-1"></div>

    <!-- Query Options -->
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <div class="flex items-center gap-1.5" title="Timeout (seconds)">
            <span class="text-[10px] text-muted-foreground">Timeout:</span>
            <input
                :value="queryOptions.timeout"
                @input="updateOption('timeout', Number(($event.target as HTMLInputElement).value))"
                type="number"
                min="1"
                max="300"
                class="w-10 px-1 py-0.5 rounded border-none bg-transparent hover:bg-muted/50 focus:bg-background focus:ring-1 focus:ring-primary text-center transition-colors appearance-none"
            />
        </div>

        <div class="flex items-center gap-1.5" title="Row Limit">
            <span class="text-[10px] text-muted-foreground">Limit:</span>
            <input
                :value="queryOptions.limit"
                @input="updateOption('limit', Number(($event.target as HTMLInputElement).value))"
                type="number"
                min="1"
                max="100000"
                class="w-14 px-1 py-0.5 rounded border-none bg-transparent hover:bg-muted/50 focus:bg-background focus:ring-1 focus:ring-primary text-center transition-colors appearance-none"
            />
        </div>

        <div class="flex items-center gap-1.5 ml-1">
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                <input
                :checked="queryOptions.autoCommit"
                @change="updateOption('autoCommit', ($event.target as HTMLInputElement).checked)"
                type="checkbox"
                class="rounded border-muted-foreground/40 bg-transparent text-primary focus:ring-primary w-3.5 h-3.5"
                />
                <span class="text-[10px]">Auto-commit</span>
            </label>
        </div>
    </div>

    <!-- Clear Button -->
     <div class="border-l border-border pl-1 ml-1 h-4">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('clear')"
              class="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Eraser class="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear editor</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
</template>
