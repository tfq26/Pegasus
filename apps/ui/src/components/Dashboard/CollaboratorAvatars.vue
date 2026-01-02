
<template>
  <div class="flex items-center -space-x-2">
    <div 
      v-for="collaborator in collaborators" 
      :key="collaborator.socketId"
      class="relative group"
      :title="collaborator.user.email"
    >
      <div class="w-8 h-8 rounded-lg border-2 border-background bg-muted flex items-center justify-center overflow-hidden text-xs font-medium text-foreground">
        <img 
          v-if="collaborator.user.profilePictureUrl" 
          :src="collaborator.user.profilePictureUrl" 
          class="w-full h-full object-cover"
        >
        <span v-else>{{ getInitials(collaborator.user) }}</span>
      </div>
      
      <!-- Tooltip -->
      <div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md border border-border z-[100]">
        {{ collaborator.user.firstName || collaborator.user.email }}
      </div>
    </div>
    
    <!-- More count if needed (simplified for now to show all) -->
  </div>
</template>

<script setup lang="ts">
defineProps<{
  collaborators: any[]
}>()

const getInitials = (u: any) => {
  if (u.firstName && u.lastName) return (u.firstName[0] + u.lastName[0]).toUpperCase()
  return u.email?.substring(0, 2).toUpperCase() || '?'
}
</script>
