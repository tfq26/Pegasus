<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Share Dashboard</DialogTitle>
        <DialogDescription>
          Invite authorized users or share a public link.
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
                 <div class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                    <img v-if="user.profile_picture_url" :src="user.profile_picture_url" class="w-full h-full object-cover">
                    <span v-else>{{ user.first_name?.[0] || user.email[0] }}</span>
                 </div>
                 <div class="flex flex-col">
                   <span class="font-medium">{{ user.first_name }} {{ user.last_name }}</span>
                   <span class="text-xs text-muted-foreground">{{ user.email }}</span>
                 </div>
               </div>
            </div>

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
                   <div class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                     You
                   </div>
                   <span>You <span class="text-muted-foreground">(Owner)</span></span>
                </div>
             </div>
             
             <div v-if="permissions.length === 0" class="text-xs text-muted-foreground p-2 text-center italic">
                No invited users yet.
             </div>

             <div v-for="perm in permissions" :key="perm.email" class="flex items-center justify-between text-sm p-2 rounded-md hover:bg-muted/50 transition-colors">
                <div class="flex items-center gap-2 overflow-hidden">
                   <div class="w-6 h-6 min-w-[1.5rem] rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-500">
                     {{ perm.email[0].toUpperCase() }}
                   </div>
                   <span class="truncate" :title="perm.email">{{ perm.email }}</span>
                </div>
                <button @click="handleRemove(perm.email)" class="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded transition">
                   Remove
                </button>
             </div>
          </div>
        </div>

        <div class="h-px bg-border my-1"></div>

        <!-- Public Link Section -->
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
import { toast } from 'vue-sonner'
import { 
  inviteUserToDashboard, 
  fetchDashboardPermissions, 
  removeDashboardPermission,
  searchUsers 
} from '@/lib/api'

const props = defineProps<{
  open: boolean
  dashboardId: string | null
  publicLink: string
}>()

const emit = defineEmits(['update:open'])

const inviteEmail = ref('')
const isInviting = ref(false)
const isLoading = ref(false)
const permissions = ref<any[]>([])
const copied = ref(false)

// Search State
const searchResults = ref<any[]>([])
const isSearching = ref(false)
let searchTimeout: any = null

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value)
})

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.dashboardId) {
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
  if (!props.dashboardId) return
  isLoading.value = true
  try {
    permissions.value = await fetchDashboardPermissions(props.dashboardId)
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

const handleInvite = async () => {
  if (!props.dashboardId || !isValidEmail.value) return
  
  isInviting.value = true
  try {
    await inviteUserToDashboard(props.dashboardId, inviteEmail.value)
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
  if (!props.dashboardId) return
  if (!confirm(`Revoke access for ${email}?`)) return
  
  try {
    await removeDashboardPermission(props.dashboardId, email)
    toast.success('Access revoked')
    await loadPermissions()
  } catch (e: any) {
    toast.error('Failed to revoke access')
  }
}

const copyLink = () => {
  navigator.clipboard.writeText(props.publicLink)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}
</script>
