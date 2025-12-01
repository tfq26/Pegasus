<template>
  <div class="flex-1 overflow-hidden relative bg-[#1e1e1e]">
    <CodeEditor
      v-if="mode === 'write'"
      v-model="localInput"
      language="sql"
      class="w-full h-full"
    />
    <textarea
      v-else
      v-model="localInput"
      placeholder="Ask Pegasus..."
      class="w-full h-full bg-transparent text-stone-200 p-4 resize-none focus:outline-none font-sans text-base placeholder:text-stone-600"
      @keydown.enter.exact.prevent="$emit('submit')"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
// @ts-ignore: ignore missing .vue module declaration
import CodeEditor from './CodeEditor.vue'

const props = defineProps<{ mode: 'chat' | 'write', input: string }>()
const emit = defineEmits(['update:input', 'submit'])

const localInput = ref(props.input)

watch(() => props.input, (val) => {
  localInput.value = val
})

watch(localInput, (val) => {
  emit('update:input', val)
})
</script>
