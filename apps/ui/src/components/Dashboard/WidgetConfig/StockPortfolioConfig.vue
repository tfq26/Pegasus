<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Configure Stock Portfolio Widget</DialogTitle>
        <DialogDescription>
          Customize how your stock portfolio is displayed
        </DialogDescription>
      </DialogHeader>
      
      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Display Options</label>
          <div class="flex items-center space-x-2">
            <input
              id="show-chart"
              v-model="config.showChart"
              type="checkbox"
              class="rounded border-border"
            />
            <label for="show-chart" class="text-sm cursor-pointer">
              Show performance chart
            </label>
          </div>
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">
            Auto-Refresh Interval
          </label>
          <select
            v-model="config.autoRefresh"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option :value="10000">10 seconds</option>
            <option :value="30000">30 seconds</option>
            <option :value="60000">1 minute</option>
            <option :value="300000">5 minutes</option>
          </select>
        </div>
      </div>
      
      <DialogFooter>
        <button
          @click="$emit('update:open', false)"
          class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
        >
          Cancel
        </button>
        <button
          @click="handleSave"
          class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
        >
          Add Widget
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', config: any): void
}>()

const config = ref({
  showChart: true,
  autoRefresh: 30000
})

// Reset config when dialog opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    config.value = {
      showChart: true,
      autoRefresh: 30000
    }
  }
})

function handleSave() {
  emit('save', config.value)
  emit('update:open', false)
}
</script>
