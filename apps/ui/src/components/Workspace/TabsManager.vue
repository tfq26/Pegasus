
<script setup lang="ts">
import { MessageSquare, Table, Database, X, Plus, Grid, Sparkles } from 'lucide-vue-next';

export interface Tab {
  id: string;
  label: string;
  type: 'chat' | 'query' | 'table' | 'default' | 'mockup';
  data?: {
      tableName?: string;
      connection?: any;
      provider?: string;
      headers?: string[];
      schemaMode?: string;
      versions?: Array<{ version: number; table: string; created_at: string; reason?: string }>;
      currentVersion?: number;
      originalTable?: string;
      content?: string; // For query/chat
      [key: string]: any;
  }; 
}

const props = defineProps<{
  tabs: Tab[];
  activeTabId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:activeTabId', id: string): void;
  (e: 'close', id: string): void;
  (e: 'add', type: Tab['type']): void;
}>();

const addTab = (type: Tab['type']) => {
  emit('add', type);
};


const getTabTooltip = (tab: Tab) => {
  if (tab.type === 'chat') return 'AI Chat Instance';
  if (tab.type === 'query') return 'Formula / SQL Playground';
  
  const data = tab.data;
  if (!data) return tab.label;

  const connection = data.connection;
  const connectionName = connection?.alias || connection?.nickname || connection?.host || connection?.database || connection?.provider || 'Local Data';
  const tableName = data.tableName || tab.label;
  
  return `${tableName} @ ${connectionName}`;
};

const getTabIcon = (tab: Tab) => {
  if (tab.type === 'chat') return MessageSquare;
  if (tab.type === 'query') return Database;
  if (tab.type === 'table') return Table;
  if (tab.type === 'mockup') {
    if (tab.data?.isExcelSource) return Grid;
    if (tab.data?.isSavedView) return Sparkles;
    return Table;
  }
  return Table;
};

</script>

<template>
  <div class="border-b border-border/60 bg-background/78 px-2 py-1.5 backdrop-blur-xl">
    <div class="flex items-center gap-1.5 overflow-x-auto">
        <div class="flex items-center gap-1">
        <div v-for="tab in tabs" :key="tab.id">
            <div 
              class="group relative flex max-w-[170px] cursor-pointer select-none items-center gap-2 rounded-[16px] border px-2.5 py-1.5 text-xs transition-all duration-200"
              :class="{
                'border-border/70 bg-card/85 text-foreground shadow-[0_8px_20px_-18px_rgba(15,23,42,0.45)]': tab.id === activeTabId,
                'border-transparent bg-transparent text-muted-foreground hover:border-border/50 hover:bg-muted/35 hover:text-foreground': tab.id !== activeTabId
              }"
              @click="emit('update:activeTabId', tab.id)"
            >
              <span
                class="absolute inset-y-2 left-0.5 w-px rounded-full transition-opacity"
                :class="tab.id === activeTabId ? 'bg-primary/90 opacity-100' : 'bg-transparent opacity-0 group-hover:opacity-40'"
              ></span>

              <div
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted/35"
                :class="{
                  'text-primary': tab.id === activeTabId,
                  'text-emerald-600': tab.type === 'mockup' && tab.data?.isExcelSource,
                  'text-violet-500': tab.type === 'chat'
                }"
              >
                <component :is="getTabIcon(tab)" class="h-3.5 w-3.5" />
              </div>

              <div class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium leading-none">{{ tab.label }}</span>
              </div>

              <button 
                class="ml-auto flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/80 opacity-0 transition hover:bg-muted hover:text-foreground"
                :class="{ 'opacity-100': tab.id === activeTabId }"
                @click.stop="emit('close', tab.id)"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
        </div>
        </div>

      <div class="ml-1 shrink-0">
        <button 
          class="flex h-8 w-8 items-center justify-center rounded-[16px] border border-dashed border-border/60 bg-transparent text-muted-foreground transition hover:border-border hover:bg-muted/35 hover:text-foreground" 
          title="New Tab"
          @click.stop="addTab('default')"
        >
           <Plus class="w-4 h-4" />
        </button>
      </div>

      <div class="flex-1"></div>
    </div>
  </div>
</template>
