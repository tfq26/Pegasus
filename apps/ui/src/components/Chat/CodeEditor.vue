<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
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
const colorMode = useColorMode() // auto-detects prefers-color-scheme

const editorOptions = ref({
  fontSize: 14,
  minimap: { enabled: false },
  wordWrap: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  theme: colorMode.value === 'dark' ? 'pegasus-sql-dark' : 'pegasus-sql-light',
})

watch(modelValue, val => {
  emit('update:modelValue', val)
})

// Reactively update theme when user toggles light/dark mode
watch(colorMode, newMode => {
  const theme = newMode === 'dark' ? 'pegasus-sql-dark' : 'pegasus-sql-light'
  monaco.editor.setTheme(theme)
})

onMounted(() => {
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
      { token: 'keyword', foreground: 'a259ff', fontStyle: 'bold' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'string', foreground: '10b981' },
    ],
    colors: {
      'editor.background': '#1e1e1e', // deep neutral dark gray
      'editor.foreground': '#e5e7eb', // stone-200
      'editor.lineHighlightBackground': '#2a2a2a',
      'editorCursor.foreground': '#a259ff',
      'editor.selectionBackground': '#4c1d95aa',
      'editorLineNumber.foreground': '#6b7280',
    },
  })

  // LIGHT THEME
  monaco.editor.defineTheme('pegasus-sql-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7c3aed', fontStyle: 'bold' },
      { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
      { token: 'number', foreground: 'b45309' },
      { token: 'string', foreground: '059669' },
    ],
    colors: {
      'editor.background': '#f9fafb', // Tailwind gray-50
      'editor.foreground': '#374151', // gray-700
      'editor.lineHighlightBackground': '#f3f4f6',
      'editorCursor.foreground': '#7c3aed',
      'editor.selectionBackground': '#c4b5fd66',
      'editorLineNumber.foreground': '#9ca3af',
    },
  })

  // Set the initial theme
  const theme = colorMode.value === 'dark' ? 'pegasus-sql-dark' : 'pegasus-sql-light'
  monaco.editor.setTheme(theme)
})
</script>

<template>
  <MonacoEditor
    v-model="modelValue"
    language="sql"
    :options="editorOptions"
    class="border border-slate-200 dark:border-slate-700 overflow-hidden"
  />
</template>

<style scoped>
/* Optional: smooth transition when switching themes */
.monaco-editor, .monaco-editor-background {
  transition: background-color 0.3s ease, color 0.3s ease;
}
</style>
