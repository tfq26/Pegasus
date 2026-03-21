<script setup lang="ts">
import { computed } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Progress } from '@/components/ui/progress'
import { usePegasusTheme } from '@/composables/usePegasusTheme'

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

const themeMode = usePegasusTheme()
const preferredDark = usePreferredDark()
const isDark = computed(() => themeMode.value === 'dark' || (themeMode.value === 'auto' && preferredDark.value))
const progressClass = computed(() => {
  const tone = props.status === 'success'
    ? '[&>div]:bg-emerald-500'
    : props.status === 'error'
      ? '[&>div]:bg-rose-500'
      : props.status === 'warning'
        ? '[&>div]:bg-amber-500'
        : props.status === 'info'
          ? '[&>div]:bg-sky-500'
          : isDark.value
            ? '[&>div]:bg-white/45'
            : '[&>div]:bg-slate-900/70'

  return [
    isDark.value ? 'bg-white/[0.06]' : 'bg-slate-900/8',
    tone
  ]
})
</script>

<template>
  <div
    :class="[
      'group flex w-[350px] flex-col overflow-hidden rounded-xl border backdrop-blur-xl',
      isDark
        ? 'border-white/10 bg-zinc-950/90 text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
        : 'border-slate-200/90 bg-white/95 text-slate-900 shadow-[0_20px_50px_rgba(15,23,42,0.12)]'
    ]"
  >
    <div class="p-4 pb-3 flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <p :class="['truncate text-[13px] font-medium leading-tight', isDark ? 'text-white' : 'text-slate-900']">{{ message }}</p>
        <p v-if="description" :class="['mt-1 line-clamp-1 break-all text-[11px]', isDark ? 'text-white/50' : 'text-slate-500']">{{ description }}</p>
      </div>
      
      <div class="flex items-center gap-2">
        <div v-if="progress !== undefined" :class="['text-[11px] font-normal tabular-nums', isDark ? 'text-white/90' : 'text-slate-600']">
          {{ Math.round(progress) }}%
        </div>
        <button 
            @click="dismiss" 
            :class="[
              'rounded-full p-1 transition-colors',
              isDark
                ? 'text-white/40 hover:bg-white/10 hover:text-white'
                : 'text-slate-400 hover:bg-slate-900/5 hover:text-slate-700'
            ]"
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
        class="h-1 rounded-none border-none"
        :class="progressClass"
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
