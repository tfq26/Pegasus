
<template>
  <div class="flex flex-col h-full border-l border-border bg-card w-[320px] relative overflow-hidden shadow-2xl animate-in slide-in-from-right duration-300">
    <!-- Header -->
    <div class="p-3 border-b border-border flex items-center justify-between z-10 bg-card">
      <div class="flex items-center gap-2">
        <History class="w-4 h-4 text-primary" />
        <h3 class="font-semibold text-sm">Activity Feed</h3>
      </div>
      <button 
        @click="$emit('close')" 
        class="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors text-muted-foreground"
        title="Close Activity Feed"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Activity List -->
    <div class="flex-1 overflow-y-auto p-3 space-y-4">
      <div v-if="activities.length === 0" class="text-center text-muted-foreground text-sm py-12 flex flex-col items-center gap-3">
        <div class="p-3 bg-muted rounded-full">
            <Activity class="w-6 h-6 opacity-20" />
        </div>
        No recent activity found.
      </div>
      
      <div 
        v-for="activity in activities" 
        :key="activity.id" 
        class="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <!-- User Avatar -->
        <div class="shrink-0 mt-0.5">
          <div 
            class="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border border-border overflow-hidden bg-primary/10"
            :title="activity.userName"
          >
             <img v-if="activity.userProfilePicture" :src="activity.userProfilePicture" class="w-full h-full object-cover">
             <span v-else>{{ getInitials(activity.userName) }}</span>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-0.5">
            <span class="text-xs font-semibold truncate">{{ activity.userName }}</span>
            <span class="text-[10px] text-muted-foreground whitespace-nowrap">{{ formatRelativeTime(activity.timestamp) }}</span>
          </div>
          
          <div class="text-xs text-foreground/90 leading-relaxed break-words">
            <span v-if="activity.type === 'add'" class="flex items-center gap-1">
                <PlusCircle class="w-3 h-3 text-green-500 shrink-0" />
                Added <strong class="text-primary">{{ activity.elementTitle }}</strong>
            </span>
            <span v-else-if="activity.type === 'update'" class="flex items-center gap-1">
                <Edit2 class="w-3 h-3 text-blue-500 shrink-0" />
                Updated <strong class="text-primary">{{ activity.elementTitle }}</strong>
            </span>
            <span v-else-if="activity.type === 'remove'" class="flex items-center gap-1">
                <Trash2 class="w-3 h-3 text-destructive shrink-0" />
                Removed <strong class="text-primary">{{ activity.elementTitle }}</strong>
            </span>
            <span v-else-if="activity.type === 'refresh'" class="flex items-center gap-1">
                <RefreshCw class="w-3 h-3 text-violet-500 shrink-0" />
                Refreshed data for <strong class="text-primary">{{ activity.elementTitle }}</strong>
            </span>
          </div>

          <!-- Changes Sneak Peek -->
          <div v-if="activity.changes && Object.keys(activity.changes).length > 0" class="mt-1.5 p-1.5 bg-muted/50 rounded-md text-[10px] text-muted-foreground font-mono truncate">
            {{ formatChanges(activity.changes) }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Footer/Stats -->
    <div class="p-2 border-t border-border bg-muted/30 text-[9px] text-center text-muted-foreground uppercase tracking-widest">
      Showing last 50 changes
    </div>
  </div>
</template>

<script setup lang="ts">
import { 
  X, History, PlusCircle, Edit2, Trash2, RefreshCw, Activity 
} from 'lucide-vue-next'

const props = defineProps<{
  activities: any[]
}>()

defineEmits(['close'])

const getInitials = (name: string) => {
  if (!name) return '??'
  const parts = name.split(' ')
  if (parts.length >= 2) {
    const first = parts[0]?.[0] || ''
    const last = parts[parts.length - 1]?.[0] || ''
    return (first + last).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

// Helper indices for initials logic safely
const Part1Idx = (p: string[]) => 0;
const Part2Idx = (p: string[]) => p.length - 1;

const formatRelativeTime = (timestamp: number) => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(timestamp).toLocaleDateString()
}

const formatChanges = (changes: any) => {
    if (!changes) return ''
    return Object.entries(changes)
        .map(([key, val]) => `${key}: ${typeof val === 'string' && val.length > 20 ? val.substring(0, 20) + '...' : val}`)
        .join(', ')
}
</script>

<style scoped>
/* Custom scrollbar matching chat */
div::-webkit-scrollbar {
  width: 4px;
}
div::-webkit-scrollbar-track {
  background: transparent;
}
div::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 10px;
}
div::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}
</style>
