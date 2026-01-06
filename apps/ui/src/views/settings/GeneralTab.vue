<script setup lang="ts">
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'

const props = defineProps<{
  isDark: boolean
  toggleTheme: () => void
}>()

const settingsStore = useSettingsStore()
import { unref, computed } from 'vue'
const settings = computed(() => unref(settingsStore.settings))
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h2 class="text-2xl font-semibold text-primary mb-6">General</h2>
      <p class="text-muted-foreground text-sm">Adjust your overall Pegasus experience.</p>
    </div>

    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-foreground font-medium">Appearance</h3>
          <p class="text-muted-foreground text-sm">Switch between light and dark themes.</p>
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
          <h3 class="text-foreground font-medium">Default Page Size</h3>
          <p class="text-muted-foreground text-sm">Rows per page in results table.</p>
        </div>
        <Select v-model="settings.defaultPageSize" class="w-40">
          <SelectTrigger>
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="10">10 rows</SelectItem>
            <SelectItem :value="25">25 rows</SelectItem>
            <SelectItem :value="50">50 rows</SelectItem>
            <SelectItem :value="100">100 rows</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-foreground font-medium">Date Format</h3>
          <p class="text-muted-foreground text-sm">How dates should be displayed.</p>
        </div>
        <Select v-model="settings.dateFormat" class="w-40">
          <SelectTrigger>
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="iso">ISO 8601</SelectItem>
            <SelectItem value="local">Local Time</SelectItem>
            <SelectItem value="relative">Relative (e.g. 2h ago)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-foreground font-medium">CSV Delimiter</h3>
          <p class="text-muted-foreground text-sm">Separator for copied data.</p>
        </div>
        <Select v-model="settings.csvDelimiter" class="w-40">
          <SelectTrigger>
            <SelectValue placeholder="Select delimiter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=",">Comma (,)</SelectItem>
            <SelectItem value=";">Semicolon (;)</SelectItem>
            <SelectItem value="\t">Tab (\t)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-foreground font-medium">Notifications</h3>
          <p class="text-muted-foreground text-sm">Enable toast notifications.</p>
        </div>
        <Switch v-model:checked="settings.notifications" class="accent-violet-600" />
      </div>

      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-foreground font-medium">Confirm Destructive Actions</h3>
          <p class="text-muted-foreground text-sm">Ask before deleting items.</p>
        </div>
        <Switch v-model:checked="settings.confirmDestructive" class="accent-violet-600" />
      </div>
    </div>
  </div>
</template>
