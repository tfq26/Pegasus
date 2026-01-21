<script lang="ts" setup>
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import { Zap, Loader2, FileText, Table, StickyNote, Database } from 'lucide-vue-next';
import MentionsPopup, { type MentionItem } from './MentionsPopup.vue';
import { useSpaceStore } from '@/stores/space';
import { useConnectionStore } from '@/stores/connection';
import { useExplorerSchema } from '@/composables/useExplorerSchema';

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
// We only need schema for the selected connection
const activeConnection = computed(() => connectionStore.selectedConnection ? [connectionStore.selectedConnection] : []);
const { schemaFor } = useExplorerSchema(activeConnection);

const inputRef = ref<HTMLInputElement | null>(null);
const mentionsVisible = ref(false);
const mentionQuery = ref('');
const mentionType = ref<'file' | 'table' | 'note' | null>(null); 
const mentionTriggerIndex = ref(-1);
const mentionsPopupRef = ref<InstanceType<typeof MentionsPopup> | null>(null);

const mentionItems = computed<MentionItem[]>(() => {
  if (!mentionType.value) return [];

  if (mentionType.value === 'file') {
    return (spaceStore.currentSpaceFiles || []).map(f => ({
      id: f.id,
      label: f.filename,
      type: 'file',
      icon: FileText,
      value: `!${f.filename}` // or ID if needed, using filename for readability
    }));
  } else if (mentionType.value === 'note') {
    return (spaceStore.currentSpaceNotes || []).map(n => ({
      id: n.id,
      label: n.title,
      type: 'note',
      icon: StickyNote,
      value: `@${n.title}`
    }));
  } else if (mentionType.value === 'table') {
    const conn = connectionStore.selectedConnection;
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
  }
  return [];
});

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const val = target.value;
  emit('update:modelValue', val);
  
  checkMentions(val, target.selectionStart || 0);
};

const checkMentions = (text: string, cursor: number) => {
  // Find the last trigger character before cursor
  const lastExcl = text.lastIndexOf('!', cursor - 1);
  const lastHash = text.lastIndexOf('#', cursor - 1);
  const lastAt = text.lastIndexOf('@', cursor - 1);
  
  const triggerIdx = Math.max(lastExcl, lastHash, lastAt);
  
  if (triggerIdx === -1) {
    mentionsVisible.value = false;
    return;
  }
  
  // Check if it's the start of a word or line
  if (triggerIdx > 0 && /\S/.test(text[triggerIdx - 1])) {
     mentionsVisible.value = false;
     return;
  }
  
  const triggerChar = text[triggerIdx];
  const query = text.slice(triggerIdx + 1, cursor);
  
  // Space escapes the mention
  if (query.includes(' ')) {
    mentionsVisible.value = false;
    return;
  }
  
  mentionTriggerIndex.value = triggerIdx;
  mentionQuery.value = query;
  
  if (triggerChar === '!') mentionType.value = 'file';
  else if (triggerChar === '#') mentionType.value = 'table';
  else if (triggerChar === '@') mentionType.value = 'note';
  
  mentionsVisible.value = true;
};

const handleSelectMention = (item: MentionItem) => {
  if (mentionTriggerIndex.value === -1 || !item.value) return;
  
  const text = props.modelValue;
  const before = text.slice(0, mentionTriggerIndex.value);
  // Ensure we replace up to the current query end (which might be the cursor pos)
  // For simplicity, we just replace the trigger + query with value + space
  const after = text.slice(mentionTriggerIndex.value + 1 + mentionQuery.value.length);
  
  // Just use the value provided (e.g. #users) + space
  const newValue = before + item.value + ' ' + after;
  
  emit('update:modelValue', newValue);
  mentionsVisible.value = false;
  
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus();
      // Move cursor to end of inserted mention
      const newCursorPos = before.length + item.value!.length + 1;
      inputRef.value.setSelectionRange(newCursorPos, newCursorPos);
    }
  });
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (mentionsVisible.value && mentionsPopupRef.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      mentionsPopupRef.value.handleKeyDown(e);
      // If we handled it in popup, don't let it propagate (especially Enter)
      if (e.key !== 'Escape') { // Escape should maybe propagate to blur?
         // For Enter/Tab/Arrows, we definitely want to stop default global submit
         if (e.key === 'Enter') e.stopPropagation();
         // Don't prevent default for arrows completely if we want to scroll input? 
         // But MentionsPopup handles selection movement, so preventing default is correct there.
      }
      return; 
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (props.modelValue.trim() && !props.isThinking) {
      // Small safety delay to ensure mention selection didn't just happen
      if (!mentionsVisible.value) {
         emit('submit');
      }
    }
  }
};

const focus = () => {
  inputRef.value?.focus();
};

defineExpose({ focus });
</script>

<template>
  <div
    id="halo-search"
    :class="[props.class, { 'is-thinking': props.isThinking }]"
  >
    <div class="aurora-glow" />
    <div class="outer-ring" />
    <div class="outer-ring" />
    <div class="outer-ring" />

    <div class="inner-glow" />

    <div class="main-border" />

    <div id="search-wrapper">
      <MentionsPopup
        ref="mentionsPopupRef"
        :visible="mentionsVisible"
        :items="mentionItems"
        :query="mentionQuery"
        @select="handleSelectMention"
        @close="mentionsVisible = false"
      />
      
      <input
        ref="inputRef"
        :value="props.modelValue"
        @input="handleInput"
        @keydown="handleKeyDown"
        :placeholder="props.placeholder"
        :disabled="props.isThinking"
        type="text"
        name="text"
        class="search-field"
        autocomplete="off"
      />
      
      <button
        @click="emit('submit')"
        :disabled="!props.modelValue.trim() || props.isThinking"
        class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full transition-all bg-primary text-primary-foreground shadow-md hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed dark:shadow-violet-900/20"
      >
        <Loader2 v-if="props.isThinking" class="w-4 h-4 animate-spin" />
        <Zap v-else class="w-4 h-4" />
      </button>
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
  height: 52px;
  border-radius: 9999px; /* Pill shape looks better with circular button, or stick to rounded-xl? User asked to refactor to look better. Let's stick to rounded-xl but cleaner. */
  border-radius: 12px;
  color: var(--foreground);
  padding-right: 50px;
  padding-left: 16px;
  font-size: 14px;
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

/* Halos */
.inner-glow,
.main-border,
.outer-ring,
.aurora-glow {
  max-height: 70px;
  height: 60px;
  width: 100%;
  position: absolute;
  overflow: hidden;
  z-index: -1;
  border-radius: 14px;
  filter: blur(8px);
  opacity: 0.0; /* Hide by default in light mode for cleaner look, show on hover/focus or in dark mode */
  transition: opacity 0.5s ease;
}

.dark .inner-glow,
.dark .main-border,
.dark .outer-ring,
.dark .aurora-glow {
  opacity: 0.4;
}

#halo-search:focus-within .inner-glow,
#halo-search:focus-within .main-border,
#halo-search:focus-within .outer-ring,
#halo-search:focus-within .aurora-glow {
    opacity: 0.5; /* Show in light mode when focused */
}

/* Aurora adjustments for less noise */
.inner-glow::before,
.main-border::before,
.outer-ring::before,
.aurora-glow::before {
    filter: brightness(1.1) contrast(1.1);
    /* Simplified gradients defined in original CSS are fine */
}

/* Animations */
.inner-glow { width: 98%; height: 90%; top: 5%; left: 1%; }
.main-border { width: 99%; height: 95%; top: 2.5%; left: 0.5%; }

/* Reuse existing keyframes and pseudo-elements */
.inner-glow::before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(83deg);
  position: absolute;
  width: 600px;
  height: 600px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-image: conic-gradient(
    rgba(0, 0, 0, 0) 0%,
    var(--primary),
    rgba(0, 0, 0, 0) 15%,
    rgba(0, 0, 0, 0) 50%,
    #ec4899,
    rgba(0, 0, 0, 0) 65%
  );
  transition: transform 2s;
}

.main-border::before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(70deg);
  position: absolute;
  width: 600px;
  height: 600px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-image: conic-gradient(
    transparent,
    #6366f1 5%,
    transparent 20%,
    transparent 50%,
    #d946ef 60%,
    transparent 75%
  );
  transition: transform 2s;
}

.outer-ring::before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(82deg);
  position: absolute;
  width: 600px;
  height: 600px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-image: conic-gradient(
    rgba(0, 0, 0, 0),
    #4f46e5,
    rgba(0, 0, 0, 0) 10%,
    rgba(0, 0, 0, 0) 50%,
    #c026d3,
    rgba(0, 0, 0, 0) 60%
  );
  transition: transform 2s;
}

.aurora-glow::before {
  content: "";
  z-index: -2;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(60deg);
  position: absolute;
  width: 800px;
  height: 800px;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-image: conic-gradient(transparent, #8b5cf6 5%, transparent 30%, transparent 50%, #ec4899 60%, transparent 80%);
  transition: transform 2s;
}

/* Hover States */
#halo-search:hover .outer-ring::before { transform: translate(-50%, -50%) rotate(-98deg); }
#halo-search:hover .aurora-glow::before { transform: translate(-50%, -50%) rotate(-120deg); }
#halo-search:hover .inner-glow::before { transform: translate(-50%, -50%) rotate(-97deg); }
#halo-search:hover .main-border::before { transform: translate(-50%, -50%) rotate(-110deg); }

/* Thinking Animation */
.is-thinking .outer-ring::before { animation: rotate-think 3s linear infinite; }
.is-thinking .aurora-glow::before { animation: rotate-think 4s linear infinite reverse; }
.is-thinking .inner-glow::before { animation: rotate-think 2.5s linear infinite; }
.is-thinking .main-border::before { animation: rotate-think 3.5s linear infinite; }

@keyframes rotate-think {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
</style>

