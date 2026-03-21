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
  <div class="flex w-full items-center gap-3">
    <div class="flex items-center gap-1 rounded-xl border border-border/70 bg-background/80 p-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('run')"
              :disabled="isExecuting"
              class="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-50"
            >
              <Play v-if="!isExecuting" class="w-3.5 h-3.5 fill-current" />
              <span v-else class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <span>{{ isExecuting ? 'Running' : 'Run' }}</span>
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
              class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
              class="rounded-lg p-2 text-destructive transition-colors hover:bg-muted hover:text-destructive/80"
            >
              <Square class="w-3.5 h-3.5 fill-current" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop execution</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <div class="flex items-center gap-1 rounded-xl border border-border/70 bg-background/75 p-1">
       <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
               @click="emit('format-sql')"
               class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
               class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
               class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                <button class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
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

    <div class="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
        <div class="flex items-center gap-1.5" title="Timeout (seconds)">
            <span class="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">Timeout</span>
            <input
                :value="queryOptions.timeout"
                @input="updateOption('timeout', Number(($event.target as HTMLInputElement).value))"
                type="number"
                min="1"
                max="300"
                class="w-12 rounded-lg border border-transparent bg-transparent px-2 py-1 text-center text-foreground transition-colors appearance-none hover:bg-muted/50 focus:border-border focus:bg-background focus:ring-1 focus:ring-primary/20"
            />
        </div>

        <div class="h-5 w-px bg-border/70"></div>

        <div class="flex items-center gap-1.5" title="Row Limit">
            <span class="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">Limit</span>
            <input
                :value="queryOptions.limit"
                @input="updateOption('limit', Number(($event.target as HTMLInputElement).value))"
                type="number"
                min="1"
                max="100000"
                class="w-16 rounded-lg border border-transparent bg-transparent px-2 py-1 text-center text-foreground transition-colors appearance-none hover:bg-muted/50 focus:border-border focus:bg-background focus:ring-1 focus:ring-primary/20"
            />
        </div>

        <div class="h-5 w-px bg-border/70"></div>

        <div class="flex items-center gap-1.5">
            <label class="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                <input
                :checked="queryOptions.autoCommit"
                @change="updateOption('autoCommit', ($event.target as HTMLInputElement).checked)"
                type="checkbox"
                class="rounded border-muted-foreground/40 bg-transparent text-primary focus:ring-primary w-3.5 h-3.5"
                />
                <span class="text-[10px] font-medium uppercase tracking-[0.12em]">Auto-commit</span>
            </label>
        </div>
    </div>

     <div class="rounded-xl border border-border/70 bg-background/70 p-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('clear')"
              class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
