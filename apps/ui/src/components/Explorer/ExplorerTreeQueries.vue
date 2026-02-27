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
              @click="(ev: MouseEvent) => handleSelect(`chat:${chat.id}`, ev)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ chat.title || 'Untitled Chat' }}</span>
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('delete-chat', chat)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
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
              @click="(ev: MouseEvent) => handleSelect(`query:${q.id}`, ev)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ q.query }}</span>
                <span class="text-[9px] text-muted-foreground ml-auto bg-muted px-1 rounded">{{ new Date(q.timestamp).toLocaleTimeString() }}</span>
              </div>
            </File>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-48 bg-popover border-border text-popover-foreground">
            <ContextMenuItem @select="emit('delete-query', q.id)" class="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10">
              <Trash class="w-3.5 h-3.5 mr-2" />
              Delete Query
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Folder>
    </ContextMenuTrigger>
  </ContextMenu>
</template>
