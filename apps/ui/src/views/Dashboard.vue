<template>
  <div class="w-full h-full flex flex-col text-foreground overflow-hidden">
    <!-- Premium Loading State -->
    <LoadingScreen 
      v-if="isInitializing" 
      title="Decompressing Dashboard"
      message="Reconstructing visualizations and live data streams..."
    />

    <template v-else>
      <!-- Header -->
    <header 
      class="border-b border-border bg-card/80 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-10 transition-all duration-300"
      :class="{ 'mr-[350px]': showChat && !isChatDetached }"
    >
      <div class="flex items-center gap-3">
        <button 
          @click="router.push('/dashboard')"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
          title="Back to Dashboards"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span v-if="isShared" class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-medium border border-amber-500/20">
          Read Only Preview
        </span>
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
          {{ (userRole || 'viewer').charAt(0).toUpperCase() + (userRole || 'viewer').slice(1) }}
        </div>
      </div>
      
      <!-- Actions Menu - Right Side -->
      <div class="flex items-center gap-2" v-if="!isShared">
        <!-- Undo/Redo Buttons -->
        <div v-if="currentDashboard && showFullToolbar" class="flex items-center gap-1 mr-1">
          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  @click="store.undo()"
                  :disabled="undoStack.length < 2"
                  class="p-2 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center justify-center shrink-0 disabled:opacity-30"
                >
                  <Undo class="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo (Opt+Shift+Z)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  @click="store.redo()"
                  :disabled="redoStack.length === 0"
                  class="p-2 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center justify-center shrink-0 disabled:opacity-30"
                >
                  <Redo class="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Redo (Opt+Shift+Y)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <!-- Add Element Button -->
        <TooltipProvider :delay-duration="0">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                v-if="currentDashboard && showFullToolbar"
                @click="showAddElementDialog = true"
                class="p-2 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center justify-center shrink-0"
              >
                <Plus class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Add Element</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div v-if="showFullToolbar" class="flex items-center gap-2">
          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  ref="chatToggleRef"
                  @click="showChat = !showChat"
                  class="relative p-2 text-sm font-medium border border-border hover:bg-muted rounded-md transition flex items-center justify-center shrink-0"
                  :class="{ 'bg-muted text-foreground': showChat }"
                >
                  <MessageSquare class="w-4 h-4" />
                  <span v-if="hasUnreadMessages" class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-background"></span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Dashboard Assistant
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  v-if="currentDashboard && activeLayout.length > 0"
                  @click="generateDashboardSummary"
                  :disabled="isAnalyzing"
                  class="p-2 text-sm font-medium border border-border hover:bg-muted rounded-md transition inline-flex items-center justify-center shrink-0 text-primary"
                >
                  <BrainCircuit v-if="!isAnalyzing" class="w-4 h-4" />
                  <Loader2 v-else class="w-4 h-4 animate-spin" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Generate AI Insights</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        <CollaboratorAvatars :collaborators="collaborators" class="mr-2 hidden sm:flex" />
        
        <TooltipProvider :delay-duration="0">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                v-if="currentDashboard && showFullToolbar"
                @click="(e) => e.ctrlKey ? showActivityFeed = !showActivityFeed : handleSave()"
                class="p-2 text-sm font-medium rounded-md transition flex items-center justify-center shrink-0 shadow-sm border backdrop-blur-md"
                :class="store.isSaving 
                  ? 'bg-muted text-muted-foreground border-border' 
                  : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20'"
              >
                <Loader2 v-if="store.isSaving" class="w-4 h-4 animate-spin" />
                <Save v-else class="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{{ store.isSaving ? 'Saving...' : 'Save Dashboard' }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
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
            <!-- Mobile Actions -->
            <template v-if="!showFullToolbar && currentDashboard">
                <div class="px-2 py-1.5 text-sm font-semibold">Actions</div>
                
                <DropdownMenuItem @click="showAddElementDialog = true">
                  <Plus class="w-4 h-4 mr-2" />
                  Add Element
                </DropdownMenuItem>

                <DropdownMenuItem @click="showChat = !showChat" class="relative">
                  <MessageSquare class="w-4 h-4 mr-2" />
                  Toggle Chat
                  <span v-if="hasUnreadMessages" class="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                </DropdownMenuItem>

                <DropdownMenuItem 
                  v-if="activeLayout.length > 0"
                  @click="generateDashboardSummary"
                  :disabled="isAnalyzing"
                >
                  <template v-if="!isAnalyzing">
                    <BrainCircuit class="w-4 h-4 mr-2 text-primary" />
                    Generate Insights
                  </template>
                  <template v-else>
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </template>
                </DropdownMenuItem>

                <DropdownMenuItem @click="handleSave">
                  <template v-if="!store.isSaving">
                    <Save class="w-4 h-4 mr-2" />
                    Save Dashboard
                  </template>
                  <template v-else>
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </template>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
            </template>

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
            
            <DropdownMenuItem @click="openFullscreen" class="cursor-pointer">
              <Maximize class="w-4 h-4 mr-2" />
              <span>Open in New Window</span>
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

            <DropdownMenuItem @click="handleExportImage" class="cursor-pointer">
              <Image class="w-4 h-4 mr-2" />
              <span>Export as Image</span>
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

    <!-- Page Tabs & Filters -->
    <div 
      class="border-b border-border bg-card/50 flex flex-col transition-all duration-300"
      :class="{ 'mr-[350px]': showChat && !isChatDetached }"
    >
       <!-- Pages Tab Bar -->
       <div v-if="currentDashboard?.data?.pages && currentDashboard.data.pages.length > 0" class="flex items-center px-4 pt-2 gap-1 overflow-x-auto no-scrollbar">
          <ContextMenu v-for="page in sortedPages" :key="page.id">
            <ContextMenuTrigger>
              <div 
                @click="switchPage(page.id)"
                @dblclick="startRenamingPage(page)"
                class="group relative max-w-[200px] flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-all cursor-pointer hover:bg-muted/50 rounded-t-lg select-none"
                :class="activePageId === page.id ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:text-foreground'"
              >
                <span v-if="pageToRename?.id !== page.id" class="truncate">{{ page.title }}</span>
                <Input
                  v-else
                  ref="renamingInput"
                  v-model="newPageTitle"
                  class="bg-transparent border-none border-b border-primary/50 focus:outline-none p-0 w-full h-auto font-medium text-primary shadow-none rounded-none"
                  @click.stop
                  @mousedown.stop
                  @blur="processRenamePage"
                  @keydown.enter="processRenamePage"
                  @keydown.esc="cancelRename"
                />

                <!-- Delete Page Button (hover) -->
                <button 
                  v-if="!isShared && currentDashboard.data.pages.length > 1 && activePageId === page.id"
                  @click.stop="confirmDeletePage(page)"
                  class="ml-1 p-0.5 rounded-full hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete Page"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent v-if="!isShared">
              <ContextMenuItem @click="startRenamingPage(page)">
                <Pencil class="w-4 h-4 mr-2" />
                Rename Page
              </ContextMenuItem>
              <ContextMenuItem 
                v-if="currentDashboard.data.pages.length > 1"
                @click="confirmDeletePage(page)" 
                class="text-destructive focus:text-destructive"
              >
                <Trash2 class="w-4 h-4 mr-2" />
                Delete Page
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <!-- Add Page Button -->
          <button 
            v-if="!isShared"
            @click="handleAddPage"
            class="ml-2 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition mb-0.5"
            title="Add Page"
          >
            <Plus class="w-4 h-4" />
          </button>
       </div>

      <DashboardFilters />
    </div>

    <!-- Main Content Area with potential Sidebar -->
    <div class="flex-1 overflow-hidden flex relative relative-container">
      

      
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
          ref="chatSidebarRef"
          class="border border-border z-50 shadow-2xl bg-card fixed w-[350px] overflow-hidden flex flex-col transition-all duration-300"
          :class="[
            isChatDetached 
              ? 'rounded-2xl' 
              : 'top-[65px] bottom-0 right-0 border-t-0 border-b-0 border-r-0 rounded-l-xl'
          ]"
          :style="isChatDetached ? (style as any) : {}"
        >
          <DashboardChat 
            ref="dashboardChatRef"
            :messages="chatMessages" 
            :isAIThinking="isAIThinking"
            :typingUsers="typingUsers"
            :isDetached="isChatDetached"
            :collaborators="(store.authorizedUsers as any)"
            @close="showChat = false"
            @send="handleSendMessage"
            @pegasus-query="handlePegasusQuery"
            @edit="handleEditMessage"
            @delete="handleDeleteMessage"
            @typing-start="handleTypingStart"
            @typing-stop="handleTypingStop"
            @toggle-detach="isChatDetached = !isChatDetached"
          />
        </div>
      </Transition>

      <Transition name="slide-fade">
        <div 
          v-if="showActivityFeed"
          class="fixed z-[30] shadow-2xl transition-all duration-300 pointer-events-auto"
          :class="[
            'top-[65px] bottom-0 right-0 border-t-0 border-b-0 border-r-0 rounded-l-xl'
          ]"
        >
          <ActivityFeed 
            :activities="(store.activityLogs as any)"
            @close="showActivityFeed = false"
          />
        </div>
      </Transition>
      
      <!-- Backdrop for mobile chat -->
      <div 
        v-if="showChat && !isDesktop" 
        class="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 sm:hidden"
        @click="showChat = false"
      ></div>

      <!-- Main Grid Container -->
      <div 
        class="flex-1 h-full overflow-auto relative transition-all duration-300 p-4"
        ref="dashboardContainer"
        :class="{ 'bg-grid-pattern': showGrid }"
        :style="gridStyle"
        @mousemove="onMouseMove"
        @mouseleave="onMouseLeave"
      >
        <!-- AI Insights -->
        <DashboardInsights v-if="currentDashboard && activeLayout.length > 0" />

        <!-- Live Cursors Overlay -->
        <LiveCursors :cursors="cursors" />



      <DraggableGrid
        v-if="currentDashboard"
        v-model:items="activeLayout"
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
            :is-mobile="isPhone"
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
        v-if="!isLoading && (!currentDashboard || !activeLayout.length)"
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
    <ShareResourceDialog
      v-model:open="showShareModal"
      :resource-id="currentDashboard?.id || null"
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

    <!-- Delete Page Modal -->
    <Dialog v-model:open="showDeletePageModal">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Page</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{{ pageToDelete?.title }}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div class="flex justify-end gap-2 pt-4">
          <button 
            @click="showDeletePageModal = false"
            class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
          >
            Cancel
          </button>
          <button 
            @click="processDeletePage"
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
  </div> <!-- closes line 372 -->
  </template> <!-- closes line 10 -->
</div> <!-- closes line 2 -->
</template> <!-- closes line 1 -->

<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import LoadingScreen from '@/components/ui/LoadingScreen.vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDashboardStore, type DashboardPage } from '@/stores/dashboard'
import { useSettingsStore } from '@/stores/settings'
import DraggableGrid from '@/components/grid/DraggableGrid.vue'
import CodeEditor from '@/components/Chat/CodeEditor.vue'
import ElementEditorWrapper from '@/components/Dashboard/ElementEditorWrapper.vue'
import AddElementDialog from '@/components/Dashboard/AddElementDialog.vue'
import AddTextDialog from '@/components/Dashboard/AddTextDialog.vue'
import AddFileDialog from '@/components/Dashboard/AddFileDialog.vue'
import ShareResourceDialog from '@/components/shared/ShareResourceDialog.vue'
import DashboardChat from '@/components/Dashboard/DashboardChat.vue'
import LiveCursors from '@/components/Dashboard/LiveCursors.vue'
import CollaboratorAvatars from '@/components/Dashboard/CollaboratorAvatars.vue'
import ActivityFeed from '@/components/Dashboard/ActivityFeed.vue'
import DashboardInsights from '@/components/Dashboard/DashboardInsights.vue'
import DashboardFilters from '@/components/Dashboard/DashboardFilters.vue'
import { useDashboardAnalysis } from '@/composables/useDashboardAnalysis'
import { useCollaboration } from '@/composables/useCollaboration'
import { useDashboardPage } from '@/composables/useDashboardPage'
import { useDashboardCollaboration } from '@/composables/useDashboardCollaboration'
import { useDashboardModals } from '@/composables/useDashboardModals'
import { identityService } from '@/services/identityService'
import { uploadDashboardFile, getFileDownloadUrl, updateDashboardPrivacy, trackDashboardAccess, api } from '@/lib/api'
import { toast } from '@/composables/useNotifications'
import { exportElementAsImage } from '@/lib/exportImage'
import { useMediaQuery, useThrottleFn, onClickOutside, onKeyStroke, useBreakpoints, breakpointsTailwind, useDraggable } from '@vueuse/core'
import { usePlatform } from '@/composables/usePlatform'
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
import { Input } from '@/components/ui/input'
import { Pencil, Trash2, Code, Plus, Save, Share2, ArrowLeft, Settings, MoreVertical, FileText, Lock, Globe, MessageSquare, X, Send, Loader2, LayoutDashboard, BrainCircuit, Maximize, Image, Undo, Redo } from 'lucide-vue-next'
import DashboardElement from '@/components/Dashboard/DashboardElement.vue'

defineOptions({ name: 'DashboardPage' })

const router = useRouter()
const route = useRoute()
const store = useDashboardStore()
const settingsStore = useSettingsStore()
const settings = computed(() => settingsStore.settings)
const dashboards = computed((): any[] => store.dashboards as any)
const currentDashboard = computed((): any => store.currentDashboard as any)
const isLoading = computed(() => store.isLoading)
const undoStack = computed(() => store.undoStack as unknown as any[])
const redoStack = computed(() => store.redoStack as unknown as any[])
const isInitializing = ref(true)
const isDeveloping = ref(import.meta.env.DEV)
const isShared = computed(() => route.path.includes('/shared/'))

const { isPhone, isTablet } = usePlatform()
const isDesktop = useMediaQuery('(min-width: 640px)')
const breakpoints = useBreakpoints(breakpointsTailwind)
const showFullToolbar = breakpoints.greaterOrEqual('md')
const isCtrlPressed = ref(false)

// -------- Composables -----------------------------------------------

// 1. Page Management
const {
  activePageId,
  activePage,
  sortedPages,
  activeLayout,
  handleAddPage,
  switchPage,
  confirmDeletePage,
  processDeletePage,
  pageToRename,
  newPageTitle,
  renamingInput,
  startRenamingPage,
  cancelRename,
  processRenamePage,
  getElement,
  showDeletePageModal,
  pageToDelete
} = useDashboardPage(currentDashboard, store, isShared)

// 2. Collaboration & Chat
const {
  collaborators,
  cursors,
  chatMessages,
  isAIThinking,
  typingUsers,
  hasUnreadMessages,
  showChat,
  showActivityFeed,
  chatSidebarRef,
  chatToggleRef,
  dashboardContainer,
  dashboardChatRef,
  isChatDetached,
  joinDashboard,
  leaveDashboard,
  emitCursorMove,
  sendChatMessage,
  emitPegasusQuery,
  editChatMessage,
  deleteChatMessage,
  emitTypingStart,
  emitTypingEnd,
  emitDashboardUpdate,
  onMouseMove,
  onMouseLeave,
  handleSendMessage,
  handlePegasusQuery,
  handleEditMessage,
  handleDeleteMessage,
  handleTypingStart,
  handleTypingStop,
  style
} = useDashboardCollaboration(currentDashboard, store, activePage)

// 3. Modals & Actions
const {
  showQueryModal,
  showAddElementDialog,
  showTextDialog,
  showFileDialog,
  editingElement,
  editingQuery,
  showEditModal,
  editingElementForModal,
  showShareModal,
  shareUrl,
  copied,
  showPrivacyDialog,
  showRenameModal,
  renameTitle,
  showDeleteModal,
  handleDashboardChange,
  handleCreateDashboard,
  handleSave,
  handleDeleteDashboard,
  handleExportImage,
  confirmDelete,
  handleRename,
  confirmRename,
  confirmPrivacyChange,
  openFullscreen,
  handleShare,
  copyShareLink,
  removeElement,
  handleEditQuery,
  handleViewQuery,
  saveQueryChanges,
  handleEditElement,
  handleAddElementSelect,
  handleAddWidget,
  handleAddTextElement,
  handleAddFileElement,
  handleSaveElement
} = useDashboardModals(
  currentDashboard,
  dashboards,
  activePage,
  store,
  async () => { await store.saveCurrentDashboard() },
  router,
  isShared
)

const { isAnalyzing, generateDashboardSummary } = useDashboardAnalysis()

// -------- Computed & Helpers ----------------------------------------

const isCompact = computed({
  get: () => currentDashboard.value?.data?.settings?.compactMode ?? false,
  set: (val) => {
    if (isShared.value || !currentDashboard.value) return
    if (!currentDashboard.value.data) currentDashboard.value.data = { pages: [] }
    if (!currentDashboard.value.data.settings) currentDashboard.value.data.settings = {}
    currentDashboard.value.data.settings.compactMode = val
    handleSave()
  }
})

const showGrid = computed({
  get: () => currentDashboard.value?.data?.settings?.showGrid ?? true,
  set: (val) => {
    if (isShared.value || !currentDashboard.value) return
    if (!currentDashboard.value.data) currentDashboard.value.data = { pages: [] }
    if (!currentDashboard.value.data.settings) currentDashboard.value.data.settings = {}
    currentDashboard.value.data.settings.showGrid = val
    store.saveCurrentDashboard()
  }
})

const isLocked = computed({
  get: () => isShared.value || (currentDashboard.value?.data?.settings?.locked ?? false),
  set: (val) => {
    if (isShared.value || !currentDashboard.value) return
    if (!currentDashboard.value.data) currentDashboard.value.data = { pages: [] }
    if (!currentDashboard.value.data.settings) currentDashboard.value.data.settings = {}
    currentDashboard.value.data.settings.locked = val
    store.saveCurrentDashboard()
  }
})

const userRole = computed<'owner' | 'editor' | 'viewer' | null>(() => {
  if (!currentDashboard.value) return null
  const role = currentDashboard.value.access_level
  if (!role || typeof role !== 'string') return 'viewer'
  return role as 'owner' | 'editor' | 'viewer'
})

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

// -------- Event Handlers --------------------------------------------

const onLayoutUpdated = () => {
  store.pushToHistory()
  if (currentDashboard.value) {
    emitDashboardUpdate(currentDashboard.value.id, { 
      type: 'layout', 
      layout: activeLayout.value 
    })
  }
}

const handleDrillDown = async (data: any) => {
  const params = store.parameters
  const keys = Object.keys(params)
  let targetKey = keys.find(k => k.toLowerCase() === data.datasetLabel?.toLowerCase())
  if (!targetKey) {
    targetKey = keys.find(k => k.toLowerCase().includes('category') || k.toLowerCase().includes('name') || k.toLowerCase().includes('type'))
  }
  if (targetKey) {
    store.updateParameter(targetKey, data.label)
    toast.info(`Filtering by ${data.label}...`)
    await store.refreshDashboard(true)
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

// -------- Shortcuts & Lifecycle -------------------------------------

onKeyStroke(['s', 'S'], (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault()
    store.saveCurrentDashboard()
  }
  if (e.altKey || (e.metaKey && e.shiftKey)) {
    e.preventDefault()
    handleShare()
  }
})

onKeyStroke(['z', 'Z'], (e) => {
  if (e.altKey && e.shiftKey) {
    e.preventDefault()
    store.undo()
  }
})

onKeyStroke(['y', 'Y'], (e) => {
  if (e.altKey && e.shiftKey) {
    e.preventDefault()
    store.redo()
  }
})

onKeyStroke(['c', 'C'], (e) => {
  if (e.altKey || (e.metaKey && e.shiftKey)) {
     e.preventDefault()
     showChat.value = !showChat.value
  }
})

onMounted(async () => {
  isInitializing.value = true
  try {
    await store.loadDashboards()
    const id = route.params.id as string
    if (id) {
      await store.selectDashboard(id)
    } else if (dashboards.value.length > 0) {
      router.replace(`/dashboard/${dashboards.value[0]!.id}`)
    }
  } catch (e) {
    console.error('[Dashboard] Initialization failed:', e)
  } finally {
    isInitializing.value = false
  }
})

watch(() => route.params.id, async (newId) => {
  if (newId && typeof newId === 'string') {
    if (currentDashboard.value?.id !== newId) {
      await store.selectDashboard(newId)
    }
  }
})

watch(() => currentDashboard.value?.id, (newId, oldId) => {
  if (oldId) leaveDashboard(oldId)
  if (newId) {
    joinDashboard(newId)
    trackDashboardAccess(newId).catch(console.error)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (currentDashboard.value?.id) {
    leaveDashboard(currentDashboard.value.id)
  }
})
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


