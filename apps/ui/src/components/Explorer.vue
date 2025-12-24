<script setup lang="ts">
import { ref, toRefs } from 'vue'
import { toast } from 'vue-sonner'
import { Database, Plus, Trash, Search, Sparkles } from 'lucide-vue-next'
import { useStorage } from '@vueuse/core'

// UI Components
import AddConnectionModal from '@/components/AddConnectionModal.vue'
import ConnectionItem from './Explorer/ConnectionItem.vue'
import ChatHistoryList from './Explorer/ChatHistoryList.vue'
import QueryLogList from './Explorer/QueryLogList.vue'
import DataViewerModal from './Explorer/DataViewerModal.vue'
import RenameTableDialog from './Explorer/RenameTableDialog.vue'

// UI Parts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Composables & Libs
import { useExplorerSchema } from '@/composables/useExplorerSchema'
import { useDataViewer } from '@/composables/useDataViewer'
import type { ConnectionEntry } from '@/lib/db-connections'
import { 
  deleteChat, clearAllChats, 
  deleteConnection as apiDeleteConnection,
  renameTable as apiRenameTable,
  deleteTable as apiDeleteTable
} from '@/lib/api'

const props = defineProps<{
  connections: ConnectionEntry[]
  selectedConnectionId: string
  chats?: any[]
  selectedChatId?: string
  queryHistory?: any[]
}>()

const emit = defineEmits<{
  'update:selectedConnectionId': [value: string]
  'edit-table': [connection: ConnectionEntry, table: string]
  'create-chat': []
  'select-chat': [id: string]
  'load-query': [query: string]
  'sanitize-table': [connection: ConnectionEntry, table: string]
}>()

// --- State & Composables ---
const { connections } = toRefs(props)
const { 
  connectionSchemas, 
  schemaFor, 
  refreshSchemas 
} = useExplorerSchema(connections)

const {
  viewer,
  zoomLevel,
  zoomClass,
  searchQuery,
  sortColumn,
  sortDirection,
  openViewer,
  loadPage,
  closeViewer,
  toggleSort
} = useDataViewer()

// Persistent Zoom State for the Modal
const persistentZoom = useStorage('pegasus-viewer-zoom', 1)
zoomLevel.value = persistentZoom.value

const sidebarTabs = ['data', 'chats', 'queries'] as const
const activeTab = ref<typeof sidebarTabs[number]>('data')
const addConnectionModalOpen = ref(false)

// --- Rename Logic ---
const renamingTable = ref<{ conn: ConnectionEntry; oldName: string; newName: string } | null>(null)

const startRenameTable = (conn: ConnectionEntry, table: string) => {
  renamingTable.value = { conn, oldName: table, newName: table }
}

const confirmRename = async (newName: string) => {
  if (!renamingTable.value) return
  try {
    await apiRenameTable(renamingTable.value.conn, renamingTable.value.oldName, newName)
    toast.success('Table renamed successfully')
    renamingTable.value = null
    refreshSchemas()
  } catch (err: any) {
    toast.error('Failed to rename table', { description: err.message })
  }
}

// --- Delete Table Logic ---
const deleteDialogOpen = ref(false)
const tableToDelete = ref<{ conn: ConnectionEntry; table: string } | null>(null)

const handleDeleteTable = (conn: ConnectionEntry, table: string) => {
  tableToDelete.value = { conn, table }
  deleteDialogOpen.value = true
}

const confirmDeleteTable = async () => {
  if (!tableToDelete.value) return
  try {
    await apiDeleteTable(tableToDelete.value.conn, tableToDelete.value.table)
    toast.success('Table deleted')
    deleteDialogOpen.value = false
    refreshSchemas()
  } catch (err: any) {
    toast.error('Failed to delete table', { description: err.message })
  }
}

// --- Delete Connection Logic ---
const deleteConnectionDialogOpen = ref(false)
const connectionToDelete = ref<ConnectionEntry | null>(null)
const deleteConfirmationText = ref('')

const handleDeleteConnection = (conn: ConnectionEntry) => {
  connectionToDelete.value = conn
  deleteConfirmationText.value = ''
  deleteConnectionDialogOpen.value = true
}

const confirmDeleteConnection = async () => {
  if (!connectionToDelete.value) return
  
  if (deleteConfirmationText.value !== connectionToDelete.value.nickname) {
    toast.error('Confirmation text does not match')
    return
  }

  try {
    await apiDeleteConnection(connectionToDelete.value.id)
    toast.success('Connection removed')
    deleteConnectionDialogOpen.value = false
    window.location.reload()
  } catch (err: any) {
    toast.error('Failed to remove connection', { description: err.message })
  }
}

// --- Chat Logic ---
const deleteChatDialogOpen = ref(false)
const chatToDelete = ref<any>(null)
const clearAllChatsDialogOpen = ref(false)

const startDeleteChat = (chat: any) => {
  chatToDelete.value = chat
  deleteChatDialogOpen.value = true
}

const confirmDeleteChat = async () => {
  if (!chatToDelete.value) return
  try {
    await deleteChat(chatToDelete.value.id)
    toast.success('Deleted session')
    deleteChatDialogOpen.value = false
    window.location.reload()
  } catch (err: any) {
    toast.error('Failed to delete session', { description: err.message })
  }
}

const confirmClearAllChats = async () => {
  try {
    await clearAllChats()
    toast.success('History cleared')
    clearAllChatsDialogOpen.value = false
    window.location.reload()
  } catch (err: any) {
    toast.error('Failed to clear history', { description: err.message })
  }
}
</script>

<template>
  <aside 
    class="flex flex-col h-full bg-[#0a0a0b] border-r border-stone-800/50 w-80 shrink-0"
  >
    <!-- Header -->
    <header class="p-4 border-b border-stone-800/50">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Explorer</h2>
        <div class="flex items-center gap-1.5 p-1 bg-stone-900/60 rounded-xl border border-stone-800/50">
          <button
            v-for="tab in sidebarTabs"
            :key="tab"
            @click="activeTab = tab"
            class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
            :class="[
              activeTab === tab 
                ? 'bg-stone-800 text-stone-100 shadow-sm ring-1 ring-stone-700/50' 
                : 'text-stone-500 hover:text-stone-300'
            ]"
          >
            {{ tab }}
          </button>
        </div>
      </div>
    </header>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden p-3 scrollbar-hide">
      <!-- DATA TAB -->
      <section v-if="activeTab === 'data'" class="space-y-4">
        <div class="flex items-center justify-between px-1 mb-2">
          <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Connections</h3>
          <button 
            @click="addConnectionModalOpen = true"
            class="p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-violet-400 hover:bg-stone-800 transition-all group"
            title="Add Database"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </div>

        <div v-if="!connections.length" class="py-12 text-center space-y-4">
          <div class="w-12 h-12 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto opacity-50">
            <Database class="w-6 h-6 text-stone-700" />
          </div>
          <div class="space-y-1">
            <p class="text-[10px] font-bold uppercase tracking-widest text-stone-600">No connections</p>
            <button @click="addConnectionModalOpen = true" class="text-[9px] font-bold uppercase tracking-widest text-violet-500 hover:text-violet-400">Add first database</button>
          </div>
        </div>

        <div class="space-y-3">
          <ConnectionItem 
            v-for="conn in connections"
            :key="conn.id"
            :connection="conn"
            :selected="selectedConnectionId === conn.id"
            :schema="schemaFor(conn.id)"
            @select="(id) => emit('update:selectedConnectionId', id)"
            @delete="handleDeleteConnection"
            @table-click="(c, t) => emit('edit-table', c, t)"
            @preview-table="openViewer"
            @edit-table="(c, t) => emit('edit-table', c, t)"
            @rename-table="startRenameTable"
            @delete-table="handleDeleteTable"
          />
        </div>
      </section>

      <!-- CHATS TAB -->
      <ChatHistoryList 
        v-if="activeTab === 'chats'"
        :chats="chats"
        :selected-chat-id="selectedChatId"
        @select-chat="(id) => emit('select-chat', id)"
        @create-chat="emit('create-chat')"
        @clear-all="clearAllChatsDialogOpen = true"
        @delete-chat="startDeleteChat"
      />

      <!-- QUERIES TAB -->
      <QueryLogList 
        v-if="activeTab === 'queries'"
        :query-history="queryHistory"
        @load-query="(q) => emit('load-query', q)"
      />
    </div>

    <!-- Viewer & Dialogs -->
    <Teleport to="body">
      <DataViewerModal 
        :viewer="viewer"
        :zoom-level="zoomLevel"
        :zoom-classes="['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl']"
        :search-query="searchQuery"
        :sort-column="sortColumn"
        :sort-direction="sortDirection"
        @update:search-query="(v) => searchQuery = v"
        @close="closeViewer"
        @increase-zoom="() => zoomLevel < 4 && zoomLevel++"
        @decrease-zoom="() => zoomLevel > 0 && zoomLevel--"
        @toggle-sort="toggleSort"
        @page-change="loadPage"
        @limit-change="(limit) => loadPage(1, limit)"
      />

      <RenameTableDialog 
        :renaming-table="renamingTable"
        @cancel="renamingTable = null"
        @confirm="confirmRename"
      />

      <!-- Delete Table Confirmation -->
      <Dialog :open="deleteDialogOpen" @update:open="(v) => !v && (deleteDialogOpen = false)">
        <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-md rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Delete Table</DialogTitle>
                <DialogDescription class="text-stone-500 text-sm mt-1.5 font-medium">
                  This action is permanent and cannot be undone.
                </DialogDescription>
              </div>
            </div>
            
            <p class="text-sm text-stone-400 leading-relaxed pt-2">
              Are you sure you want to delete <span class="text-stone-200 font-code font-bold underline decoration-rose-500/30 underline-offset-4">{{ tableToDelete?.table }}</span>? All data associated with this table will be purged.
            </p>
          </div>

          <DialogFooter class="bg-stone-900/40 p-4 border-t border-stone-800 flex items-center justify-end gap-3 px-6">
            <button 
              @click="deleteDialogOpen = false" 
              class="px-4 py-2 rounded-lg text-stone-400 hover:text-white text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button 
              @click="confirmDeleteTable" 
              class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-950/20 transition-all active:scale-95"
            >
              Delete Table
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Delete Connection Confirmation -->
      <Dialog :open="deleteConnectionDialogOpen" @update:open="(v) => !v && (deleteConnectionDialogOpen = false)">
        <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-md rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-5">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <Database class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Remove Connection</DialogTitle>
                <DialogDescription class="text-stone-500 text-sm mt-1.5 font-medium">
                  Disconnecting from the database.
                </DialogDescription>
              </div>
            </div>
            
            <div class="space-y-4">
              <p class="text-sm text-stone-400 leading-relaxed">
                You are about to remove <span class="text-stone-200 font-bold underline underline-offset-4 decoration-amber-500/30">{{ connectionToDelete?.nickname }}</span>. This will remove access in Pegasus but won't delete actual data.
              </p>
              
              <div class="space-y-2">
                <label class="text-[10px] uppercase tracking-widest font-bold text-stone-500 px-1">Type nickname to confirm</label>
                <input 
                  v-model="deleteConfirmationText"
                  type="text"
                  :placeholder="connectionToDelete?.nickname"
                  class="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2.5 text-sm text-stone-200 placeholder:text-stone-700 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-medium"
                />
              </div>
            </div>
          </div>

          <DialogFooter class="bg-stone-900/40 p-4 border-t border-stone-800 flex items-center justify-end gap-3 px-6">
            <button 
              @click="deleteConnectionDialogOpen = false" 
              class="px-4 py-2 rounded-lg text-stone-400 hover:text-white text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button 
              @click="confirmDeleteConnection" 
              :disabled="deleteConfirmationText !== connectionToDelete?.nickname"
              class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg shadow-rose-950/20 transition-all active:scale-95"
            >
              Remove Connection
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Deleting Session Confirmation -->
      <Dialog :open="deleteChatDialogOpen" @update:open="(v) => !v && (deleteChatDialogOpen = false)">
        <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Delete Session</DialogTitle>
                <DialogDescription class="text-stone-500 text-sm mt-1.5 font-medium">
                  This cannot be undone.
                </DialogDescription>
              </div>
            </div>
            <p class="text-sm text-stone-400 leading-relaxed">
              Are you sure you want to delete this chat session?
            </p>
          </div>
          <DialogFooter class="bg-stone-900/40 p-4 border-t border-stone-800 flex items-center justify-end gap-3 px-6">
            <button @click="deleteChatDialogOpen = false" class="px-4 py-2 rounded-lg text-stone-400 hover:text-white text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmDeleteChat" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Clear All History Confirmation -->
      <Dialog :open="clearAllChatsDialogOpen" @update:open="(v) => !v && (clearAllChatsDialogOpen = false)">
        <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-xl p-0 overflow-hidden shadow-2xl">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
                <Trash class="w-5 h-5" />
              </div>
              <div>
                <DialogTitle class="text-lg font-semibold leading-none">Clear History</DialogTitle>
                <DialogDescription class="text-stone-500 text-sm mt-1.5 font-medium">
                  All sessions will be lost.
                </DialogDescription>
              </div>
            </div>
            <p class="text-sm text-stone-400 leading-relaxed">
              Are you sure you want to clear your entire chat history?
            </p>
          </div>
          <DialogFooter class="bg-stone-900/40 p-4 border-t border-stone-800 flex items-center justify-end gap-3 px-6">
            <button @click="clearAllChatsDialogOpen = false" class="px-4 py-2 rounded-lg text-stone-400 hover:text-white text-sm font-semibold transition-colors">Cancel</button>
            <button @click="confirmClearAllChats" class="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all active:scale-95">Clear All</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddConnectionModal 
        :open="addConnectionModalOpen"
        @update:open="(v) => addConnectionModalOpen = v"
        @saved="refreshSchemas"
      />
    </Teleport>
  </aside>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
