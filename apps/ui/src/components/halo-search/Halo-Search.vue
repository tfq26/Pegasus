<script lang="ts" setup>
import { ref, watch, onMounted, computed, nextTick, unref } from 'vue';
import { ArrowRight, Loader2, FileText, Table, StickyNote, Database, LineChart, Sparkles, Activity, Layers, Code, Zap } from 'lucide-vue-next';
import MentionsPopup, { type MentionItem } from './MentionsPopup.vue';
import { useSpaceStore } from '@/stores/space';
import { useConnectionStore } from '@/stores/connection';
import { useExplorerSchema } from '@/composables/useExplorerSchema';
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

const activeConnection = computed(() =>
  connectionStore.selectedConnection ? [connectionStore.selectedConnection as any] : []
);
const { schemaFor } = useExplorerSchema(activeConnection);
const { activeOperations } = useProgress();

const activeAIOp = computed(() => activeOperations.value.find(op => op.category === 'ai'));
const hasValue = computed(() => props.modelValue.trim().length > 0);
const progressPercent = computed(() => Math.max(0, Math.min(100, Math.round(activeAIOp.value?.progress ?? 0))));
const progressLabel = computed(() => activeAIOp.value?.label || 'Thinking');
const progressDetails = computed(() => activeAIOp.value?.details || 'Processing your request');

const editorRef = ref<HTMLElement | null>(null);
const mentionsVisible = ref(false);
const mentionQuery = ref('');
const mentionType = ref<'file' | 'table' | 'note' | 'database' | 'command' | 'wildcard' | null>(null);
const triggerRange = ref<Range | null>(null);
const mentionsPopupRef = ref<InstanceType<typeof MentionsPopup> | null>(null);

const wildcardItems = [
  { id: 'v-viz', label: 'visualization', type: 'wildcard' as const, icon: LineChart, value: '*visualization' },
  { id: 'v-sum', label: 'summary', type: 'wildcard' as const, icon: Zap, value: '*summary' },
  { id: 'v-ana', label: 'analysis', type: 'wildcard' as const, icon: Sparkles, value: '*analysis' },
  { id: 'v-qry', label: 'query', type: 'wildcard' as const, icon: Database, value: '*query' },
  { id: 'v-met', label: 'metrics', type: 'wildcard' as const, icon: Activity, value: '*metrics' },
  { id: 'v-all', label: 'all', type: 'wildcard' as const, icon: Layers, value: '*all' },
  { id: 'v-sch', label: 'schema', type: 'wildcard' as const, icon: Code, value: '*schema' }
];

const mentionItems = computed<MentionItem[]>(() => {
  if (!mentionType.value) return [];

  if (mentionType.value === 'file') {
    return ((unref(spaceStore.currentSpaceFiles) as any[]) || []).map((file: any) => ({
      id: file.id,
      label: file.filename,
      type: 'file',
      icon: FileText,
      value: `!${file.filename}`
    }));
  }

  if (mentionType.value === 'note') {
    return ((unref(spaceStore.currentSpaceNotes) as any[]) || []).map((note: any) => ({
      id: note.id,
      label: note.title,
      type: 'note',
      icon: StickyNote,
      value: `@${note.title}`
    }));
  }

  if (mentionType.value === 'table') {
    const connection = connectionStore.selectedConnection as any;
    if (!connection) return [];
    const schema = schemaFor(connection.id);
    return (schema.tables || []).map((table: string) => ({
      id: table,
      label: table,
      type: 'table',
      icon: Table,
      value: `#${table}`
    }));
  }

  if (mentionType.value === 'database') {
    return (connectionStore.connections as unknown as any[]).map((connection: any) => ({
      id: connection.id,
      label: connection.alias || connection.nickname || connection.provider,
      type: 'database',
      icon: Database,
      value: `$${connection.alias || connection.nickname || connection.provider}`
    }));
  }

  if (mentionType.value === 'command') {
    return [
      { id: 'visualization', label: '/visualization', type: 'command', icon: LineChart, value: '/visualization ' },
      { id: 'query', label: '/query', type: 'command', icon: Database, value: '/query ' },
      { id: 'text', label: '/text', type: 'command', icon: FileText, value: '/text ' }
    ];
  }

  if (mentionType.value === 'wildcard') {
    return wildcardItems;
  }

  return [];
});

const mentionChipClasses: Record<NonNullable<typeof mentionType.value>, string> = {
  file: 'border-sky-500/20 bg-sky-500/10 text-sky-500',
  table: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
  note: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
  database: 'border-violet-500/20 bg-violet-500/10 text-violet-500',
  command: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-500',
  wildcard: 'border-orange-500/20 bg-orange-500/10 text-orange-500'
};

const serializeContent = () => {
  if (!editorRef.value) return '';

  let text = '';

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    if (element.classList.contains('mention-chip')) {
      text += element.dataset.value || element.textContent;
      return;
    }

    if (element.tagName !== 'BR') {
      node.childNodes.forEach(walk);
    }
  };

  editorRef.value.childNodes.forEach(walk);
  return text;
};

const handleInput = () => {
  emit('update:modelValue', serializeContent());
  checkSelectionForMention();
};

const checkSelectionForMention = () => {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent || '';
  const cursor = range.startOffset;

  const triggerIndexes = [
    text.lastIndexOf('!', cursor - 1),
    text.lastIndexOf('#', cursor - 1),
    text.lastIndexOf('@', cursor - 1),
    text.lastIndexOf('$', cursor - 1),
    text.lastIndexOf('/', cursor - 1),
    text.lastIndexOf('*', cursor - 1)
  ];

  const triggerIdx = Math.max(...triggerIndexes);
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
  else if (triggerChar === '*') mentionType.value = 'wildcard';

  mentionsVisible.value = true;
};

const truncateLabel = (label: string, limit = 20) => {
  if (label.length <= limit) return label;
  return `${label.substring(0, limit)}...`;
};

const handleSelectMention = (item: MentionItem) => {
  if (!triggerRange.value) return;

  const range = triggerRange.value;
  range.deleteContents();

  const chip = document.createElement('span');
  chip.className = [
    'mention-chip',
    'mx-0.5 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[12px] font-medium leading-none align-middle',
    mentionChipClasses[item.type]
  ].join(' ');
  chip.contentEditable = 'false';
  chip.dataset.value = item.value;
  chip.dataset.type = item.type;
  chip.textContent = truncateLabel(item.label);
  range.insertNode(chip);

  const space = document.createTextNode('\u00A0');
  range.collapse(false);
  range.insertNode(space);

  const newRange = document.createRange();
  newRange.setStartAfter(space);
  newRange.collapse(true);

  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(newRange);
  }

  mentionsVisible.value = false;
  triggerRange.value = null;

  handleInput();
  nextTick(() => editorRef.value?.focus());
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (mentionsVisible.value && mentionsPopupRef.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      mentionsPopupRef.value.handleKeyDown(event);
      if (event.key !== 'Escape') {
        if (event.key === 'Enter') event.stopPropagation();
        event.preventDefault();
      }
      return;
    }
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    if (serializeContent().trim() && !props.isThinking && !mentionsVisible.value) {
      emit('submit');
    }
  }
};

const handlePaste = (event: ClipboardEvent) => {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || '';

  const cleanText = text
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`{1,3}(.*?)\1/g, '$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

  if (!cleanText) return;

  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(cleanText));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  handleInput();
};

watch(
  () => props.modelValue,
  newVal => {
    if (!editorRef.value) return;
    if (newVal === serializeContent()) return;

    if (!newVal) {
      editorRef.value.innerHTML = '';
      return;
    }

    editorRef.value.textContent = newVal;
  }
);

const focus = () => {
  editorRef.value?.focus();
};

onMounted(() => {
  if (props.modelValue && editorRef.value) {
    editorRef.value.textContent = props.modelValue;
  }
});

defineExpose({ focus });
</script>

<template>
  <div :class="props.class">
    <div class="relative w-full">
      <MentionsPopup
        ref="mentionsPopupRef"
        :visible="mentionsVisible"
        :items="mentionItems"
        :query="mentionQuery"
        @select="handleSelectMention"
        @close="mentionsVisible = false"
      />

      <div class="overflow-hidden rounded-[24px] border border-black/10 bg-white/90 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.5)] backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-[#101114]/88">
        <div
          v-if="props.isThinking || activeAIOp"
          class="border-b border-black/5 px-4 py-2 dark:border-white/5"
        >
          <div class="mb-1 flex items-center justify-between gap-3 text-[11px]">
            <div class="min-w-0 truncate font-medium text-foreground/80">
              {{ progressLabel }}
            </div>
            <div class="shrink-0 tabular-nums text-muted-foreground">
              {{ progressPercent }}%
            </div>
          </div>
          <div class="h-px w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              class="h-full rounded-full bg-foreground/65 transition-all duration-300 dark:bg-white/75"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
          <div class="mt-1 truncate text-[11px] text-muted-foreground">
            {{ progressDetails }}
          </div>
        </div>

        <div class="relative flex min-h-[58px] items-center gap-3 px-4 py-3" @click="focus">
          <div
            v-if="!hasValue"
            class="pointer-events-none absolute left-4 right-16 top-1/2 -translate-y-1/2 text-[15px] leading-6 text-muted-foreground/80"
          >
            {{ props.placeholder }}
          </div>

          <div class="flex min-h-[32px] flex-1 items-center py-0.5">
            <div
              ref="editorRef"
              contenteditable="true"
              @input="handleInput"
              @keydown="handleKeyDown"
              @paste="handlePaste"
              class="max-h-40 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[15px] leading-6 text-foreground outline-none no-scrollbar"
              spellcheck="false"
            ></div>
          </div>

          <button
            @click="emit('submit')"
            :disabled="!hasValue || props.isThinking"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-black text-white transition-all duration-200 hover:translate-x-0.5 hover:bg-black/90 disabled:translate-x-0 disabled:cursor-not-allowed disabled:border-black/5 disabled:bg-black/20 disabled:text-white/70 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-white/90 dark:disabled:border-white/10 dark:disabled:bg-white/20 dark:disabled:text-white/60"
            aria-label="Send message"
          >
            <Loader2 v-if="props.isThinking" class="h-4 w-4 animate-spin" />
            <ArrowRight v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
