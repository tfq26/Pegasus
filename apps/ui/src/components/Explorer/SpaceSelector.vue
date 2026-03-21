<script setup lang="ts">
import { useSpaceStore, type DataSpace } from '@/stores/space'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Box, Plus, Settings, Copy, Share2, Trash2, Code, Database, Globe, Lock, Layout, Cloud, Shield, Pin } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import CreateSpaceDialog from './CreateSpaceDialog.vue'
import SpaceSettingsDialog from './SpaceSettingsDialog.vue'
import ShareResourceDialog from '@/components/shared/ShareResourceDialog.vue'
import { toast } from '@/composables/useNotifications'

const spaceStore = useSpaceStore()
const showCreateDialog = ref(false)
const showSettingsDialog = ref(false)
const selectedSpaceForSettings = ref<DataSpace | null>(null)
const isDeleting = ref(false)
const showShareDialog = ref(false)
const selectedSpaceForShare = ref<DataSpace | null>(null)

// Icon Map
const iconMap: Record<string, any> = {
  box: Box,
  code: Code,
  database: Database,
  globe: Globe,
  lock: Lock,
  layout: Layout,
  cloud: Cloud,
  shield: Shield
}

function getIcon(name: string) {
  return iconMap[name] || Box
}

// Computed helpers to ensure proper typing in template
const activeSpace = computed(() => (spaceStore.currentSpace as unknown) as DataSpace | null)
const allSpaces = computed(() => (spaceStore.allSpaces as unknown) as DataSpace[])

function handleSelect(id: string) {
  spaceStore.selectSpace(id)
}

function openSettings(space: DataSpace) {
  selectedSpaceForSettings.value = space
  showSettingsDialog.value = true
}

function handleDelete(space: DataSpace) {
  if (space.isDefault) {
    toast.error('Cannot Delete', { description: 'You cannot delete your default space.' })
    return
  }
  
  try {
    spaceStore.deleteSpace(space.id)
    toast.success('Space Deleted', { description: `${space.name} has been removed.` })
  } catch (e) {
    toast.error('Error', { description: 'Failed to delete space.' })
  }
}

async function handleSetDefault(space: DataSpace) {
  try {
    await spaceStore.updateSpace(space.id, { isDefault: true })
    toast.success('Default Updated', { description: `${space.name} is now your default space.` })
  } catch (e) {
    console.error(e)
    toast.error('Error', { description: 'Failed to update default space.' })
  }
}

function copyJoinCode(space: DataSpace) {
  const idPart = space.id.includes(':') ? space.id.split(':')[1] : space.id
  const code = idPart?.substring(0, 8) || ''
  navigator.clipboard.writeText(code)
  toast.success('Copied!', {
    description: 'Join code copied to clipboard.'
  })
}

function openShareDialog(space: DataSpace) {
  selectedSpaceForShare.value = space
  showShareDialog.value = true
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Control' || e.key === 'Meta') {
    isDeleting.value = true
  }
}

const handleKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'Control' || e.key === 'Meta') {
    isDeleting.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', () => isDeleting.value = false)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})
</script>

<template>
  <div>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          class="group flex w-full max-w-[260px] items-center gap-2.5 rounded-xl border border-border/70 bg-background/78 px-2.5 py-2 text-left transition-all hover:bg-muted/40"
        >
          <div 
            class="flex h-8 w-8 items-center justify-center rounded-xl text-white transition-transform group-hover:scale-[1.02]"
            :style="{ backgroundColor: activeSpace ? activeSpace.color : '#8B5CF6' }"
          >
            <component :is="getIcon(activeSpace?.icon || 'box')" class="h-4 w-4 pointer-events-none" />
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="truncate text-[12px] font-semibold leading-none text-foreground">
              {{ activeSpace ? activeSpace.name : 'Select Space' }}
            </h4>
            <div class="mt-0.5 flex items-center gap-1.5 opacity-80">
            </div>
          </div>
          <ChevronDown class="mr-0.5 h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent class="z-[100] w-64 rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl" align="start" :side-offset="8">
        <div class="select-none px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/60">
          Your Spaces
        </div>
        
        <!-- Scrollable Space List -->
        <div 
          class="space-y-0.5 max-h-[320px] overflow-y-auto px-1 scrollbar-thin scrollbar-thumb-border/20" 
          v-if="allSpaces && allSpaces.length"
        >
          <ContextMenu v-for="s in allSpaces" :key="s.id">
            <ContextMenuTrigger as-child>
              <DropdownMenuItem 
                class="group/item flex cursor-pointer items-center gap-3 rounded-xl border-0 p-2.5 transition-colors hover:bg-accent/50 focus:bg-accent/50 !ring-0"
                @select="handleSelect(s.id)"
              >
                <div 
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
                  :style="{ backgroundColor: s.color }"
                >
                  <component :is="getIcon(s.icon)" class="w-4 h-4" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="truncate text-xs font-semibold text-foreground">{{ s.name }}</p>
                    <div v-if="s.isDefault" class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" title="Default Workspace">
                      <Pin class="w-2.5 h-2.5 fill-current" />
                    </div>
                  </div>
                </div>

                <!-- Action Toggle (Settings vs Delete) -->
                <button 
                  v-if="!isDeleting"
                  @click.stop="openSettings(s)"
                  class="rounded-lg p-1.5 opacity-0 transition-all group-hover/item:opacity-100 hover:bg-muted"
                  title="Space Settings"
                >
                  <Settings class="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button 
                  v-else
                  @click.stop="handleDelete(s)"
                  class="rounded-lg p-1.5 text-destructive opacity-0 transition-all group-hover/item:opacity-100 hover:bg-destructive/10"
                  title="Delete Space"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </DropdownMenuItem>
            </ContextMenuTrigger>
            <ContextMenuContent class="z-[200] w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
              <ContextMenuItem @select="openSettings(s)" class="cursor-pointer rounded-xl px-3 py-2 text-xs font-medium">
                <Settings class="w-3.5 h-3.5 mr-2" />
                Edit Space Settings
              </ContextMenuItem>
              <ContextMenuItem 
                v-if="!s.isDefault"
                @select="handleSetDefault(s)" 
                class="cursor-pointer rounded-xl px-3 py-2 text-xs font-medium"
              >
                <Pin class="w-3.5 h-3.5 mr-2" />
                Mark as Default
              </ContextMenuItem>
              <ContextMenuItem 
                v-else
                disabled
                class="cursor-not-allowed rounded-xl px-3 py-2 text-xs font-medium opacity-50"
              >
                <Pin class="w-3.5 h-3.5 mr-2 fill-current" />
                Default Space
              </ContextMenuItem>
              <ContextMenuItem @select="copyJoinCode(s)" class="cursor-pointer rounded-xl px-3 py-2 text-xs font-medium">
                <Copy class="w-3.5 h-3.5 mr-2" />
                Copy Join Code
              </ContextMenuItem>
              <ContextMenuSeparator v-if="!s.isPersonal" class="bg-border my-1" />
              <ContextMenuItem v-if="!s.isPersonal" @select="openShareDialog(s)" class="cursor-pointer rounded-xl px-3 py-2 text-xs font-medium">
                <Share2 class="w-3.5 h-3.5 mr-2" />
                Share Space
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
        
        <DropdownMenuSeparator class="bg-border/50 mx-2 my-2" />
        
        <div class="space-y-0.5 px-1">
          <DropdownMenuItem 
            @select="showCreateDialog = true"
            class="flex items-center gap-3 rounded-xl border-0 p-2.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground !ring-0"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-border">
              <Plus class="w-4 h-4" />
            </div>
            <p class="text-[11px] font-semibold">Create New Space</p>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>

    <CreateSpaceDialog :open="showCreateDialog" @update:open="showCreateDialog = $event" />
    <SpaceSettingsDialog 
      :open="showSettingsDialog" 
      :space="selectedSpaceForSettings"
      @update:open="showSettingsDialog = $event" 
    />
    <ShareResourceDialog
      :open="showShareDialog"
      @update:open="showShareDialog = $event"
      :resource-id="selectedSpaceForShare?.id || null"
      resource-type="space"
    />
  </div>
</template>

<style scoped>
/* Custom scrollbar for the spaces list */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 10px;
}
</style>
