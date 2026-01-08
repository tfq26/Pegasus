<template>
  <div class="flex items-center">
    <Tooltip :items="mappedCollaborators" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Tooltip from '@/components/usersTooltip/Tooltip.vue'

const props = defineProps<{
  collaborators: any[]
}>()

const getCollaboratorColor = (socketId: string) => {
  const colors = [
    '#FF3B30', // Red
    '#34C759', // Green
    '#007AFF', // Blue
    '#FF9500', // Orange
    '#AF52DE', // Purple
    '#5856D6', // Indigo
    '#FF2D55', // Pink
    '#30B0C7', // Teal
  ]
  let hash = 0
  for (let i = 0; i < socketId.length; i++) {
    hash = socketId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const mappedCollaborators = computed(() => {
  return props.collaborators.map((c, idx) => ({
    id: idx, // Tooltip expects a number id
    name: c.user?.firstName || c.user?.email?.split('@')[0] || 'Guest',
    designation: c.user?.email || 'Collaborator',
    image: c.user?.profilePictureUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.user?.firstName || 'G')}&background=random`,
    color: getCollaboratorColor(c.socketId)
  }))
})
</script>
