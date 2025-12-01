<script setup lang="ts">
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import type { SettingsModel } from './types'

const props = defineProps<{
  settings: SettingsModel
  isDark: boolean
  toggleTheme: () => void
}>()
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h2 class="text-2xl font-semibold text-violet-400 mb-6">General</h2>
      <p class="text-stone-400 text-sm">Adjust your overall Pegasus experience.</p>
    </div>

    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-stone-300 font-medium">Appearance</h3>
          <p class="text-stone-400 text-sm">Switch between light and dark themes.</p>
        </div>
        <button
          @click="props.toggleTheme"
          class="px-4 py-2 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-200 transition"
        >
          {{ props.isDark ? 'Switch to Light Mode ☀️' : 'Switch to Dark Mode 🌙' }}
        </button>
      </div>

      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-stone-300 font-medium">Language</h3>
          <p class="text-stone-400 text-sm">Choose your interface language.</p>
        </div>
        <Select v-model="props.settings.language" class="w-40">
          <SelectTrigger>
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="English">English</SelectItem>
            <SelectItem value="Spanish">Spanish</SelectItem>
            <SelectItem value="French">French</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
</template>
