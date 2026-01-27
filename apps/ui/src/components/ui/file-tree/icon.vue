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
  MoreHorizontal
} from 'lucide-vue-next'

const props = defineProps<{
  name: string
  size?: number | string
}>()

const iconMap: Record<string, any> = {
  'folder': Folder,
  'folder-open': FolderOpen,
  'file': File,
  'file-text': FileText,
  'image': Image,
  'code': Code,
  'layout': Layout,
  'database': Database,
  'table': Table2,
  'more': MoreHorizontal
}

const iconComponent = computed(() => {
  const normalized = props.name.replace('lucide:', '')
  return iconMap[normalized] || File
})

const iconSize = computed(() => Number(props.size) || 16)

const isPath = computed(() => {
  return props.name?.startsWith('/') || props.name?.startsWith('http')
})
</script>

<template>
  <img 
    v-if="isPath" 
    :src="name" 
    :style="{ width: iconSize + 'px', height: iconSize + 'px' }" 
    class="object-contain"
    alt=""
  />
  <component v-else :is="iconComponent" :size="iconSize" />
</template>
