<script lang="ts" setup>
import { computed } from 'vue'
import { 
  File, 
  Folder, 
  FolderOpen, 
  FileText, 
  Image, 
  Code,
  Layout,
  Database,
  Table2,
  MoreHorizontal,
  Grid,
  MessageCircle,
  MessageSquare,
  ScrollText,
  Code2,
  Notebook,
  StickyNote,
  LayoutGrid,
  LayoutTemplate,
  FileSpreadsheet,
  FileJson,
  FileCode
} from 'lucide-vue-next'

import { usePegasusTheme } from '@/composables/usePegasusTheme'

const props = defineProps<{
  name: string
  size?: number | string
}>()

const mode = usePegasusTheme()

const iconMap: Record<string, any> = {
  'folder': Folder,
  'folder-open': FolderOpen,
  'file': File,
  'file-text': FileText,
  'image': Image,
  'code': Code,
  'code-2': Code2,
  'layout': Layout,
  'database': Database,
  'table': Table2, // Fallback
  'more': MoreHorizontal,
  'grid': Grid,
  'message-circle': MessageCircle,
  'message-square': MessageSquare,
  'scroll-text': ScrollText,
  'notebook': Notebook,
  'sticky-note': StickyNote,
  'layout-grid': LayoutGrid,
  'layout-template': LayoutTemplate,
  'file-spreadsheet': FileSpreadsheet,
  'file-json': FileJson,
  'file-code': FileCode,
  'table-2': Table2
}

// Map of special icon names to their SVG paths or themed objects
const svgIconMap: Record<string, string | { light: string, dark: string }> = {
  'excel': '/icons/microsoft/Excel/excel-file-svgrepo-com.svg',
  'table': {
    light: '/icons/table/table-rows-svgrepo-com.svg',
    dark: '/icons/table/table-rows-svgrepo-com-white.svg'
  },
  'lucide:table': {
    light: '/icons/table/table-rows-svgrepo-com.svg',
    dark: '/icons/table/table-rows-svgrepo-com-white.svg'
  },
  'lucide:sticky-note': {
    light: '/icons/note/note-svgrepo-com.svg',
    dark: '/icons/note/note-svgrepo-com-white.svg'
  },
  'logos:postgresql': '/icons/postgres/postgres.svg',
  'logos:mysql': '/icons/mysql/mysql.svg',
  'logos:sqlite': '/icons/sqlite/sqlite.svg',
  'logos:mongodb-icon': '/icons/mongo/mongo-svgrepo-com.svg',
  'logos:azure-icon': '/icons/microsoft/Azure/azure-2.svg',
  'logos:google-cloud': '/icons/google/google-cloud-svgrepo-com.svg',
  'logos:snowflake-icon': '/icons/snowflake/snowflake-svgrepo-com.svg'
}

const iconComponent = computed(() => {
  const normalized = props.name.replace('lucide:', '')
  return iconMap[normalized] || null
})

const iconSize = computed(() => Number(props.size) || 16)

const isPath = computed(() => {
  return props.name?.startsWith('/') || props.name?.startsWith('http')
})

const isSvgIcon = computed(() => {
  return svgIconMap[props.name] !== undefined
})

const svgPath = computed(() => {
  const entry = svgIconMap[props.name]
  if (entry) {
    if (typeof entry === 'string') return entry
    return mode.value === 'dark' ? entry.dark : entry.light
  }
  if (isPath.value) return props.name
  return null
})
</script>

<template>
  <img 
    v-if="svgPath" 
    :src="svgPath" 
    :style="{ width: iconSize + 'px', height: iconSize + 'px' }" 
    class="object-contain shrink-0"
    alt=""
  />
  <component 
    v-else-if="iconComponent" 
    :is="iconComponent" 
    :size="iconSize" 
    class="shrink-0"
  />
  <File v-else :size="iconSize" class="shrink-0" />
</template>
