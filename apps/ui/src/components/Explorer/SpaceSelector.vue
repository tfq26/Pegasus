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
  <div class="px-3 pt-4 pb-2">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          class="flex items-center gap-2.5 w-full p-2.5 rounded-2xl border border-border bg-card/40 hover:bg-muted/50 transition-all text-left group shadow-sm ring-1 ring-border/5"
        >
          <div 
            class="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-900/10 transition-transform group-hover:scale-105"
            :style="{ backgroundColor: activeSpace ? activeSpace.color : '#8B5CF6' }"
          >
            <component :is="getIcon(activeSpace?.icon || 'box')" class="w-5 h-5 pointer-events-none" />
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-[13px] font-bold truncate leading-none text-foreground mb-1">
              {{ activeSpace ? activeSpace.name : 'Select Space' }}
            </h4>
            <div class="flex items-center gap-1.5 opacity-60">
              <span class="text-[9px] uppercase tracking-[0.2em] font-black pointer-events-none">Data Space</span>
            </div>
          </div>
          <ChevronDown class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors mr-1" />
        </button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent class="w-64 bg-popover/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl z-[100] p-1.5" align="start" :side-offset="8">
        <div class="text-[10px] uppercase tracking-[0.25em] font-black text-muted-foreground/60 px-4 py-3 select-none">
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
                class="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-accent/50 focus:bg-accent/50 transition-colors rounded-xl border-0 !ring-0 group/item"
                @select="handleSelect(s.id)"
              >
                <div 
                  class="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                  :style="{ backgroundColor: s.color }"
                >
                  <component :is="getIcon(s.icon)" class="w-4 h-4" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="text-xs font-bold truncate text-foreground">{{ s.name }}</p>
                    <div v-if="s.isDefault" class="flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/10 text-purple-500 shrink-0" title="Default Workspace">
                      <Pin class="w-2.5 h-2.5 fill-current" />
                    </div>
                  </div>
                </div>

                <!-- Action Toggle (Settings vs Delete) -->
                <button 
                  v-if="!isDeleting"
                  @click.stop="openSettings(s)"
                  class="opacity-0 group-hover/item:opacity-100 p-1.5 rounded-lg hover:bg-muted transition-all"
                  title="Space Settings"
                >
                  <Settings class="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button 
                  v-else
                  @click.stop="handleDelete(s)"
                  class="opacity-0 group-hover/item:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-all"
                  title="Delete Space"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </DropdownMenuItem>
            </ContextMenuTrigger>
            <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground z-[200]">
              <ContextMenuItem @select="openSettings(s)" class="cursor-pointer">
                <Settings class="w-3.5 h-3.5 mr-2" />
                Edit Space Settings
              </ContextMenuItem>
              <ContextMenuItem 
                v-if="!s.isDefault"
                @select="handleSetDefault(s)" 
                class="cursor-pointer"
              >
                <Pin class="w-3.5 h-3.5 mr-2" />
                Mark as Default
              </ContextMenuItem>
              <ContextMenuItem 
                v-else
                disabled
                class="opacity-50 cursor-not-allowed"
              >
                <Pin class="w-3.5 h-3.5 mr-2 fill-current" />
                Default Space
              </ContextMenuItem>
              <ContextMenuItem @select="copyJoinCode(s)" class="cursor-pointer">
                <Copy class="w-3.5 h-3.5 mr-2" />
                Copy Join Code
              </ContextMenuItem>
              <ContextMenuSeparator v-if="!s.isPersonal" class="bg-border my-1" />
              <ContextMenuItem v-if="!s.isPersonal" @select="openShareDialog(s)" class="cursor-pointer">
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
            class="flex items-center gap-3 p-2.5 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors rounded-xl border-0 !ring-0"
          >
            <div class="w-8 h-8 rounded-lg border border-border border-dashed flex items-center justify-center shrink-0">
              <Plus class="w-4 h-4" />
            </div>
            <p class="text-[11px] font-bold">Create New Space</p>
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
/* Ensure the button feels premium */
button {
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

/* Custom scrollbar for the spaces list */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 10px;
}
</style>
