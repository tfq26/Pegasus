<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { fetchConnectionSchema, QUERY_API_URL, getAuthHeaders } from '@/lib/api'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import DialogContent from '@/components/ui/dialog/DialogContent.vue'
import DialogHeader from '@/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '@/components/ui/dialog/DialogTitle.vue'
import DialogDescription from '@/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '@/components/ui/dialog/DialogFooter.vue'
import { 
  AlertCircle, 
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  Search, 
  Server, 
  Upload,
  Link2,
  CheckCircle2,
  Lock,
  Unlock
} from 'lucide-vue-next'

import { 
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from '@/components/ui/select'

import type { ConnectionEntry } from '@/lib/db-connections'
import { getMongoDatabaseFromUrl } from '@/lib/db-connections'
import type { ConnectionFormState } from '@/views/settings/types'

import MySQLForm from './ConnectionForms/MySQLForm.vue'
import PostgresForm from './ConnectionForms/PostgresForm.vue'
import MongoDBForm from './ConnectionForms/MongoDBForm.vue'
import KustoForm from './ConnectionForms/KustoForm.vue'
import SQLiteForm from './ConnectionForms/SQLiteForm.vue'
import FileImportForm from './ConnectionForms/FileImportForm.vue'

const props = defineProps<{
  open: boolean
  isEditMode: boolean
  connectionForm: ConnectionFormState
  canAddConnection: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': []
  'update': []
  'upload-success': []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const closeModal = () => {
  isOpen.value = false
}

</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent size="lg" class="bg-background border border-border text-foreground sm:rounded-xl shadow-2xl">
      <DialogHeader>
        <DialogTitle class="text-xl font-semibold text-primary flex items-center gap-2">
          <Database class="w-5 h-5" />
          {{ props.isEditMode ? 'Edit Database Connection' : 'Add Database Connection' }}
        </DialogTitle>
        <DialogDescription class="text-muted-foreground">
          {{ props.isEditMode ? 'Update your database connection settings.' : 'Configure a new database source for Pegasus to access.' }}
        </DialogDescription>
      </DialogHeader>

      <form 
        class="space-y-6 mt-4"
        @submit.prevent="() => { props.isEditMode ? emit('update') : emit('save'); closeModal() }"
      >
        <div class="grid gap-6 md:grid-cols-2">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nickname</label>
            <input
              v-model="props.connectionForm.nickname"
              type="text"
              placeholder="e.g. Production DB"
              class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground"
            />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider</label>
            <Select v-model="props.connectionForm.provider">
              <SelectTrigger class="w-full rounded-lg border-input bg-background h-[42px]">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent class="bg-popover border-border">
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
                <SelectItem value="mongodb">MongoDB</SelectItem>
                <SelectItem value="kusto">Kusto</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="file">File Import (Excel/JSON/XML)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <!-- Lock Toggle -->
        <div class="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
          <div class="space-y-0.5">
            <div class="flex items-center gap-2">
               <component :is="props.connectionForm.isLocked ? 'Lock' : 'Unlock'" class="w-3.5 h-3.5" :class="props.connectionForm.isLocked ? 'text-amber-500' : 'text-stone-500'" />
               <span class="text-xs font-bold uppercase tracking-tight">Lock Connection</span>
            </div>
            <p class="text-[10px] text-muted-foreground">Require typing the nickname to delete this connection.</p>
          </div>
          <div 
            @click="props.connectionForm.isLocked = !props.connectionForm.isLocked"
            class="w-10 h-5 rounded-full p-1 cursor-pointer transition-colors duration-200"
            :class="props.connectionForm.isLocked ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-stone-800 border border-stone-700'"
          >
            <div 
              class="w-3 h-3 rounded-full transition-transform duration-200 shadow-sm"
              :class="[
                props.connectionForm.isLocked ? 'bg-amber-400 translate-x-5' : 'bg-stone-500'
              ]"
            ></div>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
          <textarea
            v-model="props.connectionForm.description"
            rows="2"
            placeholder="Optional description for this connection..."
            class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground resize-none"
          />
        </div>

        <div class="h-px bg-border my-4"></div>

        <!-- Provider-specific Forms -->
        <MySQLForm v-if="props.connectionForm.provider === 'mysql'" :connection-form="props.connectionForm" />
        <PostgresForm v-else-if="props.connectionForm.provider === 'postgres'" :connection-form="props.connectionForm" />
        <MongoDBForm v-else-if="props.connectionForm.provider === 'mongodb'" :connection-form="props.connectionForm" />
        <KustoForm v-else-if="props.connectionForm.provider === 'kusto'" :connection-form="props.connectionForm" />
        <SQLiteForm v-else-if="props.connectionForm.provider === 'sqlite'" :connection-form="props.connectionForm" />
        <FileImportForm 
          v-else-if="props.connectionForm.provider === 'file'" 
          :connection-form="props.connectionForm"
          @upload-success="emit('upload-success')"
        />

        <DialogFooter class="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            @click="closeModal"
            class="px-4 py-2 rounded-lg border border-input text-muted-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>

          <button
            :disabled="!props.canAddConnection"
            class="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/20"
          >
            {{ props.isEditMode ? 'Update Connection' : 'Save Connection' }}
          </button>
        </DialogFooter>
      </form>

    </DialogContent>
  </Dialog>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #44403c;
  border-radius: 0.5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #57534e;
}
</style>
