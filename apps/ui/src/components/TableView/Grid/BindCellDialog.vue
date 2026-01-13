<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Bind Cell to Live Data</DialogTitle>
        <DialogDescription>
          Select a data source and the specific field you want to track in this cell ({{ cellLabel }}).
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Data Source</label>
          <Select v-model="selectedSourceId" @update:modelValue="fetchSourceDetails">
            <SelectTrigger>
              <SelectValue placeholder="Select a source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="source in dataSources" :key="source.id" :value="source.id">
                <div class="flex items-center gap-2">
                  <component :is="getSourceIcon(source.type)" class="w-4 h-4" />
                  <span>{{ source.name }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="selectedSource" class="space-y-2">
          <label class="text-sm font-medium">Field Path</label>
          <div class="relative">
            <input
              v-model="fieldPath"
              placeholder="e.g. price or current.temp"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <p class="text-[11px] text-muted-foreground">
            Use dot notation for nested fields.
          </p>
        </div>

        <!-- Preview -->
        <div v-if="previewValue !== undefined" class="p-3 bg-muted rounded-md border border-dashed">
          <div class="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Preview</div>
          <div class="text-sm font-mono break-all">{{ previewValue }}</div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="isOpen = false">Cancel</Button>
        <Button :disabled="!isReady || isSaving" @click="saveBinding">
          <Loader2 v-if="isSaving" class="mr-2 h-4 w-4 animate-spin" />
          {{ existingBinding ? 'Update Binding' : 'Bind Cell' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, Cloud, Globe, Database } from 'lucide-vue-next';
import { toast } from '@/composables/useNotifications';
import { ApiClient, QUERY_API_URL } from '@/lib/apiClient';

const props = defineProps<{
    spreadsheetId: string;
    row: number;
    col: number;
    cellLabel: string;
}>();

const emit = defineEmits(['saved', 'closed']);

const isOpen = ref(true);
const isSaving = ref(false);
const dataSources = ref<any[]>([]);
const selectedSourceId = ref('');
const selectedSource = ref<any>(null);
const fieldPath = ref('');
const existingBinding = ref<any>(null);

const api = new ApiClient(QUERY_API_URL);

const isReady = computed(() => !!selectedSourceId.value && !!fieldPath.value);

const getSourceIcon = (type: string) => {
    switch (type) {
        case 'stock': return TrendingUp;
        case 'weather': return Cloud;
        case 'custom': return Globe;
        default: return Database;
    }
};

const fetchSources = async () => {
    try {
        const resp = await api.get<any[]>('/data-sources');
        dataSources.value = resp;
    } catch (e: any) {
        toast.error('Failed to load data sources');
    }
};

const fetchExistingBinding = async () => {
    try {
        const cellId = `${props.row},${props.col}`;
        const resp = await api.get<any[]>(`/data-sources/bindings?spreadsheetId=${props.spreadsheetId}`);
        const binding = resp.find((b: any) => b.cell_id === cellId);
        if (binding) {
            existingBinding.value = binding;
            selectedSourceId.value = binding.data_source;
            fieldPath.value = binding.field_path;
        }
    } catch (e) {}
};

const fetchSourceDetails = () => {
    selectedSource.value = dataSources.value.find(s => s.id === selectedSourceId.value);
};

const previewValue = computed(() => {
    if (!selectedSource.value || !selectedSource.value.last_result) return undefined;
    const path = fieldPath.value || '';
    if (!path || path === '.') return JSON.stringify(selectedSource.value.last_result);
    
    try {
        return path.split('.').reduce((acc, part) => acc && acc[part], selectedSource.value.last_result);
    } catch (e) {
        return 'Error resolving path';
    }
});

const saveBinding = async () => {
    if (!isReady.value) return;
    isSaving.value = true;
    try {
        await api.post('/data-sources/bindings', {
            spreadsheetId: props.spreadsheetId,
            cellId: `${props.row},${props.col}`,
            dataSourceId: selectedSourceId.value,
            fieldPath: fieldPath.value
        });
        toast.success('Cell bound successfully');
        emit('saved');
        isOpen.value = false;
    } catch (e: any) {
        toast.error(`Failed to save binding: ${e.message}`);
    } finally {
        isSaving.value = false;
    }
};

watch(isOpen, (val) => {
    if (!val) emit('closed');
});

onMounted(() => {
    fetchSources();
    fetchExistingBinding();
});
</script>
