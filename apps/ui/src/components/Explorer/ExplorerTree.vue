<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Tree, Folder, File } from '@/components/ui/file-tree'
import { 
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { 
  Edit, 
  Eye, 
  Trash, 
  Sparkles,
  Activity,
  FileText,
  StickyNote,
  Plus,
  Upload,
  Database,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  FolderPlus,
  MessageSquarePlus,
  FilePlus,
  NotebookPen,
  LayoutDashboard,
  Star
} from 'lucide-vue-next'
import type { ConnectionEntry } from '@/lib/db-connections'
import { useExplorerSchema } from '@/composables/useExplorerSchema'
import { useFavorites } from '@/composables/useFavorites'

const props = defineProps<{
  connections: ConnectionEntry[]
  files?: any[]
  notes?: any[]
  spaces?: any[]
  chats?: any[]
  queryHistory?: any[]
  querySessions?: any[]
  sheets?: any[]
  selectedTable?: { connectionId: string; tableName: string } | null
  searchFilter?: string
  isDeleteMode?: boolean
}>()

const emit = defineEmits<{
  'select-table': [connection: ConnectionEntry, table: string]
  'select-connection': [connection: ConnectionEntry]
  'select-file': [file: any]
  'select-note': [note: any]
  'preview-table': [connection: ConnectionEntry, table: string]
  'rename-table': [connection: ConnectionEntry, table: string]
  'delete-table': [connection: ConnectionEntry, table: string]
  'explain-table': [connection: ConnectionEntry, table: string]
  'generate-data': [connection: ConnectionEntry, table: string]
  'delete-connection': [connection: ConnectionEntry]
  'add-table': [connection: ConnectionEntry]
  'add-connection': []
  'upload-file': []
  'add-note': []
  'health-check': [connection: ConnectionEntry]
  'update:context': [context: string]
  'move-connection': [connection: ConnectionEntry, spaceId: string]
  'delete-file': [file: any]
  'delete-note': [note: any]
  'selection-change': [items: { type: string, id: string }[]]
  'delete-files': [files: any[]]
  'delete-notes': [notes: any[]]

  // Sheets
  'select-sheet': [sheet: any]
  'delete-sheet': [sheet: any]
  'add-sheet': []

  // Chats
  'select-chat': [id: string]
  'delete-chat': [chat: any]
  'create-chat': []
  'delete-chats': [chats: any[]]

  // Queries
  'load-query': [query: string]
  'delete-query': [id: string]
  'delete-queries': [queries: any[]]
  'select-session': [session: any]
  'delete-session': [session: any]
  'add-note-to-dashboard': [note: any]
  
  // Drag & Drop
  'reorder-favorites': [fromIndex: number, toIndex: number]
}>()

const { schemaFor } = useExplorerSchema(computed(() => props.connections))

const selectedIds = ref<string[]>([])
const lastSelectedId = ref<string | null>(null)

// --- Favorites ---
const { favorites, isFavorite, toggleFavorite, reorderFavorites } = useFavorites()

// Build favorite items from IDs
const favoriteItems = computed(() => {
  const items = favorites.value.map(id => {
    // Connection
    const conn = props.connections.find(c => c.id === id)
    if (conn) return { type: 'connection', id, name: conn.nickname || (conn as any).alias, icon: getProviderIcon(conn) }
    
    // Table (format: connId::tableName)
    if (id.includes('::')) {
      const [connId, tableName] = id.split('::')
      return { type: 'table', id, name: tableName, icon: 'lucide:table' }
    }
    
    // File
    if (id.startsWith('file:')) {
      const fileId = id.replace('file:', '')
      const file = props.files?.find(f => f.id === fileId)
      if (file) return { type: 'file', id, name: file.filename, icon: 'lucide:file-text' }
    }
    
    // Note
    if (id.startsWith('note:')) {
      const noteId = id.replace('note:', '')
      const note = props.notes?.find(n => n.id === noteId)
      if (note) return { type: 'note', id, name: note.title, icon: 'lucide:sticky-note' }
    }
    
    // Sheet
    if (id.startsWith('sheet:')) {
      const sheetId = id.replace('sheet:', '')
      const sheet = props.sheets?.find(s => s.id === sheetId)
      if (sheet) return { type: 'sheet', id, name: sheet.name, icon: 'lucide:grid' }
    }
    
    // Chat
    if (id.startsWith('chat:')) {
      const chatId = id.replace('chat:', '')
      const chat = props.chats?.find(c => c.id === chatId)
      if (chat) return { type: 'chat', id, name: chat.title || 'Untitled', icon: 'lucide:message-circle' }
    }
    
    return null
  })
  return items.filter((item): item is NonNullable<typeof item> => item !== null)
})

function getTables(connId: string) {
  return schemaFor(connId).tables || []
}

// --- Search Filtering ---
const normalizeSearch = (str: string) => str.toLowerCase().trim()

const filteredConnections = computed(() => {
  const q = normalizeSearch(props.searchFilter || '')
  if (!q) return props.connections
  return props.connections.filter(conn => {
    const connName = (conn.nickname || (conn as any).alias || '').toLowerCase()
    if (connName.includes(q)) return true
    // Also check if any table matches
    const tables = getTables(conn.id)
    return tables.some(t => t.toLowerCase().includes(q))
  })
})

const filteredFiles = computed(() => {
  const q = normalizeSearch(props.searchFilter || '')
  if (!q) return props.files || []
  return (props.files || []).filter(f => 
    (f.filename || f.name || '').toLowerCase().includes(q)
  )
})

const filteredNotes = computed(() => {
  const q = normalizeSearch(props.searchFilter || '')
  if (!q) return props.notes || []
  return (props.notes || []).filter(n => 
    (n.title || '').toLowerCase().includes(q) ||
    (n.content || '').toLowerCase().includes(q)
  )
})

const filteredSheets = computed(() => {
  const q = normalizeSearch(props.searchFilter || '')
  if (!q) return props.sheets || []
  return (props.sheets || []).filter(s => 
    (s.name || s.title || '').toLowerCase().includes(q)
  )
})

const filteredChats = computed(() => {
  const q = normalizeSearch(props.searchFilter || '')
  if (!q) return props.chats || []
  return (props.chats || []).filter(c => 
    (c.title || c.name || '').toLowerCase().includes(q)
  )
})

const filteredQueries = computed(() => {
  const q = normalizeSearch(props.searchFilter || '')
  if (!q) return props.queryHistory || []
  return (props.queryHistory || []).filter(qh => 
    (qh.query || '').toLowerCase().includes(q)
  )
})

function getFilteredTables(connId: string) {
  const q = normalizeSearch(props.searchFilter || '')
  const tables = getTables(connId)
  if (!q) return tables
  return tables.filter(t => t.toLowerCase().includes(q))
}

function getDisplayName(connId: string, table: string) {
  return schemaFor(connId).tableMetadata?.[table]?.displayName || table
}

function getRowCount(connId: string, table: string): number | undefined {
  const meta = schemaFor(connId).tableMetadata?.[table] as any
  const count = meta?.rowCount
  if (count === undefined || count === null) return undefined
  return typeof count === 'number' ? count : parseInt(count, 10)
}

function formatRowCount(count: number | undefined): string | undefined {
  if (count === undefined) return undefined
  if (count < 1000) return `${count}`
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count)
}

function getTableId(connId: string, table: string) {
  return `${connId}::${table}`
}

function isExcelOrCsv(conn: ConnectionEntry): boolean {
  const p = conn.provider || (conn as any).type
  if (p !== 'duckdb' && p !== 'file' && p !== 'sqlite') return false
  
  const c = conn as any
  // Check ALL potential text fields for extension hints
  const searchStr = [
    c.nickname, 
    c.alias, 
    c.name, 
    c.path, 
    c.config?.path,
    c.config?.filename,
    c.duckdb?.path,
    c.sqlite?.path,
    c.file?.path
  ].filter(Boolean).join(' ').toLowerCase()
  
  if (searchStr.includes('.xlsx') || searchStr.includes('.xls') || searchStr.includes('.csv')) {
    return true
  }

  // If it's a DuckDB connection without an obvious extension, it's almost 
  // certainly a file-based connection in this app's context (e.g. from an upload)
  if (p === 'duckdb' && (c.isLocked || c.isVirtual)) {
    return true
  }
  
  return false
}

function getProviderIcon(conn: ConnectionEntry): string {
  if (isExcelOrCsv(conn)) return 'excel'
  
  const p = conn.provider
  if (p === 'mysql') return '/icons/mysql/mysql.svg'
  if (p === 'postgres' || p === 'surrealdb') return '/icons/postgres/postgres.svg'
  if (p === 'sqlite') return '/icons/sqlite/sqlite.svg'
  if (p === 'mongodb') {
    const url = conn.mongodb?.url?.toLowerCase() || ''
    if (url.includes('documents.azure.com') || url.includes('cosmos.azure.com')) {
      return '/icons/microsoft/Azure/azure-2.svg'
    }
    return '/icons/mongo/mongo-svgrepo-com.svg'
  }
  if (p === 'kusto' || p === 'cosmosdb') return '/icons/microsoft/Azure/azure-2.svg'
  if (p === 'bigquery') return '/icons/google/GCP/icons8-google-cloud.svg'
  if (p === 'dynamodb') return '/icons/aws/aws-colored-black-text.svg'
  
  // Fallback for names
  const name = (conn.nickname || conn.alias || '').toLowerCase()
  if (name.includes('azure') || name.includes('cosmos') || name.includes('kusto')) {
    return '/icons/microsoft/Azure/azure-2.svg'
  }
  
  return 'lucide:database'
}

function getTableIcon(conn: ConnectionEntry): string {
  return 'lucide:table'
}

function getFileIcon(filename: string): string {
  const name = filename.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return '/icons/microsoft/Excel/excel-file-svgrepo-com.svg'
  }
  if (name.endsWith('.json')) {
    return '/icons/json/json-file-svgrepo-com.svg'
  }
  if (name.endsWith('.xml')) {
    return '/icons/xml/xml-svgrepo-com.svg'
  }
  return 'lucide:file-text'
}

// Flatten all IDs for range selection
const allSelectableIds = computed(() => {
  const ids: string[] = []
  if (favoriteItems.value.length > 0) ids.push('root:favorites')
  ids.push('root:db')
  props.connections.forEach(conn => {
    ids.push(conn.id)
    getTables(conn.id).forEach(table => ids.push(getTableId(conn.id, table)))
  })
  ids.push('root:files')
  props.files?.forEach(f => ids.push(`file:${f.id}`))
  ids.push('root:notes')
  props.notes?.forEach(n => ids.push(`note:${n.id}`))
  ids.push('root:sheets')
  props.sheets?.forEach(s => ids.push(`sheet:${s.id}`))
  ids.push('root:chats')
  props.chats?.forEach(c => ids.push(`chat:${c.id}`))
  ids.push('root:queries')
  props.queryHistory?.forEach(q => ids.push(`query:${q.id}`))
  return ids
})

// --- Keyboard Navigation ---
const focusedIndex = ref(0)
const treeRef = ref<HTMLElement | null>(null)

function handleKeyDown(event: KeyboardEvent) {
  const ids = allSelectableIds.value
  if (ids.length === 0) return

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault()
      focusedIndex.value = Math.min(focusedIndex.value + 1, ids.length - 1)
      const nextId = ids[focusedIndex.value]
      if (nextId) handleSelect(nextId)
      break
    }
    case 'ArrowUp': {
      event.preventDefault()
      focusedIndex.value = Math.max(focusedIndex.value - 1, 0)
      const prevId = ids[focusedIndex.value]
      if (prevId) handleSelect(prevId)
      break
    }
    case 'Enter': {
      event.preventDefault()
      const currentId = ids[focusedIndex.value]
      if (currentId) handleSelect(currentId)
      break
    }
    case 'Delete':
    case 'Backspace':
      // Trigger delete for selected items (existing selection handles this)
      break
    case 'n':
      if (!event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        emit('add-note')
      }
      break
    case 'c':
      if (!event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        emit('create-chat')
      }
      break
    case 'f':
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault()
        // Focus search - parent component handles this
      }
      break
  }
}

// Focus management
onMounted(() => {
  // Optional: auto-focus the tree on mount
})

function handleSelect(id: string, event?: MouseEvent) {
    if (id.startsWith('session:')) {
        const sessionId = id.replace('session:', '')
        const session = props.querySessions?.find(s => s.id === sessionId)
        if (session) emit('select-session', session)
    }
  if (event?.shiftKey && lastSelectedId.value && !props.isDeleteMode) {
    const all = allSelectableIds.value
    const start = all.indexOf(lastSelectedId.value)
    const end = all.indexOf(id)
    if (start !== -1 && end !== -1) {
      const range = all.slice(Math.min(start, end), Math.max(start, end) + 1)
      selectedIds.value = Array.from(new Set([...selectedIds.value, ...range]))
    }
  } else if (event?.ctrlKey || event?.metaKey || props.isDeleteMode) {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter(i => i !== id)
    } else {
      selectedIds.value.push(id)
    }
  } else {
    selectedIds.value = [id]
  }
  
  lastSelectedId.value = id

  // Emit selection change
  const selectedItems = selectedIds.value.map(sid => {
    if (sid.startsWith('file:')) return { type: 'file', id: sid.replace('file:', '') }
    if (sid.startsWith('note:')) return { type: 'note', id: sid.replace('note:', '') }
    if (sid.startsWith('chat:')) return { type: 'chat', id: sid.replace('chat:', '') }
    if (sid.startsWith('query:')) return { type: 'query', id: sid.replace('query:', '') }

    if (sid.includes('::')) {
       const [connId, ...tableParts] = sid.split('::')
       return { type: 'table', id: sid, connectionId: connId, tableName: tableParts.join('::') }
    }
    if (props.connections.some(c => c.id === sid)) return { type: 'connection', id: sid }
    return null
  }).filter(Boolean) as any[]
  
  emit('selection-change', selectedItems)

  // Determine context based on selection
  let context = 'db'
  if (id.startsWith('root:files') || id.startsWith('file:')) context = 'files'
  else if (id.startsWith('root:notes') || id.startsWith('note:')) context = 'notes'
  else if (id.startsWith('root:sheets') || id.startsWith('sheet:')) context = 'sheets'
  else if (id.startsWith('root:chats') || id.startsWith('chat:')) context = 'chats'
  else if (id.startsWith('root:queries') || id.startsWith('query:')) context = 'queries'
  
  emit('update:context', context)

  // Stop here if in Delete Mode (do not open items)
  if (props.isDeleteMode) return

  if (id.startsWith('file:')) {
    const fileId = id.replace('file:', '')
    const file = props.files?.find(f => f.id === fileId)
    if (file) emit('select-file', file)
    return
  }
  
  if (id.startsWith('note:')) {
    const noteId = id.replace('note:', '')
    const note = props.notes?.find(n => n.id === noteId)
    if (note) emit('select-note', note)
    return
  }

  if (id.includes('::')) {
    const [connId, ...tableParts] = id.split('::')
    const tableName = tableParts.join('::')
    const conn = props.connections.find(c => c.id === connId)
    if (conn) {
      emit('select-table', conn, tableName)
    }
  } else {
  // Handle new types
  if (id.startsWith('sheet:')) {
    const sheetId = id.replace('sheet:', '')
    const sheet = props.sheets?.find(s => s.id === sheetId)
    if (sheet) emit('select-sheet', sheet)
    return
  }

  if (id.startsWith('chat:')) {
    const chatId = id.replace('chat:', '')
    emit('select-chat', chatId)
    return
  }
  
  if (id.startsWith('query:')) {
    const qId = id.replace('query:', '')
    const q = props.queryHistory?.find(q => q.id === qId)
    if (q) emit('load-query', q.query) 
    return
  }

  const conn = props.connections.find(c => c.id === id)
    if (conn) {
      emit('select-connection', conn)
    }
  }
}

const initialExpanded = computed(() => [])
const handleDeleteFile = (file: any) => {
  const isSelected = selectedIds.value.includes(`file:${file.id}`)
  const fileItems = selectedIds.value
    .filter(id => id.startsWith('file:'))
    .map(id => {
       const fid = id.replace('file:', '')
       return props.files?.find(f => f.id === fid)
    })
    .filter(Boolean)

  if (isSelected && fileItems.length > 1) {
    emit('delete-files', fileItems)
  } else {
    emit('delete-file', file)
  }
}

const handleDeleteNote = (note: any) => {
  const isSelected = selectedIds.value.includes(`note:${note.id}`)
  const noteItems = selectedIds.value
    .filter(id => id.startsWith('note:'))
    .map(id => {
       const nid = id.replace('note:', '')
       return props.notes?.find(n => n.id === nid)
    })
    .filter(Boolean)

  if (isSelected && noteItems.length > 1) {
    emit('delete-notes', noteItems)
  } else {
    emit('delete-note', note)
  }
}

const handleDeleteChat = (chat: any) => {
  const isSelected = selectedIds.value.includes(`chat:${chat.id}`)
  const chatItems = selectedIds.value
    .filter(id => id.startsWith('chat:'))
    .map(id => {
       const cid = id.replace('chat:', '')
       return props.chats?.find(c => c.id === cid)
    })
    .filter(Boolean)

  if (isSelected && chatItems.length > 1) {
    emit('delete-chats', chatItems)
  } else {
    emit('delete-chat', chat)
  }
}

const handleDeleteQuery = (id: string) => {
  const isSelected = selectedIds.value.includes(`query:${id}`)
  const queryItems = selectedIds.value
    .filter(sid => sid.startsWith('query:'))
    .map(sid => {
       const qid = sid.replace('query:', '')
       return props.queryHistory?.find(q => q.id === qid)
    })
    .filter(Boolean)

  if (isSelected && queryItems.length > 1) {
    emit('delete-queries', queryItems)
  } else {
    emit('delete-query', id)
  }
}
</script>

<template>
  <div 
    ref="treeRef"
    class="h-full w-full overflow-hidden focus:outline-none"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <Tree
      :elements="[]"
      :initial-selected-id="selectedTable ? getTableId(selectedTable.connectionId, selectedTable.tableName) : ''"
      :initial-expanded-items="initialExpanded"
      :is-delete-mode="isDeleteMode"
      class="h-full w-full"
      @select="(id, ev) => handleSelect(id, ev)"
    >
      <!-- FAVORITES ROOT -->
      <Folder
        v-if="favoriteItems.length > 0"
        id="root:favorites"
        name="Favorites"
        open-icon="lucide:star"
        close-icon="lucide:star"
        class="font-medium"
      >
        <template #label>
          <div class="flex items-center gap-2">
            <Star class="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span class="text-foreground">Favorites</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">{{ favoriteItems.length }}</span>
          </div>
        </template>
        <ContextMenu v-for="item in favoriteItems" :key="item.id">
          <ContextMenuTrigger as-child>
            <File
              :id="item.id"
              :name="item.name"
              :file-icon="item.icon"
              :is-select="selectedIds.includes(item.id)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ item.name }}</span>
                <Star class="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="toggleFavorite(item.id)" class="text-amber-600">
              <Star class="w-3.5 h-3.5 mr-2" />
              Remove from Favorites
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>

      <!-- DATABASES ROOT -->
      <ContextMenu>
        <ContextMenuTrigger as-child>
           <Folder 
              id="root:db" 
              name="Databases" 
              open-icon="lucide:database" 
              close-icon="lucide:database"
              class="font-medium group"
           >
               <template #label>
                  <div class="flex items-center justify-between w-full">
                     <div class="flex items-center gap-2">
                        <span class="text-foreground">Databases</span>
                        <span v-if="filteredConnections.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{{ filteredConnections.length }}</span>
                     </div>
                     <button 
                        @click.stop.prevent="emit('add-connection')" 
                        class="mr-1 p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        title="Add Connection"
                     >
                        <Plus class="w-4 h-4" />
                     </button>
                  </div>
               </template>
              <div v-if="filteredConnections.length === 0" class="flex flex-col items-center justify-center py-6 px-4 text-center">
                 <Database class="w-10 h-10 text-muted-foreground/30 mb-2" />
                 <p class="text-xs text-muted-foreground mb-2">No database connections yet</p>
                 <button 
                    @click="emit('add-connection')" 
                    class="text-xs text-primary hover:underline flex items-center gap-1"
                 >
                    <FolderPlus class="w-3.5 h-3.5" /> Add your first connection
                 </button>
              </div>
              
              <!-- Connection Loop -->
              <ContextMenu v-for="conn in filteredConnections" :key="conn.id">
                <ContextMenuTrigger as-child>
                  <Folder
                    :id="conn.id"
                    :name="conn.alias || conn.nickname"
                    :open-icon="getProviderIcon(conn)"
                    :close-icon="getProviderIcon(conn)"
                    :is-select="selectedIds.includes(conn.id)"
                    class="group/folder ml-0"
                  >
                    <template #label>
                       <div class="flex items-center gap-2 overflow-hidden">
                           <span class="truncate font-semibold" :title="conn.alias ? `Original: ${conn.nickname}` : conn.nickname">
                               {{ conn.alias || conn.nickname }}
                           </span>
                       </div>
                       <div v-if="!conn.space" class="inline-flex items-center ml-2" title="Unassigned Connection">
                           <AlertTriangle class="w-3.5 h-3.5 text-amber-500/80" />
                       </div>
                       <div v-else class="inline-flex items-center ml-2" title="Synced & Healthy">
                           <CheckCircle2 class="w-3.5 h-3.5 text-emerald-500/80" />
                       </div>
                    </template>
                    <ContextMenu v-for="table in getFilteredTables(conn.id)" :key="getTableId(conn.id, table)">
                      <ContextMenuTrigger as-child>
                        <File
                          :id="getTableId(conn.id, table)"
                          :name="table"
                          :file-icon="getTableIcon(conn)"
                          :is-select="selectedIds.includes(getTableId(conn.id, table))"
                          class="group"
                        >
                          <div class="flex items-center justify-between w-full pr-2 overflow-hidden">
                              <div class="flex items-center gap-1.5 min-w-0">
                                <span class="truncate">{{ getDisplayName(conn.id, table) }}</span>
                                <Star v-if="isFavorite(getTableId(conn.id, table))" class="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                              </div>
                              <span 
                                v-if="getRowCount(conn.id, table) !== undefined"
                                class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap ml-2"
                              >
                                  {{ formatRowCount(getRowCount(conn.id, table)) }}
                              </span>
                          </div>
                        </File>
                      </ContextMenuTrigger>
                      <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                         <ContextMenuItem @select="emit('preview-table', conn, table)">
                            <Eye class="w-3.5 h-3.5 mr-2" />
                            Preview Data
                         </ContextMenuItem>
                         <ContextMenuItem @select="emit('select-table', conn, table)">
                            <Edit class="w-3.5 h-3.5 mr-2" />
                            Open in Editor
                         </ContextMenuItem>
                         <ContextMenuItem @select="toggleFavorite(getTableId(conn.id, table))" :class="isFavorite(getTableId(conn.id, table)) ? 'text-amber-600' : ''">
                            <Star class="w-3.5 h-3.5 mr-2" :class="isFavorite(getTableId(conn.id, table)) ? 'fill-amber-500 text-amber-500' : ''" />
                            {{ isFavorite(getTableId(conn.id, table)) ? 'Remove from Favorites' : 'Add to Favorites' }}
                         </ContextMenuItem>
                         <ContextMenuSeparator class="bg-border my-1" />
                         <ContextMenuItem @select="emit('rename-table', conn, table)">
                            Rename Table...
                         </ContextMenuItem>
                         <ContextMenuItem @select="emit('explain-table', conn, table)">
                            <Sparkles class="w-3.5 h-3.5 mr-2 text-purple-500" />
                            Explain Table (AI)
                         </ContextMenuItem>
                         <ContextMenuItem @select="emit('generate-data', conn, table)">
                            <Sparkles class="w-3.5 h-3.5 mr-2 text-indigo-500" />
                            Generate Test Data (AI)
                         </ContextMenuItem>
                         <ContextMenuSeparator class="bg-border my-1" />
                         <ContextMenuItem @select="emit('delete-table', conn, table)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                            <Trash class="w-3.5 h-3.5 mr-2" />
                            Delete Table
                         </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </Folder>
                </ContextMenuTrigger>
                <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                    <ContextMenuItem @select="emit('add-table', conn)">
                       <Plus class="w-3.5 h-3.5 mr-2" />
                       Add Table
                    </ContextMenuItem>
                    
                    <ContextMenuSub v-if="spaces && spaces.length > 0">
                        <ContextMenuSubTrigger>
                            Move to Space
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent class="w-48 bg-popover border-border text-popover-foreground p-1">
                            <ContextMenuItem 
                                v-for="space in spaces" 
                                :key="space.id"
                                @select="emit('move-connection', conn, space.id)"
                            >
                                {{ space.name }}
                            </ContextMenuItem>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    
                    <ContextMenuSeparator class="bg-border my-1" />

                    <ContextMenuItem @select="emit('health-check', conn)">
                       <Activity class="w-3.5 h-3.5 mr-2 text-emerald-500" />
                       Health Check
                    </ContextMenuItem>
                    <ContextMenuSeparator class="bg-border my-1" />
                    <ContextMenuItem @select="emit('delete-connection', conn)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                       <Trash class="w-3.5 h-3.5 mr-2" />
                       Remove Connection
                    </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
           </Folder>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('add-connection')">
               <Plus class="w-3.5 h-3.5 mr-2" />
               Add Connection
            </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      
      <!-- SHEETS ROOT -->
      <ContextMenu>
        <ContextMenuTrigger as-child>
            <Folder 
                id="root:sheets" 
                name="Sheets" 
                open-icon="lucide:grid" 
                close-icon="lucide:grid"
                :is-select="selectedIds.includes('root:sheets')"
                class="font-medium group"
            >
                <template #label>
                  <div class="flex items-center justify-between w-full">
                     <div class="flex items-center gap-2">
                        <span class="text-foreground">Sheets</span>
                        <span v-if="filteredSheets?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">{{ filteredSheets.length }}</span>
                     </div>
                  </div>
               </template>
                <div v-if="!filteredSheets?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
                    <p class="text-xs text-muted-foreground">No spreadsheets</p>
                </div>
                <!-- Sheets Loop -->
                <ContextMenu v-for="sheet in filteredSheets" :key="sheet.id">
                    <ContextMenuTrigger as-child>
                        <File 
                            :id="`sheet:${sheet.id}`" 
                            :name="sheet.name"
                            file-icon="lucide:grid"
                            :is-select="selectedIds.includes(`sheet:${sheet.id}`)"
                        >
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="truncate">{{ sheet.name }}</span>
                            </div>
                        </File>
                    </ContextMenuTrigger>
                    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                        <ContextMenuItem @select="emit('delete-sheet', sheet)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                            <Trash class="w-3.5 h-3.5 mr-2" />
                            Delete Sheet
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Folder>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
             <ContextMenuItem @select="emit('add-sheet')">
               <Plus class="w-3.5 h-3.5 mr-2" />
               New Sheet
            </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

       <!-- CHATS ROOT -->
       <ContextMenu>
        <ContextMenuTrigger as-child>
            <Folder 
                id="root:chats" 
                name="Chats" 
                open-icon="lucide:message-square" 
                close-icon="lucide:message-square"
                :is-select="selectedIds.includes('root:chats')"
                class="font-medium group"
            >
                <template #label>
                  <div class="flex items-center justify-between w-full">
                     <div class="flex items-center gap-2">
                        <span class="text-foreground">Chats</span>
                        <span v-if="filteredChats?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">{{ filteredChats.length }}</span>
                     </div>
                     <button 
                        @click.stop.prevent="emit('create-chat')" 
                        class="mr-1 p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        title="New Chat"
                     >
                        <Plus class="w-4 h-4" />
                     </button>
                  </div>
               </template>
                <div v-if="!filteredChats?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
                    <MessageSquarePlus class="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p class="text-xs text-muted-foreground">Start a conversation</p>
                </div>
                <ContextMenu v-for="chat in filteredChats" :key="chat.id">
                    <ContextMenuTrigger as-child>
                        <File 
                            :id="`chat:${chat.id}`" 
                            :name="chat.title || 'Untitled Chat'"
                            file-icon="lucide:message-circle"
                            :is-select="selectedIds.includes(`chat:${chat.id}`)"
                        >
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="truncate">{{ chat.title || 'Untitled Chat' }}</span>
                            </div>
                        </File>
                    </ContextMenuTrigger>
                    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                        <ContextMenuItem @select="handleDeleteChat(chat)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                            <Trash class="w-3.5 h-3.5 mr-2" />
                            Delete Chat
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Folder>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
             <ContextMenuItem @select="emit('create-chat')">
               <Plus class="w-3.5 h-3.5 mr-2" />
               New Chat
            </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

            <!-- QUERY SESSIONS -->
            <Folder 
                v-if="querySessions && querySessions.length > 0"
                id="root:query-sessions" 
                name="Query Sessions"
                class="font-medium"
            >
                <template #label>
                    <div class="flex items-center gap-2">
                        <Database class="w-3.5 h-3.5 text-violet-500" />
                        <span class="text-foreground">Query Sessions</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">{{ querySessions.length }}</span>
                    </div>
                </template>
                <ContextMenu v-for="session in querySessions" :key="session.id">
                    <ContextMenuTrigger as-child>
                        <File 
                            :id="`session:${session.id}`" 
                            :name="session.name || 'Untitled Session'"
                            icon="lucide:database"
                            class="text-xs"
                            :is-selected="selectedIds.includes(`session:${session.id}`)"
                        />
                    </ContextMenuTrigger>
                    <ContextMenuContent class="w-48 bg-background border border-border/50 shadow-xl rounded-xl p-1 backdrop-blur-xl">
                        <ContextMenuItem @select="emit('select-session', session)" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm transition-colors outline-none cursor-pointer">
                            <Eye class="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Open Session</span>
                        </ContextMenuItem>
                        <ContextMenuSeparator class="h-px bg-border/50 my-1 mx-2" />
                        <ContextMenuItem @select="emit('delete-session', session)" class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-rose-500/10 text-rose-500 text-sm transition-colors outline-none cursor-pointer">
                            <Trash class="w-3.5 h-3.5" />
                            <span>Delete Session</span>
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Folder>

            <!-- QUERIES ROOT -->
            <ContextMenu>
                <ContextMenuTrigger as-child>
                    <Folder 
                        id="root:queries" 
                name="Queries" 
                open-icon="lucide:scroll-text" 
                close-icon="lucide:scroll-text"
                :is-select="selectedIds.includes('root:queries')"
                class="font-medium group"
            >
                <template #label>
                  <div class="flex items-center justify-between w-full">
                     <div class="flex items-center gap-2">
                        <span class="text-foreground">Queries</span>
                        <span v-if="filteredQueries?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">{{ filteredQueries.length }}</span>
                     </div>
                  </div>
               </template>
                <div v-if="!filteredQueries?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
                    <p class="text-xs text-muted-foreground">No query history</p>
                </div>
                <ContextMenu v-for="q in filteredQueries" :key="q.id">
                    <ContextMenuTrigger as-child>
                        <File 
                            :id="`query:${q.id}`" 
                            :name="q.query"
                            file-icon="lucide:code-2"
                            :is-select="selectedIds.includes(`query:${q.id}`)"
                        >
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="truncate">{{ q.query }}</span>
                                <span class="text-[9px] text-muted-foreground ml-auto bg-muted px-1 rounded">{{ new Date(q.timestamp).toLocaleTimeString() }}</span>
                            </div>
                        </File>
                    </ContextMenuTrigger>
                    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                        <ContextMenuItem @select="handleDeleteQuery(q.id)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                            <Trash class="w-3.5 h-3.5 mr-2" />
                            Delete Query
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Folder>
        </ContextMenuTrigger>
      </ContextMenu>

      <!-- FILES ROOT -->
      <ContextMenu>
        <ContextMenuTrigger as-child>
            <Folder 
                id="root:files" 
                name="Files" 
                open-icon="lucide:folder-open" 
                close-icon="lucide:folder"
                :is-select="selectedIds.includes('root:files')"
                class="font-medium group"
            >
                <template #label>
                  <div class="flex items-center justify-between w-full">
                     <div class="flex items-center gap-2">
                        <span class="text-foreground">Files</span>
                        <span v-if="filteredFiles?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">{{ filteredFiles.length }}</span>
                     </div>
                     <button 
                        @click.stop.prevent="emit('upload-file')" 
                        class="mr-1 p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        title="Upload File"
                     >
                        <Upload class="w-4 h-4" />
                     </button>
                  </div>
               </template>
                <div v-if="!filteredFiles?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
                    <FilePlus class="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p class="text-xs text-muted-foreground">Drop files here or click to upload</p>
                </div>
                <ContextMenu v-for="file in filteredFiles" :key="file.id">
                    <ContextMenuTrigger as-child>
                        <File 
                            :id="`file:${file.id}`" 
                            :name="file.filename"
                            :file-icon="getFileIcon(file.filename)"
                            :is-select="selectedIds.includes(`file:${file.id}`)"
                        >
                            <div class="flex items-center justify-between w-full pr-2 overflow-hidden">
                                <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="truncate">{{ file.filename }}</span>
                                    <CheckCircle2 class="w-3 h-3 text-emerald-500/50" />
                                </div>
                                <span class="text-[9px] text-muted-foreground ml-2">
                                     {{ (file.file_size_bytes / 1024).toFixed(0) }} KB
                                </span>
                            </div>
                        </File>
                    </ContextMenuTrigger>
                    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                        <ContextMenuItem @select="handleDeleteFile(file)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                            <Trash class="w-3.5 h-3.5 mr-2" />
                            Delete File
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Folder>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('upload-file')">
               <Upload class="w-3.5 h-3.5 mr-2" />
               Upload File
            </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <!-- NOTES ROOT -->
      <ContextMenu>
        <ContextMenuTrigger as-child>
            <Folder 
                id="root:notes" 
                name="Notes" 
                open-icon="lucide:notebook" 
                close-icon="lucide:notebook"
                :is-select="selectedIds.includes('root:notes')"
                class="font-medium group"
            >
                <template #label>
                  <div class="flex items-center justify-between w-full">
                     <div class="flex items-center gap-2">
                        <span class="text-foreground">Notes</span>
                        <span v-if="filteredNotes?.length" class="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">{{ filteredNotes.length }}</span>
                     </div>
                     <button 
                        @click.stop.prevent="emit('add-note')" 
                        class="mr-1 p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        title="New Note"
                     >
                        <Plus class="w-4 h-4" />
                     </button>
                  </div>
               </template>
                <div v-if="!filteredNotes?.length" class="flex flex-col items-center justify-center py-4 px-4 text-center">
                    <NotebookPen class="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p class="text-xs text-muted-foreground">Create your first note</p>
                </div>
                 <ContextMenu v-for="note in filteredNotes" :key="note.id">
                    <ContextMenuTrigger as-child>
                        <File 
                            :id="`note:${note.id}`" 
                            :name="note.title"
                            file-icon="lucide:sticky-note"
                            :is-select="selectedIds.includes(`note:${note.id}`)"
                        >
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="truncate">{{ note.title }}</span>
                                <CheckCircle2 class="w-3 h-3 text-emerald-500/50" />
                            </div>
                        </File>
                    </ContextMenuTrigger>
                    <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
                        <ContextMenuItem @select="emit('add-note-to-dashboard', note)">
                            <LayoutDashboard class="w-3.5 h-3.5 mr-2" />
                            Add to Dashboard
                        </ContextMenuItem>
                        <ContextMenuSeparator class="bg-border my-1" />
                        <ContextMenuItem @select="emit('delete-note', note)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
                            <Trash class="w-3.5 h-3.5 mr-2" />
                            Delete Note
                        </ContextMenuItem>
                    </ContextMenuContent>
                 </ContextMenu>
            </Folder>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('add-note')">
               <Plus class="w-3.5 h-3.5 mr-2" />
               New Note
            </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

    </Tree>
  </div>
</template>
