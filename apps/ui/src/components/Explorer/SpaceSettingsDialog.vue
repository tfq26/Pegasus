<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSpaceStore, type DataSpace } from '@/stores/space'
import { Loader2, Copy, Check, Trash2, Users, Settings as Cog, Shield, UserPlus, X } from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'
import { inviteUserToSpace, fetchSpacePermissions, removeSpacePermission, searchUsers } from '@/lib/api'

const props = defineProps<{
  open: boolean
  space: DataSpace | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'deleted': []
}>()

const spaceStore = useSpaceStore()
const loading = ref(false)
const copied = ref(false)
const activeTab = ref('general')

// Form state
const name = ref('')
const description = ref('')
const selectedColor = ref('#8B5CF6')

// Sharing state
const inviteEmail = ref('')
const inviteRole = ref<'read' | 'editor'>('read')
const permissions = ref<any[]>([])
const owner = ref<any>(null)
const currentUserRole = ref<string | null>(null)
const isInviting = ref(false)
const isLoadingPermissions = ref(false)
const searchResults = ref<any[]>([])
let searchTimeout: any = null

const colors = [
  '#8B5CF6', // Purple
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#F43F5E', // Rose
  '#64748B', // Slate
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
  '#84CC16', // Lime
]

// Generate a join code from the space ID
const joinCode = computed(() => {
  if (!props.space?.id) return ''
  const idPart = props.space.id.includes(':') 
    ? props.space.id.split(':')[1] 
    : props.space.id
  return idPart?.substring(0, 8) || ''
})

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value)
})

const isOwner = computed(() => currentUserRole.value === 'owner')
const canManage = computed(() => isOwner.value || currentUserRole.value === 'editor')

// Sync form with space data when space changes
watch(() => props.space, (newSpace) => {
  if (newSpace) {
    name.value = newSpace.name || ''
    description.value = newSpace.description || ''
    selectedColor.value = newSpace.color || '#8B5CF6'
    loadPermissions()
  }
}, { immediate: true })

// Search Logic
watch(inviteEmail, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  if (!val || val.length < 2) {
    searchResults.value = []
    return
  }
  
  searchTimeout = setTimeout(async () => {
    try {
      searchResults.value = await searchUsers(val)
    } catch (e) {
      console.error(e)
    }
  }, 300)
})

async function loadPermissions() {
  if (!props.space) return
  isLoadingPermissions.value = true
  try {
    const data = await fetchSpacePermissions(props.space.id)
    permissions.value = data.permissions || []
    owner.value = data.owner || null
    currentUserRole.value = data.currentUserRole || null
  } catch (e) {
    console.error('Failed to load permissions:', e)
  } finally {
    isLoadingPermissions.value = false
  }
}

async function handleInvite() {
  if (!props.space || !isValidEmail.value) return
  isInviting.value = true
  try {
    await inviteUserToSpace(props.space.id, inviteEmail.value, inviteRole.value)
    toast.success('User Invited', { description: `${inviteEmail.value} has been added to the space.` })
    inviteEmail.value = ''
    searchResults.value = []
    loadPermissions()
  } catch (e: any) {
    toast.error('Failed to invite', { 
      description: e.response?.data?.error || 'User must have logged in at least once.'
    })
  } finally {
    isInviting.value = false
  }
}

async function handleRemoveUser(email: string) {
  if (!props.space) return
  try {
    await removeSpacePermission(props.space.id, email)
    toast.success('Permission Removed', { description: `Access revoked for ${email}.` })
    loadPermissions()
  } catch (e) {
    toast.error('Error', { description: 'Failed to remove user.' })
  }
}

function selectUser(user: any) {
  inviteEmail.value = user.email
  searchResults.value = []
}

async function handleSave() {
  if (!name.value || !props.space) return
  
  loading.value = true
  try {
    await spaceStore.updateSpace(props.space.id, {
      name: name.value,
      description: description.value,
      color: selectedColor.value
    })
    toast.success('Space Updated', { description: 'Your space settings have been saved.' })
    emit('update:open', false)
  } catch (e) {
    toast.error('Error', { description: 'Failed to update space settings.' })
  } finally {
    loading.value = false
  }
}

async function handleDelete() {
  if (!props.space) return
  if (props.space.is_default) {
    toast.error('Cannot Delete', { description: 'You cannot delete your default space.' })
    return
  }
  
  loading.value = true
  try {
    await spaceStore.deleteSpace(props.space.id)
    toast.success('Space Deleted', { description: 'The space has been removed.' })
    emit('deleted')
    emit('update:open', false)
  } catch (e) {
    toast.error('Error', { description: 'Failed to delete space.' })
  } finally {
    loading.value = false
  }
}

function copyJoinCode() {
  navigator.clipboard.writeText(joinCode.value)
  copied.value = true
  toast.success('Copied!', { description: 'Join code copied to clipboard.' })
  setTimeout(() => copied.value = false, 2000)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md p-0 overflow-hidden gap-0">
      <DialogHeader class="p-6 pb-2">
        <DialogTitle>Space Settings</DialogTitle>
        <DialogDescription>
          Manage your space details and sharing options.
        </DialogDescription>
      </DialogHeader>
      
      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="w-full justify-start rounded-none border-b bg-transparent px-6 h-12">
          <TabsTrigger value="general" class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4">
            <Cog class="w-4 h-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="sharing" class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4">
            <Users class="w-4 h-4 mr-2" />
            Sharing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="p-6 mt-0">
          <div class="space-y-4">
            <!-- Name -->
            <div class="space-y-2">
              <Label>Space Name</Label>
              <Input v-model="name" placeholder="e.g. Marketing Team" :disabled="!isOwner" />
            </div>
            
            <!-- Description -->
            <div class="space-y-2">
              <Label>Description</Label>
              <Input v-model="description" placeholder="What is this space for?" :disabled="!isOwner" />
            </div>
            
            <!-- Color -->
            <div class="space-y-2">
              <Label>Color Tag</Label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="color in colors"
                  :key="color"
                  @click="selectedColor = color"
                  :disabled="!isOwner"
                  class="w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center"
                  :class="[
                    selectedColor === color ? 'border-primary ring-2 ring-ring ring-offset-2' : 'border-transparent',
                    isOwner ? 'hover:scale-105' : 'opacity-50 cursor-not-allowed'
                  ]"
                  :style="{ backgroundColor: color }"
                />
              </div>
            </div>
            
            <!-- Join Code Section -->
            <div class="space-y-2 pt-2 border-t">
              <Label>Invite Code</Label>
              <p class="text-xs text-muted-foreground mb-2">
                Share this code with others so they can join your space directly.
              </p>
              <div class="flex items-center gap-2">
                <Input 
                  :model-value="joinCode" 
                  readonly 
                  class="font-mono text-center tracking-widest bg-muted/50"
                />
                <Button variant="outline" size="icon" @click="copyJoinCode">
                  <Check v-if="copied" class="w-4 h-4 text-emerald-500" />
                  <Copy v-else class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sharing" class="p-6 mt-0">
          <div class="space-y-6">
            <!-- Invite Section -->
            <div v-if="canManage" class="space-y-3">
              <Label>Invite Member</Label>
              <div class="flex gap-2 relative">
                <div class="relative flex-1">
                  <Input 
                    v-model="inviteEmail" 
                    placeholder="Enter email address" 
                    @keyup.enter="handleInvite"
                  />
                  <!-- Search Results -->
                  <div v-if="searchResults.length > 0" class="absolute top-full left-0 w-full mt-1 bg-popover border rounded-md shadow-lg z-50 overflow-hidden">
                    <button
                      v-for="user in searchResults"
                      :key="user.id"
                      @click="selectUser(user)"
                      class="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                    >
                      <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold">
                        {{ user.first_name?.[0] || user.email[0].toUpperCase() }}
                      </div>
                      <div class="flex flex-col">
                        <span class="font-medium truncate">{{ user.first_name }} {{ user.last_name }}</span>
                        <span class="text-[10px] text-muted-foreground">{{ user.email }}</span>
                      </div>
                    </button>
                  </div>
                </div>
                <select 
                  v-model="inviteRole"
                  class="h-9 px-2 rounded-md border text-xs bg-background outline-none hover:bg-accent"
                >
                  <option value="read">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <Button @click="handleInvite" :disabled="!isValidEmail || isInviting" size="sm">
                  <Loader2 v-if="isInviting" class="w-4 h-4 animate-spin" />
                  <span v-else>Invite</span>
                </Button>
              </div>
            </div>

            <!-- Members List -->
            <div class="space-y-3">
              <Label>Active Members</Label>
              <div class="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                <!-- Owner -->
                <div v-if="owner" class="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {{ owner.first_name?.[0] || owner.email[0].toUpperCase() }}
                    </div>
                    <div class="flex flex-col">
                      <span class="text-sm font-medium">{{ owner.first_name ? `${owner.first_name} ${owner.last_name || ''}` : owner.email }}</span>
                      <span class="text-[10px] text-muted-foreground">Owner</span>
                    </div>
                  </div>
                  <Shield class="w-4 h-4 text-primary opacity-50 mr-2" />
                </div>

                <!-- Guests/Editors -->
                <div v-for="perm in permissions" :key="perm.email" class="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 group border border-transparent hover:border-border transition-all">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {{ (perm.first_name?.[0] || perm.email?.[0] || '?').toUpperCase() }}
                    </div>
                    <div class="flex flex-col">
                      <span class="text-sm font-medium">{{ perm.first_name ? `${perm.first_name} ${perm.last_name || ''}` : perm.email }}</span>
                      <span class="text-[10px] text-muted-foreground capitalize">{{ perm.access_level }}</span>
                    </div>
                  </div>
                  <button 
                    v-if="canManage"
                    @click="handleRemoveUser(perm.email)"
                    class="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                  >
                    <X class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      <DialogFooter class="p-6 border-t bg-muted/10 gap-2">
        <Button 
          v-if="!space?.is_default && isOwner"
          variant="destructive" 
          @click="handleDelete" 
          :disabled="loading"
          class="sm:mr-auto"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          Delete Space
        </Button>
        <Button variant="outline" @click="emit('update:open', false)">
          Cancel
        </Button>
        <Button @click="handleSave" :disabled="!name || loading || !isOwner">
          <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
          Save Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
