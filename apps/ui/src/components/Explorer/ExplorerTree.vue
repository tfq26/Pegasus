<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Tree } from '@/components/ui/file-tree';
import type { ConnectionEntry } from '@/lib/db-connections';

// Sub-components
import ExplorerTreeFavorites from './ExplorerTreeFavorites.vue';
import ExplorerTreeConnections from './ExplorerTreeConnections.vue';
import ExplorerTreeDataViews from './ExplorerTreeDataViews.vue';
import ExplorerTreeNotes from './ExplorerTreeNotes.vue';
import ExplorerTreeQueries from './ExplorerTreeQueries.vue';

// Composables
import { useExplorerSchema } from '@/composables/useExplorerSchema';
import { useFavorites } from '@/composables/useFavorites';
import { useExplorerTreeSelection, type SelectionItem } from '@/composables/useExplorerTreeSelection';
import { useExplorerHelpers } from '@/composables/useExplorerHelpers';
import { useExplorerFiltering } from '@/composables/useExplorerFiltering';

const props = defineProps<{
  connections: ConnectionEntry[]
  files?: any[]
  notes?: any[]
  spaces?: any[]
  chats?: any[]
  queryHistory?: any[]
  querySessions?: any[]
  dataViews?: any[]
  selectedTable?: { connectionId: string; tableName: string } | null
  searchFilter?: string
  isDeleteMode?: boolean
}>();

const emit = defineEmits<{
  'select-table': [connection: ConnectionEntry, table: string]
  'select-connection': [connection: ConnectionEntry]
  'select-file': [file: any]
  'select-note': [note: any]
  'select-chat': [id: string]
  'select-data-view': [view: any]
  'selection-change': [items: SelectionItem[]]
  'update:context': [context: string]
  'add-connection': []
  'add-note': []
  'add-data-view': []
  'upload-file': []
  'preview-table': [conn: ConnectionEntry, table: string]
  'rename-table': [conn: ConnectionEntry, table: string]
  'explain-table': [conn: ConnectionEntry, table: string]
  'generate-data': [conn: ConnectionEntry, table: string]
  'delete-table': [conn: ConnectionEntry, table: string]
  'delete-connection': [conn: ConnectionEntry]
  'move-connection': [conn: ConnectionEntry, spaceId: string]
  'health-check': [conn: ConnectionEntry]
  'add-table': [conn: ConnectionEntry]
  'delete-file': [file: any]
  'delete-files': [files: any[]]
  'delete-note': [note: any]
  'delete-notes': [notes: any[]]
  'delete-data-view': [view: any]
  'delete-chat': [chat: any]
  'delete-chats': [chats: any[]]
  'create-chat': []
  'load-query': [query: string]
  'delete-query': [id: string]
  'delete-queries': [queries: any[]]
  'select-session': [session: any]
  'delete-session': [session: any]
  'add-note-to-dashboard': [note: any]
  'refresh-table-details': [conn: ConnectionEntry, table: string]
}>();

// --- Logic Extractions ---
const { schemaFor } = useExplorerSchema(computed(() => props.connections));
const { favorites, isFavorite, toggleFavorite } = useFavorites();
const { getTableId, getProviderIcon } = useExplorerHelpers();

const favoriteItems = computed(() => {
  return favorites.value.map(id => {
    const conn = props.connections.find(c => c.id === id);
    if (conn) return { type: 'connection', id, name: conn.nickname || (conn as any).alias, icon: getProviderIcon(conn) };
    
    if (id.includes('::')) {
       const [connId, ...tableParts] = id.split('::');
       const tableName = tableParts.join('::');
       const c = props.connections.find(conn => conn.id === connId);
       if (c) return { type: 'table', id, name: tableName, icon: 'lucide:table-2' };
    }

    if (id.startsWith('note:')) {
      const noteId = id.replace('note:', '');
      const note = props.notes?.find(n => n.id === noteId);
      if (note) return { type: 'note', id, name: note.title || 'Untitled', icon: 'lucide:sticky-note' };
    }

    if (id.startsWith('chat:')) {
      const chatId = id.replace('chat:', '');
      const chat = props.chats?.find(c => c.id === chatId);
      if (chat) return { type: 'chat', id, name: chat.title || 'Untitled', icon: 'lucide:message-circle' };
    }

    if (id.startsWith('view:') || id.startsWith('sheet:')) {
      const viewId = id.replace(/^(view|sheet):/, '');
      const view = props.dataViews?.find((v: any) => v.id === viewId);
      if (view) return { type: 'sheet', id, name: view.name || 'Untitled View', icon: 'lucide:database' };
    }
    
    return null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);
});

const {
  selectedIds,
  handleSelect,
  handleKeyDown
} = useExplorerTreeSelection({ ...props, favoriteItems: favoriteItems.value } as any, emit);

const {
  filteredConnections,
  filteredChats,
  filteredQueries,
  filteredFiles,
  filteredNotes,
  filteredDataViews
} = useExplorerFiltering(props);

// --- Local Helpers ---
const getFilteredTables = (connId: string) => {
  const schema = schemaFor(connId);
  if (schema.status !== 'success') return [];
  const q = (props.searchFilter || '').toLowerCase().trim();
  if (!q) return schema.tables;
  return schema.tables.filter(t => t.toLowerCase().includes(q));
};

const getDisplayName = (connId: string, table: string) => {
  const schema = schemaFor(connId);
  return schema.tableMetadata?.[table]?.displayName || table;
};

const getRowCount = (connId: string, table: string): number | undefined => {
  const conn = props.connections.find(c => c.id === connId);
  return (conn as any)?.tableStats?.[table]?.rowCount;
};

const treeRef = ref<HTMLElement | null>(null);
const initialExpanded = computed(() => []);
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
      <ExplorerTreeFavorites 
        :favorite-items="favoriteItems" 
        :selected-ids="selectedIds"
        @select="handleSelect"
        @toggle-favorite="toggleFavorite"
      />

      <ExplorerTreeConnections 
        :connections="connections"
        :filtered-connections="filteredConnections"
        :spaces="spaces"
        :selected-ids="selectedIds"
        :is-favorite="isFavorite"
        :get-filtered-tables="getFilteredTables"
        :get-display-name="getDisplayName"
        :get-row-count="getRowCount"
        @select="handleSelect"
        @add-connection="emit('add-connection')"
        @preview-table="(c, t) => emit('preview-table', c, t)"
        @select-table="(c, t) => emit('select-table', c, t)"
        @rename-table="(c, t) => emit('rename-table', c, t)"
        @explain-table="(c, t) => emit('explain-table', c, t)"
        @generate-data="(c, t) => emit('generate-data', c, t)"
        @delete-table="(c, t) => emit('delete-table', c, t)"
        @add-table="c => emit('add-table', c)"
        @move-connection="(c, s) => emit('move-connection', c, s)"
        @health-check="c => emit('health-check', c)"
        @delete-connection="c => emit('delete-connection', c)"
        @toggle-favorite="toggleFavorite"
        @refresh-table-details="(conn, table) => emit('refresh-table-details', conn, table)"
      />

      <ExplorerTreeDataViews 
        :filtered-data-views="filteredDataViews"
        :selected-ids="selectedIds"
        @select="handleSelect"
        @add-data-view="emit('add-data-view')"
        @delete-data-view="v => emit('delete-data-view', v)"
      />

      <ExplorerTreeQueries 
        :filtered-queries="filteredQueries"
        :filtered-chats="filteredChats"
        :query-sessions="querySessions"
        :selected-ids="selectedIds"
        @select="handleSelect"
        @create-chat="emit('create-chat')"
        @delete-chat="c => emit('delete-chat', c)"
        @load-query="q => emit('load-query', q)"
        @delete-query="id => emit('delete-query', id)"
        @select-session="s => emit('select-session', s)"
        @delete-session="s => emit('delete-session', s)"
      />

      <ExplorerTreeNotes 
        :filtered-files="filteredFiles"
        :filtered-notes="filteredNotes"
        :selected-ids="selectedIds"
        @select="handleSelect"
        @upload-file="emit('upload-file')"
        @delete-file="f => emit('delete-file', f)"
        @add-note="emit('add-note')"
        @add-note-to-dashboard="n => emit('add-note-to-dashboard', n)"
        @delete-note="n => emit('delete-note', n)"
      />
    </Tree>
  </div>
</template>
