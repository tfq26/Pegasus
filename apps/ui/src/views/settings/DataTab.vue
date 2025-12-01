<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import type { SettingsModel } from './types'

const props = defineProps<{ settings: SettingsModel }>()
</script>

<template>
  <div class="space-y-3 max-w-3xl">
    <h2 class="text-2xl font-semibold text-violet-400 mb-6">Data</h2>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.autoRefresh" class="accent-violet-600" />
      Auto-refresh data every 30s
    </label>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.showRowCount" class="accent-violet-600" />
      Show table row count
    </label>
  </div>
</template>
