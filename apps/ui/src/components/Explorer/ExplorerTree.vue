<script setup lang="ts">
import { ref, computed } from 'vue'
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
  Loader2
} from 'lucide-vue-next'
import type { ConnectionEntry } from '@/lib/db-connections'
import { useExplorerSchema } from '@/composables/useExplorerSchema'

const props = defineProps<{
  connections: ConnectionEntry[]
  files?: any[]
  notes?: any[]
  spaces?: any[]
  selectedTable?: { connectionId: string; tableName: string } | null
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
}>()

const { schemaFor } = useExplorerSchema(computed(() => props.connections))

const selectedIds = ref<string[]>([])
const lastSelectedId = ref<string | null>(null)

function getTables(connId: string) {
  return schemaFor(connId).tables || []
}

function getDisplayName(connId: string, table: string) {
  return schemaFor(connId).tableMetadata?.[table]?.displayName || table
}

function getRowCount(connId: string, table: string): string | undefined {
  const meta = schemaFor(connId).tableMetadata?.[table] as any
  return meta?.rowCount
}

function getTableId(connId: string, table: string) {
  return `${connId}::${table}`
}

// Flatten all IDs for range selection
const allSelectableIds = computed(() => {
  const ids: string[] = []
  ids.push('root:db')
  props.connections.forEach(conn => {
    ids.push(conn.id)
    getTables(conn.id).forEach(table => ids.push(getTableId(conn.id, table)))
  })
  ids.push('root:files')
  props.files?.forEach(f => ids.push(`file:${f.id}`))
  ids.push('root:notes')
  props.notes?.forEach(n => ids.push(`note:${n.id}`))
  return ids
})

function handleSelect(id: string, event?: MouseEvent) {
  if (event?.shiftKey && lastSelectedId.value) {
    const all = allSelectableIds.value
    const start = all.indexOf(lastSelectedId.value)
    const end = all.indexOf(id)
    if (start !== -1 && end !== -1) {
      const range = all.slice(Math.min(start, end), Math.max(start, end) + 1)
      selectedIds.value = Array.from(new Set([...selectedIds.value, ...range]))
    }
  } else if (event?.ctrlKey || event?.metaKey) {
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
  
  emit('update:context', context)

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
    const conn = props.connections.find(c => c.id === id)
    if (conn) {
      emit('select-connection', conn)
    }
  }
}

const initialExpanded = computed(() => [
  'root:db', 
  'root:files', 
  'root:notes',
  ...props.connections.map(c => c.id)
])
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
</script>

<template>
  <div class="h-full w-full overflow-hidden">
    <Tree
      :elements="[]"
      :initial-selected-id="selectedTable ? getTableId(selectedTable.connectionId, selectedTable.tableName) : ''"
      :initial-expanded-items="initialExpanded"
      class="h-full w-full"
      @select="(id, ev) => handleSelect(id, ev)"
    >
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
                     <span>Databases</span>
                     <button 
                        @click.stop.prevent="emit('add-connection')" 
                        class="mr-2 p-0.5 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
                        title="Add Connection"
                     >
                        <Plus class="w-3.5 h-3.5" />
                     </button>
                  </div>
               </template>
              <div v-if="connections.length === 0" class="pl-6 py-1 text-xs text-muted-foreground italic">
                 No connections
              </div>
              
              <!-- Connection Loop -->
              <ContextMenu v-for="conn in connections" :key="conn.id">
                <ContextMenuTrigger as-child>
                  <Folder
                    :id="conn.id"
                    :name="conn.nickname"
                    open-icon="lucide:database"
                    close-icon="lucide:database"
                    :is-select="selectedIds.includes(conn.id)"
                    class="group/folder ml-0"
                  >
                    <template #label>
                       <span class="truncate">{{ conn.nickname }}</span>
                       <div v-if="!conn.space" class="inline-flex items-center ml-2" title="Unassigned Connection">
                           <AlertTriangle class="w-3.5 h-3.5 text-amber-500/80" />
                       </div>
                       <div v-else class="inline-flex items-center ml-2" title="Synced & Healthy">
                           <CheckCircle2 class="w-3.5 h-3.5 text-emerald-500/80" />
                       </div>
                    </template>
                    <ContextMenu v-for="table in getTables(conn.id)" :key="getTableId(conn.id, table)">
                      <ContextMenuTrigger as-child>
                        <File
                          :id="getTableId(conn.id, table)"
                          :name="table"
                          file-icon="lucide:table"
                          :is-select="selectedIds.includes(getTableId(conn.id, table))"
                          class="group"
                        >
                          <div class="flex items-center justify-between w-full pr-2 overflow-hidden">
                              <div class="flex items-center gap-1.5 min-w-0">
                                <span class="truncate">{{ getDisplayName(conn.id, table) }}</span>
                                <CheckCircle2 class="w-3 h-3 text-muted-foreground/30" />
                              </div>
                              <span 
                                v-if="getRowCount(conn.id, table)"
                                class="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ml-2"
                              >
                                  {{ getRowCount(conn.id, table) }}
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
                     <span>Files</span>
                     <button 
                        @click.stop.prevent="emit('upload-file')" 
                        class="mr-2 p-0.5 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
                        title="Upload File"
                     >
                        <Plus class="w-3.5 h-3.5" />
                     </button>
                  </div>
               </template>
                <div v-if="!files?.length" class="pl-6 py-1 text-xs text-muted-foreground italic">
                    No files
                </div>
                <ContextMenu v-for="file in files" :key="file.id">
                    <ContextMenuTrigger as-child>
                        <File 
                            :id="`file:${file.id}`" 
                            :name="file.filename"
                            file-icon="lucide:file-text"
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
                     <span>Notes</span>
                     <button 
                        @click.stop.prevent="emit('add-note')" 
                        class="mr-2 p-0.5 rounded-sm hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
                        title="New Note"
                     >
                        <Plus class="w-3.5 h-3.5" />
                     </button>
                  </div>
               </template>
                <div v-if="!notes?.length" class="pl-6 py-1 text-xs text-muted-foreground italic">
                    No notes
                 </div>
                 <ContextMenu v-for="note in notes" :key="note.id">
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
