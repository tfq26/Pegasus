<script setup lang="ts">
import { ref } from 'vue'
import { Database, Trash, Table2, Layers } from 'lucide-vue-next'
import type { ConnectionEntry } from '@/lib/db-connections'
import type { ConnectionSchemaState } from '@/composables/useExplorerSchema'
import TableList from './TableList.vue'
import TabList from './TabList.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const workspaceStore = useWorkspaceStore()
const viewMode = ref<'tables' | 'tabs'>('tables')

const props = defineProps<{
  connection: ConnectionEntry
  selected: boolean
  schema: ConnectionSchemaState
}>()

const emit = defineEmits<{
  'select': [id: string]
  'delete': [connection: ConnectionEntry]
  'table-click': [connection: ConnectionEntry, table: string]
  'preview-table': [connection: ConnectionEntry, table: string]
  'edit-table': [connection: ConnectionEntry, table: string]
  'rename-table': [connection: ConnectionEntry, table: string]
  'delete-table': [connection: ConnectionEntry, table: string]
}>()

function statusDotClasses(status?: ConnectionSchemaState['status']) {
  switch (status) {
    case 'loading': return 'bg-amber-500 animate-pulse'
    case 'success': return 'bg-emerald-500'
    case 'error': return 'bg-rose-500'
    default: return 'bg-stone-700'
  }
}

function statusLabel(state?: ConnectionSchemaState) {
  if (state?.status === 'loading') return 'Syncing...'
  if (state?.status === 'error') return 'Error'
  return `${state?.tables?.length || 0} Tables`
}
</script>

<template>
  <div class="group relative">
    <div 
      v-if="selected"
      class="absolute -inset-1 bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 blur-md rounded-xl"
    ></div>

    <article
      @click="emit('select', connection.id)"
      class="relative cursor-pointer rounded-xl border p-3 transition-all duration-300 overflow-hidden"
      :class="[
        selected 
          ? 'bg-stone-900/90 border-violet-500/30 ring-1 ring-violet-500/10' 
          : 'bg-stone-900/40 border-stone-800/80 hover:border-stone-700 hover:bg-stone-900/60'
      ]"
    >
      <div class="flex items-start justify-between relative z-10">
        <div class="flex items-center gap-3">
          <div 
            class="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
            :class="[
              selected 
                ? 'bg-violet-500/10 border-violet-500/20 text-violet-400 shadow-[0_0_15px_-5px_theme(colors.violet.500)]' 
                : 'bg-stone-800/50 border-stone-700/50 text-stone-500 group-hover:text-stone-300 group-hover:border-stone-600'
            ]"
          >
            <Database class="w-4 h-4" />
          </div>
          <div>
            <p class="font-semibold text-stone-200 group-hover:text-white transition-colors truncate max-w-[120px]">{{ connection.nickname }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[9px] font-bold uppercase tracking-widest text-stone-500">{{ connection.provider }}</span>
              <div class="w-1 h-1 rounded-full bg-stone-700"></div>
              <div class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest" :class="schema?.status === 'error' ? 'text-rose-500' : 'text-stone-500'">
                <span :class="['h-1.5 w-1.5 rounded-full', statusDotClasses(schema?.status)]"></span>
                {{ statusLabel(schema) }}
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col items-end gap-1">
          <button 
            @click.stop="emit('delete', connection)"
            class="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-stone-800 text-stone-600 hover:text-rose-400 transition-all"
          >
            <Trash class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- View Toggle -->
      <div v-if="selected" class="px-1 mt-3 mb-1 flex items-center bg-stone-900/50 p-1 rounded-lg border border-stone-800/50" @click.stop>
        <button 
          @click.stop="viewMode = 'tables'"
          class="flex-1 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5"
          :class="viewMode === 'tables' ? 'bg-stone-800 text-stone-100 shadow-sm ring-1 ring-stone-700/50' : 'text-stone-500 hover:text-stone-300'"
        >
          <Table2 class="w-3 h-3" />
          Tables
        </button>
        <button 
          @click.stop="viewMode = 'tabs'"
          class="flex-1 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5"
          :class="viewMode === 'tabs' ? 'bg-stone-800 text-stone-100 shadow-sm ring-1 ring-stone-700/50' : 'text-stone-500 hover:text-stone-300'"
        >
          <Layers class="w-3 h-3" />
          Tabs
        </button>
      </div>

      <TableList 
        v-if="selected && viewMode === 'tables'" 
        :connection="connection" 
        :tables="schema.tables"
        @table-click="(c, t) => emit('table-click', c, t)"
        @preview="(c, t) => emit('preview-table', c, t)"
        @edit="(c, t) => emit('edit-table', c, t)"
        @rename="(c, t) => emit('rename-table', c, t)"
        @delete="(c, t) => emit('delete-table', c, t)"
      />

      <TabList
        v-if="selected && viewMode === 'tabs'"
        :tabs="workspaceStore.tabs"
        :active-tab-id="workspaceStore.activeTabId"
        @select="(id) => workspaceStore.setActiveTab(id)"
        @close="(id) => workspaceStore.closeTab(id)"
      />
    </article>
  </div>
</template>
