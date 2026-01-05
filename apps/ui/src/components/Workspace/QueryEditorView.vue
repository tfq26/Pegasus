<script setup lang="ts">
import { ref, watch, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { Terminal, Sparkles } from 'lucide-vue-next'

const CodeEditor = defineAsyncComponent(() => import('../Chat/CodeEditor.vue'))

const props = defineProps<{
  modelValue: string
  isThinking?: boolean
}>()

const emit = defineEmits(['update:modelValue', 'submit', 'save'])

const localValue = ref(props.modelValue)

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

watch(localValue, (val) => {
  emit('update:modelValue', val)
})

const handleRun = () => {
  if (!localValue.value.trim() || props.isThinking) return
  emit('submit')
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden relative bg-[#0a0a0b] group/query-view">
    <!-- Technical Background -->
    <div class="absolute inset-0 pointer-events-none z-0 opacity-[0.02]" 
         style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 40px 40px;">
    </div>
    
    <!-- Main Editor Area -->
    <div class="flex-1 relative overflow-hidden flex flex-col">
      <div class="flex-1 relative z-10">
        <CodeEditor
          v-model="localValue"
          language="sql"
          class="w-full h-full"
        />
      </div>

      <!-- Statistics/Info Footer -->
      <div class="px-4 py-1.5 bg-stone-950 border-t border-stone-900 flex items-center justify-between z-10">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-[10px] text-stone-600 font-mono">
             <Terminal class="w-3 h-3" />
             <span>Ln {{ (localValue.match(/\n/g) || []).length + 1 }}, Col 1</span>
          </div>
          <div class="flex items-center gap-2 text-[10px] text-stone-600 font-mono">
             <Sparkles class="w-3 h-3" />
             <span>AI Insights Ready</span>
          </div>
        </div>
        <div class="text-[10px] text-stone-700 font-black uppercase tracking-widest">
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
