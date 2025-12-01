<template>
  <div class="flex-1 overflow-auto">
    <CodeEditor
      v-model="input"
      :placeholder="mode === 'chat' ? 'Ask Pegasus…' : 'Write queries…'"
      :language="mode === 'write' ? 'sql' : 'text'"
      class="w-full h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
// @ts-ignore: ignore missing .vue module declaration
import CodeEditor from './CodeEditor.vue'

defineProps<{ mode: 'chat' | 'write', input: string }>()
const emit = defineEmits(['update:input'])

const input = ref('')

watch(input, (val) => {
  // Sync with parent
  emit('update:input', val)
})
</script>
