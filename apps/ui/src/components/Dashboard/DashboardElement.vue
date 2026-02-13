<template>
  <ContextMenu>
    <ContextMenuTrigger>
      <div 
        ref="elementContainer"
        class="dashboard-card w-full h-full flex flex-col bg-card border border-border/60 shadow-sm rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-primary/20 group relative"
        :class="{ 'pointer-events-none': isLocked && !isMobile }"
      >
        <!-- Card Content -->
        <div class="flex flex-col h-full">
          <!-- Solid Header -->
          <div class="px-4 py-3 border-b border-border/40 bg-muted/30 sticky top-0 z-20 transition-colors group-hover:bg-muted/50">
            <div class="flex items-center justify-between gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex-1 min-w-0">
                        <h3 class="card-title text-foreground/90 font-bold text-sm truncate tracking-tight group-hover:text-foreground transition-colors">{{ element?.title || 'Untitled' }}</h3>
                        <p class="card-subtitle text-[10px] font-medium text-muted-foreground truncate uppercase tracking-[0.05em] opacity-70 group-hover:opacity-100 transition-opacity">{{ element?.customization?.description || element?.query }}</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" class="bg-popover border-border/50 text-xs shadow-xl">
                      <p class="font-bold">Created by: <span class="text-primary">{{ element?.created_by_name || element?.created_by || 'Unknown' }}</span></p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              
              <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                <!-- Combined Drag/Delete Handle -->
                <div 
                  v-if="!isLocked && !isMobile"
                  class="transition-all duration-200 rounded-lg p-1.5 flex items-center justify-center shrink-0 border border-transparent shadow-none"
                  :class="[
                    isCtrlPressed 
                      ? 'bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20 border-destructive/20' 
                      : 'drag-handle cursor-move text-muted-foreground hover:text-primary hover:bg-primary/10 hover:border-primary/20'
                  ]"
                  :title="isCtrlPressed ? 'Click to remove' : 'Drag to move'"
                  @click.stop="isCtrlPressed ? $emit('remove') : null"
                >
                  <Trash2 v-if="isCtrlPressed" class="w-4 h-4" />
                  <Move v-else class="w-4 h-4" />
                </div>

                <!-- Refresh Button (Dynamic Icon Color) -->
                <button
                  v-if="element?.query && connectionStatus !== 'static'"
                  @click.stop="handleRefresh(true)"
                  :disabled="isRefreshing"
                  class="p-1.5 rounded-lg border border-transparent hover:bg-muted transition-all duration-300 disabled:opacity-50 active:scale-95 shadow-none"
                  :class="{
                    'text-emerald-500 hover:border-emerald-500/20 hover:bg-emerald-500/5': connectionStatus === 'live',
                    'text-rose-500 hover:border-rose-500/20 hover:bg-rose-500/5': connectionStatus === 'error',
                    'text-amber-500 hover:border-amber-500/20 hover:bg-amber-500/5': connectionStatus === 'stale',
                    'text-muted-foreground hover:bg-muted': !connectionStatus
                  }"
                  :title="refreshTooltip"
                >
                  <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isRefreshing }" />
                </button>
              </div>

               <!-- Mobile Actions Menu -->
               <div v-if="isMobile" class="shrink-0" @click.stop>
                 <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                       <button class="p-1.5 hover:bg-muted rounded-lg border border-border/50">
                          <MoreVertical class="w-4 h-4 text-muted-foreground" />
                       </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="rounded-xl shadow-xl border-border/50">
                       <DropdownMenuItem @click="$emit('edit-element')" class="py-2.5">
                          <Settings class="w-4 h-4 mr-3 opacity-70" />
                          Edit Element
                       </DropdownMenuItem>
                       <DropdownMenuItem @click="$emit('edit-query')" class="py-2.5">
                          <Pencil class="w-4 h-4 mr-3 opacity-70" />
                          Edit Query
                       </DropdownMenuItem>
                       <DropdownMenuItem @click="$emit('view-query')" class="py-2.5">
                          <Code class="w-4 h-4 mr-3 opacity-70" />
                          View Query
                       </DropdownMenuItem>
                       <DropdownMenuItem @click="handleExportImage" class="py-2.5">
                          <Image class="w-4 h-4 mr-3 opacity-70" />
                          Export as Image
                       </DropdownMenuItem>
                       <DropdownMenuSeparator />
                       <DropdownMenuItem @click="$emit('remove')" class="text-destructive py-2.5 focus:bg-destructive/10">
                          <Trash2 class="w-4 h-4 mr-3" />
                          Delete
                       </DropdownMenuItem>
                    </DropdownMenuContent>
                 </DropdownMenu>
               </div>
            </div>
          </div>

          <div class="flex-1 relative overflow-hidden min-h-[200px] bg-card/20 animate-in fade-in duration-500">
            <ChartRenderer 
              v-if="element && element.type !== 'stat' && element.type !== 'table' && element.type !== 'text' && element.type !== 'file' && element.config" 
              :type="element.type" 
              :data="element.config.data" 
              :options="{ ...element.config.options, maintainAspectRatio: false, responsive: true }"
              :customization="element.customization"
              @drill-down="$emit('drill-down', $event)"
              class="w-full h-full p-6 transition-all duration-700"
            />
            <ChartRenderer 
              v-else-if="element && element.type === 'stat' && element.config" 
              :type="element.type" 
              :data="element.config" 
              :options="{ label: element.title }"
              :customization="element.customization"
              @drill-down="$emit('drill-down', $event)"
              class="w-full h-full p-6"
            />

            <!-- Text Element -->
            <div 
              v-else-if="element?.type === 'text'" 
              class="p-6 h-full overflow-auto prose dark:prose-invert text-[13px] leading-relaxed max-w-none text-foreground/80 selection:bg-primary/20"
            >
               <MarkdownRenderer :content="element.config.content" />
            </div>

            <!-- Table Element -->
            <TableElement
              v-else-if="element?.type === 'table' && element.config"
              :config="element.config"
              :title="element.title"
              class="h-full px-1"
            />

            <!-- File Element -->
            <div 
              v-else-if="element?.type === 'file'" 
              class="flex flex-col items-center justify-center h-full p-6 group/file"
            >
               <div class="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4 transition-all duration-300 group-hover/file:bg-primary/10 group-hover/file:scale-110">
                 <File class="w-8 h-8 text-primary shadow-sm" />
               </div>
               <div class="text-sm font-bold text-center truncate max-w-full px-4 text-foreground/90">{{ element.config.fileName }}</div>
               <div class="text-[10px] font-bold text-muted-foreground uppercase opacity-60 mt-1 tracking-widest">{{ formatSize(element.config.fileSize) }}</div>
               <button 
                 class="mt-6 px-6 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95 rounded-xl transition-all duration-300 shadow-lg shadow-primary/20" 
                 @click="$emit('download')"
               >
                 Download File
               </button>
            </div>
          </div>
        </div>
      </div>
    </ContextMenuTrigger>
    
    <!-- Desktop Context Menu -->
    <ContextMenuContent v-if="!isMobile" class="w-48 bg-popover border-border text-popover-foreground">
      <ContextMenuItem @select="$emit('edit-element')">
        <Settings class="w-4 h-4 mr-2" />
        Edit Element
      </ContextMenuItem>
      
      <!-- Query Options (Only for Viz/Table) -->
      <template v-if="element?.type !== 'text' && element?.type !== 'file'">
        <ContextMenuSeparator class="bg-border" />
        <ContextMenuItem @select="$emit('edit-query')">
          <Pencil class="w-4 h-4 mr-2" />
          Edit Query
        </ContextMenuItem>
        <ContextMenuItem @select="$emit('view-query')">
          <Code class="w-4 h-4 mr-2" />
          View Query
        </ContextMenuItem>
        <ContextMenuSeparator class="bg-border" />
        <ContextMenuItem @select="handleRefresh(true)" :disabled="isRefreshing">
          <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isRefreshing }" />
          Refresh Data
        </ContextMenuItem>
        
        <!-- Toggle Axis Intervals (Only for Viz) -->
        <ContextMenuItem 
          v-if="element?.type !== 'table' && element?.type !== 'text' && element?.type !== 'file' && element?.type !== 'stat'"
          @select="toggleAxes"
        >
          <component :is="element?.customization?.hideAxes ? Eye : EyeOff" class="w-4 h-4 mr-2" />
          {{ element?.customization?.hideAxes ? 'Show Axis Labels' : 'Hide Axis Labels' }}
        </ContextMenuItem>
      </template>

      <ContextMenuItem @select="handleExportImage">
        <Image class="w-4 h-4 mr-2" />
        Export as Image
      </ContextMenuItem>

      <ContextMenuSeparator class="bg-border" />
      <ContextMenuItem @select="$emit('remove')" class="text-destructive focus:text-destructive focus:bg-destructive/10">
        <Trash2 class="w-4 h-4 mr-2" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ChartRenderer from '@/components/Dashboard/ChartRenderer.vue'
import TableElement from '@/components/Dashboard/Elements/TableElement.vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Pencil, Trash2, Code, Settings, File, Move, MoreVertical, Eye, EyeOff, Image } from 'lucide-vue-next'
import { exportElementAsImage } from '@/lib/exportImage'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { useIntersectionObserver } from '@vueuse/core'
import { unref } from 'vue'
import { useConnectionStore } from '@/stores/connection'

const props = defineProps<{
  element: any
  isLocked: boolean
  isCtrlPressed?: boolean
  isMobile?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove'): void
  (e: 'edit-element'): void
  (e: 'edit-query'): void
  (e: 'view-query'): void
  (e: 'download'): void
  (e: 'drill-down', data: any): void
}>()

import { onMounted, ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'
import { isStaticSource } from '@/lib/db-connections'

const store = useDashboardStore()
const connectionStore = useConnectionStore()
const isRefreshing = ref(false)

const connectionStatus = computed(() => {
    const connections = unref(connectionStore.connections)
    const conn = (connections as any[]).find((c: any) => c.id === props.element?.connectionId)
    
    if (isStaticSource(conn)) return 'static'
    if (props.element?.error) return 'error'
    
    const now = Date.now()
    const isStale = props.element?.cacheUntil && props.element.cacheUntil < now
    if (isStale) return 'stale'
    
    return 'live'
})

const refreshTooltip = computed(() => {
    switch (connectionStatus.value) {
        case 'live': return 'Connection Live'
        case 'error': return `Error: ${props.element?.error || 'Unknown'}`
        case 'stale': return 'Connection Stale (Click to refresh)'
        default: return 'Refresh Data'
    }
})

const handleExportImage = async () => {
    if (!elementContainer.value) return
    await exportElementAsImage(
        elementContainer.value, 
        props.element?.title || 'element',
        'png'
    )
}

const handleRefresh = async (force = false) => {
    if (!props.element?.id || !props.element?.query || !props.element?.connectionId) return
    
    isRefreshing.value = true
    try {
        await store.executeElementQuery(props.element.id, force)
        if (force) {
            toast.success(`Refreshed ${props.element.title || 'element'}`)
        }
    } catch (e: any) {
        console.error('[DashboardElement] Refresh failed:', e)
        toast.error(`Failed to refresh ${props.element.title || 'element'}: ${e.message}`)
    } finally {
        isRefreshing.value = false
    }
}

const toggleAxes = () => {
    if (!props.element?.id) return
    
    // Find the element in the store to mutate it properly
    const page = store.activePage as any
    if (!page) return
    
    const element = page.elements.find((el: any) => el.id === props.element.id)
    if (element) {
        const customization = { ...element.customization || {} }
        customization.hideAxes = !customization.hideAxes
        element.customization = customization
        store.saveCurrentDashboard()
        toast.success(`${element.customization.hideAxes ? 'Hidden' : 'Shown'} axis labels`)
    }
}

const elementContainer = ref<HTMLElement | null>(null)
const hasInitiallyLoaded = ref(false)

// Use Intersection Observer for Lazy Loading
const { stop } = useIntersectionObserver(
  elementContainer as any,
  (entries) => {
    const entry = entries[0]
    if (entry?.isIntersecting && !hasInitiallyLoaded.value) {
        hasInitiallyLoaded.value = true
        
        // Only fetch if we need to (if query exists but no data, or if cache is stale)
        if (props.element?.query && props.element?.connectionId) {
            const now = Date.now()
            const isStale = !props.element.cacheUntil || props.element.cacheUntil < now
            const hasNoData = props.element.type === 'stat' ? props.element.config?.value === undefined : !props.element.config?.data
            
            if (hasNoData || isStale) {
                console.log(`[DashboardElement] Lazy refresh for ${props.element.id}`)
                handleRefresh()
            }
        }
        
        // We can stop observing once we've triggered the initial load
        stop()
    }
  },
  { threshold: 0.1 }
)

onMounted(async () => {
    // Basic initialization if needed, but the actual data fetch is now handled by Intersection Observer
})

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>
