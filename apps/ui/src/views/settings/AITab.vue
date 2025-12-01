<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { computed } from 'vue'
import type { SettingsModel } from './types'

const props = defineProps<{
  settings: SettingsModel
}>()

const sliderValue = computed({
  get: () => [props.settings.aiDetail],
  set: ([value]) => {
    props.settings.aiDetail = Number(value ?? 0)
  },
})
</script>

<template>
  <div class="space-y-4 max-w-3xl">
    <h2 class="text-2xl font-semibold text-violet-400 mb-6">Pegasus AI</h2>
    <div>
      <h3 class="text-stone-300 font-medium mb-1">Response Detail</h3>
  <Slider v-model="sliderValue" :min="0" :max="2" class="w-full" />
      <p class="text-stone-400 text-sm">Level: <strong>{{ ['Brief', 'Balanced', 'Detailed'][props.settings.aiDetail] }}</strong></p>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.enableContext" class="accent-violet-600" />
      Enable conversation memory
    </label>

    <label class="flex items-center gap-2 text-sm">
      <Checkbox v-model="props.settings.enableCodeHints" class="accent-violet-600" />
      Enable AI code suggestions
    </label>
  </div>
</template>
