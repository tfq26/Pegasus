<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Generate Test Data</DialogTitle>
        <DialogDescription>
          Generate realistic mock data using AI. Result will be returned as SQL.
        </DialogDescription>
      </DialogHeader>
      
      <div class="grid gap-4 py-4">
        <div class="grid gap-2">
          <Label for="count">Row Count</Label>
          <Input id="count" v-model="count" type="number" min="1" max="100" />
          <p class="text-[0.8rem] text-muted-foreground">
             Max 100 rows per batch recommended.
          </p>
        </div>
        <div class="grid gap-2">
          <Label for="hint">Context / Hint (Optional)</Label>
          <Textarea 
            id="hint" 
            v-model="hint" 
            placeholder="e.g. Ensure email addresses are valid, ages between 20-50..." 
            class="h-24 resize-none"
          />
        </div>
      </div>
      
      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">
          Cancel
        </Button>
        <Button @click="handleGenerate" :disabled="loading">
          <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
          Generate SQL
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { generateTestData } from '@/lib/api'
import { toast } from '@/composables/useNotifications'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  connectionId: string
  tableName: string
}>()

const emit = defineEmits(['update:open', 'generated'])

const count = ref(10)
const hint = ref('')
const loading = ref(false)

const handleGenerate = async () => {
    if (loading.value) return
    loading.value = true
    try {
        const res = await generateTestData(props.connectionId, props.tableName, Number(count.value), hint.value)
        emit('generated', res.sql)
        emit('update:open', false)
        toast.success('Test Data Generated')
    } catch (e: any) {
        toast.error('Failed to generate data', { description: e.message })
    } finally {
        loading.value = false
    }
}
</script>
