<script setup lang="ts">
import { ref, watch, defineAsyncComponent, onMounted, onUnmounted, computed } from 'vue'
import { Terminal, Sparkles } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'
import { useDebounceFn } from '@vueuse/core'

const CodeEditor = defineAsyncComponent(() => import('../Chat/CodeEditor.vue'))

const props = defineProps<{
  modelValue: string
  isThinking?: boolean
}>()

const emit = defineEmits(['update:modelValue', 'submit', 'save', 'explain-query', 'optimize-query'])

const localValue = ref(props.modelValue)

const settingsStore = useSettingsStore()
// In Setup Stores, refs are returned as is, so we can destructure directly
const { settings } = settingsStore

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
      <div class="px-4 py-1.5 bg-muted/50 border-t border-border flex items-center justify-between z-10">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
             <Terminal class="w-3 h-3" />
             <span>Ln {{ (localValue.match(/\n/g) || []).length + 1 }}, Col 1</span>
          </div>
          <div v-if="settings.showQueryTips" class="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
             <Sparkles class="w-3 h-3" />
             <span>AI Insights Ready</span>
          </div>
        </div>
        <div class="text-[10px] text-muted-foreground/70 font-black uppercase tracking-widest">
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
