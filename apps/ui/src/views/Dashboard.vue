<template>
  <div class="w-full h-full flex flex-col text-foreground">
    <!-- Header -->
    <header class="border-b border-border bg-card/80 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <div class="flex items-center gap-3">
        <button 
          @click="router.push('/dashboard')"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
          title="Back to Dashboards"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <h1 class="text-lg font-bold text-primary">{{ currentDashboard?.title || 'Dashboard' }}</h1>
        <span v-if="isShared" class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-medium border border-amber-500/20">
          Read Only Preview
        </span>
        <span v-if="currentDashboard" class="text-muted-foreground">/</span>
        <!-- Dashboard Selector -->
        <Select v-if="!isLoading" :model-value="currentDashboard?.id" @update:model-value="handleDashboardChange">
          <SelectTrigger class="w-[200px] h-8">
            <SelectValue placeholder="Select Dashboard" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="d in dashboards" :key="d.id" :value="d.id">
              {{ d.title }}
            </SelectItem>
            <SelectSeparator />
            <div class="p-1">
              <button
                @click.stop="handleCreateDashboard"
                class="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                <Plus class="w-4 h-4" />
                New Dashboard
              </button>
            </div>
          </SelectContent>
        </Select>
        
        <!-- Role Badge - Moved here -->
        <div v-if="currentDashboard && userRole" class="px-2 py-1 rounded text-xs font-medium"
          :class="{
            'bg-primary/10 text-primary': userRole === 'owner',
            'bg-blue-500/10 text-blue-500': userRole === 'editor',
            'bg-emerald-500/10 text-emerald-500': userRole === 'viewer'
          }"
        >
          {{ userRole.charAt(0).toUpperCase() + userRole.slice(1) }}
        </div>
      </div>
      
      <!-- Actions Menu - Right Side -->
      <div class="flex items-center gap-2" v-if="!isShared">
        <!-- Add Element Button -->
        <button
          v-if="currentDashboard"
          @click="showAddElementDialog = true"
          class="px-2 sm:px-3 py-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center gap-2"
          title="Add Element"
        >
          <Plus class="w-4 h-4" />
          <span class="hidden sm:inline">Add Element</span>
        </button>

        <TooltipProvider :delay-duration="0">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                @click="showChat = !showChat"
                class="px-2 sm:px-3 py-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center gap-2"
                :class="{ 'bg-muted text-foreground': showChat }"
              >
                <MessageSquare class="w-4 h-4" />
                <span class="hidden sm:inline">Chat</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Dashboard Assistant
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <button
          v-if="currentDashboard && layout.length > 0"
          @click="generateDashboardSummary"
          :disabled="isAnalyzing"
          class="px-2 sm:px-3 py-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center gap-2 text-primary"
          title="Generate AI Insights"
        >
          <BrainCircuit v-if="!isAnalyzing" class="w-4 h-4" />
          <Loader2 v-else class="w-4 h-4 animate-spin" />
          <span class="hidden lg:inline">{{ isAnalyzing ? 'Analyzing...' : 'Generate Insights' }}</span>
        </button>
        
        <CollaboratorAvatars :collaborators="collaborators" class="mr-2 hidden sm:flex" />
        
        <button
          v-if="currentDashboard"
          @click="handleSave"
          class="p-2 sm:px-3 sm:py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition flex items-center gap-2 shadow-sm"
          title="Save"
        >
          <Loader2 v-if="store.isSaving" class="w-4 h-4 animate-spin" />
          <Save v-else class="w-4 h-4" />
          <span class="hidden sm:inline">{{ store.isSaving ? 'Saving...' : 'Save' }}</span>
        </button>
        
        <!-- Three Dots Menu -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
              title="Dashboard Options"
            >
              <MoreVertical class="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <!-- View Options -->
            <div class="px-2 py-1.5 text-sm font-semibold">View Options</div>
            <DropdownMenuSeparator />
            
            <DropdownMenuItem @click="isCompact = !isCompact" class="cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="mr-2">
                <path d="M2 2h12v4H2V2zm0 6h12v6H2V8z" opacity="0.8"/>
              </svg>
              <span>Compact Mode</span>
              <span v-if="isCompact" class="ml-auto text-primary">✓</span>
            </DropdownMenuItem>
            
            <DropdownMenuItem @click="showGrid = !showGrid" class="cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="mr-2">
                <path d="M2 2h12v12H2V2zm1 1v10h10V3H3z" opacity="0.8"/>
              </svg>
              <span>Show Grid</span>
              <span v-if="showGrid" class="ml-auto text-primary">✓</span>
            </DropdownMenuItem>
            
            <DropdownMenuItem @click="isLocked = !isLocked" class="cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="mr-2">
                <path v-if="isLocked" d="M8 1a4 4 0 00-4 4v2H3v8h10V7h-1V5a4 4 0 00-4-4zm0 2a2 2 0 012 2v2H6V5a2 2 0 012-2z"/>
                <path v-else d="M11 5V4a3 3 0 00-6 0v1H4v9h8V5h-1zm-1 0H6V4a2 2 0 014 0v1z"/>
              </svg>
              <span>{{ isLocked ? 'Unlock Layout' : 'Lock Layout' }}</span>
              <span v-if="isLocked" class="ml-auto text-amber-500">🔒</span>
            </DropdownMenuItem>
            
            <!-- Dashboard Actions -->
            <DropdownMenuSeparator />
            <div class="px-2 py-1.5 text-sm font-semibold">Dashboard Actions</div>
            <DropdownMenuSeparator />
            
            <DropdownMenuItem @click="handleShare" class="cursor-pointer">
              <Share2 class="w-4 h-4 mr-2" />
              <span>Share Dashboard</span>
            </DropdownMenuItem>
            
            <!-- Privacy Toggle - Owner Only -->
            <DropdownMenuItem 
              v-if="currentDashboard?.access_level === 'owner'"
              @click="showPrivacyDialog = true" 
              class="cursor-pointer"
            >
              <Lock v-if="!currentDashboard.is_public" class="w-4 h-4 mr-2" />
              <Globe v-else class="w-4 h-4 mr-2" />
              <span>{{ currentDashboard.is_public ? 'Make Private' : 'Make Public' }}</span>
            </DropdownMenuItem>
            
            <DropdownMenuItem @click="handleRename" class="cursor-pointer">
              <Pencil class="w-4 h-4 mr-2" />
              <span>Rename Dashboard</span>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem @click="handleDeleteDashboard" class="cursor-pointer text-destructive focus:text-destructive">
              <Trash2 class="w-4 h-4 mr-2" />
              <span>Delete Dashboard</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    <!-- Global Dashboard Filters -->
    <DashboardFilters />

    <!-- Main Content Area with potential Sidebar -->
    <div class="flex-1 overflow-hidden flex relative relative-container">
      

      
      <!-- Chat Sidebar (Right) - Overlay Mode -->
      <div 
        class="border-l border-border z-50 shadow-xl transition-all duration-300 bg-card fixed top-[57px] bottom-0 right-0 w-[320px]"
        :class="[
          showChat ? 'translate-x-0' : 'translate-x-full'
        ]"
      >
        <DashboardChat 
          :messages="chatMessages" 
          @close="showChat = false"
          @send="handleSendMessage"
        />
      </div>
      
      <!-- Backdrop for mobile chat -->
      <div 
        v-if="showChat && !isDesktop" 
        class="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 sm:hidden"
        @click="showChat = false"
      ></div>

      <!-- Main Grid Container -->
      <div 
        class="flex-1 h-full overflow-auto relative transition-colors duration-300 p-4"
        ref="dashboardContainer"
        :class="{ 'bg-grid-pattern': showGrid }"
        :style="gridStyle"
        @mousemove="onMouseMove"
        @mouseleave="onMouseLeave"
      >
        <!-- AI Insights -->
        <DashboardInsights v-if="currentDashboard && layout.length > 0" />

        <!-- Live Cursors Overlay -->
        <LiveCursors :cursors="cursors" />

        <div v-if="isLoading" class="flex items-center justify-center h-full">

        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>

      <DraggableGrid
        v-if="currentDashboard"
        v-model:items="layout"
        :cols="12"
        :row-height="30"
        :gap="8"
        :is-draggable="!isLocked"
        :is-resizable="!isLocked"
        :is-locked="isLocked"
        :vertical-compact="isCompact"
        drag-selector=".drag-handle"
        @layout-updated="onLayoutUpdated"
      >
        <template #item="{ item }">
          <DashboardElement
            :element="getElement(item.i)"
            :is-locked="isLocked"
            :is-ctrl-pressed="isCtrlPressed"
            :is-mobile="isPhone || isTablet"
            @remove="removeElement(item.i)"
            @edit-element="handleEditElement(getElement(item.i)!)"
            @edit-query="handleEditQuery(getElement(item.i)!)"
            @view-query="handleViewQuery(getElement(item.i)!)"
            @download="downloadFile(getElement(item.i)!)"
            @drill-down="handleDrillDown"
          />
        </template>
      </DraggableGrid>


      <!-- Empty State -->
      <div
        v-if="!isLoading && (!currentDashboard || !layout.length)"
        class="empty-state"
      >
        <div class="empty-state-icon-wrapper">
          <LayoutDashboard class="empty-state-icon" :size="64" :stroke-width="1.5" />
        </div>
        <h2 class="empty-state-title">
          {{ currentDashboard ? 'No dashboard elements yet' : 'No dashboard selected' }}
        </h2>
        <p class="empty-state-text">
          {{ currentDashboard ? 'Ask AI in Chat to "Create a dashboard element" from your query results.' : 'Select or create a dashboard to get started.' }}
        </p>
        <button
          v-if="!currentDashboard"
          @click="handleCreateDashboard"
          class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition"
        >
          Create Dashboard
        </button>
      </div>
    </div>

    <!-- Query Edit Modal -->
    <Dialog v-model:open="showQueryModal">
      <DialogContent class="max-w-5xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Query - {{ editingElement?.title }}</DialogTitle>
        </DialogHeader>
        
        <div class="flex-1 min-h-0 border border-border rounded-lg overflow-hidden">
          <CodeEditor
            v-model="editingQuery"
            language="sql"
          />
        </div>
        
        <DialogFooter class="gap-2 mt-4">
          <button
            @click="showQueryModal = false"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            @click="saveQueryChanges"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
          >
            Save Changes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Share Modal -->
    <ShareDialog
      v-model:open="showShareModal"
      :dashboard-id="currentDashboard?.id || null"
      :public-link="shareUrl"
    />

    <!-- Rename Modal -->
    <Dialog v-model:open="showRenameModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Dashboard</DialogTitle>
          <DialogDescription>
            Enter a new name for your dashboard.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <div class="space-y-2">
            <label for="dashboard-name" class="text-sm font-medium">Dashboard Name</label>
            <input
              id="dashboard-name"
              v-model="renameTitle"
              @keyup.enter="confirmRename"
              placeholder="Enter dashboard name"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button 
            @click="showRenameModal = false"
            class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
          >
            Cancel
          </button>
          <button 
            @click="confirmRename"
            :disabled="!renameTitle.trim()"
            class="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
          >
            Rename
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Delete Confirmation Modal -->
    <Dialog v-model:open="showDeleteModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Dashboard</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{{ currentDashboard?.title }}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div class="flex justify-end gap-2 pt-4">
          <button 
            @click="showDeleteModal = false"
            class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
          >
            Cancel
          </button>
          <button 
            @click="confirmDelete"
            class="px-3 py-2 text-sm font-medium bg-destructive text-white hover:bg-destructive/90 rounded-md"
          >
            Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Privacy Toggle Dialog -->
    <Dialog v-model:open="showPrivacyDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {{ currentDashboard?.is_public ? 'Make Dashboard Private?' : 'Make Dashboard Public?' }}
          </DialogTitle>
          <DialogDescription>
            <template v-if="currentDashboard?.is_public">
              <p class="mb-3">
                Making this dashboard private will:
              </p>
              <ul class="list-disc list-inside space-y-1 text-sm mb-3">
                <li>Remove access for all collaborators</li>
                <li>Disable the public sharing link</li>
                <li>Make the dashboard only visible to you</li>
              </ul>
              <p class="text-amber-500 font-medium text-sm">
                ⚠️ This action will immediately revoke access for all current users.
              </p>
            </template>
            <template v-else>
              <p>
                Making this dashboard public will allow anyone with the link to view it.
                You can still control who can edit it.
              </p>
            </template>
          </DialogDescription>
        </DialogHeader>
        <div class="flex justify-end gap-2 pt-4">
          <button 
            @click="showPrivacyDialog = false"
            class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
          >
            Cancel
          </button>
          <button 
            @click="confirmPrivacyChange"
            :class="currentDashboard?.is_public ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'"
            class="px-3 py-2 text-sm font-medium text-white rounded-md"
          >
            {{ currentDashboard?.is_public ? 'Make Private' : 'Make Public' }}
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Add Element Dialog -->
    <AddElementDialog
      v-model:open="showAddElementDialog"
      @select="handleAddElementSelect"
      @select-widget="handleAddWidget"
    />

    <!-- Add Text Dialog -->
    <AddTextDialog
      v-model:open="showTextDialog"
      @save="handleAddTextElement"
    />

    <!-- Add File Dialog -->
    <AddFileDialog
      v-model:open="showFileDialog"
      @save="handleAddFileElement"
    />

    <!-- Element Editor Modal -->
    <ElementEditorWrapper
      v-model:open="showEditModal"
      :element="editingElementForModal"
      @save="handleSaveElement"
    />
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import DraggableGrid from '@/components/grid/DraggableGrid.vue'
import CodeEditor from '@/components/Chat/CodeEditor.vue'
import ElementEditorWrapper from '@/components/Dashboard/ElementEditorWrapper.vue'
import AddElementDialog from '@/components/Dashboard/AddElementDialog.vue'
import AddTextDialog from '@/components/Dashboard/AddTextDialog.vue'
import AddFileDialog from '@/components/Dashboard/AddFileDialog.vue'
import ShareDialog from '@/components/Dashboard/ShareDialog.vue'
import DashboardChat from '@/components/Dashboard/DashboardChat.vue'
import LiveCursors from '@/components/Dashboard/LiveCursors.vue'
import CollaboratorAvatars from '@/components/Dashboard/CollaboratorAvatars.vue'
import DashboardInsights from '@/components/Dashboard/DashboardInsights.vue'
import DashboardFilters from '@/components/Dashboard/DashboardFilters.vue'
import { useDashboardAnalysis } from '@/composables/useDashboardAnalysis'
import { useCollaboration } from '@/composables/useCollaboration'
import { uploadDashboardFile, getFileDownloadUrl, updateDashboardPrivacy, api } from '@/lib/api'
import { toast } from '@/composables/useNotifications'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Pencil, Trash2, Code, Plus, Save, Share2, ArrowLeft, Settings, MoreVertical, FileText, Lock, Globe, MessageSquare, X, Send, Loader2, LayoutDashboard, BrainCircuit } from 'lucide-vue-next'
import DashboardElement from '@/components/Dashboard/DashboardElement.vue'

defineOptions({ name: 'DashboardPage' })

const router = useRouter()
const route = useRoute()
const store = useDashboardStore()
const dashboards = computed((): any[] => store.dashboards as any)
const currentDashboard = computed((): any => store.currentDashboard as any)
const isLoading = computed(() => store.isLoading)

import Navbar from '@/components/Navbar.vue'
import { useMediaQuery, useThrottleFn } from '@vueuse/core'
import { usePlatform } from '@/composables/usePlatform'

const { isPhone, isTablet } = usePlatform()
const isDesktop = useMediaQuery('(min-width: 640px)')

const { 
  joinDashboard, 
  leaveDashboard, 
  emitCursorMove, 
  sendChatMessage,
  collaborators,
  cursors,
  chatMessages
} = useCollaboration()

const { isAnalyzing, generateDashboardSummary } = useDashboardAnalysis()

const showChat = ref(false)
const dashboardContainer = ref<HTMLElement | null>(null)

// Watch for dashboard changes to join/leave rooms and save last viewed
watch(() => currentDashboard.value?.id, (newId, oldId) => {
  if (oldId) leaveDashboard(oldId)
  if (newId) {
    joinDashboard(newId)
    // Save as last viewed dashboard for navbar navigation
    localStorage.setItem('pegasus-last-dashboard', newId)
  }
}, { immediate: true })

let autoSaveInterval: ReturnType<typeof setInterval> | null = null
let debouncedSaveTimeout: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_DELAY = 2000 // 2 seconds after last change

// Debounced save function - saves 2 seconds after last change
const debouncedSave = () => {
  // Clear any existing timeout
  if (debouncedSaveTimeout) {
    clearTimeout(debouncedSaveTimeout)
  }
  
  // Set new timeout
  debouncedSaveTimeout = setTimeout(async () => {
    if (currentDashboard.value && !store.isSaving) {
      console.log('[Dashboard] Triggering debounced auto-save')
      try {
        await store.saveCurrentDashboard()
        console.log('[Dashboard] Auto-saved successfully')
      } catch (err) {
        console.error('[Dashboard] Auto-save failed:', err)
      }
    }
  }, DEBOUNCE_DELAY)
}

onMounted(() => {
  // Auto-save every 5 minutes (backup save)
  autoSaveInterval = setInterval(() => {
    if (currentDashboard.value && !store.isSaving) {
      console.log('[Dashboard] Triggering 5-minute backup save')
      store.saveCurrentDashboard().catch(err => {
        console.error('[Dashboard] Backup save failed:', err)
      })
    }
  }, 5 * 60 * 1000)
})

onBeforeUnmount(() => {
  if (currentDashboard.value?.id) {
    leaveDashboard(currentDashboard.value.id)
  }
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval)
  }
  if (debouncedSaveTimeout) {
    clearTimeout(debouncedSaveTimeout)
  }
})

// Cursor Handling - Throttled to 30Hz (33ms) for performance
const onMouseMove = useThrottleFn((e: MouseEvent) => {
  if (!dashboardContainer.value || !currentDashboard.value) return
  
  const rect = dashboardContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left + dashboardContainer.value.scrollLeft
  const y = e.clientY - rect.top + dashboardContainer.value.scrollTop
  
  emitCursorMove(currentDashboard.value.id, x, y)
}, 33)

const onMouseLeave = () => {
    // Optionally signal cursor left
}

const handleSendMessage = (content: string) => {
  if (currentDashboard.value) {
    sendChatMessage(currentDashboard.value.id, content)
  }
}



const downloadFile = (element: any) => {
  if (!element.config?.fileId) {
    toast.error('File not found')
    return
  }
  toast.info(`Downloading ${element.config.fileName}...`)
  const url = getFileDownloadUrl(element.config.fileId)
  window.open(url, '_blank')
}

// Layout State
const isCompact = ref(false)
const isLocked = ref(false)
const showGrid = ref(false)

const isShared = computed(() => route.path.includes('/shared/'))

// Lock layout automatically if shared
watch(isShared, (shared) => {
  if (shared) isLocked.value = true
}, { immediate: true })

// Query Modal State
const showQueryModal = ref(false)
const showAddElementDialog = ref(false)
const showTextDialog = ref(false)
const showFileDialog = ref(false)
const editingElement = ref<any>(null)
const editingQuery = ref('')

// Element Editor Modal State
const showEditModal = ref(false)
const editingElementForModal = ref<any>(null)

// Share Modal State
const showShareModal = ref(false)
const shareUrl = ref('')
const copied = ref(false)

// Privacy Dialog State
const showPrivacyDialog = ref(false)

// Rename Modal State
const showRenameModal = ref(false)
const renameTitle = ref('')

// Delete Modal State
const showDeleteModal = ref(false)

// User Role - determine if user is owner
const userRole = computed<'owner' | 'editor' | 'viewer' | null>(() => {
  if (!currentDashboard.value) return null
  // For now, all dashboards created by the user are owned by them
  // In the future, this could check dashboard.owner against current user ID
  return 'owner'
})

// Computed grid style for background pattern
const gridStyle = computed(() => {
  if (!showGrid.value) return {}
  return {
    backgroundImage: `
      linear-gradient(to right, color-mix(in srgb, var(--color-primary), transparent 95%) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--color-primary), transparent 95%) 1px, transparent 1px)
    `,
    backgroundSize: `calc((100% - 8px) / 12) 38px`,
    backgroundPosition: '8px 8px'
  }
})

// Elements Map for easy lookup
const elementsMap = computed(() => {
  const map = new Map()
  if (currentDashboard.value?.data?.elements) {
    currentDashboard.value.data.elements.forEach((el: any) => {
      map.set(el.id, el)
    })
  }
  return map
})

const getElement = (id: string) => elementsMap.value.get(id)

// Layout binding
const layout = computed({
  get: () => currentDashboard.value?.data?.layout || [],
  set: (newLayout) => {
    if (currentDashboard.value) {
      currentDashboard.value.data.layout = newLayout
    }
  }
})

const onLayoutUpdated = () => {
  // Trigger debounced save - will save 2 seconds after last change
  debouncedSave()
}

const handleDashboardChange = (id: string) => {
  router.push(`/dashboard/${id}`)
}

const handleCreateDashboard = async () => {
  const title = prompt('Enter dashboard title:', 'New Dashboard')
  if (title) {
    try {
      const id = await store.createNewDashboard(title)
      router.push(`/dashboard/${id}`)
      toast.success('Dashboard created')
    } catch (e) {
      toast.error('Failed to create dashboard')
    }
  }
}

const handleSave = async () => {
  try {
    await store.saveCurrentDashboard()
    toast.success('Dashboard saved')
  } catch (e) {
    toast.error('Failed to save dashboard')
  }
}

const handleDeleteDashboard = () => {
  if (!currentDashboard.value) return
  showDeleteModal.value = true
}

const confirmDelete = async () => {
  if (!currentDashboard.value) return
  
  try {
    await store.removeDashboard(currentDashboard.value.id)
    toast.success('Dashboard deleted successfully')
    showDeleteModal.value = false
    
    // Navigate to another dashboard or home
    if (dashboards.value.length > 0) {
      router.push(`/dashboard/${dashboards.value[0]!.id}`)
    } else {
      router.push('/dashboard')
    }
  } catch (e) {
    toast.error('Failed to delete dashboard')
  }
}

const handleRename = () => {
  if (!currentDashboard.value) return
  renameTitle.value = currentDashboard.value.title
  showRenameModal.value = true
}

const confirmRename = async () => {
  if (!renameTitle.value.trim() || !currentDashboard.value) return
  
  currentDashboard.value.title = renameTitle.value.trim()
  await handleSave()
  toast.success('Dashboard renamed successfully')
  showRenameModal.value = false
}

const confirmPrivacyChange = async () => {
  if (!currentDashboard.value) return
  
  try {
    const makingPrivate = currentDashboard.value.is_public
    
    // Update privacy via API
    await updateDashboardPrivacy(currentDashboard.value.id, !currentDashboard.value.is_public)
    
    // Update local state
    currentDashboard.value.is_public = !currentDashboard.value.is_public
    
    // Also remove share token if making private
    if (makingPrivate) {
      currentDashboard.value.share_token = null
    }
    
    toast.success(makingPrivate ? 'Dashboard is now private' : 'Dashboard is now public')
    showPrivacyDialog.value = false
  } catch (e) {
    console.error('Privacy change error:', e)
    toast.error('Failed to update privacy settings')
  }
}

const handleDrillDown = async (data: any) => {
  console.log('[Dashboard] Drill-down received:', data)
  
  // Try to find a parameter that matches the label or dataset label
  const params = store.parameters
  const keys = Object.keys(params)
  
  let targetKey = keys.find(k => k.toLowerCase() === data.datasetLabel?.toLowerCase())
  if (!targetKey) {
    targetKey = keys.find(k => k.toLowerCase().includes('category') || k.toLowerCase().includes('name') || k.toLowerCase().includes('type'))
  }
  
  if (targetKey) {
    console.log(`[Dashboard] Updating parameter "${targetKey}" to "${data.label}"`)
    store.updateParameter(targetKey, data.label)
    
    // Automatically refresh
    toast.info(`Filtering by ${data.label}...`)
    await store.refreshDashboard(true)
  } else {
    console.log('[Dashboard] No matching parameter found for drill-down')
    toast.info(`Clicked: ${data.label} (${data.value})`, {
      description: 'Add a parameter with a matching name to enable automatic filtering.'
    })
  }
}

const handleShare = async () => {
  if (!currentDashboard.value) return
  try {
    const token = await store.generateShareLink(currentDashboard.value.id)
    shareUrl.value = `${window.location.origin}/shared/dashboard/${token}`
    showShareModal.value = true
    copied.value = false
  } catch (e) {
    toast.error('Failed to generate share link')
  }
}

const copyShareLink = () => {
  navigator.clipboard.writeText(shareUrl.value)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

// Element Actions
const removeElement = async (id: string) => {
  if (!currentDashboard.value) return
  currentDashboard.value.data.elements = currentDashboard.value.data.elements.filter((el: any) => el.id !== id)
  currentDashboard.value.data.layout = currentDashboard.value.data.layout.filter((item: any) => item.i !== id)
  await handleSave()
}

const handleEditQuery = (element: any) => {
  if (!element.query) return
  router.push({ 
    path: '/query', 
    query: { 
      loadQuery: element.query,
      mode: 'write',
      connectionId: element.config.connectionId
    } 
  })
}

const handleViewQuery = (element: any) => {
  editingElement.value = element
  editingQuery.value = element.query || ''
  showQueryModal.value = true
}

const saveQueryChanges = async () => {
  if (!editingElement.value || !currentDashboard.value) return
  
  const el = currentDashboard.value.data.elements.find((e: any) => e.id === editingElement.value.id)
  if (el) {
    el.query = editingQuery.value
    showQueryModal.value = false
    await handleSave()
    toast.success('Query updated and saved.')
  }
}

// Element Editor Handlers
const handleEditElement = (element: any) => {
  editingElementForModal.value = element
  showEditModal.value = true
}

const handleAddElementSelect = (type: 'visualization' | 'table' | 'text' | 'file') => {
  if (type === 'visualization' || type === 'table') {
    // Redirect to query builder with return context
    // We pass dashboardId so the query builder knows where to add the result
    router.push({ 
      path: '/query', 
      query: { 
        mode: 'write',
        dashboardId: currentDashboard.value?.id 
      } 
    })
  } else if (type === 'text') {
    showTextDialog.value = true
  } else if (type === 'file') {
    showFileDialog.value = true
  }
}

const handleAddWidget = async (widgetType: string, config: any) => {
  if (!currentDashboard.value) return
  
  try {
    console.log(`[Dashboard] Adding widget: ${widgetType}`, config)
    
    const response = await api.post(`/dashboards/${currentDashboard.value.id}/elements/widget`, {
      widgetType,
      config
    })
    
    console.log('[Dashboard] Widget created:', response)
    
    // Reload dashboard to show new widget
    await store.selectDashboard(currentDashboard.value.id)
    
    toast.success('Widget added successfully')
  } catch (e: any) {
    console.error('[Dashboard] Widget creation failed:', e)
    toast.error(e.message || 'Failed to add widget')
  }
}

const handleAddTextElement = async (data: { title: string, content: string }) => {
  if (!currentDashboard.value) return
  
  const element = {
    type: 'text',
    title: data.title,
    config: { content: data.content },
    w: 6, h: 4 // default size
  }

  try {
    await store.addElementToDashboard(currentDashboard.value.id, element)
    toast.success('Text block added')
  } catch (e) {
    toast.error('Failed to add text block')
  }
}

const handleAddFileElement = async (data: { file: File, title: string }) => {
  if (!currentDashboard.value) return
  
  // Check 200MB limit
  if (data.file.size > 200 * 1024 * 1024) {
    toast.error('File exceeds 200MB limit')
    return
  }

  try {
    toast.info('Uploading file...')
    
    // Upload file to backend
    const uploadResult = await uploadDashboardFile(currentDashboard.value.id, data.file)
    
    // Add element with file info
    const element = {
      type: 'file',
      title: data.title || data.file.name,
      config: {
        fileId: uploadResult.fileId,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        fileType: uploadResult.fileType
      },
      w: 4, h: 3
    }
    
    await store.addElementToDashboard(currentDashboard.value.id, element)
    toast.success('File uploaded successfully')
  } catch (e) {
    console.error('File upload error:', e)
    toast.error('Failed to upload file')
  }
}

const handleSaveElement = async (updatedElement: any) => {
  if (!currentDashboard.value) return
  
  const elementIndex = currentDashboard.value.data.elements.findIndex(
    (el: any) => el.id === updatedElement.id
  )
  
  if (elementIndex !== -1) {
    currentDashboard.value.data.elements[elementIndex] = updatedElement
    await handleSave()
    toast.success('Element updated and saved.')
  }
  
  showEditModal.value = false
}


// Initialization
onMounted(async () => {
  await store.loadDashboards()
  
  const id = route.params.id as string
  if (id) {
    await store.selectDashboard(id)
  } else if (dashboards.value.length > 0) {
    // Auto-select first dashboard if none specified
    router.replace(`/dashboard/${dashboards.value[0]!.id}`)
  }
  
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

watch(() => route.params.id, async (newId) => {
  if (newId && typeof newId === 'string') {
    if (currentDashboard.value?.id !== newId) {
      await store.selectDashboard(newId)
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

// Track Control/Command key state
const isCtrlPressed = ref(false)

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = true
  }
}

const handleKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = false
  }
}
</script>

<style scoped>
/* Dashboard Card Styles */
.dashboard-card {
  transition: all 0.2s ease;
  overflow: hidden;
  border-radius: 1rem;
}

.dashboard-card:hover {
  border-color: oklch(var(--color-primary) / 0.6);
  box-shadow: 0 10px 15px -3px oklch(var(--color-primary) / 0.2), 0 4px 6px -2px oklch(var(--color-primary) / 0.1);
}

.card-content {
  padding: 1rem;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-title-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

/* Grid Layout Customization */
:deep(.vue-grid-item.vue-grid-placeholder) {
  background: oklch(var(--color-primary) / 0.15) !important;
  border: 2px dashed oklch(var(--color-primary) / 0.5) !important;
  border-radius: 1rem;
  opacity: 1;
}

:deep(.vue-grid-item.resizing),
:deep(.vue-grid-item.dragging) {
  opacity: 0.9;
  z-index: 100;
  transition: none;
}

:deep(.vue-grid-item > .vue-resizable-handle) {
  opacity: 0;
  transition: opacity 0.2s ease;
  width: 20px;
  height: 20px;
  bottom: 0;
  right: 0;
}

:deep(.vue-grid-item:hover > .vue-resizable-handle) {
  opacity: 1;
}

:deep(.vue-resizable-handle::after) {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 12px 12px;
  border-color: transparent transparent oklch(var(--color-primary) / 0.8) transparent;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
  padding: 2rem;
}

.empty-state-icon-wrapper {
  margin-bottom: 1.5rem;
  padding: 1.5rem;
  border-radius: 1rem;
  background: oklch(var(--color-primary) / 0.05);
  border: 2px dashed oklch(var(--color-primary) / 0.2);
}

.empty-state-icon {
  color: oklch(var(--color-primary) / 0.4);
}

.empty-state-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.empty-state-text {
  font-size: 0.875rem;
  margin: 0 0 1.5rem 0;
}

/* Grid Pattern */
.bg-grid-pattern {
  background-attachment: local;
}
</style>

<style scoped>
/* Dashboard Card Styles */
.dashboard-card {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  border-radius: 0.25rem;
  box-shadow: var(--shadow-sm);
  background-color: var(--card);
}

.dashboard-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}

.card-content {
  padding: 0.75rem;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-title-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

/* Grid Layout Customization */
:deep(.vue-grid-item.vue-grid-placeholder) {
  background: oklch(var(--color-primary) / 0.15) !important;
  border: 2px dashed oklch(var(--color-primary) / 0.5) !important;
  border-radius: 0.25rem;
  opacity: 1;
}

:deep(.vue-grid-item.resizing),
:deep(.vue-grid-item.dragging) {
  opacity: 0.9;
  z-index: 100;
  transition: none;
}

:deep(.vue-grid-item > .vue-resizable-handle) {
  opacity: 0;
  transition: opacity 0.2s ease;
  width: 20px;
  height: 20px;
  bottom: 0;
  right: 0;
}

:deep(.vue-grid-item:hover > .vue-resizable-handle) {
  opacity: 1;
}

:deep(.vue-resizable-handle::after) {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 12px 12px;
  border-color: transparent transparent oklch(var(--color-primary) / 0.8) transparent;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
  padding: 2rem;
}

.empty-state-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.empty-state-text {
  font-size: 0.875rem;
  margin: 0 0 1.5rem 0;
}

/* Grid Pattern */
.bg-grid-pattern {
  background-attachment: local;
}
</style>
