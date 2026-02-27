<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  content: string
}>()

const emit = defineEmits(['update:content'])

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
})

const checkboxRegex = /^([\s>]*?(?:-\s*|\*\s*|\d+\.\s*)?)\[([ xX])\](\s)/gm;

const renderedContent = computed(() => {
  let idx = 0;
  const preprocessed = (props.content || '').replace(checkboxRegex, (match, prefix, check, suffix) => {
    const isChecked = check.toLowerCase() === 'x';
    const html = `${prefix}<input type="checkbox" class="markdown-checkbox w-4 h-4 rounded appearance-none border border-border bg-background checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 relative cursor-pointer top-[2px] mx-1 transition-colors" data-index="${idx}" ${isChecked ? 'checked' : ''} />${suffix}`;
    idx++;
    return html;
  });
  return md.render(preprocessed)
})

const handleCheckboxChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target || target.type !== 'checkbox' || !target.classList.contains('markdown-checkbox')) return;
  
  const cbIndex = parseInt(target.getAttribute('data-index') || '-1', 10);
  if (cbIndex >= 0) {
    let currentContent = props.content || '';
    let matchCount = 0;
    
    currentContent = currentContent.replace(checkboxRegex, (match, prefix, check, suffix) => {
      if (matchCount === cbIndex) {
        matchCount++;
        const newCheck = target.checked ? 'x' : ' ';
        return `${prefix}[${newCheck}]${suffix}`;
      }
      matchCount++;
      return match;
    });
    
    emit('update:content', currentContent);
  }
}

const handleCheckboxClick = (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.tagName.toLowerCase() === 'input' && target.classList.contains('markdown-checkbox')) {
    e.stopPropagation();
  }
}
</script>

<template>
  <div class="markdown-body" v-html="renderedContent" @change="handleCheckboxChange" @click="handleCheckboxClick"></div>
</template>

<style scoped>
/* Basic Markdown Styling mimicking GitHub-style */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  line-height: 1.25;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  color: hsl(var(--foreground));
}

.markdown-body :deep(h1) { font-size: 1.5em; border-bottom: 1px solid hsl(var(--border) / 0.5); padding-bottom: 0.3em; }
.markdown-body :deep(h2) { font-size: 1.3em; border-bottom: 1px solid hsl(var(--border) / 0.3); padding-bottom: 0.3em; }
.markdown-body :deep(h3) { font-size: 1.1em; }

.markdown-body :deep(p) {
  margin-top: 0;
  margin-bottom: 1em;
  line-height: 1.6;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin-bottom: 1em;
  list-style-type: disc;
}
.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(li) {
  margin-bottom: 0.25em;
}

.markdown-body :deep(code) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: hsl(var(--muted));
  border-radius: 6px;
  font-family: monospace;
}

.markdown-body :deep(pre) {
  padding: 16px;
  overflow: auto;
  line-height: 1.45;
  background-color: hsl(var(--muted));
  border-radius: 6px;
  margin-bottom: 1em;
}

.markdown-body :deep(pre code) {
  background-color: transparent;
  padding: 0;
  font-size: 100%;
}

.markdown-body :deep(strong) {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.markdown-body :deep(table) {
  width: 100%;
  margin-bottom: 1rem;
  border-collapse: collapse;
  font-size: 0.9em;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 0.5rem;
  border: 1px solid hsl(var(--border) / 0.5);
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: hsl(var(--muted) / 0.5);
  font-weight: 600;
}

.markdown-body :deep(tr:nth-child(even)) {
  background-color: hsl(var(--muted) / 0.2);
}

.markdown-body :deep(.markdown-checkbox) {
  vertical-align: text-bottom;
}

.markdown-body :deep(.markdown-checkbox:checked::after) {
  content: '';
  position: absolute;
  top: 45%;
  left: 50%;
  width: 4px;
  height: 8px;
  border: solid hsl(var(--primary-foreground));
  border-width: 0 2px 2px 0;
  transform: translate(-50%, -50%) rotate(45deg);
}
</style>
