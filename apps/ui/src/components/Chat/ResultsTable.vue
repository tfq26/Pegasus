<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import JsonViewer from '@/components/JsonViewer.vue'
import { Braces } from 'lucide-vue-next'

const props = defineProps<{
  data: any[]
}>()

const selectedData = ref<any>(null)
const isDialogOpen = ref(false)

const openJsonModal = (data: any) => {
  selectedData.value = data
  isDialogOpen.value = true
}

const isObject = (val: any) => {
  return typeof val === 'object' && val !== null
}

const columns = computed(() => {
  if (!props.data || props.data.length === 0) return []
  // Get all unique keys from all objects to handle sparse data
  const keys = new Set<string>()
  props.data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(k => keys.add(k))
    }
  })
  return Array.from(keys)
})

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}
</script>

<template>
  <div class="overflow-auto max-h-full border border-stone-800 rounded-lg bg-stone-900/50">
    <table class="w-full text-left text-xs border-collapse">
      <thead class="bg-stone-900 sticky top-0 z-10">
        <tr>
          <th
            v-for="col in columns"
            :key="col"
            class="px-4 py-2 font-medium text-stone-400 border-b border-stone-800 whitespace-nowrap"
          >
            {{ col }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-stone-800/50">
        <tr
          v-for="(row, i) in data"
          :key="i"
          class="hover:bg-stone-800/50 transition-colors"
        >
          <td
            v-for="col in columns"
            :key="col"
            class="px-4 py-2 text-stone-300 whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis"
          >
            <button 
              v-if="isObject(row[col])"
              @click="openJsonModal(row[col])"
              class="flex items-center gap-1.5 px-2 py-1 rounded bg-stone-800 hover:bg-violet-600 hover:text-white text-stone-400 transition-colors text-[10px] font-medium"
            >
              <Braces class="w-3 h-3" />
              <span>View JSON</span>
            </button>
            <span v-else :title="formatValue(row[col])">{{ formatValue(row[col]) }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col bg-stone-900 border-stone-800 text-stone-100">
        <DialogHeader>
          <DialogTitle>JSON View</DialogTitle>
        </DialogHeader>
        <div class="flex-1 overflow-auto p-4 bg-stone-950 rounded-md">
          <JsonViewer :data="selectedData" :max-depth="5" />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
