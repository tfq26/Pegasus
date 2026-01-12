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
  FileText,
  MoreHorizontal,
  GitCommit,
  WrapText,
  Rows,
  ChevronDown
} from 'lucide-vue-next'
import { ColorPicker } from '@/components/ColorPicker'
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
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  aiMode: boolean
  privateMode: boolean
  liveMode: boolean
  collaboratorCount?: number
  saveStatus?: 'saved' | 'saving' | 'error'
  canUndo?: boolean
  canRedo?: boolean
  isSyncing?: boolean
  versions?: Array<{ version: number; table: string; created_at: string }>
  currentVersion?: number
  textWrap?: boolean
  showGridlines?: boolean
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
  'commit': []
  'version-change': [version: number]
  'update:text-wrap': [value: boolean]
  'update:show-gridlines': [value: boolean]
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

      <!-- Color Pickers -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1.5 ml-1">
              <ColorPicker @value-change="(v) => emit('format', 'color', v.hex)">
                <button class="p-1 rounded hover:bg-muted group relative flex flex-col items-center">
                  <span class="text-[10px] font-bold leading-none">A</span>
                  <div class="w-3 h-0.5 mt-0.5 bg-foreground" />
                </button>
              </ColorPicker>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">Text Color</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1.5">
              <ColorPicker @value-change="(v) => emit('format', 'background', v.hex)">
                <button class="p-1 rounded hover:bg-muted group relative flex flex-col items-center">
                  <span class="text-[8px] font-bold leading-none opacity-50">Bg</span>
                  <div class="w-3.5 h-2.5 mt-0.5 border border-border shadow-sm bg-background" />
                </button>
              </ColorPicker>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">Fill Color</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- View Options -->
    <div class="flex items-center gap-0.5 border-r border-border pr-3 mr-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded transition-colors"
                :class="props.textWrap ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'"
              @click="emit('update:text-wrap', !props.textWrap)"
            >
              <WrapText class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Text Wrapping</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <button 
              class="p-1.5 rounded transition-colors"
               :class="props.showGridlines ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'"
              @click="emit('update:show-gridlines', !props.showGridlines)"
            >
              <Rows class="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Show Gridlines</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Version Selection -->
    <div v-if="props.versions && props.versions.length > 0" class="flex items-center gap-2 border-r border-border pr-3 mr-1">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:inline">Version</span>
        <div class="relative group">
            <select 
                title="Select Table Version"
                :value="props.currentVersion" 
                @change="(e) => emit('version-change', Number((e.target as HTMLSelectElement).value))"
                class="h-7 text-xs bg-muted/50 border border-transparent hover:border-border rounded pl-2 pr-6 appearance-none transition-all cursor-pointer outline-none focus:ring-1 focus:ring-primary min-w-[120px]"
            >
                <option v-for="v in props.versions" :key="v.version" :value="v.version">
                    v{{ v.version }} ({{ new Date(v.created_at).toLocaleDateString() }})
                </option>
            </select>
            <ChevronDown class="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity" />
        </div>
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
    


    <!-- Spacer -->
    <div class="flex-1"></div>

      <!-- COMMIT BUTTON (Primary Action) -->
      <button 
        @click="emit('commit')"
        class="flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-md bg-stone-900 text-stone-50 hover:bg-stone-800 transition-colors shadow-sm text-xs font-bold uppercase tracking-wide border border-stone-800 disabled:opacity-50"
        :disabled="saveStatus === 'saving'"
      >
        <GitCommit class="w-3.5 h-3.5" />
        <span class="hidden md:inline">Commit</span>
      </button>

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

      <!-- MORE OPTIONS DROPDOWN -->
      <div class="flex items-center gap-1 ml-2">
         <DropdownMenu>
            <DropdownMenuTrigger class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                <MoreHorizontal class="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
                
                <div class="px-2 py-1.5 text-xs text-muted-foreground font-normal uppercase tracking-wider">Data Actions</div>
                
                <!-- Sanitize -->
                <DropdownMenuItem @select="emit('sanitize')" class="flex items-center gap-2 cursor-pointer">
                    <Sparkles class="w-3.5 h-3.5 text-amber-500" />
                    <span>Sanitize Data</span>
                </DropdownMenuItem>
                
                <!-- Share -->
                <DropdownMenuItem @select="emit('share')" class="flex items-center gap-2 cursor-pointer">
                    <Share2 class="w-3.5 h-3.5 text-blue-500" />
                    <span>Share Spreadsheet</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <div class="px-2 py-1.5 text-xs text-muted-foreground font-normal uppercase tracking-wider">Collaboration</div>

                <!-- Private/Live Mode Toggle (Inside Menu) -->
                <div class="px-2 py-1.5 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <Users v-if="liveMode" class="w-3.5 h-3.5 text-green-500" />
                        <Lock v-else class="w-3.5 h-3.5 text-muted-foreground" />
                        <span class="text-sm">{{ liveMode ? 'Live Mode' : 'Private Mode' }}</span>
                    </div>
                    <Switch
                        :checked="liveMode"
                        @update:checked="emit('update:live-mode', $event)"
                        class="scale-75"
                    />
                </div>

                <DropdownMenuSeparator />
                <div class="px-2 py-1.5 text-xs text-muted-foreground font-normal uppercase tracking-wider">Export</div>

                <!-- Export Options -->
                <DropdownMenuItem @select="$emit('export', 'csv')" class="flex items-center gap-2 cursor-pointer">
                    <FileText class="w-3.5 h-3.5 text-slate-500" />
                    <span>Export as CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem @select="$emit('export', 'xlsx')" class="flex items-center gap-2 cursor-pointer">
                    <FileText class="w-3.5 h-3.5 text-green-500" />
                    <span>Export as Excel</span>
                </DropdownMenuItem>
                <DropdownMenuItem @select="$emit('export', 'pdf')" class="flex items-center gap-2 cursor-pointer">
                    <FileText class="w-3.5 h-3.5 text-rose-500" />
                    <span>Export as PDF</span>
                </DropdownMenuItem>

            </DropdownMenuContent>
         </DropdownMenu>
      </div>

  </div>
</template>
