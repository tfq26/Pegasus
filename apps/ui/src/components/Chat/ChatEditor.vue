<template>
  <div class="flex-1 overflow-hidden relative bg-background min-h-[300px]">
    <CodeEditor
      v-if="props.mode === 'write'"
      :key="'write-mode'"
      v-model="localInput"
      language="sql"
      class="w-full h-full bg-transparent text-foreground p-4 resize-none focus:outline-none font-sans text-base placeholder:text-muted-foreground"
    />
    <textarea
      v-else
      :key="'chat-mode'"
      v-model="localInput"
      placeholder="Ask Pegasus..."
      class="w-full h-full bg-transparent text-foreground p-4 resize-none focus:outline-none font-sans text-base placeholder:text-muted-foreground"
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
