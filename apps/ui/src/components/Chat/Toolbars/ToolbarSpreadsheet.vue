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
  RefreshCw,
  Share2,
  FileText
} from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
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
  aiMode: boolean
  privateMode: boolean
  liveMode: boolean  // NEW: Collaboration enabled
  collaboratorCount?: number  // NEW: Number of active collaborators
  saveStatus?: 'saved' | 'saving' | 'error'
  canUndo?: boolean
  canRedo?: boolean
  isSyncing?: boolean
}>()

const emit = defineEmits<{
  'toggle-ai-mode': []
  'format': [type: string, value?: any]
  'visualize': []
  'sanitize': []
  'update:private-mode': [value: boolean]
  'update:live-mode': [value: boolean]  // NEW
  'share': []  // NEW
  'merge': []
  'export': [format: 'csv' | 'xlsx' | 'pdf']
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              @click="emit('toggle-ai-mode')"
              class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all"
              :class="props.aiMode 
                ? 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20' 
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            >
              <Sparkles v-if="props.aiMode" class="w-3.5 h-3.5" />
              <FunctionSquare v-else class="w-3.5 h-3.5" />
              <span v-if="props.aiMode" class="hidden md:inline">AI Mode</span>
              <span v-else class="hidden md:inline">Formula</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{{ props.aiMode ? 'Switch to Formula Mode' : 'Switch to AI Mode' }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
                <TooltipContent side="bottom">Undo</TooltipContent>
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
                <TooltipContent side="bottom">Redo</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>

    <!-- Formatting Tools -->
    <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'bold')"
            >
              <Bold class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Bold (Ctrl+B)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'italic')"
            >
              <Italic class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Italic (Ctrl+I)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'underline')"
            >
              <Underline class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Underline (Ctrl+U)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'align', 'left')"
            >
              <AlignLeft class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Align Left</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'align', 'center')"
            >
              <AlignCenter class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Align Center</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              @click="emit('format', 'align', 'right')"
            >
              <AlignRight class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Align Right</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
                <TooltipContent side="bottom">Find & Replace</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>

    <!-- Data Actions -->
    <div class="flex items-center gap-2">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger as-child>
                    <button
                        @click="emit('sanitize')"
                        class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-all shadow-sm"
                    >
                        <Sparkles class="w-3.5 h-3.5" />
                        <span class="hidden md:inline">Sanitize</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Sanitize Data</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>

    <div class="flex-1"></div>

    <!-- Live/Private Mode Toggle -->
    <div class="flex items-center gap-1 border-r border-border pr-3 mr-2">
        <div class="flex items-center gap-2">
            <Switch
                :checked="liveMode"
                @update:checked="emit('update:live-mode', $event)"
                id="live-mode-toggle"
                class="data-[state=checked]:bg-green-500"
            />
            <label 
                for="live-mode-toggle" 
                class="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none"
                :class="liveMode ? 'text-green-600' : 'text-muted-foreground'"
            >
                <Users v-if="liveMode" class="w-3.5 h-3.5" />
                <Lock v-else class="w-3.5 h-3.5" />
                <span class="hidden md:inline">{{ liveMode ? 'Live' : 'Private' }}</span>
                <span v-if="liveMode && collaboratorCount" class="px-1.5 py-0.5 bg-green-500/20 text-green-600 rounded-full text-[10px] font-bold">
                  {{ collaboratorCount }}
                </span>
            </label>
        </div>
    </div>

    <!-- Share Button -->
    <div class="flex items-center gap-1 border-r border-border pr-3 mr-2">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger as-child>
                    <button 
                        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1"
                        @click="emit('share')"
                    >
                        <Share2 class="w-3.5 h-3.5" />
                        <span class="hidden md:inline text-xs">Share</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Share Spreadsheet</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </div>

    <!-- Merge Button (Private Mode Only) - For version control, currently disabled
        <div v-if="privateMode" class="flex items-center gap-1 border-r border-border pr-3 mr-2">
            <button
            class="h-7 px-3 rounded flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-sm transition-colors text-xs font-semibold"
            @click="emit('merge')"
            title="Merge changes to live dashboard"
            >
            <GitMerge class="w-3.5 h-3.5" />
            <span class="hidden md:inline">Merge</span>
            </button>
    </div>
    -->

    <!-- Export Menu -->
    <div class="flex items-center gap-1 border-r border-border pr-3 mr-2">
        <DropdownMenu>
            <DropdownMenuTrigger class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                <Download class="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            
            <DropdownMenuContent align="end" class="w-48 bg-background border-border">
                <DropdownMenuItem @select="$emit('export', 'csv')" class="flex items-center gap-2 cursor-pointer">
                    <FileText class="w-3.5 h-3.5 text-blue-500" />
                    <div class="flex flex-col">
                        <span class="text-xs font-bold uppercase tracking-wider">Comma Separated</span>
                        <span class="text-[9px] text-muted-foreground">Standard CSV format</span>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem @select="$emit('export', 'xlsx')" class="flex items-center gap-2 cursor-pointer">
                    <FileText class="w-3.5 h-3.5 text-green-500" />
                    <div class="flex flex-col">
                        <span class="text-xs font-bold uppercase tracking-wider">Excel Workbook</span>
                        <span class="text-[9px] text-muted-foreground">Native .xlsx format</span>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem @select="$emit('export', 'pdf')" class="flex items-center gap-2 cursor-pointer">
                    <FileText class="w-3.5 h-3.5 text-rose-500" />
                    <div class="flex flex-col">
                        <span class="text-xs font-bold uppercase tracking-wider">PDF Document</span>
                        <span class="text-[9px] text-muted-foreground">Non-editable snapshot</span>
                    </div>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    </div>
    
      <!-- Sync/Save Status Indicator -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-2">
              <!-- Background Sync Badge -->
              <div v-if="isSyncing" class="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-600 animate-in fade-in slide-in-from-right-2">
                 <RefreshCw class="w-3 h-3 animate-spin" />
                 <span class="text-[10px] font-bold uppercase tracking-wider">Syncing</span>
              </div>

              <!-- Main Save Status -->
              <button 
                @click="emit('refresh-table')"
                class="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30 text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer"
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
                
                <RefreshCw v-if="!isSyncing" class="w-3 h-3 ml-1 text-muted-foreground" :class="{'animate-spin': saveStatus === 'saving'}" />
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {{ isSyncing ? 'Background synchronization in progress' : saveStatus === 'saved' ? 'Click to refresh data from database' : saveStatus === 'saving' ? 'Saving changes...' : 'Error saving - click to retry' }}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

  </div>
</template>
