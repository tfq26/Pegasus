<script setup lang="ts">
import { ref, computed } from 'vue'
import { Database, Trash, Table2, Layers, ChevronDown, ChevronUp, Lock, Plus } from 'lucide-vue-next'
import type { ConnectionEntry } from '@/lib/db-connections'
import type { ConnectionSchemaState } from '@/composables/useExplorerSchema'
import TableList from './TableList.vue'
import TabList from './TabList.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { checkHealthProfile } from '@/lib/api'
import { toast } from '@/composables/useNotifications'
import { Activity } from 'lucide-vue-next'

const workspaceStore = useWorkspaceStore()
const tabs = computed(() => {
  const ws = (workspaceStore as any).workspacesByConnection?.[props.connection.id]
  return [...(ws?.tabs || [])]
})
const inactiveTabs = computed(() => {
  const ws = (workspaceStore as any).workspacesByConnection?.[props.connection.id]
  return [...(ws?.inactiveTabs || [])]
})
const activeTabId = computed(() => {
  const ws = (workspaceStore as any).workspacesByConnection?.[props.connection.id]
  return ws?.activeTabId || null
})
const viewMode = ref<'tables' | 'tabs'>('tables')
const isCheckingHealth = ref(false)

const handleHealthCheck = async () => {
  isCheckingHealth.value = true
  try {
    toast.info('Analyzing database health...', { id: 'health-check' })
    const res = await checkHealthProfile(props.connection.id)
    toast.dismiss('health-check')
    
    if (res.status) {
      const type = res.status === 'healthy' ? 'success' : (res.status === 'critical' ? 'error' : 'warning')
      toast[type](`Health: ${res.status.toUpperCase()}`, {
        description: `${res.summary}\n${res.recommendations?.join('\n') || ''}`,
        duration: 8000
      })
    }
  } catch (e: any) {
    toast.error('Health Check Failed', { description: e.message })
  } finally {
    isCheckingHealth.value = false
  }
}

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
  'add-table': [connection: ConnectionEntry]
  'explain-table': [connection: ConnectionEntry, table: string]
  'generate-data': [connection: ConnectionEntry, table: string]
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
      class="absolute -inset-1 bg-gradient-to-r from-purple-600/10 to-fuchsia-600/10 blur-md rounded-xl"
    ></div>

    <article
      @click="emit('select', selected ? '' : connection.id)"
      class="relative cursor-pointer rounded-xl border p-3 transition-all duration-300 overflow-hidden"
      :class="[
        selected 
          ? 'bg-card border-purple-500/30 ring-1 ring-purple-500/10 shadow-lg shadow-purple-900/5' 
          : 'bg-card/40 border-border/80 hover:border-border hover:bg-muted/50'
      ]"
    >
      <div class="flex items-start justify-between relative z-10">
        <div class="flex items-center gap-3">
          <div 
            class="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
            :class="[
              selected 
                ? 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400 shadow-[0_0_15px_-5px_theme(colors.purple.500)]' 
                : 'bg-muted/50 border-border/50 text-muted-foreground group-hover:text-foreground group-hover:border-border'
            ]"
          >
            <Database class="w-4 h-4" />
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <p class="font-semibold text-foreground transition-colors truncate max-w-[120px]">{{ connection.nickname }}</p>
              <Lock v-if="connection.isLocked" class="w-3 h-3 text-amber-500/80" />
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{{ connection.provider }}</span>
              <div class="w-1 h-1 rounded-full bg-border"></div>
              <div class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest" :class="schema?.status === 'error' ? 'text-rose-500' : 'text-muted-foreground'">
                <span :class="['h-1.5 w-1.5 rounded-full', statusDotClasses(schema?.status)]"></span>
                {{ statusLabel(schema) }}
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button 
            @click.stop="emit('select', selected ? '' : connection.id)"
            class="p-1 rounded-md transition-all sm:opacity-0 sm:group-hover:opacity-100"
            :class="selected ? 'text-purple-500 opacity-100' : 'text-muted-foreground hover:bg-muted'"
            :title="selected ? 'Collapse' : 'Expand'"
          >
            <ChevronUp v-if="selected" class="w-4 h-4" />
            <ChevronDown v-else class="w-4 h-4" />
          </button>
          
          <button 
            @click.stop="emit('add-table', connection)"
            class="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-purple-500/10 text-muted-foreground hover:text-purple-500 transition-all"
            title="Add Table"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>

          <button 
            @click.stop="handleHealthCheck"
            class="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 transition-all"
            :class="{ 'opacity-100 animate-pulse text-emerald-500': isCheckingHealth }"
            title="Health Check"
          >
            <Activity class="w-3.5 h-3.5" />
          </button>
          
          <button 
            @click.stop="emit('delete', connection)"
            class="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-rose-500 transition-all"
            title="Delete Connection"
          >
            <Trash class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- View Toggle -->
      <div v-if="selected" class="px-1 mt-3 mb-1 flex items-center bg-muted/40 p-1 rounded-lg border border-border/50" @click.stop>
        <button 
          @click.stop="viewMode = 'tables'"
          class="flex-1 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5"
          :class="viewMode === 'tables' ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'"
        >
          <Table2 class="w-3 h-3" />
          Tables
        </button>
        <button 
          @click.stop="viewMode = 'tabs'"
          class="flex-1 text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5"
          :class="viewMode === 'tabs' ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'"
        >
          <Layers class="w-3 h-3" />
          Tabs
        </button>
      </div>

      <TableList 
        v-if="selected && viewMode === 'tables'" 
        :connection="connection" 
        :tables="schema.tables"
        :table-metadata="schema.tableMetadata"
        @table-click="(c, t) => emit('table-click', c, t)"
        @preview="(c, t) => emit('preview-table', c, t)"
        @edit="(c, t) => emit('edit-table', c, t)"
        @rename="(c, t) => emit('rename-table', c, t)"
        @delete="(c, t) => emit('delete-table', c, t)"
        @explain="(c, t) => emit('explain-table', c, t)"
        @generate-data="(c, t) => emit('generate-data', c, t)"
      />

      <TabList
        v-if="selected && viewMode === 'tabs'"
        :tabs="tabs"
        :inactive-tabs="inactiveTabs"
        :active-tab-id="activeTabId"
        @select="(id) => workspaceStore.setActiveTab(id)"
        @close="(id) => workspaceStore.closeTab(id)"
        @restore="(id: string) => (workspaceStore as any).restoreTab(id)"
        @delete-permanently="(id: string) => (workspaceStore as any).deleteInactiveTab(id)"
      />
    </article>
  </div>
</template>
