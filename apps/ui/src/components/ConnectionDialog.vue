<script setup lang="ts">
import { ref, watch, computed, h } from 'vue'
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
import AzureOAuthForm from './ConnectionForms/AzureOAuthForm.vue'
import SQLiteForm from './ConnectionForms/SQLiteForm.vue'
import DynamoDBForm from './ConnectionForms/DynamoDBForm.vue'
import DynamoDBOAuthForm from './ConnectionForms/DynamoDBOAuthForm.vue'
import BigQueryForm from './ConnectionForms/BigQueryForm.vue'
import BigQueryOAuthForm from './ConnectionForms/BigQueryOAuthForm.vue'
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

// Track whether to use OAuth for cloud providers
const useOAuth = ref(true)

// Custom Icons
const AzureIcon = h('img', { src: '/icons/microsoft/Azure/azure-2.svg', class: 'w-4 h-4' })
const AWSIcon = h('img', { src: '/icons/aws/aws-colored-black-text.svg', class: 'w-4 h-4' })
const GCPIcon = h('img', { src: '/icons/google/GCP/icons8-google-cloud.svg', class: 'w-4 h-4' })
const MongoIcon = h('img', { src: '/icons/mongo/mongo-svgrepo-com.svg', class: 'w-4 h-4' })
const PostgresIcon = h('img', { src: '/icons/postgres/postgres.svg', class: 'w-4 h-4 rounded-sm' })
const SQLiteIcon = h('img', { src: '/icons/sqlite/sqlite.svg', class: 'w-4 h-4 rounded-sm' })
const MySQLIcon = h('img', { src: '/icons/mysql/mysql.svg', class: 'w-4 h-4 rounded-sm' })

const providers = [
  { value: 'postgres' as const, label: 'PostgreSQL', icon: PostgresIcon },
  { value: 'mysql' as const, label: 'MySQL', icon: MySQLIcon },
  { value: 'mongodb' as const, label: 'MongoDB', icon: MongoIcon },
  { value: 'sqlite' as const, label: 'SQLite', icon: SQLiteIcon },
  { value: 'file' as const, label: 'File Import', icon: Upload },
  { value: 'kusto' as const, label: 'Azure', icon: AzureIcon },
  { value: 'dynamodb' as const, label: 'AWS DynamoDB', icon: AWSIcon },
  { value: 'bigquery' as const, label: 'GCP BigQuery', icon: GCPIcon },
]

const currentProviderLabel = computed(() => {
  const p = providers.find(p => p.value === props.connectionForm.provider)
  return p ? p.label : 'Database'
})

</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="bg-background border border-border text-foreground sm:rounded-xl shadow-2xl p-0 overflow-hidden flex flex-col w-full max-w-[95vw] md:max-w-4xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] h-[90vh] max-h-[900px] xl:max-h-[1000px]">
      <DialogHeader class="p-6 pb-4 border-b border-border bg-muted/10 shrink-0">
        <DialogTitle class="text-xl font-semibold text-primary flex items-center gap-2">
          <Database class="w-5 h-5" />
          {{ props.isEditMode ? 'Edit Database Connection' : 'Add Database Connection' }}
        </DialogTitle>
        <DialogDescription class="text-muted-foreground">
          {{ props.isEditMode ? 'Update your database connection settings.' : 'Choose a data source to connect to Pegasus.' }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 flex overflow-hidden">
        <!-- Sidebar -->
        <div class="w-64 border-r border-border bg-muted/10 flex flex-col overflow-y-auto shrink-0">
          <div class="p-4">
             <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">Data Sources</div>
             <div class="space-y-1">
                <button 
                  v-for="p in providers" 
                  :key="p.value"
                  @click="props.connectionForm.provider = p.value"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                  :class="props.connectionForm.provider === p.value ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
                >
                  <component :is="p.icon" class="w-4 h-4 shrink-0" />
                  {{ p.label }}
                  <ChevronRight v-if="props.connectionForm.provider === p.value" class="w-4 h-4 ml-auto opacity-50" />
                </button>
             </div>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 flex flex-col min-w-0 bg-background">
          <div class="flex-1 overflow-y-auto p-6">
            <form id="connection-form" @submit.prevent="() => { props.isEditMode ? emit('update') : emit('save'); closeModal() }">
              <!-- Common Fields -->
               <div class="grid gap-6 mb-6">
                  <div class="space-y-2">
                    <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connection Name</label>
                    <input
                      v-model="props.connectionForm.alias"
                      type="text"
                      placeholder="e.g. My Production DB"
                      class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground"
                    />
                  </div>
                  
                  <div class="space-y-2">
                    <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description (Optional)</label>
                    <textarea
                      v-model="props.connectionForm.description"
                      rows="2"
                      placeholder="What is this data source used for?"
                      class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted-foreground resize-none"
                    />
                  </div>

                   <!-- Lock Toggle -->
                   <div class="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                     <div class="space-y-0.5">
                       <div class="flex items-center gap-2">
                          <component :is="props.connectionForm.isLocked ? 'Lock' : 'Unlock'" class="w-3.5 h-3.5" :class="props.connectionForm.isLocked ? 'text-amber-500' : 'text-muted-foreground'" />
                          <span class="text-xs font-bold uppercase tracking-tight">Prevent Accidental Deletion</span>
                       </div>
                     </div>
                     <div 
                       @click="props.connectionForm.isLocked = !props.connectionForm.isLocked"
                       class="w-9 h-5 rounded-full p-0.5 cursor-pointer transition-colors duration-200"
                       :class="props.connectionForm.isLocked ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-muted border border-border'"
                     >
                       <div 
                         class="w-3.5 h-3.5 rounded-full transition-transform duration-200 shadow-sm"
                         :class="[
                           props.connectionForm.isLocked ? 'bg-amber-500 translate-x-4' : 'bg-muted-foreground translate-x-0'
                         ]"
                       ></div>
                     </div>
                   </div>
               </div>

              <div class="h-px bg-border mb-6"></div>

              <!-- Provider Specific Form -->
              <div class="space-y-4">
                  <div class="flex items-center gap-2 mb-4">
                    <span class="text-xs font-semibold uppercase tracking-wider text-primary">{{ currentProviderLabel }} Configuration</span>
                  </div>

                  <MySQLForm v-if="props.connectionForm.provider === 'mysql'" :connection-form="props.connectionForm" />
                  <PostgresForm v-else-if="props.connectionForm.provider === 'postgres'" :connection-form="props.connectionForm" />
                  <MongoDBForm v-else-if="props.connectionForm.provider === 'mongodb'" :connection-form="props.connectionForm" />
                  
                  <!-- Azure (Kusto or CosmosDB) with OAuth toggle -->
                  <div v-else-if="props.connectionForm.provider === 'kusto' || props.connectionForm.provider === 'cosmosdb'" class="space-y-4">
                    <div class="flex items-center justify-between pb-2 border-b border-border">
                      <span class="text-xs text-muted-foreground">Connection Method</span>
                      <button
                        type="button"
                        @click="useOAuth = !useOAuth"
                        class="text-xs text-primary hover:underline"
                      >
                        {{ useOAuth ? 'Use manual credentials' : 'Use Azure OAuth' }}
                      </button>
                    </div>
                    <AzureOAuthForm v-if="useOAuth" :connection-form="props.connectionForm" />
                    <template v-else>
                      <KustoForm v-if="props.connectionForm.provider === 'kusto'" :connection-form="props.connectionForm" />
                      <!-- We don't have a manual CosmosForm yet, but could add one -->
                      <div v-else class="text-sm text-muted-foreground p-4 text-center">
                        Manual Cosmos DB configuration coming soon. Please use Azure OAuth.
                      </div>
                    </template>
                  </div>
                  
                  <SQLiteForm v-else-if="props.connectionForm.provider === 'sqlite'" :connection-form="props.connectionForm" />

                  <!-- DynamoDB with OAuth toggle -->
                  <div v-else-if="props.connectionForm.provider === 'dynamodb'" class="space-y-4">
                    <div class="flex items-center justify-between pb-2 border-b border-border">
                      <span class="text-xs text-muted-foreground">Connection Method</span>
                      <button
                        type="button"
                        @click="useOAuth = !useOAuth"
                        class="text-xs text-primary hover:underline"
                      >
                        {{ useOAuth ? 'Use manual credentials' : 'Use AWS OAuth' }}
                      </button>
                    </div>
                    <DynamoDBOAuthForm v-if="useOAuth" :connection-form="props.connectionForm" />
                    <DynamoDBForm v-else :connection-form="props.connectionForm" />
                  </div>

                  <!-- BigQuery with OAuth toggle -->
                  <div v-else-if="props.connectionForm.provider === 'bigquery'" class="space-y-4">
                    <div class="flex items-center justify-between pb-2 border-b border-border">
                      <span class="text-xs text-muted-foreground">Connection Method</span>
                      <button
                        type="button"
                        @click="useOAuth = !useOAuth"
                        class="text-xs text-primary hover:underline"
                      >
                        {{ useOAuth ? 'Use manual credentials' : 'Use GCP OAuth' }}
                      </button>
                    </div>
                    <BigQueryOAuthForm v-if="useOAuth" :connection-form="props.connectionForm" />
                    <BigQueryForm v-else :connection-form="props.connectionForm" />
                  </div>
                  <FileImportForm 
                    v-else-if="props.connectionForm.provider === 'file'" 
                    :connection-form="props.connectionForm"
                    @upload-success="emit('upload-success')"
                  />
              </div>
            </form>
          </div>

          <!-- Footer -->
          <div class="p-4 border-t border-border bg-background flex justify-between items-center shrink-0">
             <div class="text-xs text-muted-foreground flex items-center gap-1.5">
                <div class="w-2 h-2 rounded-full" :class="props.canAddConnection ? 'bg-green-500' : 'bg-amber-500/50'"></div>
                {{ props.canAddConnection ? 'Ready to connect' : 'Fill required fields' }}
             </div>

             <div class="flex gap-3">
                <button
                  type="button"
                  @click="closeModal"
                  class="px-4 py-2 rounded-lg border border-input text-muted-foreground text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>

                <button
                  form="connection-form"
                  type="button"
                  @click="props.isEditMode ? emit('update') : emit('save')"
                  :disabled="!props.canAddConnection"
                  class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  {{ props.isEditMode ? 'Update Connection' : 'Connect Source' }}
                </button>
             </div>
          </div>
        </div>
      </div>
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
