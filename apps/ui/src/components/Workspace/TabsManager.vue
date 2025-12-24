
<script setup lang="ts">
import { ref, watch } from 'vue';
import { MessageSquare, Table, Database, X, Plus } from 'lucide-vue-next';

export interface Tab {
  id: string;
  label: string;
  type: 'chat' | 'query' | 'table';
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

const isDropdownOpen = ref(false);
const plusButtonRef = ref<HTMLButtonElement | null>(null);
const dropdownStyle = ref<any>({});

const updatePosition = () => {
    if (!plusButtonRef.value) return;
    const rect = plusButtonRef.value.getBoundingClientRect();
    dropdownStyle.value = {
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
    };
}

const toggleDropdown = () => {
  if (!isDropdownOpen.value) {
      updatePosition();
      isDropdownOpen.value = true;
  } else {
      isDropdownOpen.value = false;
  }
};

const closeDropdown = () => {
  isDropdownOpen.value = false;
};

const addTab = (type: Tab['type']) => {
  emit('add', type);
  isDropdownOpen.value = false;
};

</script>

<template>
  <div class="flex items-center h-10 border-b border-border bg-muted/40 px-2 overflow-x-auto">
    <!-- Tab List -->
    <div class="flex items-center gap-1 flex-1">
      <div 
        v-for="tab in tabs" 
        :key="tab.id"
        class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer select-none border border-transparent transition-colors group relative max-w-[150px]"
        :class="{
          'bg-background border-border border-b-background shadow-sm text-foreground': tab.id === activeTabId,
          'hover:bg-muted/80 text-muted-foreground hover:text-foreground': tab.id !== activeTabId
        }"
        @click="emit('update:activeTabId', tab.id)"
      >
        <!-- Icon based on type -->
        <MessageSquare v-if="tab.type === 'chat'" class="w-3 h-3 opacity-70" />
        <Table v-else-if="tab.type === 'table'" class="w-3 h-3 opacity-70" />
        <Database v-else-if="tab.type === 'query'" class="w-3 h-3 opacity-70" />
        
        <span class="truncate font-medium">{{ tab.label }}</span>
        
        <!-- Close Button (visible on hover or active) -->
        <button 
          class="ml-auto w-4 h-4 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20"
          :class="{ 'opacity-100': tab.id === activeTabId }"
          @click.stop="emit('close', tab.id)"
        >
          <X class="w-3 h-3" />
        </button>
      </div>

      <!-- Add New Tab Dropdown Trigger -->
      <div class="relative">
        <button 
          ref="plusButtonRef"
          class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" 
          title="New Tab"
          @click.stop="toggleDropdown"
        >
           <Plus class="w-4 h-4" />
        </button>
      </div>
    </div>
    
    <!-- Teleport dropdown to body to escape stacking context -->
    <Teleport to="body">
      <!-- Backdrop to close dropdown -->
      <div 
        v-show="isDropdownOpen" 
        class="fixed inset-0 z-[9998]"
        @click="closeDropdown"
      ></div>
      
      <!-- Dropdown Menu -->
      <div 
        v-show="isDropdownOpen"
        :style="dropdownStyle"
        class="fixed w-32 bg-popover border border-border rounded-md shadow-lg z-[9999] flex flex-col py-1"
      >
        <button 
          v-for="type in (['chat', 'table', 'query'] as const)" 
          :key="type"
          class="px-3 py-1.5 text-xs text-left hover:bg-muted capitalize"
          @click="addTab(type)"
        >
          New {{ type }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
