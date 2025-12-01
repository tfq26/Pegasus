<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import type { SettingsModel } from './types'

const props = defineProps<{ settings: SettingsModel }>()
</script>

<template>
  <div class="space-y-3 max-w-3xl">
    <h2 class="text-2xl font-semibold text-violet-400 mb-6">Queries</h2>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.autoSaveQueries" class="accent-violet-600" />
      Auto-save queries
    </label>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.syntaxHighlighting" class="accent-violet-600" />
      Syntax highlighting
    </label>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.showQueryTips" class="accent-violet-600" />
      Show AI query recommendations
    </label>
  </div>
</template>
