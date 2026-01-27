<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle class="text-xl font-semibold">{{ title }}</DialogTitle>
        <DialogDescription class="text-muted-foreground mt-2">
          {{ description }}
        </DialogDescription>
      </DialogHeader>
      
      <div v-if="showInput" class="py-6">
        <label v-if="inputLabel" class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
          {{ inputLabel }}
        </label>
        <input 
          v-model="inputValue" 
          :placeholder="inputPlaceholder" 
          @keyup.enter="handleConfirm"
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          autofocus
        />
      </div>

      <DialogFooter class="flex gap-2 sm:justify-end mt-4">
        <button 
          @click="$emit('update:open', false)"
          class="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors border border-border"
        >
          Cancel
        </button>
        <button 
          @click="handleConfirm"
          :disabled="showInput && !inputValue.trim()"
          class="px-4 py-2 text-sm font-medium rounded-md transition-all shadow-sm disabled:opacity-50"
          :class="isDestructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'"
        >
          {{ confirmText || (isDestructive ? 'Delete' : 'Confirm') }}
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
  title: string
  description: string
  confirmText?: string
  isDestructive?: boolean
  showInput?: boolean
  inputLabel?: string
  inputPlaceholder?: string
  initialInputValue?: string
}>()

const emit = defineEmits(['update:open', 'confirm'])

const inputValue = ref(props.initialInputValue || '')

watch(() => props.open, (newVal) => {
  if (newVal) {
    inputValue.value = props.initialInputValue || ''
  }
})

const handleConfirm = () => {
  if (props.showInput && !inputValue.value.trim()) return
  
  if (props.showInput) {
    emit('confirm', inputValue.value)
  } else {
    emit('confirm')
  }
}
</script>
