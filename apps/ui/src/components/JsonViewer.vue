<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-vue-next'

const props = defineProps<{
  data: unknown
  depth?: number
  maxDepth?: number
}>()

const depth = props.depth ?? 0
const maxDepth = props.maxDepth ?? 10
const expanded = ref(depth < 2) // Auto-expand first 2 levels
const copied = ref(false)

const dataType = computed(() => {
  if (props.data === null) return 'null'
  if (props.data === undefined) return 'undefined'
  if (Array.isArray(props.data)) return 'array'
  return typeof props.data
})

const isExpandable = computed(() => {
  return dataType.value === 'object' || dataType.value === 'array'
})

const entries = computed(() => {
  if (dataType.value === 'object' && props.data !== null) {
    return Object.entries(props.data as Record<string, unknown>)
  }
  if (dataType.value === 'array') {
    return (props.data as unknown[]).map((item, index) => [String(index), item])
  }
  return []
})

const toggleExpanded = () => {
  if (isExpandable.value) {
    expanded.value = !expanded.value
  }
}

const copyValue = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.data, null, 2))
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const formatPrimitive = (value: unknown): string => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return String(value)
}

const getValueColor = (value: unknown): string => {
  if (value === null || value === undefined) return 'text-stone-500'
  if (typeof value === 'string') return 'text-emerald-400'
  if (typeof value === 'number') return 'text-blue-400'
  if (typeof value === 'boolean') return 'text-orange-400'
  return 'text-stone-300'
}

const itemCount = computed(() => {
  if (dataType.value === 'array') return (props.data as unknown[]).length
  if (dataType.value === 'object' && props.data !== null) {
    return Object.keys(props.data as Record<string, unknown>).length
  }
  return 0
})
</script>

<template>
  <div class="json-viewer font-mono text-xs">
    <div v-if="!isExpandable" class="inline-flex items-center gap-2">
      <span :class="getValueColor(data)">{{ formatPrimitive(data) }}</span>
    </div>
    
    <div v-else class="flex flex-col">
      <div class="flex items-center gap-1 group">
        <button
          @click="toggleExpanded"
          class="flex items-center gap-1 hover:bg-stone-800/50 rounded px-1 py-0.5 transition-colors"
        >
          <ChevronRight
            v-if="!expanded"
            class="w-3 h-3 text-stone-500 transition-transform"
          />
          <ChevronDown
            v-else
            class="w-3 h-3 text-stone-500 transition-transform"
          />
          <span class="text-stone-400">
            {{ dataType === 'array' ? '[' : '{' }}
          </span>
          <span v-if="!expanded" class="text-stone-600 text-[10px]">
            {{ itemCount }} {{ dataType === 'array' ? 'items' : 'keys' }}
          </span>
          <span v-if="!expanded" class="text-stone-400">
            {{ dataType === 'array' ? ']' : '}' }}
          </span>
        </button>
        
        <button
          @click="copyValue"
          class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-violet-500/20 transition-all"
          title="Copy JSON"
        >
          <Check v-if="copied" class="w-3 h-3 text-emerald-400" />
          <Copy v-else class="w-3 h-3 text-stone-500" />
        </button>
      </div>

      <div v-if="expanded && depth < maxDepth" class="ml-4 border-l border-stone-800 pl-2 mt-1 space-y-1">
        <div
          v-for="[key, value] in entries"
          :key="String(key)"
          class="flex items-start gap-2"
        >
          <span class="text-violet-400 shrink-0">{{ key }}:</span>
          <JsonViewer :data="value" :depth="depth + 1" :max-depth="maxDepth" />
        </div>
      </div>

      <div v-if="expanded && depth >= maxDepth" class="ml-4 text-stone-600 text-[10px]">
        ... (max depth reached)
      </div>

      <div v-if="expanded" class="text-stone-400">
        {{ dataType === 'array' ? ']' : '}' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-viewer {
  line-height: 1.6;
}
</style>
