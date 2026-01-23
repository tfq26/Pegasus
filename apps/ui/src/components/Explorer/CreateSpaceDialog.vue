<script setup lang="ts">
import { ref } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSpaceStore } from '@/stores/space'
import { Loader2, Info, X, Box, Code, Database, Globe, Lock, Layout, Cloud, Shield } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': []
}>()

const spaceStore = useSpaceStore()
const loading = ref(false)

// Icons
const icons = [
  { value: 'box', label: 'Box', component: Box },
  { value: 'code', label: 'Code', component: Code },
  { value: 'database', label: 'Database', component: Database },
  { value: 'globe', label: 'Globe', component: Globe },
  { value: 'lock', label: 'Lock', component: Lock },
  { value: 'layout', label: 'Layout', component: Layout },
  { value: 'cloud', label: 'Cloud', component: Cloud },
  { value: 'shield', label: 'Shield', component: Shield },
]

// Create Form
const name = ref('')
const description = ref('')
const selectedColor = ref('#8B5CF6')
const selectedIcon = ref('box')
const tags = ref<string[]>([])
const newTag = ref('')

const colors = [
  '#8B5CF6', // Purple
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#F43F5E', // Rose
  '#64748B', // Slate
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
  '#84CC16', // Lime
]

// Join Form
const inviteCode = ref('')

function addTag() {
  if (newTag.value.trim() && !tags.value.includes(newTag.value.trim())) {
    tags.value.push(newTag.value.trim())
    newTag.value = ''
  }
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

async function handleCreate() {
  if (!name.value) return
  
  loading.value = true
  try {
    await spaceStore.createSpace(name.value, description.value, selectedIcon.value, selectedColor.value, tags.value)
    emit('created')
    emit('update:open', false)
    
    // Reset
    name.value = ''
    description.value = ''
    selectedColor.value = '#8B5CF6'
    selectedIcon.value = 'box'
    tags.value = []
    newTag.value = ''
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function handleJoin() {
  if (!inviteCode.value) return
  
  loading.value = true
  try {
     // TODO: Implement join logic
     // await spaceStore.joinSpace(inviteCode.value)
     
     // For now, mock a delay
     await new Promise(resolve => setTimeout(resolve, 1000))
     
     emit('update:open', false)
     inviteCode.value = ''
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Add Space</DialogTitle>
        <DialogDescription>
          Create a new space to organize your data or join an existing one given a code.
        </DialogDescription>
      </DialogHeader>
      
      <Tabs default-value="create" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="create">Create New</TabsTrigger>
          <TabsTrigger value="join">Join Existing</TabsTrigger>
        </TabsList>
        
        <TabsContent value="create" class="space-y-4 py-4">
           <div class="space-y-2">
             <Label>Space Name</Label>
             <Input v-model="name" placeholder="e.g. Marketing Team" />
           </div>
           
           <div class="space-y-2">
             <Label>Description (Optional)</Label>
             <Input v-model="description" placeholder="What is this space for?" />
           </div>
           
           <div class="grid grid-cols-2 gap-4">
               <div class="space-y-2">
                 <Label>Icon</Label>
                 <div class="flex flex-wrap gap-2">
                   <button
                     v-for="icon in icons"
                     :key="icon.value"
                     @click="selectedIcon = icon.value"
                     class="w-8 h-8 rounded-lg border transition-all flex items-center justify-center hover:bg-muted"
                     :class="selectedIcon === icon.value ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground'"
                   >
                     <component :is="icon.component" class="w-4 h-4" />
                   </button>
                 </div>
               </div>

               <div class="space-y-2">
                 <Label>Color Tag</Label>
                 <div class="flex flex-wrap gap-2">
                   <button
                     v-for="color in colors"
                     :key="color"
                     @click="selectedColor = color"
                     class="w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center"
                     :class="selectedColor === color ? 'border-primary ring-2 ring-ring ring-offset-2' : 'border-transparent hover:scale-105'"
                     :style="{ backgroundColor: color }"
                   >
                   </button>
                 </div>
               </div>
           </div>

            <!-- Tags -->
            <div class="space-y-2">
                <Label>Tags</Label>
                <div class="flex flex-wrap gap-2 mb-2" v-if="tags.length > 0">
                    <div v-for="tag in tags" :key="tag" class="flex items-center bg-muted px-2 py-1 rounded text-xs">
                        {{ tag }}
                        <button @click="removeTag(tag)" class="ml-1 hover:text-destructive"><X class="w-3 h-3" /></button>
                    </div>
                </div>
                <Input 
                    v-model="newTag" 
                    placeholder="Add tags (press Enter)" 
                    @keydown.enter.prevent="addTag"
                />
            </div>
           
           <div class="pt-2 flex justify-end">
               <Button @click="handleCreate" :disabled="!name || loading">
                  <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
                  Create Space
               </Button>
           </div>
        </TabsContent>
        
        <TabsContent value="join" class="space-y-4 py-4">
           <div class="p-6 rounded-lg bg-muted/30 border border-dashed border-border text-center flex flex-col items-center justify-center gap-2">
             <Info class="w-8 h-8 text-muted-foreground/50 mb-2" />
             <p class="text-sm font-medium text-foreground">
                Enter Invite Code
             </p>
             <p class="text-xs text-muted-foreground max-w-[200px] mb-4">
                Ask the space admin for an invite code or link to join their workspace.
             </p>
             <Input v-model="inviteCode" placeholder="e.g. x81ja-29s8a" class="text-center w-full max-w-[200px]" />
           </div>
           
            <div class="pt-2 flex justify-end">
               <Button @click="handleJoin" variant="secondary" :disabled="!inviteCode || loading">
                  <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
                  Join Space
               </Button>
           </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
