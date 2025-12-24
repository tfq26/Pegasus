<script setup lang="ts">
import {
  Sparkles,
  FunctionSquare,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  BarChart,
  Download,
  Lock,
  Users,
  GitMerge,
  Undo2,
  Redo2,
  Search,
  RefreshCw
} from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const props = defineProps<{
  aiMode: boolean
  privateMode: boolean
  saveStatus?: 'saved' | 'saving' | 'error'
  canUndo?: boolean
  canRedo?: boolean
}>()

const emit = defineEmits<{
  'toggle-ai-mode': []
  'format': [type: string, value?: any]
  'visualize': []
  'sanitize': []
  'update:private-mode': [value: boolean]
  'merge': []
  'export': [format: 'csv' | 'xlsx']
  'refresh-table': []
  'undo': []
  'redo': []
  'toggle-find': []
}>()
</script>

<template>
  <div class="flex items-center gap-3 w-full">
    <!-- AI / Formula Toggle -->
    <div class="flex items-center gap-1 border-r border-border pr-3 mr-1">
      <button
        @click="emit('toggle-ai-mode')"
        class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all"
        :class="props.aiMode 
          ? 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20' 
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
        :title="props.aiMode ? 'Switch to Formula Mode' : 'Switch to AI Mode'"
      >
        <Sparkles v-if="props.aiMode" class="w-3.5 h-3.5" />
        <FunctionSquare v-else class="w-3.5 h-3.5" />
        <span v-if="props.aiMode">AI Mode</span>
        <span v-else>Formula</span>
      </button>
    </div>

    <!-- Undo / Redo -->
    <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger as-child>
                    <button 
                        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                        @click="emit('undo')"
                        :disabled="!canUndo"
                    >
                        <Undo2 class="w-3.5 h-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent>Undo</TooltipContent>
            </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger as-child>
                    <button 
                        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                        @click="emit('redo')"
                        :disabled="!canRedo"
                    >
                        <Redo2 class="w-3.5 h-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent>Redo</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>

    <!-- Formatting Tools -->
    <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'bold')"
        title="Bold (Ctrl+B)"
      >
        <Bold class="w-3.5 h-3.5" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'italic')"
        title="Italic (Ctrl+I)"
      >
        <Italic class="w-3.5 h-3.5" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'underline')"
        title="Underline (Ctrl+U)"
      >
        <Underline class="w-3.5 h-3.5" />
      </button>
    </div>

    <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'align', 'left')"
        title="Align Left"
      >
        <AlignLeft class="w-3.5 h-3.5" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'align', 'center')"
        title="Align Center"
      >
        <AlignCenter class="w-3.5 h-3.5" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        @click="emit('format', 'align', 'right')"
        title="Align Right"
      >
        <AlignRight class="w-3.5 h-3.5" />
      </button>
    </div>
    
    <!-- Find & Replace Toggle -->
    <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger as-child>
                    <button 
                        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        @click="emit('toggle-find')"
                    >
                        <Search class="w-3.5 h-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent>Find & Replace</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>

    <!-- Data Actions -->
    <div class="flex items-center gap-2">
        <button
            @click="emit('visualize')"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            title="Create Visualization"
        >
            <BarChart class="w-3.5 h-3.5" />
            <span>Visualize</span>
        </button>

        <button
            @click="emit('sanitize')"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-all"
            title="Sanitize Data"
        >
            <Sparkles class="w-3.5 h-3.5" />
            <span>Sanitize</span>
        </button>
    </div>

    <div class="flex-1"></div>

    <!-- Right Side Controls -->
    
    <!-- Private Mode Toggle -->
    <div class="flex items-center gap-1 border-r border-border pr-3 mr-2">
        <div class="flex items-center gap-2">
            <Switch
                :checked="privateMode"
                @update:checked="emit('update:private-mode', $event)"
                id="private-mode-toggle"
                class="data-[state=checked]:bg-amber-500"
            />
            <label 
                for="private-mode-toggle" 
                class="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none"
                    :class="privateMode ? 'text-amber-600' : 'text-muted-foreground'"
            >
                <Lock v-if="privateMode" class="w-3.5 h-3.5" />
                <Users v-else class="w-3.5 h-3.5" />
                <span>{{ privateMode ? 'Private' : 'Live' }}</span>
            </label>
        </div>
    </div>

    <!-- Merge Button (Private Mode Only) -->
        <div v-if="privateMode" class="flex items-center gap-1 border-r border-border pr-3 mr-2">
            <button
            class="h-7 px-3 rounded flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-sm transition-colors text-xs font-semibold"
            @click="emit('merge')"
            title="Merge changes to live dashboard"
            >
            <GitMerge class="w-3.5 h-3.5" />
            Merge
            </button>
    </div>

    <!-- Export Buttons -->
    <div class="flex items-center gap-1 border-r border-border pr-3 mr-2">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger as-child>
                    <button 
                        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1"
                        @click="emit('export', 'csv')"
                    >
                        <span class="text-[10px] font-bold">CSV</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent>Export to CSV</TooltipContent>
            </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
            <Tooltip>
                 <TooltipTrigger as-child>
                    <button 
                        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        @click="emit('export', 'xlsx')"
                    >
                        <Download class="w-3.5 h-3.5" />
                    </button>
                 </TooltipTrigger>
                 <TooltipContent>Export to Excel</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>
    
     <!-- Save Status Indicator (Clickable to refresh) -->
      <button 
        @click="emit('refresh-table')"
        class="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30 text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer"
        :title="saveStatus === 'saved' ? 'Click to refresh data from database' : saveStatus === 'saving' ? 'Saving changes...' : 'Error saving - click to retry'"
      >
        <template v-if="saveStatus === 'saving'">
          <span class="w-2 h-2 rounded-lg bg-yellow-500 animate-pulse"></span>
          <span class="text-muted-foreground">Saving...</span>
        </template>
        <template v-else-if="saveStatus === 'error'">
          <span class="w-2 h-2 rounded-lg bg-destructive"></span>
          <span class="text-destructive">Error</span>
        </template>
        <template v-else>
          <span class="w-2 h-2 rounded-lg bg-green-500"></span>
          <span class="text-muted-foreground">Saved</span>
        </template>
        
        <RefreshCw class="w-3 h-3 ml-1 text-muted-foreground" :class="{'animate-spin': saveStatus === 'saving'}" />
      </button>

  </div>
</template>
