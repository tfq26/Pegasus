<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  content: string
}>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const renderedContent = computed(() => {
  return md.render(props.content || '')
})
</script>

<template>
  <div class="markdown-body" v-html="renderedContent"></div>
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
</style>
