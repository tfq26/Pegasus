<script setup lang="ts">
import { ref, watch } from 'vue'
import { Edit } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ConnectionEntry } from '@/lib/db-connections'

const props = defineProps<{
  renamingTable: { conn: ConnectionEntry; oldName: string; newName: string } | null
}>()

const emit = defineEmits<{
  'cancel': []
  'confirm': [newName: string]
}>()

function formatTableName(tableName: string): string {
  if (!tableName) return ''
  
  // Pattern 1: data_UUID_actualName (no dashes in hex)
  const pattern1 = /^data_[a-f0-9]{32}_(.+)$/
  const match1 = tableName.match(pattern1)
  if (match1) return match1[1] || ''
  
  // Pattern 2: data_UUID_with_dashes_actualName
  const pattern2 = /^data_[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12}_(.+)$/
  const match2 = tableName.match(pattern2)
  if (match2) return match2[1] || ''

  return tableName
}

const localNewName = ref('')

watch(() => props.renamingTable, (table) => {
  if (table) {
    localNewName.value = table.newName
  }
}, { immediate: true })

function handleConfirm() {
  if (localNewName.value.trim()) {
    emit('confirm', localNewName.value.trim())
  }
}
</script>

<template>
  <Dialog :open="!!renamingTable" @update:open="(val) => !val && emit('cancel')">
    <DialogContent class="bg-[#0a0a0b] border-stone-800 text-stone-100 max-w-sm rounded-[32px]">
      <DialogHeader class="items-center text-center p-6 space-y-4">
        <div class="w-16 h-16 rounded-3xl bg-violet-500/10 flex items-center justify-center text-violet-400">
          <Edit class="w-8 h-8" />
        </div>
        <div>
          <DialogTitle class="text-xl font-bold">Rename Table</DialogTitle>
          <DialogDescription class="text-stone-500 mt-2 break-all line-clamp-2">
            Update the name for "{{ formatTableName(renamingTable?.oldName || '') }}"
          </DialogDescription>
        </div>
      </DialogHeader>
      <div class="px-6 pb-2 overflow-hidden">
         <input 
           v-model="localNewName"
           @keydown.enter="handleConfirm"
           @keydown.esc="emit('cancel')"
           type="text" 
           placeholder="New Table Name" 
           class="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 transition-all text-sm"
         />
      </div>
      <DialogFooter class="px-6 pb-6 pt-2 flex flex-col gap-2">
        <button @click="handleConfirm" class="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all">
          Update Name
        </button>
        <button @click="emit('cancel')" class="w-full py-3 rounded-2xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white font-bold transition-all">
          Cancel
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
