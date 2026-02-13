<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="!w-[95vw] !max-w-[95vw] h-[90vh] flex gap-0 p-0 overflow-hidden rounded-2xl shadow-2xl border-none">
      <!-- Left Side: Editor (60%) -->
      <div class="w-[60%] flex flex-col min-w-0 bg-background">
        <div class="p-8 pb-4">
          <DialogHeader class="mb-6">
            <DialogTitle class="text-3xl font-bold tracking-tight">Edit Element</DialogTitle>
            <DialogDescription class="text-base font-medium text-muted-foreground/80">
              Customize appearance, data, and behavior.
            </DialogDescription>
          </DialogHeader>

          <!-- Tabs -->
          <Tabs v-model="activeTab" class="flex flex-col">
            <TabsList class="inline-flex h-12 items-center justify-start rounded-xl bg-muted/50 p-1 text-muted-foreground w-fit border border-border/40">
              <TabsTrigger value="general" class="px-6 rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-widest">
                <Settings class="w-3.5 h-3.5 mr-2" />
                General
              </TabsTrigger>
              <TabsTrigger value="colors" class="px-6 rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-widest">
                <Palette class="w-3.5 h-3.5 mr-2" />
                Colors
              </TabsTrigger>
              <TabsTrigger value="labels" v-if="elementConfig?.type !== 'stat'" class="px-6 rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all font-bold text-xs uppercase tracking-widest">
                <Tag class="w-3.5 h-3.5 mr-2" />
                Labels
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <!-- Tab Content Area -->
        <div class="flex-1 min-h-0 overflow-auto px-8 py-4">
          <div class="h-full">
            <TabsContent value="general" class="mt-0 h-full animate-in fade-in slide-in-from-left-4 duration-300">
              <GeneralSettings v-if="elementConfig" v-model="elementConfig" />
            </TabsContent>

            <TabsContent value="colors" class="mt-0 h-full animate-in fade-in slide-in-from-left-4 duration-300">
              <ColorCustomization v-if="elementConfig" v-model="elementConfig" />
            </TabsContent>

            <TabsContent value="labels" class="mt-0 h-full animate-in fade-in slide-in-from-left-4 duration-300">
              <LabelEditor v-if="elementConfig" v-model="elementConfig" />
            </TabsContent>
          </div>
        </div>

        <!-- Actions Footer -->
        <div class="flex justify-between items-center gap-4 px-8 py-6 bg-muted/20 border-t border-border/40">
          <button 
            @click="resetToDefaults"
            class="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all active:scale-95 border border-transparent hover:border-border/60"
          >
            Reset
          </button>
          <div class="flex gap-3">
            <button 
              @click="$emit('update:open', false)"
              class="px-6 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all active:scale-95"
            >
              Cancel
            </button>
            <button 
              @click="saveChanges"
              :disabled="isSaving"
              class="px-8 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
              {{ isSaving ? 'Updating...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Right Side: Live Preview (40%) -->
      <div class="w-[40%] flex flex-col min-w-0 bg-muted/30 border-l border-border/60 relative">
        <div class="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none"></div>
        
        <div class="p-8 pb-4 flex flex-col h-full relative z-10">
          <div class="flex items-center justify-between mb-8">
            <div>
              <h3 class="font-bold text-xl tracking-tight">Live Preview</h3>
              <p class="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">Real-time appearance</p>
            </div>
            
            <div v-if="elementConfig?.type === 'stat'" class="flex gap-1 bg-muted/60 rounded-xl p-1 border border-border/40">
              <button 
                v-for="size in (['small', 'medium', 'large'] as const)"
                :key="size"
                @click="previewSize = size"
                :class="previewSize === size ? 'bg-background text-primary shadow-sm scale-110' : 'text-muted-foreground hover:text-foreground'"
                class="px-3 py-1 text-[10px] font-bold rounded-lg transition-all capitalize"
              >
                {{ size }}
              </button>
            </div>
          </div>

          <!-- Preview Container -->
          <div class="flex-1 bg-card rounded-2xl p-8 border border-border/60 shadow-xl overflow-hidden flex flex-col transition-all duration-500">
            <div :class="previewSizeClass" class="w-full relative">
              <ChartRenderer 
                v-if="elementConfig"
                :type="elementConfig.type"
                :data="previewData"
                :options="previewOptions"
                :customization="elementConfig.customization"
                :key="previewKey"
                class="w-full h-full"
              />
            </div>
          </div>

          <!-- Preview Info Footer -->
          <div class="mt-6 flex items-center justify-between px-2">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20">
                <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span class="text-[10px] font-bold uppercase tracking-widest">Live Sync</span>
              </div>
              <span class="text-[10px] font-medium text-muted-foreground uppercase opacity-60">Updated {{ lastPreviewUpdate }}</span>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast } from '@/composables/useNotifications'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Settings, Palette, Tag } from 'lucide-vue-next'
import ChartRenderer from './ChartRenderer.vue'
import GeneralSettings from './Editor/GeneralSettings.vue'
import ColorCustomization from './Editor/ColorCustomization.vue'
import LabelEditor from './Editor/LabelEditor.vue'

interface DashboardElement {
  id: string
  title: string
  query: string
  type: string
  config: {
    data: any
    options: any
  }
  customization?: {
    description?: string
    colorPalette?: any
    [key: string]: any
  }
}

const props = defineProps<{
  open: boolean
  element: DashboardElement | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': [element: DashboardElement]
}>()

// State
const activeTab = ref('general')
const elementConfig = ref<DashboardElement | null>(null)
const originalElement = ref<DashboardElement | null>(null)
const previewSize = ref<'small' | 'medium' | 'large'>('medium')
const previewKey = ref(0)
const lastPreviewUpdate = ref(new Date().toLocaleTimeString())
const isSaving = ref(false)

// Initialize element config when modal opens
watch(() => props.element, (newElement) => {
  if (newElement) {
    elementConfig.value = JSON.parse(JSON.stringify(newElement))
    originalElement.value = JSON.parse(JSON.stringify(newElement))
  }
}, { immediate: true })

// Preview size class
const previewSizeClass = computed(() => ({
  'small': 'h-48',
  'medium': 'h-64',
  'large': 'h-96'
}[previewSize.value]))

// Preview data (reactive to changes)
const previewData = computed(() => {
  if (!elementConfig.value) return null
  
  // For stat type, return the value directly
  if (elementConfig.value.type === 'stat') {
    return elementConfig.value.config
  }
  
  // For charts, return the data object
  const data = JSON.parse(JSON.stringify(elementConfig.value.config.data))
  
  // Apply custom colors if present
  if (elementConfig.value.customization?.colorPalette?.shades && data.datasets?.[0]) {
    const shades = elementConfig.value.customization.colorPalette.shades
    data.datasets[0].backgroundColor = shades
    // Also set border color to same or slightly darker? For now use same
    data.datasets[0].borderColor = shades
  }
  
  return data
})

// Preview options (reactive to changes)
const previewOptions = computed(() => {
  if (!elementConfig.value) return null
  
  // For stat type, return config with description
  if (elementConfig.value.type === 'stat') {
    return {
      label: elementConfig.value.title,
      description: elementConfig.value.customization?.description
    }
  }
  
  // For charts, return options with responsive settings
  return {
    ...elementConfig.value.config.options,
    maintainAspectRatio: false,
    responsive: true
  }
})

// Watch for config changes and update preview
watch(
  () => elementConfig.value,
  () => {
    previewKey.value++
    lastPreviewUpdate.value = new Date().toLocaleTimeString()
  },
  { deep: true }
)

// Watch for preview size changes
watch(previewSize, () => {
  previewKey.value++
  lastPreviewUpdate.value = new Date().toLocaleTimeString()
})

// Reset to defaults
const resetToDefaults = () => {
  if (originalElement.value) {
    elementConfig.value = JSON.parse(JSON.stringify(originalElement.value))
    toast.info('Reset to original values')
  }
}

// Save changes
const saveChanges = () => {
  if (!elementConfig.value) return
  
  isSaving.value = true
  
  try {
    // Emit save event with updated element
    emit('save', elementConfig.value)
    toast.success('Element updated successfully')
    emit('update:open', false)
  } catch (error) {
    console.error('Save failed:', error)
    toast.error('Failed to save changes')
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
/* Ensure tabs content fills available space */
:deep(.tabs-content) {
  height: 100%;
}
</style>
