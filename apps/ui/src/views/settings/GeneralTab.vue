<script setup lang="ts">
import { computed } from 'vue'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{
  themeMode: any
  toggleTheme: () => void
}>()

const settingsStore = useSettingsStore()
import { unref } from 'vue'
const settings = computed(() => unref(settingsStore.settings))

// File System Access API — available in Chromium-based browsers only
const supportsFilePicker = typeof (window as any).showDirectoryPicker === 'function'

const pickFolder = async () => {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'read' })
    if (handle?.name) {
      settings.value.downloadsFolder = handle.name
    }
  } catch (e: any) {
    // User cancelled or API not available
    if (e?.name !== 'AbortError') console.warn('[GeneralTab] Folder picker error:', e)
  }
}
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
          class="px-4 py-2 rounded-lg bg-muted border border-border hover:bg-muted/80 text-foreground transition-all font-bold uppercase tracking-widest text-[10px] flex items-center gap-2"
        >
          <span v-if="props.themeMode === 'dark'">Mode: Dark 🌙</span>
          <span v-else-if="props.themeMode === 'light'">Mode: Light ☀️</span>
          <span v-else>Mode: System 🖥️</span>
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

      <!-- Downloads Folder -->
      <div class="space-y-3 pt-2 border-t border-border/50">
        <div>
          <h3 class="text-foreground font-medium">Downloads Folder</h3>
          <p class="text-muted-foreground text-sm">
            Subfolder name appended to all exported files (e.g. <code class="text-[11px] bg-muted px-1 rounded">Pegasus/Exports</code>).
            Files still land in your browser's default Downloads directory, but this keeps them organised with a consistent prefix.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="settings.downloadsFolder"
            type="text"
            placeholder="e.g. Pegasus/Exports"
            class="flex-1 h-9 rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
          />
          <button
            v-if="supportsFilePicker"
            @click="pickFolder"
            type="button"
            class="h-9 px-3 rounded-lg border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium transition whitespace-nowrap"
            title="Choose a folder from your file system (Chromium only)"
          >
            Browse…
          </button>
        </div>
        <p v-if="settings.downloadsFolder" class="text-[11px] text-violet-400/70">
          Files will be named: <code class="font-mono">{{ settings.downloadsFolder.replace(/\/$/, '') }}/&lt;filename&gt;</code>
        </p>
      </div>
    </div>
  </div>
</template>
