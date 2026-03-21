<script setup lang="ts">
import { Folder, File } from '@/components/ui/file-tree';
import { 
  ContextMenu, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuSeparator,
  ContextMenuTrigger 
} from '@/components/ui/context-menu';
import { Database, Eye, Trash, MessageSquarePlus, Plus } from 'lucide-vue-next';

const props = defineProps<{
  filteredQueries?: any[];
  filteredChats?: any[];
  querySessions?: any[];
  selectedIds: string[];
}>();

const emit = defineEmits<{
  'select': [id: string, event?: MouseEvent];
  'create-chat': [];
  'delete-chat': [chat: any];
  'load-query': [query: string];
  'delete-query': [id: string];
  'select-session': [session: any];
  'delete-session': [session: any];
}>();

function handleSelect(id: string, event?: MouseEvent) {
  emit('select', id, event);
}
</script>

<template>
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
              <span v-if="filteredChats?.length" class="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ filteredChats.length }}</span>
            </div>
            <button 
              @click.stop.prevent="emit('create-chat')" 
              class="mr-1 flex h-6 w-6 items-center justify-center rounded-lg border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border/60 hover:bg-background hover:text-foreground group-hover:opacity-100"
              title="New Chat"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </template>
        
        <div v-if="!filteredChats?.length" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/45 px-4 py-6 text-center">
          <MessageSquarePlus class="mb-2 h-8 w-8 text-muted-foreground/30" />
          <p class="text-xs font-medium text-muted-foreground">Start a conversation</p>
        </div>

        <ContextMenu v-for="chat in filteredChats" :key="chat.id">
          <ContextMenuTrigger as-child>
            <File 
              :id="`chat:${chat.id}`" 
              :name="chat.title || 'Untitled Chat'"
              file-icon="lucide:message-circle"
              :is-select="selectedIds.includes(`chat:${chat.id}`)"
              @click="(ev: MouseEvent) => handleSelect(`chat:${chat.id}`, ev)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ chat.title || 'Untitled Chat' }}</span>
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
            <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium text-rose-500 focus:bg-rose-500/10 focus:text-rose-500" @select="emit('delete-chat', chat)">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete Chat
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
      <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium" @select="emit('create-chat')">
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
          <span class="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ querySessions.length }}</span>
        </div>
      </template>
    <ContextMenu v-for="session in querySessions" :key="session.id">
      <ContextMenuTrigger as-child>
        <File 
          :id="`session:${session.id}`" 
          :name="session.name || 'Untitled Session'"
          file-icon="lucide:database"
          :is-select="selectedIds.includes(`session:${session.id}`)"
          @click="(ev: MouseEvent) => handleSelect(`session:${session.id}`, ev)"
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
              <span v-if="filteredQueries?.length" class="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{{ filteredQueries.length }}</span>
            </div>
          </div>
        </template>
        
        <div v-if="!filteredQueries?.length" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/45 px-4 py-6 text-center">
          <p class="text-xs font-medium text-muted-foreground">No query history</p>
        </div>

        <ContextMenu v-for="q in filteredQueries" :key="q.id">
          <ContextMenuTrigger as-child>
            <File 
              :id="`query:${q.id}`" 
              :name="q.query"
              file-icon="lucide:code-2"
              :is-select="selectedIds.includes(`query:${q.id}`)"
              @click="(ev: MouseEvent) => handleSelect(`query:${q.id}`, ev)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ q.query }}</span>
                <span class="ml-auto rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{{ new Date(q.timestamp).toLocaleTimeString() }}</span>
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl">
            <ContextMenuItem class="rounded-xl px-3 py-2 text-xs font-medium text-rose-500 focus:bg-rose-500/10 focus:text-rose-500" @select="emit('delete-query', q.id)">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete Query
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
  </ContextMenu>
</template>
