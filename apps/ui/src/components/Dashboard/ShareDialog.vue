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
        <div class="space-y-4">
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

            <!-- Access Level Selector (Spreadsheet only) -->
            <select
              v-if="resourceType === 'spreadsheet'"
              v-model="accessLevel"
              class="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>

            <button
              @click="handleInvite"
              :disabled="!isValidEmail || isInviting"
              class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-w-[80px]"
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
             <div class="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                <div class="flex items-center gap-2">
                   <div class="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                     You
                   </div>
                   <span>You <span class="text-muted-foreground">(Owner)</span></span>
                </div>
             </div>
             
             <div v-if="permissions.length === 0" class="text-xs text-muted-foreground p-2 text-center italic">
                No invited users yet.
             </div>

             <div v-for="perm in permissions" :key="perm.email || perm.user_email" class="flex items-center justify-between text-sm p-2 rounded-md hover:bg-muted/50 transition-colors">
                <div class="flex items-center gap-2 overflow-hidden">
                   <div class="w-6 h-6 min-w-[1.5rem] rounded-lg bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-500">
                     {{ (perm.email || perm.user_email)[0].toUpperCase() }}
                   </div>
                   <span class="truncate" :title="perm.email || perm.user_email">{{ perm.email || perm.user_email }}</span>
                   <span v-if="perm.access_level" class="text-xs text-muted-foreground px-1 py-0.5 bg-muted rounded">
                     {{ perm.access_level }}
                   </span>
                </div>
                <button @click="handleRemove(perm.email || perm.user_email)" class="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded transition">
                   Remove
                </button>
             </div>
          </div>
        </div>

        <!-- Public Link Section (Dashboard only) -->
        <template v-if="resourceType === 'dashboard' && publicLink">
          <div class="h-px bg-border my-1"></div>
          <div class="space-y-4">
            <h4 class="text-sm font-medium">Public Link</h4>
            <div class="flex items-center space-x-2">
              <div class="grid flex-1 gap-2">
                <label for="link" class="sr-only">Link</label>
                <input
                  id="link"
                  :value="publicLink"
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
  inviteUserToDashboard, 
  fetchDashboardPermissions, 
  removeDashboardPermission,
  searchUsers,
  QUERY_API_URL,
  getAuthHeaders
} from '@/lib/api'

const props = defineProps<{
  open: boolean
  dashboardId?: string | null
  spreadsheetId?: string | null  // Table name for spreadsheets
  publicLink?: string
  resourceType?: 'dashboard' | 'spreadsheet'
}>()

const emit = defineEmits(['update:open'])

const inviteEmail = ref('')
const accessLevel = ref<'view' | 'edit'>('view')
const isInviting = ref(false)
const isLoading = ref(false)
const permissions = ref<any[]>([])
const copied = ref(false)

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

watch(() => props.open, async (isOpen) => {
  if (isOpen && resourceId.value) {
    loadPermissions()
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
      permissions.value = await fetchDashboardPermissions(resourceId.value)
    }
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
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
      await inviteUserToDashboard(resourceId.value, inviteEmail.value)
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

const handleRemove = async (email: string) => {
  if (!resourceId.value) return
  if (!confirm(`Revoke access for ${email}?`)) return
  
  try {
    if (resourceTypeValue.value === 'spreadsheet') {
      await fetch(`${QUERY_API_URL}/table/${resourceId.value}/share/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
    } else {
      await removeDashboardPermission(resourceId.value, email)
    }
    toast.success('Access revoked')
    await loadPermissions()
  } catch (e: any) {
    toast.error('Failed to revoke access')
  }
}

const copyLink = () => {
  if (props.publicLink) {
    navigator.clipboard.writeText(props.publicLink)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  }
}
</script>
