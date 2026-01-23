<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Share {{ resourceLabel }}</DialogTitle>
        <DialogDescription>
          Invite authorized users{{ canGenerateLink ? ' or share a public link' : '' }}.
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-6 py-2">
        <!-- Invite Section -->
        <div v-if="canManage" class="space-y-4">
          <h4 class="text-sm font-medium">Invite User</h4>
          <div class="flex gap-2 relative flex-col">
            <div class="flex gap-2 w-full">
              <div class="relative flex-1">
                <Input 
                  v-model="inviteEmail" 
                  placeholder="name@example.com" 
                  class="pr-10"
                  @keyup.enter="handleInvite"
                />
                <div v-if="isSearching" class="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>

              <!-- Access Level Selector -->
              <select
                v-model="accessLevel"
                class="h-9 rounded-md border border-input bg-background px-2 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="read">{{ readLabel }}</option>
                <option value="write">{{ writeLabel }}</option>
                <option v-if="resourceType === 'space'" value="editor">Editor</option>
              </select>

              <Button 
                @click="handleInvite" 
                :disabled="!isValidEmail || isInviting"
                class="min-w-[80px]"
              >
                {{ isInviting ? '...' : 'Invite' }}
              </Button>
            </div>

            <!-- User Suggestions Dropdown -->
            <div v-if="(searchResults.length > 0 || (inviteEmail.length > 0 && !isSearching))" 
                 class="absolute top-11 left-0 w-full bg-popover text-popover-foreground border border-border rounded-md shadow-lg z-[100] overflow-hidden">
              <div v-if="searchResults.length > 0">
                <div 
                  v-for="user in searchResults" 
                  :key="user.id"
                  @click="selectUser(user)"
                  class="flex items-center gap-3 p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors border-b border-border/50 last:border-0"
                >
                  <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                    <img v-if="user.profile_picture_url" :src="user.profile_picture_url" class="w-full h-full object-cover" />
                    <span v-else class="text-xs font-medium">{{ user.first_name?.[0] }}{{ user.last_name?.[0] }}</span>
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium truncate">{{ user.first_name }} {{ user.last_name }}</span>
                    <span class="text-xs text-muted-foreground truncate">{{ user.email }}</span>
                  </div>
                </div>
              </div>
              <div v-else-if="inviteEmail.length > 0 && !isSearching && !searchResults.length" class="p-4 text-center text-sm text-muted-foreground italic">
                No registered users found for "{{ inviteEmail }}"
              </div>
            </div>
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
                      <span v-else>{{ (owner.first_name?.[0] || owner.email?.[0] || 'O').toUpperCase() }}</span>
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
                     <span v-else>{{ (perm.first_name?.[0] || perm.email?.[0] || 'U').toUpperCase() }}</span>
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
                     <option value="read">{{ readLabel }}</option>
                     <option value="write">{{ writeLabel }}</option>
                     <option v-if="resourceType === 'space'" value="editor">Editor</option>
                   </select>
                   <span v-else class="text-[11px] text-muted-foreground px-2">
                     {{ getRoleLabel(perm.access_level) }}
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
                     <span v-else>{{ (collab.user?.firstName?.[0] || collab.user?.email?.[0] || 'U').toUpperCase() }}</span>
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
                      <option value="read">{{ readLabel }}</option>
                      <option value="write">{{ writeLabel }}</option>
                    </select>
                    <span v-else class="text-[11px] text-muted-foreground px-2">
                      {{ readLabel }}
                    </span>
                 </div>
               </div>
             </template>
          </div>
        </div>

        <!-- Public Link Section (Dashboard only) -->
        <template v-if="canGenerateLink">
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/composables/useNotifications'
import { 
  api,
  fetchDashboardPermissions, 
  searchUsers,
  QUERY_API_URL,
  getAuthHeaders
} from '@/lib/api'
import { Trash2, Edit2, Loader2 } from 'lucide-vue-next'
import { useCollaboration } from '@/composables/useCollaboration'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const props = defineProps<{
  open: boolean
  resourceId: string | null
  resourceType: 'dashboard' | 'spreadsheet' | 'space'
}>()

const emit = defineEmits(['update:open'])

const { collaborators } = useCollaboration()

const inviteEmail = ref('')
const accessLevel = ref<'read' | 'write' | 'editor'>('read')
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

const resourceLabel = computed(() => {
  if (props.resourceType === 'dashboard') return 'Dashboard'
  if (props.resourceType === 'spreadsheet') return 'Spreadsheet'
  if (props.resourceType === 'space') return 'Workspace'
  return 'Resource'
})

const readLabel = computed(() => {
  if (props.resourceType === 'spreadsheet') return 'View'
  if (props.resourceType === 'space') return 'Viewer'
  return 'Visitor'
})

const writeLabel = computed(() => {
  if (props.resourceType === 'spreadsheet') return 'Edit'
  if (props.resourceType === 'space') return 'Editor'
  return 'Editor'
})

const canGenerateLink = computed(() => props.resourceType === 'dashboard')

const getRoleLabel = (role: string) => {
  if (role === 'read' || role === 'viewer') return readLabel.value
  if (role === 'write' || role === 'editor') return writeLabel.value
  return role
}

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value)
})

const canManage = computed(() => {
  if (props.resourceType === 'spreadsheet') return true
  return currentUserRole.value === 'owner' || currentUserRole.value === 'write' || currentUserRole.value === 'editor'
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
  if (isOpen && props.resourceId) {
    loadPermissions()
    // Also load existing share link if dashboard
    if (props.resourceType === 'dashboard') {
      loadShareLink()
    }
  }
})

// Search Logic
watch(inviteEmail, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  if (!val || val.length < 1) {
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
  if (!props.resourceId) return
  isLoading.value = true
  try {
    if (props.resourceType === 'spreadsheet') {
      // Fetch spreadsheet permissions
      const res = await fetch(`${QUERY_API_URL}/table/${props.resourceId}/permissions`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      permissions.value = data.permissions || []
    } else if (props.resourceType === 'space') {
      const result = await api.get<any>(`/spaces/${props.resourceId}/permissions`)
      permissions.value = result.permissions || []
      currentUserRole.value = result.currentUserRole
      owner.value = result.owner
    } else {
      // Dashboard
      const data = await fetchDashboardPermissions(props.resourceId)
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
  if (!props.resourceId || props.resourceType !== 'dashboard') return
  try {
    // Fetch dashboard to get existing share_token
    const dashboard = await api.get<any>(`/dashboards/${props.resourceId}`)
    if (dashboard?.dashboard?.share_token) {
      const baseUrl = window.location.origin
      shareLink.value = `${baseUrl}/shared/${dashboard.dashboard.share_token}`
    }
  } catch (e) {
    console.error('Failed to load share link:', e)
  }
}

const generateShareLink = async () => {
  if (!props.resourceId) return
  isGeneratingLink.value = true
  try {
    const result = await api.post<{ token: string }>(`/dashboards/${props.resourceId}/share`)
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
  if (!props.resourceId || !isValidEmail.value) return
  
  isInviting.value = true
  try {
    if (props.resourceType === 'spreadsheet') {
      // Share spreadsheet
      const res = await fetch(`${QUERY_API_URL}/table/${props.resourceId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email: inviteEmail.value, accessLevel: accessLevel.value })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to share')
      }
    } else if (props.resourceType === 'space') {
      await api.post(`/spaces/${props.resourceId}/share/invite`, {
         email: inviteEmail.value,
         role: accessLevel.value
      })
    } else {
      await api.post(`/dashboards/${props.resourceId}/share/invite`, { 
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
  accessLevel.value = role as any
  await handleInvite()
}

const handleRename = (identifier: string, currentAlias: string) => {
  confirmState.value = {
    open: true,
    title: 'Rename User',
    description: `Set a nickname for ${identifier} to help identify them in the workspace.`,
    confirmText: 'Save Changes',
    isDestructive: false,
    showInput: true,
    inputLabel: 'Nickname / Alias',
    inputPlaceholder: 'e.g. John (Data Lead)',
    initialInputValue: currentAlias,
    action: async (newAlias: string) => {
      if (!props.resourceId) return
      try {
        if (props.resourceType === 'spreadsheet') {
          toast.error('Renaming is only available for dashboards/workspaces')
        } else if (props.resourceType === 'space') {
          await api.put(`/spaces/${props.resourceId}/permissions/${encodeURIComponent(identifier)}`, { 
            alias: newAlias.trim() || null 
          })
        } else {
          await api.put(`/dashboards/${props.resourceId}/permissions/${encodeURIComponent(identifier)}`, { 
            alias: newAlias.trim() || null 
          })
        }
        toast.success('User updated')
        await loadPermissions()
      } catch (e: any) {
        toast.error('Failed to update user')
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
  if (!props.resourceId) return
  
  try {
    if (props.resourceType === 'spreadsheet') {
       await fetch(`${QUERY_API_URL}/table/${props.resourceId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email, accessLevel: role })
      })
    } else if (props.resourceType === 'space') {
      await api.put(`/spaces/${props.resourceId}/permissions/${encodeURIComponent(email)}`, { role })
    } else {
      await api.put(`/dashboards/${props.resourceId}/permissions/${encodeURIComponent(email)}`, { role })
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
    description: `Are you sure you want to remove ${identifier}? they will no longer be able to access this resource.`,
    confirmText: 'Revoke Access',
    isDestructive: true,
    showInput: false,
    inputLabel: '',
    inputPlaceholder: '',
    initialInputValue: '',
    action: async () => {
      if (!props.resourceId) return
      try {
        if (props.resourceType === 'spreadsheet') {
          await fetch(`${QUERY_API_URL}/table/${props.resourceId}/share/${encodeURIComponent(identifier)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          })
        } else if (props.resourceType === 'space') {
           await api.delete(`/spaces/${props.resourceId}/permissions/${encodeURIComponent(identifier)}`)
        } else {
          await api.delete(`/dashboards/${props.resourceId}/permissions/${encodeURIComponent(identifier)}`)
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
