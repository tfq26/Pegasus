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
          class="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition"
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

      <!-- Recent Dashboards -->
      <div class="py-8 px-6">
        <div class="max-w-6xl mx-auto">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-base font-medium">Recent dashboards</h2>
            <div class="flex items-center gap-2">
              <select v-model="sortBy" class="bg-transparent text-sm font-medium text-muted-foreground border-none outline-none cursor-pointer hover:text-foreground">
                <option value="updated">Last modified</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>

          <div v-if="isLoading" class="flex items-center justify-center py-12">
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
                <!-- Mock Preview Content -->
                <div class="absolute inset-4 opacity-50 grayscale group-hover:grayscale-0 transition-all duration-500">
                  <div class="w-full h-full grid grid-cols-2 gap-2">
                    <div class="bg-background rounded shadow-sm"></div>
                    <div class="bg-background rounded shadow-sm col-span-1 row-span-2"></div>
                    <div class="bg-background rounded shadow-sm"></div>
                  </div>
                </div>
                
                <!-- Overlay Actions -->
                <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <button class="p-1.5 bg-background/80 backdrop-blur-sm rounded-md hover:bg-background shadow-sm border border-border/50">
                        <MoreVertical class="w-4 h-4 text-muted-foreground" />
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem @select="handleRename(dashboard)">
                        <Pencil class="w-4 h-4 mr-2" />
                        Rename
                      </ContextMenuItem>
                      <ContextMenuItem @select="handleShare(dashboard)">
                        <Share2 class="w-4 h-4 mr-2" />
                        Share
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem @select="handleDelete(dashboard)" class="text-destructive">
                        <Trash2 class="w-4 h-4 mr-2" />
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              </div>

              <!-- Card Info -->
              <div class="px-1">
                <h3 class="font-medium truncate text-sm group-hover:text-primary transition-colors">{{ dashboard.title }}</h3>
                <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <LayoutDashboard class="w-3 h-3" />
                  <span>Opened {{ new Date(dashboard.updated_at * 1000).toLocaleDateString() }}</span>
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
    <Dialog v-model:open="showShareModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Dashboard</DialogTitle>
          <DialogDescription>
            Anyone with this link will be able to view this dashboard.
          </DialogDescription>
        </DialogHeader>
        <div class="flex items-center space-x-2">
          <div class="grid flex-1 gap-2">
            <label for="link" class="sr-only">Link</label>
            <input
              id="link"
              :value="shareUrl"
              readonly
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <button 
            @click="copyShareLink"
            class="px-3 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md"
          >
            <span v-if="copied" class="text-green-500">Copied!</span>
            <span v-else>Copy</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import { fetchSharedDashboard } from '@/lib/api'
import { 
  LayoutDashboard, 
  Search, 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Share2,
  Download
} from 'lucide-vue-next'
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
} from '@/components/ui/dialog'
import { toast } from 'vue-sonner'

const router = useRouter()
const store = useDashboardStore()
const { dashboards, isLoading } = storeToRefs(store)

const searchQuery = ref('')
const sortBy = ref('updated')

// Import State
const showImportModal = ref(false)
const importLink = ref('')
const isImporting = ref(false)

// Share Modal State
const showShareModal = ref(false)
const shareUrl = ref('')
const copied = ref(false)

// Rename Modal State
const showRenameModal = ref(false)
const renameTitle = ref('')
const dashboardToRename = ref<any>(null)

// Delete Modal State
const showDeleteModal = ref(false)
const dashboardToDelete = ref<any>(null)

const filteredDashboards = computed(() => {
  let result = [...dashboards.value]
  
  // Filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(d => d.title.toLowerCase().includes(query))
  }
  
  // Sort
  result.sort((a, b) => {
    if (sortBy.value === 'name') {
      return a.title.localeCompare(b.title)
    }
    return b.updated_at - a.updated_at
  })
  
  return result
})

const handleCreateDashboard = async () => {
  try {
    const id = await store.createNewDashboard('Untitled Dashboard')
    router.push(`/dashboard/${id}`)
  } catch (e) {
    toast.error('Failed to create dashboard')
  }
}

const openDashboard = (id: string) => {
  router.push(`/dashboard/${id}`)
}

const handleRename = (dashboard: any) => {
  dashboardToRename.value = dashboard
  renameTitle.value = dashboard.title
  showRenameModal.value = true
}

const confirmRename = async () => {
  if (!renameTitle.value.trim() || !dashboardToRename.value) return
  
  try {
    await store.selectDashboard(dashboardToRename.value.id)
    store.currentDashboard!.title = renameTitle.value.trim()
    await store.saveCurrentDashboard()
    toast.success('Dashboard renamed successfully')
    showRenameModal.value = false
  } catch (e) {
    toast.error('Failed to rename dashboard')
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
