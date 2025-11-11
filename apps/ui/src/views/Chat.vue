<template>
  <div class="flex w-full h-full text-stone-100 overflow-hidden">
    <!-- Explorer sidebar -->
    <aside class="w-64 shrink-0 border-r border-stone-800 overflow-y-auto">
      <Explorer />
    </aside>

    <!-- Editor workspace -->
    <section class="flex-1 flex flex-col overflow-hidden">
      <!-- Toolbar -->
      <header
        class="flex items-center justify-between border-b border-stone-800 bg-stone-900/90 px-4 py-2"
      >
        <h2 class="font-semibold text-stone-200 tracking-wide">Pegasus Query Editor</h2>
        <div class="flex items-center gap-2 text-sm">
          <span
            class="px-3 py-1 rounded-md cursor-pointer transition-colors"
            :class="mode === 'chat'
              ? 'bg-violet-600 text-white'
              : 'text-stone-400 hover:text-violet-400'"
            @click="mode = 'chat'"
          >
            Chat
          </span>
          <span
            class="px-3 py-1 rounded-md cursor-pointer transition-colors"
            :class="mode === 'write'
              ? 'bg-violet-600 text-white'
              : 'text-stone-400 hover:text-violet-400'"
            @click="mode = 'write'"
          >
            Write
          </span>
        </div>
      </header>

      <!-- Editor -->
      <div class="flex-1 overflow-auto">
        <textarea
          v-model="input"
          :placeholder="mode === 'chat' ? 'Ask Pegasus…' : 'Write queries…'"
          class="w-full resize-none border-0 outline-none bg-stone-950 text-stone-100 font-mono text-sm p-4 focus:ring-0"
        ></textarea>
      </div>

      <!-- Footer -->
      <footer
        class="flex items-center justify-end gap-3 border-t border-stone-800 bg-stone-900/90 px-4 py-2"
      >
        <button
          @click="run"
          class="px-4 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition"
        >
          {{ mode === 'chat' ? 'Send' : 'Execute' }}
        </button>
        <button
          @click="clear"
          class="px-3 py-1.5 rounded-md border border-stone-700 text-stone-400 hover:bg-stone-800 hover:text-stone-200 text-sm transition"
        >
          Clear
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Explorer from '../components/Explorer.vue'

defineOptions({ name: 'ChatPage' })

const mode = ref<'chat' | 'write'>('chat')
const input = ref('')

const run = () => {
  if (!input.value.trim()) return
  console.log(`${mode.value === 'chat' ? 'Chat' : 'Query'}:`, input.value)
  input.value = ''
}

const clear = () => {
  input.value = ''
}
</script>
