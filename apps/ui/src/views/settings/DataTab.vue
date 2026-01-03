<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import type { SettingsModel } from './types'
import { useFileWatcher } from '@/composables/useFileWatcher'
import { ref, computed } from 'vue'
import { FolderOpen } from 'lucide-vue-next'

const props = defineProps<{ settings: SettingsModel }>()

const { isWatching, lastEvent, startWatching, stopWatching } = useFileWatcher()
const watchPath = ref('')

// Check if running in Tauri
const isTauri = computed(() => '__TAURI_INTERNALS__' in window)

const pickFolder = async () => {
  if (!isTauri.value) return
  
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select folder to watch'
    })
    if (selected && typeof selected === 'string') {
      watchPath.value = selected
    }
  } catch (e) {
    console.error('Failed to open folder picker:', e)
  }
}

const toggleWatch = async () => {
  if (isWatching.value) {
    await stopWatching()
  } else {
    if (!watchPath.value) return
    await startWatching(watchPath.value)
  }
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <h2 class="text-2xl font-semibold text-primary mb-6">Data Management</h2>
    
    <div class="space-y-3">
      <label class="flex items-center gap-2 text-sm">
        <Checkbox v-model="props.settings.autoRefresh" class="accent-violet-600" />
        Auto-refresh data every 30s
      </label>
      <label class="flex items-center gap-2 text-sm">
        <Checkbox v-model="props.settings.showRowCount" class="accent-violet-600" />
        Show table row count
      </label>
    </div>

    <!-- Only show file watcher section on desktop -->
    <div v-if="isTauri" class="pt-6 border-t border-border">
      <h3 class="text-foreground font-medium mb-3">Native File Watcher (Preview)</h3>
      <div class="p-4 rounded-xl border border-border bg-card/50">
        <div class="flex gap-2 mb-3">
          <input 
            v-model="watchPath" 
            type="text" 
            placeholder="/Users/username/Desktop/watch-folder"
            class="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md"
          />
          <button 
            @click="pickFolder"
            class="px-3 py-2 text-sm bg-muted hover:bg-muted/80 border border-input rounded-md transition-colors"
            title="Browse..."
          >
            <FolderOpen class="w-4 h-4" />
          </button>
          <button 
            @click="toggleWatch"
            class="px-4 py-2 text-xs font-bold rounded-md transition-all"
            :class="isWatching ? 'bg-destructive text-destructive-foreground hover:opacity-90' : 'bg-primary text-primary-foreground hover:opacity-90'"
          >
            {{ isWatching ? 'Stop' : 'Watch' }}
          </button>
        </div>
        
        <div v-if="lastEvent" class="text-xs font-mono bg-muted p-2 rounded border border-border">
          <div class="text-primary font-bold mb-1">Last Event: {{ lastEvent.kind }}</div>
          <div class="text-muted-foreground">{{ lastEvent.paths.join(', ') }}</div>
        </div>
        <div v-else class="text-xs text-muted-foreground italic">
          No events detected yet.
        </div>
      </div>
    </div>
  </div>
</template>

