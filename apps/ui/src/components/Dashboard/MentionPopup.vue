<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Sparkles, User } from 'lucide-vue-next'

interface Mentionable {
  id: string
  type: 'pegasus' | 'user'
  name: string
  email?: string
  profilePictureUrl?: string
}

const props = defineProps<{
  query: string
  collaborators: any[]
  position: { top: number, left: number }
}>()

const emit = defineEmits<{
  select: [item: Mentionable]
  close: []
}>()

const selectedIndex = ref(0)

// Filter items based on query
const filteredItems = computed<Mentionable[]>(() => {
  const q = props.query.toLowerCase()
  
  // Always include Pegasus
  const pegasus: Mentionable = {
    id: 'pegasus',
    type: 'pegasus',
    name: 'Pegasus',
  }
  
  // Map collaborators to mentionables
  const users: Mentionable[] = props.collaborators.map(c => ({
    id: c.id || c.socketId,
    type: 'user',
    name: c.firstName || c.email?.split('@')[0] || 'Unknown',
    email: c.email,
    profilePictureUrl: c.profilePictureUrl,
  }))
  
  const all = [pegasus, ...users]
  
  if (!q) return all
  
  return all.filter(item => 
    item.name.toLowerCase().includes(q) ||
    (item.email && item.email.toLowerCase().includes(q))
  )
})

// Reset selection when items change
watch(filteredItems, () => {
  selectedIndex.value = 0
})

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredItems.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    const selected = filteredItems.value[selectedIndex.value]
    if (selected) {
      emit('select', selected)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

const getInitials = (item: Mentionable) => {
  if (item.name) {
    const parts = item.name.split(' ')
    const first = parts[0]
    const second = parts[1]
    if (parts.length >= 2 && first && second && first[0] && second[0]) {
      return (first[0] + second[0]).toUpperCase()
    }
    return item.name.substring(0, 2).toUpperCase()
  }
  return '??'
}

</script>

<template>
  <div 
    class="absolute z-50 w-64 bg-popover border border-border rounded-lg shadow-xl overflow-hidden mb-2"
    :style="{ bottom: '100%', left: `${position.left}px` }"
  >
    <div class="p-2 border-b border-border bg-muted/50">
      <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Suggestions
      </span>
    </div>
    
    <div class="max-h-48 overflow-y-auto">
      <div v-if="filteredItems.length === 0" class="p-3 text-sm text-muted-foreground text-center">
        No matches found
      </div>
      
      <button
        v-for="(item, index) in filteredItems"
        :key="item.id"
        @click="emit('select', item)"
        @mouseenter="selectedIndex = index"
        class="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
        :class="index === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'"
      >
        <!-- Avatar -->
        <div 
          class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold overflow-hidden shrink-0"
          :class="item.type === 'pegasus' 
            ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white' 
            : 'bg-primary/20 border border-border'"
        >
          <template v-if="item.type === 'pegasus'">
            <Sparkles class="w-4 h-4" />
          </template>
          <template v-else-if="item.profilePictureUrl">
            <img :src="item.profilePictureUrl" class="w-full h-full object-cover" />
          </template>
          <template v-else>
            {{ getInitials(item) }}
          </template>
        </div>
        
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">{{ item.name }}</div>
          <div v-if="item.type === 'pegasus'" class="text-[10px] text-muted-foreground">
            Ask AI about this data
          </div>
          <div v-else-if="item.email" class="text-[10px] text-muted-foreground truncate">
            {{ item.email }}
          </div>
        </div>
      </button>
    </div>
    
    <div class="p-2 border-t border-border bg-muted/30 flex items-center gap-2 text-[10px] text-muted-foreground">
      <span class="bg-muted px-1.5 py-0.5 rounded">↑↓</span> navigate
      <span class="bg-muted px-1.5 py-0.5 rounded">↵</span> select
      <span class="bg-muted px-1.5 py-0.5 rounded">esc</span> close
    </div>
  </div>
</template>
