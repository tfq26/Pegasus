<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-[90vw] h-[90vh] flex gap-4 p-6">
      <!-- Left Side: Editor (50%) -->
      <div class="flex-1 flex flex-col min-w-0">
        <DialogHeader class="mb-4">
          <DialogTitle>Edit Dashboard Element</DialogTitle>
          <DialogDescription>
            Customize appearance, data, and behavior of your dashboard element
          </DialogDescription>
        </DialogHeader>

        <!-- Tabs -->
        <Tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0">
          <TabsList class="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="general">
              <Settings class="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="colors">
              <Palette class="w-4 h-4 mr-2" />
              Colors
            </TabsTrigger>
            <TabsTrigger value="labels" disabled>
              <Tag class="w-4 h-4 mr-2" />
              Labels
            </TabsTrigger>
          </TabsList>

          <!-- Tab Content -->
          <div class="flex-1 min-h-0 overflow-auto">
            <TabsContent value="general" class="mt-0 h-full">
              <GeneralSettings v-model="elementConfig" />
            </TabsContent>

            <TabsContent value="colors" class="mt-0 h-full">
              <ColorCustomization v-if="elementConfig" v-model="elementConfig" />
            </TabsContent>

            <TabsContent value="labels" class="mt-0 h-full">
              <div class="text-muted-foreground text-sm">Coming in Phase 3...</div>
            </TabsContent>
          </div>
        </Tabs>

        <!-- Actions -->
        <div class="flex justify-between items-center gap-2 pt-4 border-t border-border mt-4">
          <button 
            @click="resetToDefaults"
            class="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
          >
            Reset to Defaults
          </button>
          <div class="flex gap-2">
            <button 
              @click="$emit('update:open', false)"
              class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
            >
              Cancel
            </button>
            <button 
              @click="saveChanges"
              :disabled="isSaving"
              class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition disabled:opacity-50"
            >
              {{ isSaving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Right Side: Live Preview (50%) -->
      <div class="flex-1 flex flex-col min-w-0 border-l border-border pl-6">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-semibold text-lg">Live Preview</h3>
          <div class="flex gap-1 bg-muted rounded-md p-1">
            <button 
              @click="previewSize = 'small'"
              :class="{ 'bg-background shadow-sm': previewSize === 'small' }"
              class="px-2 py-1 text-xs rounded transition"
            >
              Small
            </button>
            <button 
              @click="previewSize = 'medium'"
              :class="{ 'bg-background shadow-sm': previewSize === 'medium' }"
              class="px-2 py-1 text-xs rounded transition"
            >
              Medium
            </button>
            <button 
              @click="previewSize = 'large'"
              :class="{ 'bg-background shadow-sm': previewSize === 'large' }"
              class="px-2 py-1 text-xs rounded transition"
            >
              Large
            </button>
          </div>
        </div>

        <!-- Preview Container -->
        <div class="flex-1 border border-border rounded-lg p-4 bg-card overflow-auto">
          <div :class="previewSizeClass">
            <ChartRenderer 
              v-if="elementConfig"
              :type="elementConfig.type"
              :data="previewData"
              :options="previewOptions"
              :key="previewKey"
            />
          </div>
        </div>

        <!-- Preview Info -->
        <div class="mt-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>Last updated: {{ lastPreviewUpdate }}</span>
          <div class="flex items-center gap-1">
            <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span>Live</span>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
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
