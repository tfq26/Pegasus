<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Progress } from '@/components/ui/progress'

const props = defineProps<{
  id: string | number
  message: string
  description?: string
  progress?: number // Now optional
  status?: 'loading' | 'success' | 'error' | 'info' | 'warning' | 'default'
}>()

const dismiss = () => {
    toast.dismiss(props.id)
}
</script>

<template>
  <div class="flex flex-col bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-[350px] overflow-hidden group">
    <div class="p-4 pb-3 flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <p class="text-[13px] font-medium text-white truncate leading-tight">{{ message }}</p>
        <p v-if="description" class="text-[11px] text-white/50 mt-1 line-clamp-1 break-all">{{ description }}</p>
      </div>
      
      <div class="flex items-center gap-2">
        <div v-if="progress !== undefined" class="text-[11px] font-normal text-white/90 tabular-nums">
          {{ Math.round(progress) }}%
        </div>
        <button 
            @click="dismiss" 
            class="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            title="Dismiss"
        >
            <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Accent / Progress Bar -->
    <div class="mt-auto">
      <Progress 
        :model-value="progress !== undefined ? progress : 100" 
        class="h-1 rounded-none bg-white/5 border-none" 
        :class="[
            status === 'success' ? '[&>div]:bg-emerald-500' : 
            status === 'error' ? '[&>div]:bg-rose-500' : 
            status === 'warning' ? '[&>div]:bg-amber-500' :
            status === 'info' ? '[&>div]:bg-blue-500' :
            '[&>div]:bg-white/40'
        ]"
      />
    </div>
  </div>
</template>

<style scoped>
.group {
  animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-in {
  from {
    transform: translateY(100%) scale(0.95);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>
