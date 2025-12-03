<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useColorMode } from '@vueuse/core' // Optional if your app tracks dark/light
import MonacoEditor from 'monaco-editor-vue3'
import * as monaco from 'monaco-editor'

const props = defineProps<{
  modelValue: string
  language?: string
  placeholder?: string
}>()

const emit = defineEmits(['update:modelValue'])
const modelValue = ref(props.modelValue)
const colorMode = useColorMode()
const editorMountKey = ref(0)
const editorInstance = ref<any>(null)

// Create a key that forces remount when content changes significantly
const editorKey = computed(() => {
  return `monaco-${editorMountKey.value}`
})

const editorOptions = ref({
  fontSize: 14,
  minimap: { enabled: false },
  wordWrap: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  theme: colorMode.value === 'dark' ? 'pegasus-sql-dark' : 'pegasus-sql-light',
})

// Handle editor mount
const handleEditorMount = (editor: any) => {
  console.log('CodeEditor: Monaco editor mounted')
  editorInstance.value = editor
  
  // Set initial value
  if (modelValue.value && modelValue.value !== editor.getValue()) {
    console.log('CodeEditor: Setting initial value on mount:', modelValue.value?.substring(0, 50))
    editor.setValue(modelValue.value)
  }
  
  // Listen for changes
  editor.onDidChangeModelContent(() => {
    const value = editor.getValue()
    if (value !== modelValue.value) {
      modelValue.value = value
    }
  })
}

// Watch for prop changes and update editor directly
watch(() => props.modelValue, (val, oldVal) => {
  console.log('CodeEditor: modelValue prop changed to:', val?.substring(0, 50))
  console.log('CodeEditor: current local modelValue.value:', modelValue.value?.substring(0, 50))
  
  if (val !== modelValue.value) {
    console.log('CodeEditor: updating local modelValue')
    const wasEmpty = !modelValue.value || modelValue.value.length === 0
    const isNowEmpty = !val || val.length === 0
    modelValue.value = val
    
    // Update editor instance directly if it exists
    if (editorInstance.value && editorInstance.value.getValue() !== val) {
      console.log('CodeEditor: updating editor instance directly')
      editorInstance.value.setValue(val || '')
    }
    
    // Force remount if transitioning between empty and non-empty
    if (wasEmpty !== isNowEmpty) {
      console.log('CodeEditor: forcing remount due to empty/non-empty transition')
      editorMountKey.value++
    }
  } else {
    console.log('CodeEditor: values are the same, skipping update')
  }
}, { immediate: true })

watch(modelValue, val => {
  console.log('CodeEditor: local modelValue changed, emitting update:', val?.substring(0, 50))
  emit('update:modelValue', val)
})

// Reactively update theme when user toggles light/dark mode
watch(colorMode, newMode => {
  const theme = newMode === 'dark' ? 'pegasus-sql-dark' : 'pegasus-sql-light'
  monaco.editor.setTheme(theme)
})

onMounted(() => {
  console.log('CodeEditor: MOUNTED with modelValue:', props.modelValue?.substring(0, 50))
  console.log('CodeEditor: MOUNTED with local modelValue.value:', modelValue.value?.substring(0, 50))
  // Register SQL language highlighting
  if (!monaco.languages.getLanguages().some(l => l.id === 'sql')) {
    monaco.languages.register({ id: 'sql' })
    monaco.languages.setMonarchTokensProvider('sql', {
      tokenizer: {
        root: [
          [/\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|ON|GROUP|BY|ORDER|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|AND|OR|NOT|AS|DISTINCT|TOP|LIMIT|OFFSET|CASE|WHEN|THEN|ELSE|END|UNION|ALL|EXISTS|IN|IS|NULL|BETWEEN|LIKE|HAVING|COUNT|SUM|AVG|MIN|MAX)\b/i, 'keyword'],
          [/--.*/, 'comment'],
          [/\b\d+\b/, 'number'],
          [/'[^']*'/, 'string'],
          [/".*?"/, 'string'],
        ],
      },
    })
  }

  // DARK THEME
  monaco.editor.defineTheme('pegasus-sql-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'a78bfa', fontStyle: 'bold' }, // primary-400
      { token: 'comment', foreground: '78716c', fontStyle: 'italic' }, // stone-500
      { token: 'number', foreground: 'fbbf24' }, // amber-400
      { token: 'string', foreground: '34d399' }, // emerald-400
    ],
    colors: {
      'editor.background': '#0c0a09', // stone-950 (background)
      'editor.foreground': '#f5f5f4', // stone-100 (foreground)
      'editor.lineHighlightBackground': '#1c1917', // stone-900
      'editorCursor.foreground': '#a78bfa', // primary
      'editor.selectionBackground': '#8b5cf633', // primary/20
      'editorLineNumber.foreground': '#57534e', // stone-600
    },
  })

  // LIGHT THEME
  monaco.editor.defineTheme('pegasus-sql-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7c3aed', fontStyle: 'bold' }, // primary-600
      { token: 'comment', foreground: 'a8a29e', fontStyle: 'italic' }, // stone-400
      { token: 'number', foreground: 'd97706' }, // amber-600
      { token: 'string', foreground: '059669' }, // emerald-600
    ],
    colors: {
      'editor.background': '#ffffff', // white (background)
      'editor.foreground': '#0c0a09', // stone-950 (foreground)
      'editor.lineHighlightBackground': '#f5f5f4', // stone-100
      'editorCursor.foreground': '#7c3aed', // primary
      'editor.selectionBackground': '#8b5cf620', // primary/10
      'editorLineNumber.foreground': '#a8a29e', // stone-400
    },
  })

  // Set the initial theme
  const theme = colorMode.value === 'dark' ? 'pegasus-sql-dark' : 'pegasus-sql-light'
  monaco.editor.setTheme(theme)
})
</script>

<template>
  <div class="w-full h-full relative">
    <MonacoEditor
      :key="editorKey"
      v-model="modelValue"
      language="sql"
      :options="editorOptions"
      @editorDidMount="handleEditorMount"
      class="border border-border overflow-hidden w-full h-full"
    />
  </div>
</template>

<style scoped>
/* Optional: smooth transition when switching themes */
.monaco-editor, .monaco-editor-background {
  transition: background-color 0.3s ease, color 0.3s ease;
}
</style>
