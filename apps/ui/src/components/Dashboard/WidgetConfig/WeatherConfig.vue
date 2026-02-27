<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Configure Weather Widget</DialogTitle>
        <DialogDescription>
          Set your location and preferences
        </DialogDescription>
      </DialogHeader>
      
      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Location</label>
          <input
            v-model="config.location"
            type="text"
            placeholder="e.g., San Francisco, New York, London"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p class="text-xs text-muted-foreground">
            Enter city name or "City, Country Code"
          </p>
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">Temperature Units</label>
          <div class="flex gap-2">
            <button
              @click="config.units = 'imperial'"
              :class="[
                'flex-1 px-3 py-2 text-sm rounded-md border transition-colors',
                config.units === 'imperial' 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'border-border hover:bg-muted'
              ]"
            >
              °F (Fahrenheit)
            </button>
            <button
              @click="config.units = 'metric'"
              :class="[
                'flex-1 px-3 py-2 text-sm rounded-md border transition-colors',
                config.units === 'metric' 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'border-border hover:bg-muted'
              ]"
            >
              °C (Celsius)
            </button>
          </div>
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">Auto-Refresh Interval</label>
          <select
            v-model="config.autoRefresh"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option :value="300000">5 minutes</option>
            <option :value="600000">10 minutes</option>
            <option :value="1800000">30 minutes</option>
            <option :value="3600000">1 hour</option>
          </select>
        </div>

        <div class="space-y-2 border-t pt-4 mt-4">
          <label class="text-sm font-medium flex items-center justify-between">
            Custom API Key
            <span class="text-[10px]  tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
          </label>
          <input
            v-model="config.apiKey"
            type="password"
            placeholder="OpenWeatherMap API Key"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          />
          <p class="text-xs text-muted-foreground">
            If provided, this dashboard will use your own key. It will be stored securely and hidden from other viewers.
          </p>
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
          :disabled="!config.location.trim()"
          class="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
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
  location: 'San Francisco',
  units: 'imperial' as 'imperial' | 'metric',
  autoRefresh: 600000,
  apiKey: ''
})

// Reset config when dialog opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    config.value = {
      location: 'San Francisco',
      units: 'imperial',
      autoRefresh: 600000,
      apiKey: ''
    }
  }
})

function handleSave() {
  emit('save', config.value)
  emit('update:open', false)
}
</script>
