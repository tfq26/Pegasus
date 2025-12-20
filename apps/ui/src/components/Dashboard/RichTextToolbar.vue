<template>
  <div class="flex items-center gap-1 p-2 border-b border-border bg-muted/30 overflow-x-auto">
    <!-- Font Size -->
    <div class="flex items-center gap-1 pr-2 border-r border-border/50">
      <select 
        v-model="fontSize" 
        @change="$emit('format', 'fontSize', fontSize)"
        class="text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="12">12</option>
        <option value="14">14</option>
        <option value="16">16</option>
        <option value="18">18</option>
        <option value="20">20</option>
        <option value="24">24</option>
        <option value="28">28</option>
        <option value="32">32</option>
        <option value="36">36</option>
      </select>
      <span class="text-xs text-muted-foreground">px</span>
    </div>

    <!-- Text Style -->
    <div class="flex items-center gap-0.5 px-2 border-r border-border/50">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        :class="{ 'bg-muted text-foreground': activeFormats?.bold }"
        @click="toggleFormat('bold')"
        title="Bold (Ctrl+B)"
      >
        <Bold class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        :class="{ 'bg-muted text-foreground': activeFormats?.italic }"
        @click="toggleFormat('italic')"
        title="Italic (Ctrl+I)"
      >
        <Italic class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        :class="{ 'bg-muted text-foreground': activeFormats?.underline }"
        @click="toggleFormat('underline')"
        title="Underline (Ctrl+U)"
      >
        <Underline class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        :class="{ 'bg-muted text-foreground': activeFormats?.strikethrough }"
        @click="toggleFormat('strikethrough')"
        title="Strikethrough"
      >
        <Strikethrough class="w-4 h-4" />
      </button>
    </div>

    <!-- Headings -->
    <div class="flex items-center gap-0.5 px-2 border-r border-border/50">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition text-xs font-semibold"
        :class="{ 'bg-muted text-foreground': activeFormats?.h1 }"
        @click="toggleFormat('h1')"
        title="Heading 1"
      >
        H1
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition text-xs font-semibold"
        :class="{ 'bg-muted text-foreground': activeFormats?.h2 }"
        @click="toggleFormat('h2')"
        title="Heading 2"
      >
        H2
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition text-xs font-semibold"
        :class="{ 'bg-muted text-foreground': activeFormats?.h3 }"
        @click="toggleFormat('h3')"
        title="Heading 3"
      >
        H3
      </button>
    </div>

    <!-- Lists -->
    <div class="flex items-center gap-0.5 px-2 border-r border-border/50">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        :class="{ 'bg-muted text-foreground': activeFormats?.bulletList }"
        @click="toggleFormat('bulletList')"
        title="Bullet List"
      >
        <List class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        :class="{ 'bg-muted text-foreground': activeFormats?.orderedList }"
        @click="toggleFormat('orderedList')"
        title="Numbered List"
      >
        <ListOrdered class="w-4 h-4" />
      </button>
    </div>

    <!-- Insert -->
    <div class="flex items-center gap-0.5 px-2">
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        @click="toggleFormat('link')"
        title="Insert Link"
      >
        <Link class="w-4 h-4" />
      </button>
      <button 
        class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
        @click="toggleFormat('code')"
        title="Code Block"
      >
        <Code class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { 
  Bold, 
  Italic, 
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link,
  Code
} from 'lucide-vue-next'

const props = defineProps<{
  activeFormats?: {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    h1?: boolean
    h2?: boolean
    h3?: boolean
    bulletList?: boolean
    orderedList?: boolean
  }
}>()

const emit = defineEmits<{
  (e: 'format', type: string, value?: any): void
}>()

const fontSize = ref('16')

const toggleFormat = (format: string) => {
  emit('format', format)
}
</script>
