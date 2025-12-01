<script setup lang="ts">
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import type { SettingsModel } from './types'

const props = defineProps<{ settings: SettingsModel }>()
</script>

<template>
  <div class="space-y-4 max-w-3xl">
    <h2 class="text-2xl font-semibold text-violet-400 mb-6">Cloud</h2>
    <div>
      <h3 class="text-stone-300 font-medium">Provider</h3>
      <Select v-model="props.settings.cloudProvider" class="w-40">
        <SelectTrigger>
          <SelectValue placeholder="Select Provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Azure">Azure</SelectItem>
          <SelectItem value="AWS">AWS</SelectItem>
          <SelectItem value="Google Cloud">Google Cloud</SelectItem>
          <SelectItem value="Custom">Custom</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div>
      <h3 class="text-stone-300 font-medium mb-1">Region</h3>
      <input
        v-model="props.settings.cloudRegion"
        placeholder="e.g., eastus2"
        class="w-full px-3 py-2 bg-stone-800 border border-stone-700 text-stone-200 rounded-md text-sm"
      />
    </div>
  </div>
</template>
