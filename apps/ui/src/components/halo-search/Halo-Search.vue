<script lang="ts" setup>
import { ref, watch, onMounted, computed, nextTick, unref } from 'vue';
import { Zap, Loader2, FileText, Table, StickyNote, Database, LineChart } from 'lucide-vue-next';
import MentionsPopup, { type MentionItem } from './MentionsPopup.vue';
import { useSpaceStore } from '@/stores/space';
import { useConnectionStore } from '@/stores/connection';
import { useExplorerSchema } from '@/composables/useExplorerSchema';
import { storeToRefs } from 'pinia';
import { useProgress } from '@/lib/progress';

interface Props {
  modelValue: string;
  isThinking?: boolean;
  placeholder?: string;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  isThinking: false,
  placeholder: 'Type a message...',
  class: ''
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'submit'): void;
}>();

const spaceStore = useSpaceStore();
const connectionStore = useConnectionStore();
// const { currentSpaceFiles, currentSpaceNotes } = storeToRefs(spaceStore); // REMOVED

// We only need schema for the selected connection
const activeConnection = computed(() => connectionStore.selectedConnection ? [connectionStore.selectedConnection as any] : []);
const { schemaFor } = useExplorerSchema(activeConnection);
const { activeOperations } = useProgress();

const activeAIOp = computed(() => activeOperations.value.find(op => op.category === 'ai'));

const editorRef = ref<HTMLElement | null>(null);
const mentionsVisible = ref(false);
const mentionQuery = ref('');
const mentionType = ref<'file' | 'table' | 'note' | 'database' | 'command' | null>(null); 
const triggerRange = ref<Range | null>(null); 
const mentionsPopupRef = ref<InstanceType<typeof MentionsPopup> | null>(null);

const mentionItems = computed<MentionItem[]>(() => {
  if (!mentionType.value) return [];

  if (mentionType.value === 'file') {
    return ((unref(spaceStore.currentSpaceFiles) as any[]) || []).map((f: any) => ({
      id: f.id,
      label: f.filename,
      type: 'file',
      icon: FileText,
      value: `!${f.filename}`
    }));
  } else if (mentionType.value === 'note') {
    return ((unref(spaceStore.currentSpaceNotes) as any[]) || []).map((n: any) => ({
      id: n.id,
      label: n.title,
      type: 'note',
      icon: StickyNote,
      value: `@${n.title}`
    }));
  } else if (mentionType.value === 'table') {
    const conn = connectionStore.selectedConnection as any;
    if (!conn) return [];
    const schema = schemaFor(conn.id);
    const tables = schema.tables || [];
    return tables.map((t: string) => ({
      id: t,
      label: t,
      type: 'table',
      icon: Table,
      value: `#${t}`
    }));
  } else if (mentionType.value === 'database') {
       return (connectionStore.connections as unknown as any[]).map((c: any) => ({
          id: c.id,
          label: c.alias || c.nickname || c.provider,
          type: 'database',
          icon: Database,
          value: `$${c.alias || c.nickname || c.provider}`
      }))
  } else if (mentionType.value === 'command') {
    return [
      { id: 'visualization', label: 'visualization', type: 'command', icon: LineChart, value: '/visualization ' },
      { id: 'query', label: 'query', type: 'command', icon: Database, value: '/query ' },
      { id: 'text', label: 'text', type: 'command', icon: FileText, value: '/text ' }
    ];
  }
  return [];
});

const serializeContent = () => {
    if (!editorRef.value) return '';
    let text = '';
    
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('mention-chip')) {
                text += el.dataset.value || el.textContent;
            } else if (el.tagName === 'BR') {
                // Ignore BR or handle as needed
            } else {
                node.childNodes.forEach(walk);
            }
        }
    }
    
    editorRef.value.childNodes.forEach(walk);
    return text;
};

const handleInput = () => {
  const val = serializeContent();
  emit('update:modelValue', val);
  checkSelectionForMention();
};

const checkSelectionForMention = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    
    if (node.nodeType !== Node.TEXT_NODE) return;
    
    const text = node.textContent || '';
    const cursor = range.startOffset;
    
    const lastExcl = text.lastIndexOf('!', cursor - 1);
    const lastHash = text.lastIndexOf('#', cursor - 1);
    const lastAt = text.lastIndexOf('@', cursor - 1);
    const lastDollar = text.lastIndexOf('$', cursor - 1);
    const lastSlash = text.lastIndexOf('/', cursor - 1);
  
    const triggerIdx = Math.max(lastExcl, lastHash, lastAt, lastDollar, lastSlash);
    
    if (triggerIdx === -1) {
        mentionsVisible.value = false;
        return;
    }

    if (triggerIdx > 0 && /\S/.test(text[triggerIdx - 1] as string)) {
        mentionsVisible.value = false;
        return;
    }

    const triggerChar = text[triggerIdx] || '';
    const query = text.slice(triggerIdx + 1, cursor);

    if (query.includes(' ')) {
        mentionsVisible.value = false;
        return;
    }

    mentionQuery.value = query;

    const replaceRange = document.createRange();
    replaceRange.setStart(node, triggerIdx);
    replaceRange.setEnd(node, cursor);
    triggerRange.value = replaceRange;

    if (triggerChar === '!') mentionType.value = 'file';
    else if (triggerChar === '#') mentionType.value = 'table';
    else if (triggerChar === '@') mentionType.value = 'note';
    else if (triggerChar === '$') mentionType.value = 'database';
    else if (triggerChar === '/') mentionType.value = 'command';

    mentionsVisible.value = true;
}

const truncateLabel = (label: string, limit: number = 20) => {
    if (label.length <= limit) return label;
    return label.substring(0, limit) + '...';
}

const handleSelectMention = (item: MentionItem) => {
  if (!triggerRange.value) return;

  const range = triggerRange.value;
  range.deleteContents();

  if (item.type === 'command') {
    // For commands, just insert the text directly without a chip
    const textNode = document.createTextNode(item.value as string);
    range.insertNode(textNode);
    range.collapse(false);
  } else {
    const chip = document.createElement('span');
    chip.className = 'mention-chip';
    chip.contentEditable = 'false';
    chip.dataset.value = item.value;
    chip.dataset.type = item.type;
    chip.textContent = truncateLabel(item.label);
    range.insertNode(chip);
  }
  
  const space = document.createTextNode('\u00A0'); 
  range.collapse(false);
  range.insertNode(space);
  
  const newRange = document.createRange();
  newRange.setStartAfter(space);
  newRange.collapse(true);
  const sel = window.getSelection();
  if (sel) {
      sel.removeAllRanges();
      sel.addRange(newRange);
  }

  mentionsVisible.value = false;
  triggerRange.value = null;

  handleInput();
  
  nextTick(() => {
    editorRef.value?.focus();
  });
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (mentionsVisible.value && mentionsPopupRef.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      mentionsPopupRef.value.handleKeyDown(e);
      if (e.key !== 'Escape') { 
         if (e.key === 'Enter') e.stopPropagation();
         e.preventDefault();
      }
      return; 
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const val = serializeContent();
    if (val.trim() && !props.isThinking) {
      if (!mentionsVisible.value) {
         emit('submit');
      }
    }
  }
};

const handlePaste = (e: ClipboardEvent) => {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') || '';
  
  // Convert Markdown to Plain Text (strip basic syntax)
  const cleanText = text
    .replace(/^#+\s+/gm, '') // Strip headers
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // Strip bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // Strip italics
    .replace(/`{1,3}(.*?)\1/g, '$2') // Strip code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url) -> link
    .trim();

  if (!cleanText) return;

  // Insert at cursor position
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(cleanText));
  
  // Move cursor to end of inserted text
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  handleInput();
};

watch(() => props.modelValue, (newVal) => {
    if (!editorRef.value) return;
    const currentSerialized = serializeContent();
    if (newVal !== currentSerialized) {
        if (!newVal) {
            editorRef.value.innerHTML = '';
        } else {
            // Re-render plain text if external update differs
            editorRef.value.textContent = newVal; 
        }
    }
});

const focus = () => {
  editorRef.value?.focus();
};

onMounted(() => {
    if (props.modelValue && editorRef.value) {
        editorRef.value.textContent = props.modelValue;
    }
})

defineExpose({ focus });
</script>

<template>
  <div
    id="halo-search"
    :class="[props.class, { 'is-thinking': props.isThinking }]"
  >
    <div id="search-wrapper">
      <MentionsPopup
        ref="mentionsPopupRef"
        :visible="mentionsVisible"
        :items="mentionItems"
        :query="mentionQuery"
        @select="handleSelectMention"
        @close="mentionsVisible = false"
      />
      
      <div
        ref="editorRef"
        contenteditable="true"
        @input="handleInput"
        @keydown="handleKeyDown"
        @paste="handlePaste"
        class="search-field whitespace-pre-wrap break-words overflow-y-auto no-scrollbar"
        :data-placeholder="props.placeholder"
        spellcheck="false"
      ></div>
      
      <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center group">
          <!-- Progress Indicator (Hover Reveal) -->
          <Transition name="progress-slide">
            <div 
              v-if="activeAIOp"
              class="absolute bottom-full mb-3 right-0 w-64 p-3 rounded-xl bg-background/80 backdrop-blur-md border border-border shadow-xl flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none translate-y-2 group-hover:translate-y-0"
            >
                <!-- Text Info -->
                <div class="flex flex-col min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <h1 class="text-xs font-semibold truncate leading-tight">{{ activeAIOp.label }}</h1>
                        <span class="text-[10px] font-mono text-muted-foreground">{{ Math.round(activeAIOp.progress) }}%</span>
                    </div>
                    <div class="flex items-center gap-2 overflow-hidden">
                         <div class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shrink-0"></div>
                        <span class="text-[10px] text-muted-foreground truncate">{{ activeAIOp.details }}</span>
                    </div>
                     <!-- Tiny Progress Bar -->
                    <div class="h-1 w-full bg-muted rounded-full overflow-hidden mt-1">
                        <div 
                            class="h-full bg-violet-500 transition-all duration-300" 
                            :style="{ width: `${activeAIOp.progress}%` }"
                        ></div>
                    </div>
                </div>
            </div>
          </Transition>

          <button
            @click="emit('submit')"
            :disabled="!props.modelValue.trim() || props.isThinking"
            class="flex items-center justify-center w-8 h-8 rounded-full transition-all bg-primary text-primary-foreground shadow-md hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed dark:shadow-violet-900/20"
          >
            <!-- Show Ring Progress on Button itself if thinking -->
            <svg v-if="props.isThinking && activeAIOp" class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 32 32">
                 <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" stroke-width="2" class="text-primary-foreground/20" />
                 <circle 
                    cx="16" cy="16" r="15" 
                    fill="none" 
                    stroke="currentColor" 
                    stroke-width="2" 
                    class="text-primary-foreground transition-all duration-300"
                    stroke-dasharray="94.2"
                    :stroke-dashoffset="94.2 - (94.2 * activeAIOp.progress / 100)"
                 />
            </svg>
            <Loader2 v-if="props.isThinking && !activeAIOp" class="w-4 h-4 animate-spin" />
            <div v-else-if="props.isThinking && activeAIOp" class="text-[8px] font-bold">{{ Math.round(activeAIOp.progress) }}</div>
            <Zap v-else class="w-4 h-4" />
          </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
#halo-search {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.5s ease;
}

#search-wrapper {
  position: relative;
  width: 100%;
}

.search-field {
  background-color: var(--background);
  border: 1px solid var(--border);
  width: 100%;
  min-height: 52px;
  height: auto;
  max-height: 200px;
  border-radius: 12px;
  color: var(--foreground);
  padding-right: 50px;
  padding-left: 16px;
  padding-top: 14px;
  padding-bottom: 14px;
  font-size: 14px;
  line-height: 1.5;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.05);
}

.dark .search-field {
  background-color: rgba(9, 9, 11, 0.6);
  backdrop-filter: blur(12px);
  border-color: rgba(255,255,255,0.1);
}

.search-field::placeholder {
  color: var(--muted-foreground);
  opacity: 0.7;
}

.search-field:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary), 0 8px 16px -6px rgba(0, 0, 0, 0.1);
}

.dark .search-field:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary), 0 0 20px -5px rgba(139, 92, 246, 0.2);
}

.search-field:empty:before {
  content: attr(data-placeholder);
  color: var(--muted-foreground);
  opacity: 0.7;
}

/* Chips */
:deep(.mention-chip) {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  padding: 0 4px;
  margin: 0 2px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  vertical-align: middle;
  background-color: var(--muted);
  color: var(--foreground);
  border: 1px solid var(--border);
}

:deep(.mention-chip:hover) {
    background-color: var(--accent);
    color: var(--accent-foreground);
}

/* Type specific styling if desired */
:deep(.mention-chip[data-type="file"]) {
    color: #3b82f6;
    background-color: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.2);
}
:deep(.mention-chip[data-type="table"]) {
    color: #22c55e;
    background-color: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.2);
}
:deep(.mention-chip[data-type="note"]) {
    color: #eab308;
    background-color: rgba(234, 179, 8, 0.1);
    border-color: rgba(234, 179, 8, 0.2);
}
:deep(.mention-chip[data-type="database"]) {
    color: #a855f7;
    background-color: rgba(168, 85, 247, 0.1);
    border-color: rgba(168, 85, 247, 0.2);
}

/* Hover States - Only keeping basic interaction if needed, but removing halo related ones */

/* Thinking Animation */
.progress-slide-enter-active,
.progress-slide-leave-active {
  transition: all 0.3s ease;
}

.progress-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.progress-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>

