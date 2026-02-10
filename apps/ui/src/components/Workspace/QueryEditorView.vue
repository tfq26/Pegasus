<script setup lang="ts">
import { ref, watch, defineAsyncComponent, onMounted, onUnmounted, computed, unref } from 'vue'
import { Terminal, Sparkles } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'
import { useDebounceFn } from '@vueuse/core'

const CodeEditor = defineAsyncComponent(() => import('../Chat/CodeEditor.vue'))

const props = defineProps<{
  modelValue: string
  isThinking?: boolean
  alias?: string
}>()

const emit = defineEmits(['update:modelValue', 'update:alias', 'submit', 'save', 'explain-query', 'optimize-query'])

const localValue = ref(props.modelValue)

const settingsStore = useSettingsStore()
// Use computed to access store state reactively
const settings = computed(() => unref(settingsStore.settings))

// Keyboard shortcuts
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    handleRun()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

watch(() => props.modelValue, (val) => {
  if (val !== localValue.value) {
    localValue.value = val || ''
  }
})

const debouncedSave = useDebounceFn(() => {
  if (settings.value.autoSaveQueries) {
    emit('save')
  }
}, 1000)

watch(localValue, (val) => {
  emit('update:modelValue', val)
  debouncedSave()
})

const editorLanguage = computed(() => settings.value.syntaxHighlighting ? 'sql' : 'plaintext')

const handleRun = () => {
  if (!localValue.value.trim() || props.isThinking) return
  emit('submit')
}

const handleAction = (payload: { type: string, query: string }) => {
  if (payload.type === 'explain') emit('explain-query', payload.query)
  if (payload.type === 'optimize') emit('optimize-query', payload.query)
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden relative bg-background group/query-view">
    <!-- Technical Background -->
    <div class="absolute inset-0 pointer-events-none z-0 opacity-[0.02] dark:opacity-[0.03]" 
         style="background-image: radial-gradient(currentColor 1px, transparent 1px); background-size: 40px 40px;">
    </div>
    
    <!-- Main Editor Area -->
    <div class="flex-1 relative overflow-hidden flex flex-col">
      <div class="flex-1 relative z-10">
        <CodeEditor
          v-model="localValue"
          :language="editorLanguage"
          class="w-full h-full"
          @action="handleAction"
        />
      </div>

      <!-- Statistics/Info Footer -->
      <div class="px-4 py-1.5 bg-muted/50 border-t border-border flex items-center justify-between z-10 gap-4">
        <div class="flex items-center gap-4 flex-1">
          <div class="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
             <Terminal class="w-3 h-3" />
             <span>Ln {{ (localValue.match(/\n/g) || []).length + 1 }}, Col 1</span>
          </div>

          <!-- Alias Input -->
          <div class="flex items-center gap-2 flex-1 max-w-xs border-l border-border/50 pl-4">
            <span class="text-[10px] text-muted-foreground font-mono uppercase opacity-50">Alias:</span>
            <input 
              :value="props.alias"
              @input="(e) => emit('update:alias', (e.target as HTMLInputElement).value)"
              placeholder="QUERY_NAME (OPTIONAL)"
              class="flex-1 bg-transparent border-none outline-none text-[10px] text-violet-400 font-mono placeholder:text-muted-foreground/30 px-1 py-0.5"
            />
          </div>

          <div v-if="settings.showQueryTips" class="flex items-center gap-2 text-[10px] text-muted-foreground font-mono border-l border-border/50 pl-4">
             <Sparkles class="w-3 h-3 ml-2" />
             <span>AI Insights Ready</span>
          </div>
        </div>
        <div class="text-[10px] text-muted-foreground/70 font-black uppercase tracking-widest hidden sm:block">
           Pegasus Query Engine 0.8.4
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.monaco-editor) {
  padding-top: 10px;
}
</style>
