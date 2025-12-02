<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] bg-stone-950 border-stone-800 text-stone-100">
      <DialogHeader>
        <DialogTitle>Create Dashboard Element</DialogTitle>
        <DialogDescription>
          Preview and customize your visualization.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- Chart Preview -->
        <div class="h-[400px] w-full bg-stone-900/50 rounded-lg p-4 border border-stone-800 flex items-center justify-center">
          <ChartRenderer 
            v-if="config" 
            :type="config.type" 
            :data="config.config.data" 
            :options="config.config.options" 
          />
          <div v-else class="text-stone-500">Loading preview...</div>
        </div>

        <!-- AI Chat -->
        <div class="flex gap-2">
          <input 
            v-model="input" 
            @keydown.enter="refineChart"
            placeholder="Ask AI to change colors, labels, or chart type..." 
            class="flex-1 bg-stone-900 border border-stone-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
          />
          <button 
            @click="refineChart" 
            :disabled="isRefining"
            class="bg-stone-800 hover:bg-stone-700 text-stone-200 px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            {{ isRefining ? 'Refining...' : 'Refine' }}
          </button>
        </div>
      </div>

      <DialogFooter>
        <button @click="$emit('update:open', false)" class="px-4 py-2 text-sm text-stone-400 hover:text-stone-200">Cancel</button>
        <button @click="save" class="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-md text-sm font-medium">Save to Dashboard</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import ChartRenderer from './ChartRenderer.vue'
import { createDashboardElement, recommendVisualization } from '@/lib/api'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  initialConfig: any
  query: string
  results: any[]
}>()

const emit = defineEmits(['update:open', 'saved'])

const config = ref<any>(null)
const input = ref('')
const isRefining = ref(false)

watch(() => props.initialConfig, (newVal) => {
  if (newVal) config.value = newVal
}, { immediate: true })

const refineChart = async () => {
  if (!input.value.trim()) return
  
  isRefining.value = true
  try {
    const refinedQuery = `${props.query} (Refinement: ${input.value})`
    const newConfig = await recommendVisualization(refinedQuery, props.results)
    config.value = newConfig
    input.value = ''
    toast.success('Chart updated')
  } catch (e) {
    toast.error('Failed to refine chart')
  } finally {
    isRefining.value = false
  }
}

const save = async () => {
  try {
    await createDashboardElement({
      type: config.value.type,
      title: config.value.title,
      config: config.value.config,
      query: props.query
    })
    toast.success('Saved to Dashboard')
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    toast.error('Failed to save')
  }
}
</script>
