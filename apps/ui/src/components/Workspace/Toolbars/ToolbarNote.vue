<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  List, 
  ListOrdered, 
  Heading1, 
  Heading2, 
  Heading3, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Code,
  Quote,
  Save,
  Lock,
  Unlock,
  FileText,
  Loader2,
  Users2,
  Download
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  isSaving?: boolean
  isPrivate?: boolean
  fileType: 'txt' | 'md' | 'docx' | 'pdf'
  formatState?: {
    bold: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
  }
}>()

const emit = defineEmits<{
  'format': [command: string, value?: string]
  'save': []
  'update:is-private': [value: boolean]
  'update:file-type': [value: 'txt' | 'md' | 'docx' | 'pdf']
  'share': []
  'download': []
}>()

const fileTypeLabels = {
  txt: 'Plain Text (.txt)',
  md: 'Markdown (.md)',
  docx: 'Microsoft Word (.docx)',
  pdf: 'PDF Document (.pdf)'
}

const handleFileTypeChange = (type: 'txt' | 'md' | 'docx' | 'pdf') => {
  emit('update:file-type', type)
}
</script>

<template>
  <div class="flex items-center gap-2 w-full">
    <!-- Left: Format Controls -->
    <div class="flex items-center gap-1">
      <!-- Text Formatting -->
      <Button
        variant="ghost"
        size="sm"
        :class="{ 'bg-accent': formatState?.bold }"
        @mousedown.prevent
        @click="emit('format', 'bold')"
        title="Bold (Ctrl+B)"
      >
        <Bold class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="{ 'bg-accent': formatState?.italic }"
        @mousedown.prevent
        @click="emit('format', 'italic')"
        title="Italic (Ctrl+I)"
      >
        <Italic class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="{ 'bg-accent': formatState?.underline }"
        @mousedown.prevent
        @click="emit('format', 'underline')"
        title="Underline (Ctrl+U)"
      >
        <Underline class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="{ 'bg-accent': formatState?.strikethrough }"
        @mousedown.prevent
        @click="emit('format', 'strikeThrough')"
        title="Strikethrough"
      >
        <Strikethrough class="w-4 h-4" />
      </Button>

      <div class="w-px h-6 bg-border mx-1" />

      <!-- Headings -->
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'formatBlock', 'h1')"
        title="Heading 1"
      >
        <Heading1 class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'formatBlock', 'h2')"
        title="Heading 2"
      >
        <Heading2 class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'formatBlock', 'h3')"
        title="Heading 3"
      >
        <Heading3 class="w-4 h-4" />
      </Button>

      <div class="w-px h-6 bg-border mx-1" />

      <!-- Lists -->
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'insertUnorderedList')"
        title="Bullet List"
      >
        <List class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'insertOrderedList')"
        title="Numbered List"
      >
        <ListOrdered class="w-4 h-4" />
      </Button>

      <div class="w-px h-6 bg-border mx-1" />

      <!-- Alignment -->
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'justifyLeft')"
        title="Align Left"
      >
        <AlignLeft class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'justifyCenter')"
        title="Align Center"
      >
        <AlignCenter class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'justifyRight')"
        title="Align Right"
      >
        <AlignRight class="w-4 h-4" />
      </Button>

      <div class="w-px h-6 bg-border mx-1" />

      <!-- Special -->
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'formatBlock', 'pre')"
        title="Code Block"
      >
        <Code class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        @mousedown.prevent
        @click="emit('format', 'formatBlock', 'blockquote')"
        title="Quote"
      >
        <Quote class="w-4 h-4" />
      </Button>
    </div>

    <div class="flex-1" />

    <!-- Right: Privacy & Format Controls -->
    <div class="flex items-center gap-2">
      <!-- Format Type Selector -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" class="gap-2">
            <FileText class="w-4 h-4" />
            <span class="text-xs">{{ fileTypeLabels[fileType] }}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            @click="handleFileTypeChange('txt')"
          >
            Plain Text (.txt)
          </DropdownMenuItem>
          <DropdownMenuItem
            @click="handleFileTypeChange('md')"
          >
            Markdown (.md)
          </DropdownMenuItem>
          <DropdownMenuItem
            @click="handleFileTypeChange('docx')"
          >
            Microsoft Word (.docx)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            @click="handleFileTypeChange('pdf')"
          >
            PDF (.pdf)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Share Button -->
      <Button
        variant="outline"
        size="sm"
        @click="emit('share')"
        title="Share & Collaborate"
      >
        <Users2 class="w-4 h-4" />
      </Button>

      <!-- Privacy Toggle -->
      <Button
        variant="outline"
        size="sm"
        @click="emit('update:is-private', !isPrivate)"
        :title="isPrivate ? 'Private note' : 'Public note'"
      >
        <Lock v-if="isPrivate" class="w-4 h-4" />
        <Unlock v-else class="w-4 h-4" />
      </Button>

      <!-- Save Button -->
      <Button
        size="sm"
        @click="emit('save')"
        :disabled="isSaving"
      >
        <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
        <Save v-else class="w-4 h-4 mr-2" />
        {{ isSaving ? 'Saving...' : 'Save' }}
      </Button>
    </div>
  </div>
</template>
