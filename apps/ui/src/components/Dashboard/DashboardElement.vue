<template>
  <ContextMenu>
    <ContextMenuTrigger>
      <div 
        ref="elementContainer"
        class="dashboard-card w-full h-full flex flex-col bg-card border border-border shadow-sm rounded-sm overflow-hidden transition-all hover:shadow-md"
        :class="{ 'pointer-events-none': isLocked && !isMobile }"
      >
        <!-- Card Content -->
        <div class="flex flex-col h-full">
          <div class="px-4 py-3 border-b border-border bg-card/50">
            <div class="flex items-center justify-between gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <div class="flex-1 min-w-0">
                        <h3 class="card-title text-foreground font-semibold text-sm truncate">{{ element?.title || 'Untitled' }}</h3>
                        <p class="card-subtitle text-xs text-muted-foreground truncate">{{ element?.query }}</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Created by: {{ element?.created_by || 'Unknown' }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              
              <!-- Combined Drag/Delete Handle -->
              <div 
                v-if="!isLocked && !isMobile"
                class="transition-all duration-200 rounded-md p-1 flex items-center justify-center shrink-0"
                :class="[
                  isCtrlPressed 
                    ? 'bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20' 
                    : 'drag-handle cursor-move text-muted-foreground hover:text-primary hover:bg-primary/10'
                ]"
                :title="isCtrlPressed ? 'Click to remove' : 'Drag to move'"
                @click.stop="isCtrlPressed ? $emit('remove') : null"
              >
                <!-- Delete Icon -->
                <Trash2 v-if="isCtrlPressed" class="w-4 h-4" />
                <!-- Drag Icon -->
                <Move v-else class="w-4 h-4" />
              </div>

              <!-- Refresh Button (Always showing for now if has query) -->
              <button
                v-if="element?.query"
                @click.stop="handleRefresh(true)"
                :disabled="isRefreshing"
                class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition disabled:opacity-50"
                title="Refresh Data"
              >
                <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isRefreshing }" />
              </button>

               <!-- Mobile Actions Menu -->
               <div v-if="isMobile" class="shrink-0" @click.stop>
                 <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                       <button class="p-1 hover:bg-muted rounded">
                          <MoreVertical class="w-4 h-4 text-muted-foreground" />
                       </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                       <DropdownMenuItem @click="$emit('edit-element')">
                          <Settings class="w-4 h-4 mr-2" />
                          Edit Element
                       </DropdownMenuItem>
                       <DropdownMenuItem @click="$emit('edit-query')">
                          <Pencil class="w-4 h-4 mr-2" />
                          Edit Query
                       </DropdownMenuItem>
                       <DropdownMenuItem @click="$emit('view-query')">
                          <Code class="w-4 h-4 mr-2" />
                          View Query
                       </DropdownMenuItem>
                       <DropdownMenuSeparator />
                       <DropdownMenuItem @click="$emit('remove')" class="text-destructive">
                          <Trash2 class="w-4 h-4 mr-2" />
                          Delete
                       </DropdownMenuItem>
                    </DropdownMenuContent>
                 </DropdownMenu>
               </div>
            </div>
          </div>

          <div class="flex-1 relative overflow-hidden min-h-[200px]">
            <ChartRenderer 
              v-if="element && element.type !== 'stat' && element.type !== 'text' && element.type !== 'file' && element.config" 
              :type="element.type" 
              :data="element.config.data" 
              :options="{ ...element.config.options, maintainAspectRatio: false, responsive: true }"
              :customization="element.customization"
              @drill-down="$emit('drill-down', $event)"
              class="w-full h-full p-4"
            />
            <ChartRenderer 
              v-else-if="element && element.type === 'stat' && element.config" 
              :type="element.type" 
              :data="element.config" 
              :options="{ label: element.title }"
              :customization="element.customization"
              @drill-down="$emit('drill-down', $event)"
              class="w-full h-full p-4"
            />

            <!-- Text Element -->
            <div 
              v-else-if="element?.type === 'text'" 
              class="p-4 h-full overflow-auto prose dark:prose-invert text-sm max-w-none"
            >
               <div v-html="renderMarkdown(element.config.content)"></div>
            </div>

            <!-- File Element -->
            <div 
              v-else-if="element?.type === 'file'" 
              class="flex flex-col items-center justify-center h-full p-4"
            >
               <File class="w-12 h-12 text-primary mb-2" />
               <div class="text-sm font-medium text-center truncate max-w-full px-4">{{ element.config.fileName }}</div>
               <div class="text-xs text-muted-foreground">{{ formatSize(element.config.fileSize) }}</div>
               <button 
                 class="mt-4 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition" 
                 @click="$emit('download')"
               >
                 Download
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
      </template>
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
import { Pencil, Trash2, Code, Settings, File, Move, MoreVertical } from 'lucide-vue-next'
import { renderMarkdown } from '@/lib/markdown'
import { useIntersectionObserver } from '@vueuse/core'

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

const store = useDashboardStore()
const isRefreshing = ref(false)

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
