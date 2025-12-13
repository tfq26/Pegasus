<template>
  <div class="absolute top-10 right-10 z-50 bg-white dark:bg-zinc-800 shadow-xl border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 w-80 text-sm font-sans" @keydown.stop>
      <div class="flex justify-between items-center mb-3">
          <h3 class="font-medium text-zinc-900 dark:text-zinc-100">Find & Replace</h3>
          <button @click="$emit('close')" class="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              <span class="text-lg leading-none">&times;</span>
          </button>
      </div>

      <!-- Find Input -->
      <div class="flex gap-2 mb-2">
          <input 
            v-model="query" 
            @keydown.enter="findNext"
            ref="searchInput"
            placeholder="Find..." 
            class="flex-1 px-2 py-1.5 border border-zinc-300 dark:border-zinc-600 rounded bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
      </div>

      <!-- Replace Input -->
      <div v-if="mode === 'replace'" class="flex gap-2 mb-3">
          <input 
            v-model="replaceText" 
            @keydown.enter="replaceCurrent"
            placeholder="Replace with..." 
            class="flex-1 px-2 py-1.5 border border-zinc-300 dark:border-zinc-600 rounded bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
      </div>

      <!-- Controls -->
      <div class="flex justify-between items-center mb-3">
          <div class="text-xs text-zinc-500">
              <span v-if="matchCount > 0">{{ currentIndex + 1 }} of {{ matchCount }}</span>
              <span v-else-if="query">No matches</span>
          </div>
          <div class="flex gap-1">
              <button @click="findPrev" class="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors" title="Previous">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
              </button>
              <button @click="findNext" class="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors" title="Next">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
          </div>
      </div>

      <!-- Options -->
      <div class="grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400 mb-3">
          <label class="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" v-model="options.matchCase"> Match case
          </label>
          <label class="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" v-model="options.matchEntireCell"> Entire cell
          </label>
          <label class="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" v-model="options.searchInFormulas"> Formulas
          </label>
           <!-- Toggle Replace Mode -->
           <button @click="toggleMode" class="text-left text-primary hover:underline">
              {{ mode === 'find' ? 'Show Replace' : 'Hide Replace' }}
           </button>
      </div>

      <!-- Replace Actions -->
      <div v-if="mode === 'replace'" class="flex gap-2 justify-end">
          <button 
             @click="replaceCurrent" 
             :disabled="matchCount === 0"
             class="px-3 py-1 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded text-zinc-900 dark:text-zinc-100 disabled:opacity-50 text-xs transition-colors"
          >
              Replace
          </button>
          <button 
             @click="replaceAll"
             :disabled="matchCount === 0"
             class="px-3 py-1 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded text-zinc-900 dark:text-zinc-100 disabled:opacity-50 text-xs transition-colors"
          >
              Replace All
          </button>
      </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick } from 'vue';
import type { SearchEngine, SearchResult } from './Engine/SearchEngine';
import type { CellPosition } from './Engine/types';

const props = defineProps<{
  searchEngine: SearchEngine,
  isVisible: boolean
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-match', pos: CellPosition): void;
}>();

const query = ref('');
const replaceText = ref('');
const mode = ref<'find' | 'replace'>('find');
const searchInput = ref<HTMLInputElement>();

const options = reactive({
    matchCase: false,
    matchEntireCell: false,
    searchInFormulas: false,
    useRegex: false
});

const results = ref<SearchResult[]>([]);
const currentIndex = ref(-1);
const matchCount = ref(0);

const performSearch = () => {
    if (!query.value) {
        results.value = [];
        matchCount.value = 0;
        currentIndex.value = -1;
        return;
    }
    
    results.value = props.searchEngine.find(query.value, options);
    matchCount.value = results.value.length;
    
    // Attempt to maintain relative position or reset
    if (matchCount.value > 0 && results.value[0]) {
        currentIndex.value = 0; // Default to first match
        emit('select-match', results.value[0].pos);
    } else {
        currentIndex.value = -1;
    }
};

const findNext = () => {
    if (matchCount.value === 0) return;
    currentIndex.value = (currentIndex.value + 1) % matchCount.value;
    const match = results.value[currentIndex.value];
    if (match) emit('select-match', match.pos);
};

const findPrev = () => {
    if (matchCount.value === 0) return;
    currentIndex.value = (currentIndex.value - 1 + matchCount.value) % matchCount.value;
    const match = results.value[currentIndex.value];
    if (match) emit('select-match', match.pos);
};

const replaceCurrent = () => {
    if (currentIndex.value === -1 || !results.value[currentIndex.value]) return;
    
    const match = results.value[currentIndex.value];
    if (match) {
        props.searchEngine.replace(match.pos, replaceText.value);
        // Refresh search
        performSearch();
    }
};

const replaceAll = () => {
    if (matchCount.value === 0) return;
    
    props.searchEngine.replaceAll(results.value, replaceText.value);
    performSearch();
};

const toggleMode = () => {
    mode.value = mode.value === 'find' ? 'replace' : 'find';
};

watch([query, options], () => {
    performSearch();
}, { deep: true });

watch(() => props.isVisible, (visible) => {
    if (visible) {
        nextTick(() => searchInput.value?.focus());
        performSearch(); // Re-run search in case data changed
    }
});
</script>
