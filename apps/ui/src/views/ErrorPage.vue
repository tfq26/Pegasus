<template>
  <div 
    class="h-full w-full flex items-center justify-center p-6 animate-in fade-in duration-500"
    :class="isDark ? 'bg-black/90 text-foreground' : 'bg-stone-50/90 text-stone-900'"
  >
    <div 
      class="max-w-xl w-full border rounded-3xl p-12 shadow-2xl relative overflow-hidden text-center group transition-all duration-300"
      :class="[
        isDark 
          ? 'bg-[#0a0a0b] border-white/5 ring-1 ring-purple-500/20 shadow-purple-900/10' 
          : 'bg-white border-stone-200 ring-1 ring-purple-100 shadow-xl shadow-purple-900/5'
      ]"
    >
      
      <!-- Ambient Glow (Pegasus Purple) -->
      <div 
        class="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-[100px] transition-all duration-1000"
        :class="isDark ? 'bg-purple-600/30 group-hover:bg-purple-600/40' : 'bg-purple-200/50 group-hover:bg-purple-300/40'"
      ></div>
      <div 
        class="absolute -bottom-40 -left-32 w-80 h-80 rounded-full blur-[100px] transition-all duration-1000"
        :class="isDark ? 'bg-blue-600/20 group-hover:bg-blue-600/30' : 'bg-blue-100/60 group-hover:bg-blue-200/50'"
      ></div>
      
      <!-- Pegasus Brand Icon -->
      <div class="absolute top-8 left-1/2 -translate-x-1/2 opacity-50">
        <img 
          :src="isDark ? '/logo_new_white.svg' : '/logo_new.svg'" 
          alt="Pegasus Logo" 
          class="w-16 h-16 transition-all duration-500"
          :class="isDark ? 'drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'drop-shadow-[0_0_15px_rgba(168,85,247,0.2)]'"
        />
      </div>

      <!-- Main Icon Spacer -->
      <div class="h-12 w-full"></div>

      <!-- Content -->
      <div class="relative z-10 space-y-4 mb-10">
        <h1 
          class="text-4xl font-bold tracking-tight bg-clip-text text-transparent pb-1"
          :class="isDark 
            ? 'bg-gradient-to-br from-white via-purple-50 to-purple-200' 
            : 'bg-gradient-to-br from-stone-900 via-stone-800 to-purple-900'"
        >
          {{ displayTitle }}
        </h1>
        <p 
          class="text-base leading-relaxed max-w-sm mx-auto transition-colors duration-300"
          :class="isDark ? 'text-stone-400' : 'text-stone-500'"
        >
          {{ displayMessage }}
        </p>
      </div>

      <!-- Actions -->
      <div class="space-y-3 relative z-10 max-w-xs mx-auto mb-10">
        <button 
          @click="handleReload"
          class="w-full px-5 py-3.5 rounded-xl font-bold transition-all duration-200 shadow-lg flex items-center justify-center gap-2 group/btn active:scale-95"
          :class="isDark 
            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20' 
            : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/30'"
        >
          <RefreshCcw class="w-4 h-4 group-hover/btn:rotate-180 transition-transform duration-500" />
          Reload Application
        </button>
        
        <button 
          @click="goDashboard"
          class="w-full px-5 py-3.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 border"
          :class="isDark
            ? 'bg-white/5 hover:bg-white/10 text-white border-white/5 hover:border-purple-500/30'
            : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 hover:border-purple-300 shadow-sm'"
        >
          <LayoutDashboard class="w-4 h-4 text-stone-500" :class="{ 'text-purple-300': isDark, 'text-stone-500': !isDark }" />
          Back to Dashboard
        </button>
      </div>

      <!-- Footer: Error Code & Details -->
      <div class="relative z-10 border-t pt-6 flex flex-col items-center gap-4 transition-colors duration-300" :class="isDark ? 'border-white/5' : 'border-stone-100'">
          <div 
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-widest font-bold"
            :class="isDark 
              ? 'bg-purple-500/10 border-purple-500/20 text-purple-300' 
              : 'bg-purple-50 border-purple-100 text-purple-700'"
          >
            <span>Code</span>
            <span class="font-mono" :class="isDark ? 'text-purple-200' : 'text-purple-900'">{{ errorCode }}</span>
        </div>

        <!-- Technical Details (Collapsible) -->
        <div v-if="errorDetails" class="w-full">
            <button 
              @click="showDetails = !showDetails" 
              class="text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-1.5 mx-auto transition-colors duration-300"
              :class="isDark ? 'text-stone-600 hover:text-purple-400' : 'text-stone-400 hover:text-purple-600'"
            >
                <component :is="showDetails ? ChevronUp : ChevronDown" class="w-3 h-3" />
                Wait, what happened?
            </button>
            <div 
              v-if="showDetails" 
              class="mt-4 rounded-xl border p-4 text-left overflow-x-auto custom-scrollbar max-h-48 shadow-inner animate-in slide-in-from-top-2 duration-200"
              :class="isDark 
                ? 'bg-black/50 border-purple-500/20' 
                : 'bg-stone-50 border-stone-200'"
            >
                <pre class="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed" :class="isDark ? 'text-purple-300/90' : 'text-purple-800/80'">{{ errorDetails }}</pre>
            </div>
        </div>

        <div class="mt-2">
            <a 
              href="mailto:support@pegasus.com" 
              class="text-xs font-medium transition-colors"
              :class="isDark ? 'text-stone-600 hover:text-stone-400' : 'text-stone-400 hover:text-stone-600'"
            >Contact Support</a>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, AlertOctagon, RefreshCcw, ChevronDown, ChevronUp, Sparkles, LayoutDashboard } from 'lucide-vue-next'
import { useColorMode, usePreferredDark } from '@vueuse/core'

const props = defineProps<{
    code?: string | number
    title?: string
    message?: string
    details?: string
    fatal?: boolean
}>()

const route = useRoute()
const useRouterObj = useRouter()
const preferredDark = usePreferredDark()
const mode = useColorMode({
  emitAuto: true,
  selector: 'html',
  attribute: 'class',
  storageKey: 'pegasus-theme',
})

const isDark = computed(() => mode.value === 'dark' || (mode.value === 'auto' && preferredDark.value))

const showDetails = ref(false)

// Determine values: Props take precedence, then route query, then defaults
const errorCode = computed(() => props.code || route.query.code || 'ERR_UNKNOWN')
const displayTitle = computed(() => props.title || (route.query.title as string) || 'Application Error')
const displayMessage = computed(() => props.message || (route.query.message as string) || 'An unexpected runtime error has occurred. We have logged this issue and are working to resolve it.')
const errorDetails = computed(() => props.details || (route.query.details as string) || null)
const isFatal = computed(() => props.fatal ?? true)

const severity = computed(() => {
    const c = String(errorCode.value)
    if (c === '404' || c.startsWith('WARN')) return 'warning'
    return 'critical'
})

const handleReload = () => {
    window.location.reload()
}

const goDashboard = () => {
    // Force a full reload to clear any corrupted state
    window.location.href = '/dashboard'
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
</style>
