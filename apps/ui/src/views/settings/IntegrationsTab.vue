<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import type { SettingsModel } from './types'

const props = defineProps<{ settings: SettingsModel }>()
</script>

<template>
  <div class="space-y-3 max-w-3xl">
    <h2 class="text-2xl font-semibold text-violet-400 mb-6">Integrations</h2>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.githubConnected" class="accent-violet-600" />
      GitHub
    </label>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.slackConnected" class="accent-violet-600" />
      Slack
    </label>
    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.azureConnected" class="accent-violet-600" />
      Azure DevOps
    </label>
  </div>
</template>
