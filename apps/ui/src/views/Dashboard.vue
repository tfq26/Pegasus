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
        <span v-if="isShared" class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium border border-amber-500/20">
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
          class="px-3 py-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center gap-2"
        >
          <Plus class="w-4 h-4" />
          Add Element
        </button>
        
        <button
          v-if="currentDashboard"
          @click="handleSave"
          class="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition flex items-center gap-2 shadow-sm"
        >
          <Save class="w-4 h-4" />
          Save
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

    <!-- Main Grid -->
    <div 
      class="flex-1 overflow-auto p-4 relative transition-colors duration-300"
      :class="{ 'bg-grid-pattern': showGrid }"
      :style="gridStyle"
    >
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>

      <DraggableGrid
        v-else-if="currentDashboard"
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
          <ContextMenu>
            <ContextMenuTrigger>
              <div 
                class="dashboard-card w-full h-full flex flex-col bg-card border border-border shadow-sm"
                :class="{ 'pointer-events-none': isLocked }"
              >
                <!-- Card Content -->
                <div class="card-content">
                  <div class="card-header">
                    <div class="card-title-section">
                      <!-- Combined Drag/Delete Handle -->
                      <div 
                        v-if="!isLocked"
                        class="transition-all duration-200 rounded-md p-1 flex items-center justify-center"
                        :class="[
                          isCtrlPressed 
                            ? 'bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20' 
                            : 'drag-handle cursor-move text-muted-foreground hover:text-primary hover:bg-primary/10'
                        ]"
                        :title="isCtrlPressed ? 'Click to remove' : 'Drag to move'"
                        @click.stop="isCtrlPressed ? removeElement(item.i) : null"
                      >
                        <!-- Delete Icon -->
                        <svg v-if="isCtrlPressed" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                        <!-- Drag Icon -->
                        <svg v-else width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                        </svg>
                      </div>
                      <div>
                        <h3 class="card-title text-foreground font-semibold text-sm">{{ getElement(item.i)?.title }}</h3>
                        <p class="card-subtitle text-xs text-muted-foreground truncate max-w-[200px]">{{ getElement(item.i)?.query }}</p>
                      </div>
                    </div>
                  </div>

                  <div class="card-body relative overflow-hidden">
                    <ChartRenderer 
                      v-if="getElement(item.i) && getElement(item.i)!.type !== 'stat' && getElement(item.i)!.type !== 'text' && getElement(item.i)!.type !== 'file' && getElement(item.i)!.config" 
                      :type="getElement(item.i)!.type" 
                      :data="getElement(item.i)!.config.data" 
                      :options="{ ...getElement(item.i)!.config.options, maintainAspectRatio: false, responsive: true }"
                      :customization="getElement(item.i)!.customization"
                      class="w-full h-full"
                    />
                    <ChartRenderer 
                      v-else-if="getElement(item.i) && getElement(item.i)!.type === 'stat' && getElement(item.i)!.config" 
                      :type="getElement(item.i)!.type" 
                      :data="getElement(item.i)!.config" 
                      :options="{ label: getElement(item.i)!.title }"
                      :customization="getElement(item.i)!.customization"
                      class="w-full h-full"
                    />

                    <!-- Text Element -->
                    <div 
                      v-else-if="getElement(item.i)?.type === 'text'" 
                      class="p-4 h-full overflow-auto prose dark:prose-invert text-sm max-w-none"
                    >
                       <div v-html="renderMarkdown(getElement(item.i)!.config.content)"></div>
                    </div>

                    <!-- File Element -->
                    <div 
                      v-else-if="getElement(item.i)?.type === 'file'" 
                      class="flex flex-col items-center justify-center h-full p-4"
                    >
                       <File class="w-12 h-12 text-primary mb-2" />
                       <div class="text-sm font-medium text-center">{{ getElement(item.i)!.config.fileName }}</div>
                       <div class="text-xs text-muted-foreground">{{ formatSize(getElement(item.i)!.config.fileSize) }}</div>
                       <button 
                         class="mt-4 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition" 
                         @click="downloadFile(getElement(item.i)!)"
                       >
                         Download
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
              <ContextMenuItem @select="handleEditElement(getElement(item.i)!)">
                <Settings class="w-4 h-4 mr-2" />
                Edit Element
              </ContextMenuItem>
              <ContextMenuSeparator class="bg-border" />
              <ContextMenuItem @select="handleEditQuery(getElement(item.i)!)">
                <Pencil class="w-4 h-4 mr-2" />
                Edit Query
              </ContextMenuItem>
              <ContextMenuItem @select="handleViewQuery(getElement(item.i)!)">
                <Code class="w-4 h-4 mr-2" />
                View Query
              </ContextMenuItem>
              <ContextMenuSeparator class="bg-border" />
              <ContextMenuItem @select="removeElement(item.i)" class="text-destructive focus:text-destructive focus:bg-destructive/10">
                <Trash2 class="w-4 h-4 mr-2" />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
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
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import DraggableGrid from '@/components/grid/DraggableGrid.vue'
import ChartRenderer from '@/components/Dashboard/ChartRenderer.vue'
import CodeEditor from '@/components/Chat/CodeEditor.vue'
import ElementEditorWrapper from '@/components/Dashboard/ElementEditorWrapper.vue'
import AddElementDialog from '@/components/Dashboard/AddElementDialog.vue'
import AddTextDialog from '@/components/Dashboard/AddTextDialog.vue'
import AddFileDialog from '@/components/Dashboard/AddFileDialog.vue'
import ShareDialog from '@/components/Dashboard/ShareDialog.vue'
import { uploadDashboardFile, getFileDownloadUrl, updateDashboardPrivacy } from '@/lib/api'
import { toast } from 'vue-sonner'
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
import { Pencil, Trash2, Code, Plus, Save, Share2, ArrowLeft, Settings, MoreVertical, FileText, File, Lock, Globe } from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt()

defineOptions({ name: 'DashboardPage' })

const router = useRouter()
const route = useRoute()
const store = useDashboardStore()
const { dashboards, currentDashboard, isLoading } = storeToRefs(store)

const renderMarkdown = (content: string) => md.render(content || '')

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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
  // Auto-save layout changes
  handleSave()
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
