<template>
  <div class="w-full h-screen flex flex-col bg-background text-foreground overflow-hidden" @mousemove="handleMouseMove">
    <!-- Premium Loading State -->
    <LoadingScreen 
      v-if="isInitializing" 
      title="Loading Dashboard"
      message="Preparing fullscreen view..."
    />

    <template v-else>
      <!-- Hover Trigger Zone (for auto-hide mode) -->
      <div 
        v-if="autoHideHeader"
        class="fixed top-0 left-0 right-0 h-2 z-30"
        @mouseenter="isHeaderHovered = true"
      ></div>

      <!-- Compact Header -->
      <header 
        class="border-b border-border bg-card/90 backdrop-blur-sm px-4 py-2 flex items-center justify-between z-20 shrink-0 transition-all duration-300 ease-in-out"
        :class="[
          autoHideHeader && !isHeaderHovered ? '-mt-[49px] opacity-0' : 'mt-0 opacity-100'
        ]"
        @mouseenter="isHeaderHovered = true"
        @mouseleave="isHeaderHovered = false"
      >
        <!-- Left: Title and Pages -->
        <div class="flex items-center gap-3">
          <h1 class="text-sm font-semibold truncate max-w-[200px]">
            {{ currentDashboard?.title || 'Dashboard' }}
          </h1>
          
          <!-- Page Tabs (Compact) -->
          <div v-if="sortedPages.length > 1" class="flex items-center gap-1 ml-2">
            <button
              v-for="page in sortedPages"
              :key="page.id"
              @click="switchPage(page.id)"
              class="px-2 py-1 text-xs font-medium rounded transition-colors"
              :class="[
                activePageId === page.id 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              ]"
            >
              {{ page.title }}
            </button>
          </div>
        </div>
        
        <!-- Right: Main Actions -->
        <div class="flex items-center gap-2">
          <!-- Add Element Button -->
          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  v-if="currentDashboard"
                  @click="showAddElementDialog = true"
                  class="p-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center justify-center font-mono"
                >
                  <Plus class="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Element</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- Dashboard Assistant Button -->
          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  @click="showChat = !showChat"
                  class="relative p-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center justify-center"
                  :class="{ 'bg-muted text-foreground': showChat }"
                >
                  <MessageSquare class="w-4 h-4" />
                  <span v-if="hasUnreadMessages" class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-background"></span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Dashboard Assistant</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- AI Insights Button -->
          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  v-if="currentDashboard && activeLayout.length > 0"
                  @click="generateDashboardSummary"
                  :disabled="isAnalyzing"
                  class="p-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition inline-flex items-center justify-center shrink-0 text-primary"
                >
                  <BrainCircuit v-if="!isAnalyzing" class="w-4 h-4" />
                  <Loader2 v-else class="w-4 h-4 animate-spin" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Generate AI Insights</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- Live Collaborator Avatars -->
          <CollaboratorAvatars :collaborators="collaborators" />

          <!-- Save Button -->
          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  v-if="currentDashboard"
                  @click="handleSave"
                  class="p-1.5 text-sm font-medium rounded-md transition flex items-center justify-center shrink-0 shadow-sm border backdrop-blur-md"
                  :class="isSaving 
                    ? 'bg-muted text-muted-foreground border-border' 
                    : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'"
                >
                  <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
                  <Save v-else class="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{{ isSaving ? 'Saving...' : 'Save Dashboard' }}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <!-- Three Dots Menu -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                class="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                title="Dashboard Options"
              >
                <MoreVertical class="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <!-- View Options -->
              <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">View Options</div>
              
              <DropdownMenuItem @click="handleRefresh" class="cursor-pointer">
                <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isRefreshing }" />
                <span>Refresh Data</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem @click="isLocked = !isLocked" class="cursor-pointer">
                <Lock v-if="isLocked" class="w-4 h-4 mr-2" />
                <Unlock v-else class="w-4 h-4 mr-2" />
                <span>{{ isLocked ? 'Unlock Layout' : 'Lock Layout' }}</span>
                <span v-if="isLocked" class="ml-auto text-amber-500">🔒</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem @click="autoHideHeader = !autoHideHeader" class="cursor-pointer">
                <EyeOff v-if="autoHideHeader" class="w-4 h-4 mr-2" />
                <Eye v-else class="w-4 h-4 mr-2" />
                <span>{{ autoHideHeader ? 'Show Header' : 'Auto-hide Header' }}</span>
                <span v-if="autoHideHeader" class="ml-auto text-primary">✓</span>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <!-- Window Actions -->
              <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Window</div>
              
              <DropdownMenuItem @click="openInMainApp" class="cursor-pointer">
                <ExternalLink class="w-4 h-4 mr-2" />
                <span>Open in Main App</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem @click="closeWindow" class="cursor-pointer text-destructive focus:text-destructive">
                <X class="w-4 h-4 mr-2" />
                <span>Close Window</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-hidden flex relative">
        <!-- Live Cursors Overlay -->
        <LiveCursors :cursors="cursors" />

        <!-- Floating Chat Sidebar Overlay -->
        <Transition
          enter-active-class="transform transition ease-in-out duration-300"
          enter-from-class="translate-x-full opacity-0"
          enter-to-class="translate-x-0 opacity-100"
          leave-active-class="transform transition ease-in-out duration-300"
          leave-from-class="translate-x-0 opacity-100"
          leave-to-class="translate-x-full opacity-0"
        >
          <div 
            v-if="showChat"
            class="z-[100] shadow-2xl bg-card fixed w-[350px] overflow-hidden flex flex-col transition-all duration-300 top-[49px] bottom-4 right-4 border border-border rounded-xl"
          >
            <DashboardChat 
              :messages="chatMessages" 
              :isAIThinking="isAIThinking"
              :typingUsers="typingUsers"
              :isDetached="false"
              :collaborators="(authorizedUsers as any)"
              @close="showChat = false"
              @send="handleSendMessage"
              @pegasus-query="handlePegasusQuery"
              @edit="handleEditMessage"
              @delete="handleDeleteMessage"
              @typing-start="handleTypingStart"
              @typing-stop="handleTypingStop"
            />
          </div>
        </Transition>

        <!-- Main Grid Container -->
        <div class="flex-1 overflow-auto p-4">
          <!-- AI Insights -->
          <DashboardInsights v-if="currentDashboard && activeLayout.length > 0" />

          <DraggableGrid
            v-if="currentDashboard"
            v-model:items="activeLayout"
            :cols="12"
            :row-height="30"
            :gap="8"
            :is-draggable="!isLocked"
            :is-resizable="!isLocked"
            :is-locked="isLocked"
            :vertical-compact="true"
            drag-selector=".drag-handle"
            @layout-updated="onLayoutUpdated"
          >
            <template #item="{ item }">
              <DashboardElement
                :element="getElement(item.i)"
                :is-locked="isLocked"
                :is-ctrl-pressed="false"
                :is-mobile="false"
                @remove="removeElement(item.i)"
                @edit-element="handleEditElement(getElement(item.i)!)"
              />
            </template>
          </DraggableGrid>

          <!-- Empty State -->
          <div
            v-if="!isLoading && (!currentDashboard || !activeLayout.length)"
            class="flex flex-col items-center justify-center h-full text-center"
          >
            <LayoutDashboard class="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h2 class="text-xl font-semibold text-muted-foreground">
              {{ currentDashboard ? 'No elements on this page' : 'Dashboard not found' }}
            </h2>
            <button
              v-if="currentDashboard"
              @click="showAddElementDialog = true"
              class="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition"
            >
              Add First Element
            </button>
          </div>
        </div>
      </div>

      <!-- Add Element Dialog -->
      <AddElementDialog
        v-model:open="showAddElementDialog"
        @select="handleAddElementSelect"
        @select-widget="handleAddWidget"
      />

      <!-- Element Editor Modal -->
      <ElementEditorWrapper
        v-model:open="showEditModal"
        :element="editingElementForModal"
        @save="handleSaveElement"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDashboardStore, type DashboardPage, type DashboardElement as DashboardElementType } from '@/stores/dashboard'
import { useDashboardAnalysis } from '@/composables/useDashboardAnalysis'
import { useCollaboration } from '@/composables/useCollaboration'
import LoadingScreen from '@/components/ui/LoadingScreen.vue'
import DraggableGrid from '@/components/grid/DraggableGrid.vue'
import DashboardElement from '@/components/Dashboard/DashboardElement.vue'
import DashboardInsights from '@/components/Dashboard/DashboardInsights.vue'
import DashboardChat from '@/components/Dashboard/DashboardChat.vue'
import CollaboratorAvatars from '@/components/Dashboard/CollaboratorAvatars.vue'
import LiveCursors from '@/components/Dashboard/LiveCursors.vue'
import AddElementDialog from '@/components/Dashboard/AddElementDialog.vue'
import ElementEditorWrapper from '@/components/Dashboard/ElementEditorWrapper.vue'
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
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RefreshCw, Lock, Unlock, X, ExternalLink, LayoutDashboard, Eye, EyeOff, MoreVertical, BrainCircuit, Loader2, Save, Plus, MessageSquare } from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'
import { useThrottleFn } from '@vueuse/core'

defineOptions({ name: 'DashboardFullscreen' })

const route = useRoute()
const router = useRouter()
const store = useDashboardStore()

// State
const isInitializing = ref(true)
const isRefreshing = ref(false)
const isSaving = ref(false)
const isLocked = ref(false) // Default to unlocked to allow editing
const autoHideHeader = ref(false)
const isHeaderHovered = ref(false)
const showChat = ref(false)
const showAddElementDialog = ref(false)
const showEditModal = ref(false)
const editingElementForModal = ref<DashboardElementType | null>(null)
const hasUnreadMessages = ref(false)

// Collaboration & Chat
const { 
  collaborators, 
  cursors,
  chatMessages, 
  isAIThinking, 
  typingUsers,
  emitPegasusQuery, 
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  emitTypingStart,
  emitTypingEnd,
  emitCursorMove,
  connect,
  joinDashboard,
  leaveDashboard
} = useCollaboration()

// Dashboard data
const currentDashboard = computed((): any => store.currentDashboard as any)
const isLoading = computed(() => store.isLoading)
const authorizedUsers = computed(() => store.authorizedUsers)

// Analysis
const { isAnalyzing, generateDashboardSummary } = useDashboardAnalysis()

// Multi-page Support
const activePageId = computed({
  get: () => store.activePageId as unknown as string | null,
  set: (val) => (store.activePageId as any) = val
})

const activePage = computed(() => store.activePage as any as DashboardPage | undefined)

const sortedPages = computed(() => {
  if (!currentDashboard.value?.data?.pages) return []
  return [...currentDashboard.value.data.pages].sort((a: any, b: any) => a.order - b.order)
})

const activeLayout = computed({
  get: () => activePage.value?.layout || [],
  set: (newLayout) => {
    if (activePage.value) {
      activePage.value.layout = newLayout
    }
  }
})

// Page Actions
const switchPage = (pageId: string) => {
  activePageId.value = pageId
}

// Element helpers
const getElement = (id: string) => {
  return activePage.value?.elements?.find((el: any) => el.id === id)
}

const removeElement = (id: string) => {
  if (activePage.value) {
    activePage.value.layout = activePage.value.layout.filter((item: any) => item.i !== id)
    activePage.value.elements = activePage.value.elements.filter((el: any) => el.id !== id)
  }
}

const handleEditElement = (element: any) => {
  editingElementForModal.value = element
  showEditModal.value = true
}

const handleSaveElement = (updatedElement: any) => {
  if (!activePage.value || !updatedElement) return
  const idx = activePage.value.elements.findIndex((el: any) => el.id === updatedElement.id)
  if (idx !== -1) {
    activePage.value.elements[idx] = updatedElement
  }
  showEditModal.value = false
  editingElementForModal.value = null
}

const onLayoutUpdated = (newLayout: any[]) => {
  if (activePage.value) {
    activePage.value.layout = newLayout
  }
}

// Add Element handlers
const handleAddElementSelect = async (type: string) => {
  if (!activePage.value) return
  
  // Generate unique ID
  const id = `el-${Date.now()}`
  
  // Create new element
  const newElement: any = {
    id,
    type,
    title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
    config: {},
    query: '',
    connectionId: null
  }
  
  // Add to elements array
  activePage.value.elements.push(newElement)
  
  // Add to layout
  const newLayoutItem = {
    i: id,
    x: 0,
    y: Infinity, // Will be placed at the bottom
    w: 6,
    h: 8
  }
  activePage.value.layout.push(newLayoutItem)
  
  // Open editor
  editingElementForModal.value = newElement
  showEditModal.value = true
}

const handleAddWidget = (widgetType: string) => {
  // Handle widget types like text, image, etc.
  handleAddElementSelect(widgetType)
}

// Chat handlers
const handleSendMessage = async (content: string) => {
  if (!content.trim() || !route.params.id) return
  sendChatMessage(route.params.id as string, content)
}

const handlePegasusQuery = async (query: string) => {
  if (!route.params.id) return
  await emitPegasusQuery(route.params.id as string, query)
}

const handleEditMessage = (messageId: string, newContent: string) => {
  if (!route.params.id) return
  editChatMessage(route.params.id as string, messageId, newContent)
}

const handleDeleteMessage = (messageId: string) => {
  if (!route.params.id) return
  deleteChatMessage(route.params.id as string, messageId)
}

const handleTypingStart = () => {
  if (!route.params.id) return
  emitTypingStart(route.params.id as string)
}

const handleTypingStop = () => {
  if (!route.params.id) return
  emitTypingEnd(route.params.id as string)
}

// Cursor Handling - Throttled to 30Hz (33ms) for performance
const handleMouseMove = useThrottleFn((e: MouseEvent) => {
  if (!route.params.id || !currentDashboard.value) return
  
  // Normalized coordinates (0 to 1) are better for responsive layouts
  const x = e.clientX / window.innerWidth
  const y = e.clientY / window.innerHeight
  
  emitCursorMove(route.params.id as string, x, y)
}, 33)

// Actions
const handleRefresh = async () => {
  isRefreshing.value = true
  try {
    await store.refreshDashboard()
    toast.success('Dashboard refreshed')
  } catch (err) {
    toast.error('Failed to refresh')
  } finally {
    isRefreshing.value = false
  }
}

const handleSave = async () => {
  if (!currentDashboard.value) return
  isSaving.value = true
  try {
    await store.saveCurrentDashboard()
    toast.success('Dashboard saved')
  } catch (err) {
    toast.error('Failed to save')
  } finally {
    isSaving.value = false
  }
}

const openInMainApp = () => {
  const dashboardId = route.params.id
  router.push(`/dashboard/${dashboardId}`)
}

const closeWindow = () => {
  if (window.opener) {
    window.close()
  } else {
    router.push('/dashboard')
  }
}

// Initialize dashboard
onMounted(async () => {
  const dashboardId = route.params.id as string
  
  if (dashboardId) {
    try {
      await store.selectDashboard(dashboardId)
      
      // Initialize collaboration
      console.log('[DashboardFullscreen] Connecting to collaboration...')
      connect()
      joinDashboard(dashboardId)
      
      if (!activePageId.value && sortedPages.value.length > 0) {
        activePageId.value = sortedPages.value[0].id
      }
    } catch (err) {
      console.error('[DashboardFullscreen] Failed to load dashboard:', err)
      toast.error('Failed to load dashboard')
    }
  }
  
  isInitializing.value = false
})

onBeforeUnmount(() => {
  const dashboardId = route.params.id as string
  if (dashboardId) {
    leaveDashboard(dashboardId)
  }
})

// Update window title
watch(currentDashboard, (dashboard) => {
  if (dashboard?.title) {
    document.title = `${dashboard.title} - Pegasus Dashboard`
  }
}, { immediate: true })

// Unread message indicator
watch(chatMessages, (newMessages, oldMessages) => {
  if (newMessages.length > oldMessages.length && !showChat.value) {
    const lastMessage = newMessages[newMessages.length - 1]
    if (lastMessage.sender !== 'user') {
      hasUnreadMessages.value = true
    }
  }
}, { deep: true })

watch(showChat, (isVisible) => {
  if (isVisible) {
    hasUnreadMessages.value = false
  }
})
</script>

<style scoped>
.h-screen {
  height: 100vh;
  height: 100dvh;
}
</style>
