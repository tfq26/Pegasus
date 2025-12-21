<template>
  <div class="w-full h-full flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Top Bar -->
    <header class="flex items-center justify-between px-6 py-3 border-b border-border bg-background z-10">
      <div class="flex items-center gap-4">
        <div class="p-2 bg-primary/10 rounded-lg">
          <LayoutDashboard class="w-6 h-6 text-primary" />
        </div>
        <h1 class="text-xl font-semibold">Dashboards</h1>
      </div>
      
      <div class="flex-1 max-w-2xl mx-8">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            v-model="searchQuery"
            placeholder="Search dashboards..." 
            class="w-full pl-10 pr-4 py-2 bg-muted/50 border-none rounded-lg focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          />
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Import Button -->
        <button 
          @click="showImportModal = true"
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
          title="Import Dashboard"
        >
          <Download class="w-5 h-5" />
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-auto">
      <!-- Start New Section -->
      <div class="bg-muted/30 py-8 px-6 border-b border-border">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-sm font-medium text-muted-foreground mb-4">Start a new dashboard</h2>
          <div class="flex gap-4">
            <!-- Blank Dashboard -->
            <button 
              @click="handleCreateDashboard"
              class="group flex flex-col gap-2 text-left"
            >
              <div class="w-48 h-32 bg-background border border-border rounded-lg flex items-center justify-center hover:border-primary hover:ring-1 hover:ring-primary transition-all shadow-sm group-hover:shadow-md relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Plus class="w-12 h-12 text-primary/50 group-hover:text-primary group-hover:scale-110 transition-all duration-300" />
              </div>
              <span class="text-sm font-medium pl-1">Blank dashboard</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Tabs & Filters -->
      <div class="py-8 px-6">
        <div class="max-w-6xl mx-auto">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            
            <!-- Tabs -->
            <div class="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
              <button 
                @click="activeTab = 'my'"
                :class="[
                  'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                  activeTab === 'my' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                ]"
              >
                My Dashboards
              </button>
              <button 
                @click="activeTab = 'shared'"
                :class="[
                  'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                  activeTab === 'shared' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                ]"
              >
                Shared with me
              </button>
            </div>

            <!-- Sort -->
            <div class="flex items-center gap-2">
              <select v-model="sortBy" class="bg-transparent text-sm font-medium text-muted-foreground border-none outline-none cursor-pointer hover:text-foreground">
                <option value="updated">Last modified</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>

          <div v-if="isLoading || isLoadingShared" class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>

          <div v-else-if="filteredDashboards.length === 0" class="text-center py-12 text-muted-foreground">
            <p>No dashboards found.</p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <div 
              v-for="dashboard in filteredDashboards" 
              :key="dashboard.id"
              @click="openDashboard(dashboard.id)"
              class="group cursor-pointer flex flex-col gap-2"
            >
              <!-- Card Preview -->
              <div class="aspect-[3/2] bg-muted/30 border border-border rounded-lg overflow-hidden relative transition-all hover:border-primary hover:shadow-md">
                <!-- Cover Image -->
                <div 
                  v-if="dashboard.cover_image"
                  class="absolute inset-0 transition-all duration-500"
                  :style="getCoverImageStyle(dashboard.cover_image)"
                >
                  <!-- Overlay gradient for better text readability -->
                  <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                </div>
                
                <!-- Fallback gradient if no cover image -->
                <div 
                  v-else
                  class="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5"
                ></div>

                <!-- Role Badges -->
                <div class="absolute top-2 left-2 flex gap-1 z-10">
                  <span v-if="dashboard.access_role === 'owner'" class="bg-primary/90 text-primary-foreground px-2 py-0.5 rounded-lg text-[10px] font-medium shadow-sm backdrop-blur-sm">
                    Owner
                  </span>
                  <span v-else-if="dashboard.access_role === 'editor'" class="bg-blue-500/90 text-white px-2 py-0.5 rounded-lg text-[10px] font-medium shadow-sm backdrop-blur-sm">
                    Editor
                  </span>
                  <span v-else-if="dashboard.access_role === 'read' || dashboard.access_role === 'viewer'" class="bg-emerald-500/90 text-white px-2 py-0.5 rounded-lg text-[10px] font-medium shadow-sm backdrop-blur-sm">
                    Viewer
                  </span>
                  <span v-if="dashboard.is_public" class="bg-orange-500/90 text-white px-2 py-0.5 rounded-lg text-[10px] font-medium shadow-sm backdrop-blur-sm border border-border/20">
                    Public
                  </span>
                </div>
                
                <!-- Shared Indicator -->
                <div v-if="dashboard.is_shared" class="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                  <Users class="w-3 h-3" />
                  <span>Shared by {{ dashboard.owner?.first_name }}</span>
                </div>
                
                <!-- Actions Menu (Only show for owned dashboards or if permissions allow) -->
                <div v-else class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" @click.stop>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <button class="p-1.5 bg-background/80 backdrop-blur-sm rounded-md hover:bg-background shadow-sm border border-border/50 hover:border-primary transition-colors">
                        <MoreVertical class="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="handleRename(dashboard)">
                        <Pencil class="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="handleShare(dashboard)">
                        <Share2 class="w-4 h-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="handleDelete(dashboard)" class="text-destructive focus:text-destructive">
                        <Trash2 class="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <!-- Card Info -->
              <div class="px-1">
                <h3 class="font-medium truncate text-sm group-hover:text-primary transition-colors">{{ dashboard.title }}</h3>
                <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <LayoutDashboard class="w-3 h-3" />
                  <span>Opened {{ formatDate(dashboard.updated_at) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <Dialog v-model:open="showImportModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Dashboard</DialogTitle>
          <DialogDescription>
            Enter a shared dashboard link or token to import it.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4 py-4">
          <div class="space-y-2">
            <label for="import-link" class="text-sm font-medium">Dashboard Link or Token</label>
            <input
              id="import-link"
              v-model="importLink"
              placeholder="e.g. http://.../shared/dashboard/..."
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button 
            @click="showImportModal = false"
            class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
          >
            Cancel
          </button>
          <button 
            @click="handleLinkImport"
            :disabled="!importLink || isImporting"
            class="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
          >
            {{ isImporting ? 'Importing...' : 'Import' }}
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Share Modal -->
    <ShareDialog
      v-model:open="showShareModal"
      :dashboard-id="dashboardToShare?.id || null" 
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
          
          <!-- Cover Image Picker -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Cover Image</label>
            <div class="space-y-3">
              <!-- Stock Gradients -->
              <div class="grid grid-cols-6 gap-2">
                <button
                  v-for="stock in stockImages.slice(0, 12)"
                  :key="stock.id"
                  type="button"
                  @click="renameCoverImage = stock.id"
                  :class="[
                    'aspect-square rounded-md border-2 transition-all',
                    renameCoverImage === stock.id 
                      ? 'border-primary ring-2 ring-primary/20 scale-105' 
                      : 'border-transparent hover:border-primary/50'
                  ]"
                  :style="{ background: stock.gradient }"
                  :title="stock.name"
                ></button>
              </div>
              
              <!-- Custom Upload -->
              <input
                type="file"
                ref="renameCoverImageInput"
                @change="handleRenameCoverImageUpload"
                accept="image/*"
                class="hidden"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  @click="renameCoverImageInput?.click()"
                  class="flex-1 px-3 py-2 text-sm border border-dashed border-border hover:border-primary rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Upload class="w-4 h-4" />
                  Upload Custom Image
                </button>
                <button
                  v-if="renameCoverImage"
                  type="button"
                  @click="renameCoverImage = ''"
                  class="px-3 py-2 text-sm border border-border hover:border-destructive hover:text-destructive rounded-md transition-colors"
                >
                  Clear
                </button>
              </div>
              
              <!-- Preview -->
              <div 
                v-if="renameCoverImage"
                class="aspect-[3/2] rounded-md border border-border overflow-hidden"
                :style="getCoverImageStyle(renameCoverImage)"
              >
                <div class="h-full flex items-end p-4 bg-gradient-to-t from-black/60 to-transparent">
                  <p class="text-white font-medium">{{ renameTitle || 'Dashboard Preview' }}</p>
                </div>
              </div>
            </div>
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
            Are you sure you want to delete "{{ dashboardToDelete?.title }}"? This action cannot be undone.
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

    <!-- Create Dashboard Modal -->
    <Dialog v-model:open="showCreateModal">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Dashboard</DialogTitle>
          <DialogDescription>
            Set up your dashboard with a name, privacy settings, and optional collaborators.
          </DialogDescription>
        </DialogHeader>
        
        <div class="flex flex-col gap-4 py-4">
          <!-- Dashboard Name -->
          <div class="space-y-2">
            <label for="new-dashboard-name" class="text-sm font-medium">Dashboard Name</label>
            <input
              id="new-dashboard-name"
              v-model="newDashboardName"
              @keyup.enter="confirmCreateDashboard"
              placeholder="Enter dashboard name"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <!-- Privacy Settings -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Privacy</label>
            <div class="flex gap-2">
              <button
                @click="newDashboardIsPublic = false"
                :class="[
                  'flex-1 px-3 py-2 text-sm rounded-md border transition-all',
                  !newDashboardIsPublic 
                    ? 'bg-primary text-primary-foreground border-primary' 
                    : 'bg-background border-border hover:border-primary'
                ]"
              >
                <div class="flex items-center justify-center gap-2">
                  <Lock class="w-4 h-4" />
                  Private
                </div>
              </button>
              <button
                @click="newDashboardIsPublic = true"
                :class="[
                  'flex-1 px-3 py-2 text-sm rounded-md border transition-all',
                  newDashboardIsPublic 
                    ? 'bg-primary text-primary-foreground border-primary' 
                    : 'bg-background border-border hover:border-primary'
                ]"
              >
                <div class="flex items-center justify-center gap-2">
                  <Globe class="w-4 h-4" />
                  Public
                </div>
              </button>
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              {{ newDashboardIsPublic ? 'Anyone with the link can view this dashboard' : 'Only you and invited users can access' }}
            </p>
          </div>

          <!-- Invite Users (only for public dashboards) -->
          <div v-if="newDashboardIsPublic" class="space-y-2">
            <label class="text-sm font-medium">Invite Collaborators (Optional)</label>
            <div class="flex gap-2">
              <input
                v-model="inviteEmail"
                @keyup.enter="addInvite"
                placeholder="Enter email address"
                type="email"
                class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                @click="addInvite"
                :disabled="!inviteEmail.trim()"
                class="px-3 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md disabled:opacity-50"
              >
                Add
              </button>
            </div>
            
            <!-- Invited Users List -->
            <div v-if="invitedUsers.length > 0" class="mt-2 space-y-1">
              <div 
                v-for="(email, index) in invitedUsers" 
                :key="index"
                class="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-md text-sm"
              >
                <span>{{ email }}</span>
                <button
                  @click="removeInvite(index)"
                  class="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button 
            @click="showCreateModal = false"
            class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
          >
            Cancel
          </button>
          <button 
            @click="confirmCreateDashboard"
            :disabled="!newDashboardName.trim() || isCreating"
            class="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
          >
            {{ isCreating ? 'Creating...' : 'Create Dashboard' }}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import { 
  fetchSharedDashboards,
  fetchSharedDashboard 
} from '@/lib/api'
import { 
  LayoutDashboard, 
  Search, 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Share2,
  Download,
  Lock,
  Globe,
  X,
  Upload,
  Users
} from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import ShareDialog from '@/components/Dashboard/ShareDialog.vue'
import { toast } from 'vue-sonner'
import { stockImages, getStockImageGradient } from '@/lib/stock-images'

const router = useRouter()
const store = useDashboardStore()
const { dashboards, isLoading } = storeToRefs(store)

const searchQuery = ref('')
const sortBy = ref('updated')
const activeTab = ref('my') // 'my' | 'shared'
const sharedDashboards = ref<any[]>([])
const isLoadingShared = ref(false)

// Fetch shared dashboards when tab changes
watch(activeTab, async (val) => {
  if (val === 'shared' && sharedDashboards.value.length === 0) {
    isLoadingShared.value = true
    try {
      sharedDashboards.value = await fetchSharedDashboards()
    } catch (e) {
      console.error('Failed to load shared dashboards:', e)
      // Fallback to empty list, don't show toast to user
      sharedDashboards.value = []
    } finally {
      isLoadingShared.value = false
    }
  }
})

const filteredDashboards = computed(() => {
  // Select source based on active tab
  let source = activeTab.value === 'my' ? dashboards.value : sharedDashboards.value
  
  // Filter by search
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    source = source.filter(d => d.title?.toLowerCase().includes(q))
  }
  
  // Sort
  return [...source].sort((a, b) => {
    if (sortBy.value === 'name') {
      return (a.title || '').localeCompare(b.title || '')
    } else {
      // Sort by updated_at or shared_at depending on tab
      const dateA = activeTab.value === 'shared' ? (a.shared_at || a.updated_at) : a.updated_at
      const dateB = activeTab.value === 'shared' ? (b.shared_at || b.updated_at) : b.updated_at
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    }
  })
})

// Helper to get cover image style (gradient or URL)
const getCoverImageStyle = (coverImage: string) => {
  if (!coverImage) return {}
  
  // Check if it's a stock gradient ID
  if (coverImage.startsWith('gradient-')) {
    const gradient = getStockImageGradient(coverImage)
    return { background: gradient }
  }
  
  // Otherwise treat as custom image URL
  return {
    backgroundImage: `url(${coverImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
}

// Helper to safely format dates
const formatDate = (timestamp: any) => {
  if (!timestamp) return 'Never'
  
  try {
    // Handle Unix timestamp (number)
    if (typeof timestamp === 'number') {
      return new Date(timestamp * 1000).toLocaleDateString()
    }
    // Handle ISO string or other date formats
    if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleDateString()
    }
    // Fallback
    return new Date(timestamp).toLocaleDateString()
  } catch (e) {
    return 'Invalid date'
  }
}

// Import State
const showImportModal = ref(false)
const importLink = ref('')
const isImporting = ref(false)

// Share Modal State
const showShareModal = ref(false)
const shareUrl = ref('')
const copied = ref(false)
const dashboardToShare = ref<any>(null)

// Rename Modal State
const showRenameModal = ref(false)
const renameTitle = ref('')
const dashboardToRename = ref<any>(null)
const renameCoverImage = ref('')
const renameCoverImageInput = ref<HTMLInputElement | null>(null)

const handleRenameCoverImageUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  try {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(`${import.meta.env.VITE_QUERY_API_URL}/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    })
    
    if (!response.ok) throw new Error('Upload failed')
    
    const data = await response.json()
    renameCoverImage.value = data.url
    toast.success('Image uploaded successfully')
  } catch (error) {
    toast.error('Failed to upload image')
  }
}

// Delete Modal State
const showDeleteModal = ref(false)
const dashboardToDelete = ref<any>(null)

// Create Dashboard Modal State
const showCreateModal = ref(false)
const newDashboardName = ref('')
const newDashboardIsPublic = ref(false)
const inviteEmail = ref('')
const invitedUsers = ref<string[]>([])
const isCreating = ref(false)

const handleCreateDashboard = () => {
  // Open the create modal instead of directly creating
  newDashboardName.value = ''
  newDashboardIsPublic.value = false
  invitedUsers.value = []
  inviteEmail.value = ''
  showCreateModal.value = true
}

const addInvite = () => {
  const email = inviteEmail.value.trim()
  if (email && !invitedUsers.value.includes(email)) {
    invitedUsers.value.push(email)
    inviteEmail.value = ''
  }
}

const removeInvite = (index: number) => {
  invitedUsers.value.splice(index, 1)
}

const confirmCreateDashboard = async () => {
  if (!newDashboardName.value.trim()) return
  
  isCreating.value = true
  try {
    const id = await store.createNewDashboard(newDashboardName.value.trim())
    
    // Update dashboard privacy settings
    if (newDashboardIsPublic.value) {
      await store.selectDashboard(id)
      if (store.currentDashboard) {
        store.currentDashboard.is_public = true
        await store.saveCurrentDashboard()
      }
    }
    
    // TODO: Handle invited users - send invitations via backend
    if (invitedUsers.value.length > 0) {
      console.log('Invited users:', invitedUsers.value)
      // This would require a backend endpoint to send invitation emails
    }
    
    toast.success('Dashboard created successfully')
    showCreateModal.value = false
    router.push(`/dashboard/${id}`)
  } catch (e) {
    toast.error('Failed to create dashboard')
  } finally {
    isCreating.value = false
  }
}

const openDashboard = (id: string) => {
  router.push(`/dashboard/${id}`)
}

const handleRename = (dashboard: any) => {
  dashboardToRename.value = dashboard
  renameTitle.value = dashboard.title
  renameCoverImage.value = dashboard.cover_image || ''
  showRenameModal.value = true
}

const confirmRename = async () => {
  if (!renameTitle.value.trim() || !dashboardToRename.value) return
  
  try {
    await store.selectDashboard(dashboardToRename.value.id)
    
    store.currentDashboard!.title = renameTitle.value.trim()
    
    // Update cover image if changed
    if (renameCoverImage.value !== dashboardToRename.value.cover_image) {
      ;(store.currentDashboard as any).cover_image = renameCoverImage.value
    }
    
    await store.saveCurrentDashboard()
    
    toast.success('Dashboard updated successfully')
    showRenameModal.value = false
    renameCoverImage.value = ''
  } catch (e) {
    console.error('[DashboardHome] Failed to update dashboard:', e)
    toast.error('Failed to update dashboard')
  }
}

const handleDelete = (dashboard: any) => {
  dashboardToDelete.value = dashboard
  showDeleteModal.value = true
}

const confirmDelete = async () => {
  if (!dashboardToDelete.value) return
  
  try {
    await store.removeDashboard(dashboardToDelete.value.id)
    toast.success('Dashboard deleted successfully')
    showDeleteModal.value = false
  } catch (e) {
    toast.error('Failed to delete dashboard')
  }
}

const handleShare = async (dashboard: any) => {
  dashboardToShare.value = dashboard
  try {
    const token = await store.generateShareLink(dashboard.id)
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

const handleLinkImport = async () => {
  if (!importLink.value) return
  
  isImporting.value = true
  try {
    // Extract token from URL or use as is
    let token = importLink.value.trim()
    if (token.includes('/shared/dashboard/')) {
      const parts = token.split('/shared/dashboard/')
      if (parts.length > 1) {
        token = parts[1]!
      }
    }
    
    // Fetch shared dashboard data
    const sharedDashboard = await fetchSharedDashboard(token)
    
    // Import into store
    const id = await store.importDashboard(sharedDashboard)
    
    toast.success('Dashboard imported successfully')
    showImportModal.value = false
    importLink.value = ''
    router.push(`/dashboard/${id}`)
  } catch (e) {
    console.error(e)
    toast.error('Failed to import dashboard', {
      description: 'Invalid link or dashboard not found'
    })
  } finally {
    isImporting.value = false
  }
}

onMounted(async () => {
  await store.loadDashboards()
})
</script>
