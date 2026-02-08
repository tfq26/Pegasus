<template>
  <div class="w-full h-full flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Loading State -->
    <LoadingScreen 
      v-if="isInitializing" 
      title="Synchronizing Dashboards"
      message="Connecting to your secure visualization node..."
    />

    <template v-else>
      <!-- Top Bar (Simplified) -->
    <header class="flex items-center justify-between px-6 py-3 bg-background z-10 transition-colors duration-300" :class="{ 'pt-6 bg-transparent': isTauri }">
      <!-- Removed Title and Search from here -->
      <div v-if="!isTauri" class="h-6"></div>
    </header>

    <div class="flex-1 overflow-auto">
      <!-- Start New Section -->
      <div class="bg-muted/30 py-8 px-6 border-b border-border">
        <div class="max-w-7xl mx-auto">
          <div class="flex gap-6 overflow-x-auto pb-4 no-scrollbar">
            <!-- Blank Dashboard -->
            <button 
              @click="handleCreateDashboard"
              class="group flex flex-col gap-2 text-left shrink-0"
            >
              <div class="w-72 h-44 bg-background border border-border rounded-lg flex flex-col items-center justify-center hover:border-primary hover:ring-1 hover:ring-primary transition-all shadow-sm group-hover:shadow-md relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Plus class="w-10 h-10 text-primary/50 group-hover:text-primary group-hover:scale-110 transition-all duration-300" />
              </div>
              <span class="text-sm font-semibold pl-1">Blank Dashboard</span>
            </button>

            <!-- Templates -->
            <button 
              v-for="template in DASHBOARD_TEMPLATES"
              :key="template.id"
              @click="createFromTemplate(template)"
              class="group flex flex-col gap-2 text-left shrink-0"
            >
              <div 
                class="w-72 h-44 rounded-lg border border-border overflow-hidden relative transition-all group-hover:border-primary group-hover:shadow-md"
                :style="getCoverImageStyle(template.coverImage)"
              >
                <!-- Overlay gradient -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                
                <!-- Tag -->
                <div class="absolute top-3 left-3 bg-white/10 backdrop-blur-md border border-white/20 text-[9px] text-white px-2 py-1 rounded-md font-black uppercase tracking-widest shadow-lg">
                  {{ template.workflow }}
                </div>

                <!-- Hover Icon -->
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div class="bg-white/20 backdrop-blur-md rounded-full p-3 border border-white/30 shadow-2xl">
                    <Plus class="w-8 h-8 text-white" />
                  </div>
                </div>
              </div>
              <div class="px-1 mt-1">
                <span class="block text-base font-bold truncate">{{ template.name }}</span>
                <span class="block text-xs font-medium text-muted-foreground">{{ template.colorTheme }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="py-8 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-6">
            
            <div class="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
              <!-- Tabs -->
              <div class="flex items-center gap-1 bg-muted/50 p-1 rounded-lg w-full sm:w-auto">
                <button 
                  @click="activeTab = 'recent'"
                  :class="[
                    'flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                    activeTab === 'recent' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  ]"
                >
                  Recents
                </button>
                <button 
                  @click="activeTab = 'my'"
                  :class="[
                    'flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all',
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
                    'flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all',
                    activeTab === 'shared' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  ]"
                >
                  Shared
                </button>
              </div>

              <!-- Search -->
              <div class="relative w-full sm:w-[480px]">
                <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  v-model="searchQuery"
                  placeholder="Search dashboards..." 
                  class="w-full pl-11 pr-4 py-2.5 text-sm bg-muted/30 border border-border/50 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/50 shadow-inner"
                />
              </div>
            </div>

            <div class="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
              <!-- Sort -->
              <div class="flex items-center gap-2">
                <select v-model="sortBy" class="bg-transparent text-xs font-bold uppercase tracking-wider text-muted-foreground border-none outline-none cursor-pointer hover:text-foreground transition-colors">
                  <option value="updated">Last modified</option>
                  <option value="name">Name</option>
                </select>
              </div>

              <div class="h-4 w-px bg-border/50 hidden lg:block"></div>

              <!-- Action Buttons -->
              <div class="flex items-center gap-2">
                <button 
                  @click="showImportModal = true"
                  class="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent hover:border-border/50 rounded-lg transition-all"
                  title="Import Dashboard"
                >
                  <Download class="w-4 h-4" />
                  <span>Import</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Bulk Delete Bar -->
          <transition 
            enter-active-class="transition duration-300 ease-out"
            enter-from-class="transform -translate-y-4 opacity-0"
            enter-to-class="transform translate-y-0 opacity-100"
            leave-active-class="transition duration-200 ease-in"
            leave-from-class="transform translate-y-0 opacity-100"
            leave-to-class="transform -translate-y-4 opacity-0"
          >
            <div v-if="isBulkDeleteMode" class="mb-6 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center justify-between shadow-sm">
              <div class="flex items-center gap-3">
                <div class="bg-destructive/20 p-2 rounded-lg">
                  <Trash class="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 class="text-sm font-bold text-destructive">Delete Mode</h3>
                  <p class="text-xs text-destructive/70">{{ selectedDashboardIds.length }} dashboards selected for deletion</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <button 
                  @click="exitDeleteMode"
                  class="px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
                >
                  Cancel
                </button>
                <button 
                  @click="confirmBulkDelete"
                  :disabled="selectedDashboardIds.length === 0"
                  class="px-5 py-1.5 bg-destructive text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-lg shadow-destructive/20 hover:bg-destructive/90 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  Delete Selected ({{ selectedDashboardIds.length }})
                </button>
              </div>
            </div>
          </transition>

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
              @click="isBulkDeleteMode ? toggleSelection(dashboard.id, $event) : openDashboard(dashboard.id)"
              class="group cursor-pointer flex flex-col gap-2 relative"
            >
              <!-- Card Preview -->
              <div 
                class="aspect-[3/2] bg-muted/30 border rounded-lg overflow-hidden relative transition-all group-hover:shadow-md"
                :class="[
                  isBulkDeleteMode && selectedDashboardIds.includes(dashboard.id) 
                    ? 'border-destructive ring-2 ring-destructive/20' 
                    : 'border-border group-hover:border-primary'
                ]"
              >
                <!-- Selection Overlay (Bulk Delete Mode) -->
                <div 
                  v-if="isBulkDeleteMode"
                  class="absolute inset-0 z-20 flex items-start justify-end p-2 transition-all"
                  :class="selectedDashboardIds.includes(dashboard.id) ? 'bg-destructive/5' : 'bg-transparent hover:bg-black/5'"
                >
                  <Checkbox 
                    :checked="selectedDashboardIds.includes(dashboard.id)" 
                    class="h-5 w-5 rounded border-white/40 bg-white/10 backdrop-blur-md data-[state=checked]:bg-destructive data-[state=checked]:border-destructive focus-visible:ring-0 focus-visible:ring-offset-0 transition-all pointer-events-none shadow-none"
                  />
                </div>
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
                  <span v-if="dashboard.unread_count > 0" class="bg-red-500 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-sm backdrop-blur-sm flex items-center gap-1 animate-pulse">
                     <Bell class="w-3 h-3" />
                     {{ dashboard.unread_count }} New
                  </span>
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
                      <DropdownMenuItem v-if="isTauri" @click="handleOpenWindow(dashboard)">
                        <ExternalLink class="w-4 h-4 mr-2" />
                        Open in New Window
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="handleRename(dashboard)">
                        <Pencil class="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="handleShare(dashboard)">
                        <Share2 class="w-4 h-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="isBulkDeleteMode = true; toggleSelection(dashboard.id)">
                        <Trash class="w-4 h-4 mr-2" />
                        Delete Items
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="handleDelete(dashboard)" class="text-destructive focus:text-destructive">
                        <Trash2 class="w-4 h-4 mr-2" />
                        Delete Dashboard
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
                  <span v-if="activeTab === 'recent'">Accessed {{ formatDate(dashboard.accessed_at) }}</span>
                  <span v-else-if="activeTab === 'shared'">Shared {{ formatDate(dashboard.shared_at) }}</span>
                  <span v-else>Modified {{ formatDate(dashboard.updated_at) }}</span>
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
    <ShareResourceDialog
      v-model:open="showShareModal"
      :resource-id="dashboardToShare?.id || null" 
      resource-type="dashboard"
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
              :class="{ 'border-destructive focus-visible:ring-destructive': isRenameDuplicate }"
            />
            <p v-if="isRenameDuplicate" class="text-[11px] text-destructive font-medium mt-1">
                A dashboard with this name already exists.
            </p>
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
            :disabled="!renameTitle.trim() || isRenameDuplicate"
            class="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
          >
            Rename
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      v-model:open="confirmDialogState.open"
      :title="confirmDialogState.title"
      :description="confirmDialogState.description"
      :confirm-text="confirmDialogState.confirmText"
      is-destructive
      @confirm="onConfirmDelete"
    />

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
              :class="{ 'border-destructive focus-visible:ring-destructive': isNewNameDuplicate }"
            />
            <p v-if="isNewNameDuplicate" class="text-[11px] text-destructive font-medium mt-1">
                A dashboard with this name already exists.
            </p>
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
            :disabled="!newDashboardName.trim() || isCreating || isNewNameDuplicate"
            class="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
          >
            {{ isCreating ? 'Creating...' : 'Create Dashboard' }}
          </button>
        </div>
      </DialogContent>
    </Dialog>
    
    <!-- Upgrade Modal -->
    <UpgradeModal
      v-model:open="showUpgradeModal"
      limit-type="dashboards"
      :current-usage="dashboardUsage?.current"
      :limit="dashboardUsage?.limit"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount, unref } from 'vue'
import LoadingScreen from '@/components/ui/LoadingScreen.vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notification'
import { Checkbox } from '@/components/ui/checkbox'
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
  Users,
  ExternalLink,
  Bell,
  Trash
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
import ShareResourceDialog from '@/components/shared/ShareResourceDialog.vue'
import UpgradeModal from '@/components/UpgradeModal.vue'
import ConfirmDialog from '@/components/Common/ConfirmDialog.vue'
import { toast } from '@/composables/useNotifications'
import { useEntitlements } from '@/composables/useEntitlements'
import { useAuth } from '@/composables/useAuth'
import { usePlatform } from '@/composables/usePlatform'
import { stockImages, getStockImageGradient } from '@/lib/stock-images'

import { DASHBOARD_TEMPLATES, type DashboardTemplate } from '@/lib/dashboard-templates'

const { isTauri } = usePlatform()
const { user } = useAuth()
const router = useRouter()
const store = useDashboardStore()
const notificationStore = useNotificationStore()
const { dashboards, recentDashboards, isLoading } = storeToRefs(store)
const { dashboardUsage, handleLimitError } = useEntitlements()

const searchQuery = ref('')
const sortBy = ref('updated')
const activeTab = ref('recent') // 'recent' | 'my' | 'shared'
const sharedDashboards = ref<any[]>([])
const isLoadingShared = ref(false)
const isLoadingRecent = ref(false)
const isInitializing = ref(true)

// Bulk Delete State
const isBulkDeleteMode = ref(false)
const selectedDashboardIds = ref<string[]>([])
const lastSelectedId = ref<string | null>(null)

// Fetch data when tab changes
watch(activeTab, async (val) => {
  if (val === 'shared' && sharedDashboards.value.length === 0) {
    isLoadingShared.value = true
    try {
      sharedDashboards.value = await fetchSharedDashboards()
    } catch (e) {
      console.error('Failed to load shared dashboards:', e)
      sharedDashboards.value = []
    } finally {
      isLoadingShared.value = false
    }
  } else if (val === 'recent') {
    isLoadingRecent.value = true
    try {
      await store.loadRecentDashboards()
    } catch (e) {
      console.error('Failed to load recent dashboards:', e)
    } finally {
      isLoadingRecent.value = false
    }
  }
})

// Real-time Notifications and Socket Connection
import { useCollaboration } from '@/composables/useCollaboration'
const { connect, socket } = useCollaboration()

// Lifecycle logic moved to consolidated onMounted at bottom

onBeforeUnmount(() => {
  if (socket.value) {
    socket.value.off('notification_new')
    socket.value.off('user_mentioned')
  }
})

const filteredDashboards = computed(() => {
  // Select source based on active tab
  const source = activeTab.value === 'recent' 
    ? [...(recentDashboards.value as any || [])] 
    : activeTab.value === 'my' 
      ? [...(dashboards.value as any || [])]
      : [...(sharedDashboards.value || [])]
  
  let result = source
  
  // Filter by search
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter((d: any) => d.title?.toLowerCase().includes(q))
  }
  
  // Sort (only if not in 'recent' tab which has its own intrinsic sort)
  if (activeTab.value === 'recent' && sortBy.value === 'updated') {
    return result // Backend already sorts by accessed_at
  }

  return result.sort((a, b) => {
    if (sortBy.value === 'name') {
      return (a.title || '').localeCompare(b.title || '')
    } else {
      // Sort by updated_at or shared_at depending on tab
      const dateA = activeTab.value === 'shared' ? (a.shared_at || a.updated_at) : (a.accessed_at || a.updated_at)
      const dateB = activeTab.value === 'shared' ? (b.shared_at || b.updated_at) : (b.accessed_at || b.updated_at)
      return new Date(dateB as any).getTime() - new Date(dateA as any).getTime()
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

  // Check if it's a raw CSS gradient
  if (coverImage.includes('gradient(')) {
    return { background: coverImage }
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

// Duplicate checks for creators/renamers
const isNewNameDuplicate = computed(() => {
    const val = newDashboardName.value.trim()
    if (!val) return false
    
    // Use unref and cast to any to avoid Ref<Ref<...>> type confusion in some environments
    const myDashboards = (unref(dashboards) as any) || []
    const shared = (unref(sharedDashboards) as any) || []
    const recent = (unref(recentDashboards) as any) || []

    const all = [
        ...(Array.isArray(myDashboards) ? myDashboards : []),
        ...(Array.isArray(shared) ? shared : []),
        ...(Array.isArray(recent) ? recent : [])
    ]
    
    return all.some((d: any) => 
        d.title?.toLowerCase() === val.toLowerCase()
    )
})

const isRenameDuplicate = computed(() => {
    const val = renameTitle.value.trim()
    if (!val || !dashboardToRename.value) return false
    
    const myDashboards = (unref(dashboards) as any) || []
    const shared = (unref(sharedDashboards) as any) || []
    const recent = (unref(recentDashboards) as any) || []

    const all = [
        ...(Array.isArray(myDashboards) ? myDashboards : []),
        ...(Array.isArray(shared) ? shared : []),
        ...(Array.isArray(recent) ? recent : [])
    ]
    
    return all.some((d: any) => 
        d.id !== dashboardToRename.value.id && 
        d.title?.toLowerCase() === val.toLowerCase()
    )
})

// Confirm Dialog State
const confirmDialogState = ref({
  open: false,
  title: '',
  description: '',
  confirmText: '',
  onConfirm: () => {}
})

// Delete Modal State
const dashboardToDelete = ref<any>(null)

// Create Dashboard Modal State
const showCreateModal = ref(false)
const newDashboardName = ref('')
const newDashboardIsPublic = ref(false)
const inviteEmail = ref('')
const invitedUsers = ref<string[]>([])
const isCreating = ref(false)
const showUpgradeModal = ref(false)
const pendingTemplate = ref<DashboardTemplate | null>(null)

const createFromTemplate = (template: DashboardTemplate) => {
  pendingTemplate.value = template
  newDashboardName.value = template.name
  newDashboardIsPublic.value = false
  invitedUsers.value = []
  inviteEmail.value = ''
  showCreateModal.value = true
}

const handleCreateDashboard = () => {
  // Open the create modal instead of directly creating
  pendingTemplate.value = null
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
    const name = newDashboardName.value.trim()
    const id = await store.createNewDashboard(name)
    
    // Select it and update its properties
    await store.selectDashboard(id)
    
    if (store.currentDashboard) {
      const dashboard = store.currentDashboard as any
      
      // Update privacy
      if (newDashboardIsPublic.value) {
        dashboard.is_public = true
      }
      
      // Apply template data if needed
      if (pendingTemplate.value) {
        dashboard.data = JSON.parse(JSON.stringify(pendingTemplate.value.initialData))
      }
      
      await store.saveCurrentDashboard()
    }
    
    // TODO: Handle invited users - send invitations via backend
    if (invitedUsers.value.length > 0) {
      console.log('Invited users:', invitedUsers.value)
      // This would require a backend endpoint to send invitation emails
    }
    
    toast.success(pendingTemplate.value ? `${pendingTemplate.value.name} created successfully` : 'Dashboard created successfully')
    showCreateModal.value = false
    pendingTemplate.value = null
    router.push(`/dashboard/${id}`)
  } catch (e: any) {
    // Check if this is a tier limit error
    const limitError = handleLimitError(e)
    if (limitError) {
      // Show upgrade modal instead of error toast
      showUpgradeModal.value = true
      showCreateModal.value = false
    } else {
      toast.error(e.message || 'Failed to create dashboard')
    }
  } finally {
    isCreating.value = false
  }
}

const openDashboard = (id: string) => {
  router.push(`/dashboard/${id}`)
}

const handleOpenWindow = async (dashboard: any) => {
    try {
        // Dynamically import WebviewWindow to avoid issues on web
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
        const label = `dashboard-${dashboard.id}`
        // Check if window exists (optional, but Tauri handles duplicate labels by throwing or focusing)
        // Just try creation, catch error if label exists
        const webview = new WebviewWindow(label, {
            url: `/dashboard/${dashboard.id}`,
            title: dashboard.title || 'Pegasus Dashboard',
            width: 1200,
            height: 800,
            decorations: true,
            focus: true,
            center: true
        })
        
        webview.once('tauri://error', function (e) {
             // If error is related to existing label, we might want to focus it, but WebviewWindow constructor usually throws.
             // Actually currently constructor just creates handle.
             console.error('Window creation error', e)
        })
    } catch (e) {
        console.error('Failed to open new window', e)
        toast.error('Feature not available', { description: 'Cannot open new window in this environment' })
    }
}

const handleRename = (dashboard: any) => {
  dashboardToRename.value = dashboard
  renameTitle.value = dashboard.title
  renameCoverImage.value = dashboard.cover_image || ''
  showRenameModal.value = true
}

const confirmRename = async () => {
    try {
        const newTitle = renameTitle.value.trim()
        
        // Validation: Check for duplicate names (excluding current dashboard)
        const allDashboards = unref(dashboards)
        const isDuplicate = Array.isArray(allDashboards) && (allDashboards as any[]).some((d: any) => 
            d.id !== dashboardToRename.value.id && 
            d.title.toLowerCase() === newTitle.toLowerCase()
        )
        
        if (isDuplicate) {
            toast.error(`A dashboard with the name "${newTitle}" already exists.`)
            return
        }

        await store.selectDashboard(dashboardToRename.value.id)
        
        if (store.currentDashboard) {
            (store.currentDashboard as any).title = newTitle
            
            // Update cover image if changed
            if (renameCoverImage.value !== (dashboardToRename.value as any).cover_image) {
                (store.currentDashboard as any).cover_image = renameCoverImage.value
            }
            
            await store.saveCurrentDashboard()
            
            toast.success('Dashboard updated successfully')
            showRenameModal.value = false
            renameCoverImage.value = ''
        }
    } catch (e: any) {
        console.error('[DashboardHome] Failed to update dashboard:', e)
        toast.error(e.message || 'Failed to update dashboard')
    }
}

const handleDelete = (dashboard: any) => {
  dashboardToDelete.value = dashboard
  confirmDialogState.value = {
    open: true,
    title: 'Delete Dashboard',
    description: `Are you sure you want to delete "${dashboard.title}"? This action cannot be undone.`,
    confirmText: 'Delete Dashboard',
    onConfirm: async () => {
      try {
        await store.removeDashboard(dashboard.id)
        sharedDashboards.value = sharedDashboards.value.filter(d => d.id !== dashboard.id)
        toast.success('Dashboard deleted successfully')
      } catch (e) {
        toast.error('Failed to delete dashboard')
      }
    }
  }
}

const onConfirmDelete = async () => {
  await confirmDialogState.value.onConfirm()
  confirmDialogState.value.open = false
}

// Bulk Delete Handlers
const toggleSelection = (id: string, event?: MouseEvent) => {
  if (event?.shiftKey && lastSelectedId.value) {
    const list = filteredDashboards.value
    const startIdx = list.findIndex(d => d.id === lastSelectedId.value)
    const endIdx = list.findIndex(d => d.id === id)
    
    if (startIdx !== -1 && endIdx !== -1) {
      const min = Math.min(startIdx, endIdx)
      const max = Math.max(startIdx, endIdx)
      const rangeIds = list.slice(min, max + 1).map(d => d.id)
      
      // If the current item is being selected, select the range.
      // If it's being deselected, we don't usually unselect a range in standard UI, but let's toggle.
      const isSelecting = !selectedDashboardIds.value.includes(id)
      
      if (isSelecting) {
        rangeIds.forEach(rid => {
          if (!selectedDashboardIds.value.includes(rid)) {
            selectedDashboardIds.value.push(rid)
          }
        })
      } else {
        rangeIds.forEach(rid => {
          const idx = selectedDashboardIds.value.indexOf(rid)
          if (idx !== -1) selectedDashboardIds.value.splice(idx, 1)
        })
      }
    }
  } else {
    const index = selectedDashboardIds.value.indexOf(id)
    if (index === -1) {
      selectedDashboardIds.value.push(id)
    } else {
      selectedDashboardIds.value.splice(index, 1)
    }
  }
  lastSelectedId.value = id
}

const exitDeleteMode = () => {
  isBulkDeleteMode.value = false
  selectedDashboardIds.value = []
}

const confirmBulkDelete = async () => {
  if (selectedDashboardIds.value.length === 0) return
  
  if (typeof store.removeDashboards !== 'function') {
    toast.error('Internal Error: removeDashboards is missing on store')
    return
  }

  confirmDialogState.value = {
    open: true,
    title: 'Delete Dashboards',
    description: `Are you sure you want to delete ${selectedDashboardIds.value.length} dashboards? This action cannot be undone.`,
    confirmText: `Delete ${selectedDashboardIds.value.length} items`,
    onConfirm: async () => {
      try {
        const res = await store.removeDashboards(selectedDashboardIds.value)
        
        const count = res.success?.length || 0
        if (count > 0) {
          toast.success(`Deleted ${count} dashboards successfully`)
        }
        
        if (res.failed?.length > 0) {
          toast.error(`Failed to delete ${res.failed.length} dashboards`)
        }
        
        exitDeleteMode()
      } catch (e: any) {
        toast.error('Bulk delete failed', { description: e.message })
      }
    }
  }
}

// Keyboard listener for Delete key
const handleKeyDown = (e: KeyboardEvent) => {
  if (isBulkDeleteMode.value && (e.key === 'Delete' || e.key === 'Backspace')) {
    // Only trigger if not typing in an input
    if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      confirmBulkDelete()
    }
  } else if (isBulkDeleteMode.value && e.key === 'Escape') {
    exitDeleteMode()
  }
}

// Consolidated to bottom

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

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
  // 1. App initialization
  isInitializing.value = true
  try {
      const { fetchEntitlements } = useEntitlements()
      await Promise.all([
        store.loadDashboards(),
        store.loadRecentDashboards(),
        fetchEntitlements(true).catch(() => {})
      ])
  } catch (err) {
      console.error('[DashboardHome] Initialization error:', err)
  } finally {
      isInitializing.value = false
  }

  // 2. Event listeners
  window.addEventListener('keydown', handleKeyDown)

  // 3. Socket / Collaboration
  connect()
  if (socket.value) {
    socket.value.on('notification_new', (data: any) => {
      if (data.type === 'mention') {
        const id = data.dashboardId.includes(':') ? data.dashboardId.split(':').pop() : data.dashboardId
        const updateList = (list: any[]) => {
          const idx = list.findIndex(d => d.id === id)
          if (idx !== -1) {
            list[idx].unread_count = (list[idx].unread_count || 0) + 1
          }
        }
        updateList(store.dashboards as any)
        updateList(store.recentDashboards as any)
        updateList(sharedDashboards.value as any)
      }
    })
    socket.value.on('user_mentioned', (data) => {
      notificationStore.addNotification({
        type: 'mention',
        dashboardId: data.dashboardId,
        dashboardTitle: data.dashboardTitle,
        senderName: data.senderName,
        preview: data.preview,
        timestamp: data.timestamp
      })
      toast.info(`New mention in "${data.dashboardTitle || 'Dashboard'}": ${data.senderName} says: "${data.preview}"`)
    })
  }
})

</script>

<style scoped>
@keyframes spin-slow {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}
.animate-spin-slow {
  animation: spin-slow 3s linear infinite;
}
</style>
