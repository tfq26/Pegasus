
<script setup lang="ts">
import { ref } from 'vue';
import { MessageSquare, Table, Database, X, Plus, FileSpreadsheet, Grid, Sparkles } from 'lucide-vue-next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  <div class="flex items-center h-9 border-b border-border bg-muted/40 px-2 overflow-x-auto">
    <!-- Tab List -->
    <TooltipProvider :delay-duration="100">
      <div class="flex items-center gap-1">
        <Tooltip v-for="tab in tabs" :key="tab.id">
          <TooltipTrigger as-child>
            <div 
              class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer select-none border border-transparent transition-colors group relative max-w-[150px]"
              :class="{
                'bg-background border-border border-b-background shadow-sm text-foreground': tab.id === activeTabId,
                'hover:bg-muted/80 text-muted-foreground hover:text-foreground': tab.id !== activeTabId
              }"
              @click="emit('update:activeTabId', tab.id)"
            >
              <!-- Icon based on type -->
              <component :is="getTabIcon(tab)" class="w-3.5 h-3.5 opacity-70" :class="{ 'text-green-600': tab.type === 'mockup' && tab.data?.isExcelSource, 'text-purple-500': tab.type === 'chat' }" />
              
              <span class="truncate font-medium">{{ tab.label }}</span>
              
              <!-- Minimal dirty indicator removed for simplicity -->
              
              <!-- Close Button (visible on hover or active) -->
              <button 
                class="ml-auto w-4 h-4 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20"
                :class="{ 'opacity-100': tab.id === activeTabId }"
                @click.stop="emit('close', tab.id)"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" class="text-[10px] px-2 py-1 bg-popover/95 backdrop-blur-sm border shadow-lg font-medium animate-in fade-in zoom-in-95 duration-100">
            {{ getTabTooltip(tab) }}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>

    <!-- Add New Tab Button (Immediately to the right) -->
    <div class="ml-1 shrink-0">
        <button 
          class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" 
          title="New Tab"
          @click.stop="addTab('default')"
        >
           <Plus class="w-4 h-4" />
        </button>
    </div>

    <!-- Spacer to fill the rest of the bar -->
    <div class="flex-1"></div>
  </div>
</template>
