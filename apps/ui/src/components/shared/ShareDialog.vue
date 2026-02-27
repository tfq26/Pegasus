<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Share {{ resourceType === 'spreadsheet' ? 'Spreadsheet' : 'Dashboard' }}</DialogTitle>
        <DialogDescription>
          Invite authorized users{{ resourceType === 'spreadsheet' ? '' : ' or share a public link' }}.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-6 py-2">
        <!-- Invite Section -->
        <div v-if="canManage" class="space-y-4">
          <h4 class="text-sm font-medium">Invite User</h4>
          <div class="flex gap-2 relative">
            <input
              v-model="inviteEmail"
              placeholder="Enter email address (must be a registered user)"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              @keyup.enter="handleInvite"
            />
            
            <!-- User Suggestions Dropdown -->
            <div v-if="searchResults.length > 0" class="absolute top-10 left-0 w-full bg-popover text-popover-foreground border border-border rounded-md shadow-md z-50 overflow-hidden max-h-[200px] overflow-y-auto">
               <div
                 v-for="user in searchResults"
                 :key="user.id"
                 class="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center gap-2"
                 @click="selectUser(user)"
               >
                 <div class="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                    <img v-if="user.profile_picture_url" :src="user.profile_picture_url" class="w-full h-full object-cover">
                    <span v-else>{{ user.first_name?.[0] || user.email[0] }}</span>
                 </div>
                 <div class="flex flex-col">
                   <span class="font-medium">{{ user.first_name }} {{ user.last_name }}</span>
                   <span class="text-xs text-muted-foreground">{{ user.email }}</span>
                 </div>
               </div>
            </div>

            <!-- Access Level Selector -->
            <select
              v-model="accessLevel"
              class="h-9 rounded-md border border-input bg-background px-2 text-sm focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="read">{{ resourceTypeValue === 'spreadsheet' ? 'View' : 'Visitor' }}</option>
              <option value="write">{{ resourceTypeValue === 'spreadsheet' ? 'Edit' : 'Editor' }}</option>
            </select>

            <button
              @click="handleInvite"
              :disabled="!isValidEmail || isInviting"
              class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-w-[80px] transition-all"
            >
              {{ isInviting ? '...' : 'Invite' }}
            </button>
          </div>
        </div>

        <!-- Permissions List -->
        <div class="space-y-2">
          <h4 class="text-sm font-medium">People with access</h4>
          <div v-if="isLoading" class="text-xs text-muted-foreground">Loading...</div>
          <div v-else class="space-y-2 max-h-[150px] overflow-y-auto border border-border rounded-md p-2">
             <!-- Owner Entry -->
             <div v-if="owner" class="flex items-center justify-between text-sm p-2 rounded-md bg-muted/20 border border-border/30">
                <div class="flex items-center gap-3">
                   <div class="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden border border-primary/30">
                      <img v-if="owner.profile_picture_url" :src="owner.profile_picture_url" class="w-full h-full object-cover">
                      <span v-else>{{ (owner.first_name?.[0] || owner.email?.[0] || 'O').to() }}</span>
                   </div>
                   <div class="flex flex-col">
                      <span class="font-medium">
                        {{ currentUserRole === 'owner' ? 'You' : (owner.first_name ? `${owner.first_name} ${owner.last_name || ''}` : owner.email) }}
                        <span class="text-[10px] text-muted-foreground ml-1"> (Owner)</span>
                      </span>
                      <span v-if="currentUserRole !== 'owner'" class="text-[10px] text-muted-foreground">{{ owner.email }}</span>
                   </div>
                </div>
             </div>
             
             <div v-if="permissions.length === 0 && activeCollaborators.length === 0" class="text-xs text-muted-foreground p-2 text-center italic">
                No invited users yet.
             </div>

             <!-- Invited Users with Stored Permissions -->

             <div v-for="perm in permissions" :key="perm.email || perm.user_email" class="group flex items-center justify-between text-sm p-2 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50">
                <div class="flex items-center gap-3 overflow-hidden">
                   <div class="w-8 h-8 min-w-[2rem] rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary border border-primary/20 overflow-hidden">
                     <img v-if="perm.profile_picture_url" :src="perm.profile_picture_url" class="w-full h-full object-cover">
                     <span v-else>{{ (perm.first_name?.[0] || perm.email?.[0] || 'U').to() }}</span>
                   </div>
                   <div class="flex flex-col overflow-hidden">
                     <span class="font-medium truncate">
                       {{ perm.alias || (perm.first_name ? `${perm.first_name} ${perm.last_name || ''}` : (perm.email || 'Unidentified User')) }}
                     </span>
                     <span class="text-[10px] text-muted-foreground truncate">{{ perm.email || perm.user_id }}</span>
                   </div>
                </div>
                
                <div class="flex items-center gap-2">
                   <!-- Role Selector -->
                   <select 
                     v-if="canManage"
                     :value="perm.access_level || 'read'"
                     @change="handleUpdateRole(perm.email, ($event.target as HTMLSelectElement).value)"
                     class="bg-transparent text-[11px] border-none focus:ring-0 text-muted-foreground hover:text-foreground cursor-pointer outline-none"
                   >
                     <option value="read">{{ resourceTypeValue === 'spreadsheet' ? 'View' : 'Visitor' }}</option>
                     <option value="write">{{ resourceTypeValue === 'spreadsheet' ? 'Edit' : 'Editor' }}</option>
                   </select>
                   <span v-else class="text-[11px] text-muted-foreground px-2">
                     {{ perm.access_level === 'write' ? (resourceTypeValue === 'spreadsheet' ? 'Edit' : 'Editor') : (resourceTypeValue === 'spreadsheet' ? 'View' : 'Visitor') }}
                   </span>

                   <div v-if="canManage" class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <button @click="handleRename(perm.email || perm.user_id, perm.alias || '')" class="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Rename (Set Alias)">
                        <Edit2 class="w-3.5 h-3.5" />
                     </button>
                     <button @click="handleRemove(perm.email || perm.user_id)" class="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Remove User">
                        <Trash2 class="w-3.5 h-3.5" />
                     </button>
                   </div>
                </div>
             </div>

             <!-- Real-time Collaborators (not in permissions list) -->
             <template v-for="collab in activeCollaborators" :key="collab.socketId">
               <div 
                 v-if="!isUserInPermissions(collab.user?.email)"
                 class="flex items-center justify-between text-sm p-2 rounded-md bg-green-500/5 border border-green-500/20"
               >
                 <div class="flex items-center gap-3 overflow-hidden">
                   <div class="w-8 h-8 min-w-[2rem] rounded-lg bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-500 border border-green-500/30 overflow-hidden relative">
                     <img v-if="collab.user?.profilePictureUrl" :src="collab.user.profilePictureUrl" class="w-full h-full object-cover">
                     <span v-else>{{ (collab.user?.firstName?.[0] || collab.user?.email?.[0] || 'U').to() }}</span>
                     <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-background"></span>
                   </div>
                   <div class="flex flex-col overflow-hidden">
                     <span class="font-medium truncate">
                       {{ collab.user?.firstName ? `${collab.user.firstName} ${collab.user.lastName || ''}` : collab.user?.email }}
                     </span>
                     <span class="text-[10px] text-muted-foreground truncate">{{ collab.user?.email }}</span>
                   </div>
                 </div>

                 <div class="flex items-center gap-2">
                    <!-- Role Selector for Real-time users (Effectively invites them) -->
                    <select 
                      v-if="canManage"
                      :value="'read'"
                      @change="handleInviteRealtime(collab.user?.email, ($event.target as HTMLSelectElement).value)"
                      class="bg-transparent text-[11px] border-none focus:ring-0 text-muted-foreground hover:text-foreground cursor-pointer outline-none"
                    >
                      <option value="read">{{ resourceTypeValue === 'spreadsheet' ? 'View' : 'Visitor' }}</option>
                      <option value="write">{{ resourceTypeValue === 'spreadsheet' ? 'Edit' : 'Editor' }}</option>
                    </select>
                    <span v-else class="text-[11px] text-muted-foreground px-2">
                      {{ resourceTypeValue === 'spreadsheet' ? 'View' : 'Visitor' }}
                    </span>
                 </div>
               </div>
             </template>
          </div>
        </div>

        <!-- Public Link Section (Dashboard only) -->
        <template v-if="resourceTypeValue === 'dashboard'">
          <div class="h-px bg-border my-1"></div>
          <div class="space-y-4">
            <h4 class="text-sm font-medium">Public Link</h4>
            <div v-if="!shareLink && canManage" class="flex items-center gap-2">
              <button 
                @click="generateShareLink"
                :disabled="isGeneratingLink"
                class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {{ isGeneratingLink ? 'Generating...' : 'Generate Shareable Link' }}
              </button>
            </div>
            <div v-if="shareLink" class="flex items-center space-x-2">
              <div class="grid flex-1 gap-2">
                <label for="link" class="sr-only">Link</label>
                <input
                  id="link"
                  :value="shareLink"
                  readonly
                  class="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm text-muted-foreground cursor-pointer"
                  @click="copyLink"
                />
              </div>
              <button 
                @click="copyLink"
                class="px-3 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition"
              >
                <span v-if="copied" class="text-green-500 text-sm font-bold">Copied!</span>
                <span v-else>Copy</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Custom Confirmation Dialog for Rename/Remove -->
  <ConfirmDialog
    v-model:open="confirmState.open"
    :title="confirmState.title"
    :description="confirmState.description"
    :confirm-text="confirmState.confirmText"
    :is-destructive="confirmState.isDestructive"
    :show-input="confirmState.showInput"
    :input-label="confirmState.inputLabel"
    :input-placeholder="confirmState.inputPlaceholder"
    :initial-input-value="confirmState.initialInputValue"
    @confirm="handleConfirmAction"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { toast } from '@/composables/useNotifications'
import { 
  api,
  inviteUserToDashboard, 
  fetchDashboardPermissions, 
  removeDashboardPermission,
  searchUsers,
  QUERY_API_URL,
  getAuthHeaders
} from '@/lib/api'
import { Trash2, MoreVertical, Edit2 } from 'lucide-vue-next'
import { useCollaboration } from '@/composables/useCollaboration'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const props = defineProps<{
  open: boolean
  dashboardId?: string | null
  spreadsheetId?: string | null  // Table name for spreadsheets
  publicLink?: string
  resourceType?: 'dashboard' | 'spreadsheet'
}>()

const emit = defineEmits(['update:open'])

const { collaborators } = useCollaboration()

const inviteEmail = ref('')
const accessLevel = ref<'read' | 'write'>('read')
const isInviting = ref(false)
const isLoading = ref(false)
const permissions = ref<any[]>([])
const currentUserRole = ref<string | null>(null)
const owner = ref<any>(null)
const copied = ref(false)
const shareLink = ref('')
const isGeneratingLink = ref(false)

// Confirm Dialog State
const confirmState = ref({
  open: false,
  title: '',
  description: '',
  confirmText: '',
  isDestructive: false,
  showInput: false,
  inputLabel: '',
  inputPlaceholder: '',
  initialInputValue: '',
  action: null as ((val?: any) => void | Promise<void>) | null
})

// Search State
const searchResults = ref<any[]>([])
const isSearching = ref(false)
let searchTimeout: any = null

// Computed resource ID (dashboard or spreadsheet)
const resourceId = computed(() => props.dashboardId || props.spreadsheetId)
const resourceTypeValue = computed(() => props.resourceType || (props.spreadsheetId ? 'spreadsheet' : 'dashboard'))

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value)
})

const canManage = computed(() => {
  if (resourceTypeValue.value === 'spreadsheet') return true // Default to true for now as spreadsheet logic is legacy
  return currentUserRole.value === 'owner' || currentUserRole.value === 'write'
})

// Filter collaborators to exclude owner (already shown) and self
const activeCollaborators = computed(() => {
  return collaborators.value.filter(c => {
    const email = c.user?.email
    // Exclude owner
    if (owner.value && email === owner.value.email) return false
    return true
  })
})

const isUserInPermissions = (email: string | undefined) => {
  if (!email) return false
  return permissions.value.some(p => p.email === email)
}

watch(() => props.open, async (isOpen) => {
  if (isOpen && resourceId.value) {
    loadPermissions()
    // Also load existing share link if dashboard
    if (resourceTypeValue.value === 'dashboard') {
      loadShareLink()
    }
  }
})

// Search Logic
watch(inviteEmail, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  if (!val || val.length < 2) {
    searchResults.value = []
    return
  }
  
  // Debounce search
  searchTimeout = setTimeout(async () => {
    isSearching.value = true
    try {
      searchResults.value = await searchUsers(val)
    } catch (e) {
      console.error(e)
    } finally {
      isSearching.value = false
    }
  }, 300)
})

const selectUser = (user: any) => {
  inviteEmail.value = user.email
  searchResults.value = []
}

const loadPermissions = async () => {
  if (!resourceId.value) return
  isLoading.value = true
  try {
    if (resourceTypeValue.value === 'spreadsheet') {
      // Fetch spreadsheet permissions
      const res = await fetch(`${QUERY_API_URL}/table/${resourceId.value}/permissions`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      permissions.value = data.permissions || []
    } else {
      const data = await fetchDashboardPermissions(resourceId.value)
      permissions.value = data.permissions || []
      currentUserRole.value = data.currentUserRole || null
      owner.value = data.owner || null
    }
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

const loadShareLink = async () => {
  if (!resourceId.value || resourceTypeValue.value !== 'dashboard') return
  try {
    // Fetch dashboard to get existing share_token
    const dashboard = await api.get<any>(`/dashboards/${resourceId.value}`)
    if (dashboard?.dashboard?.share_token) {
      const baseUrl = window.location.origin
      shareLink.value = `${baseUrl}/shared/${dashboard.dashboard.share_token}`
    }
  } catch (e) {
    console.error('Failed to load share link:', e)
  }
}

const generateShareLink = async () => {
  if (!resourceId.value) return
  isGeneratingLink.value = true
  try {
    const result = await api.post<{ token: string }>(`/dashboards/${resourceId.value}/share`)
    if (result?.token) {
      const baseUrl = window.location.origin
      shareLink.value = `${baseUrl}/shared/${result.token}`
      toast.success('Shareable link generated!')
    }
  } catch (e: any) {
    toast.error('Failed to generate shareable link')
  } finally {
    isGeneratingLink.value = false
  }
}

const handleInvite = async () => {
  if (!resourceId.value || !isValidEmail.value) return
  
  isInviting.value = true
  try {
    if (resourceTypeValue.value === 'spreadsheet') {
      // Share spreadsheet
      const res = await fetch(`${QUERY_API_URL}/table/${resourceId.value}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email: inviteEmail.value, accessLevel: accessLevel.value })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to share')
      }
    } else {
      await api.post(`/dashboards/${resourceId.value}/share/invite`, { 
        email: inviteEmail.value,
        role: accessLevel.value
      })
    }
    toast.success(`Access granted to ${inviteEmail.value}`)
    inviteEmail.value = ''
    searchResults.value = []
    await loadPermissions()
  } catch (e: any) {
    toast.error(e.message || 'Failed to invite user')
  } finally {
    isInviting.value = false
  }
}

const handleInviteRealtime = async (email: string | undefined, role: string) => {
  if (!email) return
  inviteEmail.value = email
  accessLevel.value = role as 'read' | 'write'
  await handleInvite()
}

const handleRename = (identifier: string, currentAlias: string) => {
  confirmState.value = {
    open: true,
    title: 'Rename User',
    description: `Set a nickname for ${identifier} to help identify them in the dashboard.`,
    confirmText: 'Save Changes',
    isDestructive: false,
    showInput: true,
    inputLabel: 'Nickname / Alias',
    inputPlaceholder: 'e.g. John (Data Lead)',
    initialInputValue: currentAlias,
    action: async (newAlias: string) => {
      if (!resourceId.value) return
      try {
        if (resourceTypeValue.value === 'spreadsheet') {
          toast.error('Renaming is only available for dashboards')
        } else {
          await api.put(`/dashboards/${resourceId.value}/permissions/${encodeURIComponent(identifier)}`, { 
            alias: newAlias.trim() || null 
          })
        }
        toast.success('User renamed')
        await loadPermissions()
      } catch (e: any) {
        toast.error('Failed to rename user')
      }
    }
  }
}

const handleConfirmAction = (val?: any) => {
  if (confirmState.value.action) {
    confirmState.value.action(val)
  }
  confirmState.value.open = false
}

const handleUpdateRole = async (email: string, role: string) => {
  if (!resourceId.value) return
  
  try {
    if (resourceTypeValue.value === 'spreadsheet') {
       // Spreadsheet role update (different endpoint usually, but let's assume POST share handles it)
       await fetch(`${QUERY_API_URL}/table/${resourceId.value}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email, accessLevel: role })
      })
    } else {
      await api.put(`/dashboards/${resourceId.value}/permissions/${encodeURIComponent(email)}`, { role })
    }
    toast.success('Role updated')
    await loadPermissions()
  } catch (e: any) {
    toast.error('Failed to update role')
  }
}

const handleRemove = (identifier: string) => {
  confirmState.value = {
    open: true,
    title: 'Revoke Access',
    description: `Are you sure you want to remove ${identifier}? they will no longer be able to access this dashboard.`,
    confirmText: 'Revoke Access',
    isDestructive: true,
    showInput: false,
    inputLabel: '',
    inputPlaceholder: '',
    initialInputValue: '',
    action: async () => {
      if (!resourceId.value) return
      try {
        if (resourceTypeValue.value === 'spreadsheet') {
          await fetch(`${QUERY_API_URL}/table/${resourceId.value}/share/${encodeURIComponent(identifier)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          })
        } else {
          await api.delete(`/dashboards/${resourceId.value}/permissions/${encodeURIComponent(identifier)}`)
        }
        toast.success('Access revoked')
        await loadPermissions()
      } catch (e: any) {
        toast.error('Failed to revoke access')
      }
    }
  }
}

const copyLink = () => {
  if (shareLink.value) {
    navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  }
}
</script>
