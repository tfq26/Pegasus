<template>
  <div 
    class="h-full w-full flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-500 overflow-y-auto"
    :class="isDark ? 'bg-black/90 text-foreground' : 'bg-stone-50/90 text-stone-900'"
  >
    <div 
      class="max-w-4xl w-full border rounded-2xl md:rounded-3xl p-6 md:p-12 shadow-2xl relative overflow-hidden text-center group transition-all duration-300 my-auto"
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
          class="w-12 h-12 md:w-16 md:h-16 transition-all duration-500"
          :class="isDark ? 'drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'drop-shadow-[0_0_15px_rgba(168,85,247,0.2)]'"
        />
      </div>

      <!-- Main Icon Spacer -->
      <div class="h-10 md:h-12 w-full"></div>

      <!-- Content -->
      <div class="relative z-10 space-y-4 mb-8 md:mb-10">
        <h1 
          class="text-2xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent pb-1"
          :class="isDark 
            ? 'bg-gradient-to-br from-white via-purple-50 to-purple-200' 
            : 'bg-gradient-to-br from-stone-900 via-stone-800 to-purple-900'"
        >
          {{ displayTitle }}
        </h1>
        <p 
          class="text-sm md:text-base leading-relaxed max-w-lg mx-auto transition-colors duration-300 px-4"
          :class="isDark ? 'text-stone-400' : 'text-stone-500'"
        >
          {{ displayMessage }}
        </p>
      </div>

      <!-- Actions -->
      <div class="space-y-3 relative z-10 max-w-xs mx-auto mb-8 md:mb-10">
        <button 
          @click="handleReload"
          class="w-full px-5 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg flex items-center justify-center gap-2 group/btn active:scale-95 text-sm md:text-base"
          :class="isDark 
            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20' 
            : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/30'"
        >
          <RefreshCcw class="w-4 h-4 group-hover/btn:rotate-180 transition-transform duration-500" />
          Reload Application
        </button>
        
        <button 
          @click="goDashboard"
          class="w-full px-5 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 border text-sm md:text-base"
          :class="isDark
            ? 'bg-white/5 hover:bg-white/10 text-white border-white/5 hover:border-purple-500/30'
            : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 hover:border-purple-300 shadow-sm'"
        >
          <LayoutDashboard class="w-4 h-4 text-stone-500" :class="{ 'text-purple-300': isDark, 'text-stone-500': !isDark }" />
          Back to Dashboard
        </button>

        <button 
          @click="handleSupport" 
          :disabled="sending || sent"
          class="w-full px-5 py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 border text-sm md:text-base disabled:opacity-50 disabled:cursor-not-allowed"
          :class="isDark
            ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/20'
            : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-100 shadow-sm'"
        >
          <Send v-if="!sending && !sent" class="w-4 h-4" />
          <Loader2 v-if="sending" class="w-4 h-4 animate-spin" />
          <Check v-if="sent" class="w-4 h-4 text-green-500" />
          {{ sent ? 'Report Sent' : sending ? 'Sending...' : 'Send to Support' }}
        </button>
      </div>

      <!-- Footer: Error Code & Details (Dev Only) -->
      <footer v-if="isDev" class="relative z-10 border-t pt-6 flex flex-col items-center gap-4 transition-colors duration-300" :class="isDark ? 'border-white/5' : 'border-stone-100'">
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
                Wait, what happened? (Dev Mode)
            </button>
            <div 
              v-if="showDetails" 
              class="mt-4 rounded-xl border p-4 text-left overflow-x-auto custom-scrollbar max-h-64 shadow-inner animate-in slide-in-from-top-2 duration-200 relative group/code"
              :class="isDark 
                ? 'bg-black/50 border-purple-500/20' 
                : 'bg-stone-50 border-stone-200'"
            >
                <button 
                    @click="copyDetails" 
                    class="absolute top-2 right-2 p-1.5 rounded-md transition-all opacity-0 group-hover/code:opacity-100 bg-background/50 backdrop-blur-sm border border-border"
                    :class="copied ? 'text-green-500' : 'text-muted-foreground hover:text-purple-500'"
                >
                    <Check v-if="copied" class="w-3.5 h-3.5" />
                    <Copy v-else class="w-3.5 h-3.5" />
                </button>
                <pre class="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed" :class="isDark ? 'text-purple-300/90' : 'text-purple-800/80'">{{ errorDetails }}</pre>
            </div>
        </div>
      </footer>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshCcw, ChevronDown, ChevronUp, LayoutDashboard, Copy, Check, Send, Loader2 } from 'lucide-vue-next'
import { useColorMode, usePreferredDark, useClipboard } from '@vueuse/core'
import { useAuth } from '@/composables/useAuth'
import { api } from '@/lib/apiClient'

const props = defineProps<{
    code?: string | number
    title?: string
    message?: string
    details?: string
    fatal?: boolean
}>()

const route = useRoute()
const preferredDark = usePreferredDark()
const { copy, copied } = useClipboard()
const { user } = useAuth()
const mode = useColorMode({
  emitAuto: true,
  selector: 'html',
  attribute: 'class',
  storageKey: 'pegasus-theme',
})

const isDark = computed(() => mode.value === 'dark' || (mode.value === 'auto' && preferredDark.value))
const isDev = computed(() => import.meta.env.DEV)

const showDetails = ref(false)
const sending = ref(false)
const sent = ref(false)

// Determine values: Props take precedence, then route query, then defaults
const errorCode = computed(() => props.code || route.query.code || 'ERR_UNKNOWN')
const displayTitle = computed(() => props.title || (route.query.title as string) || 'Application Error')
const displayMessage = computed(() => props.message || (route.query.message as string) || 'An unexpected runtime error has occurred. Our engineers have been notified and are working to resolve it.')
const errorDetails = computed(() => props.details || (route.query.details as string) || null)

const handleReload = () => {
    window.location.reload()
}

const goDashboard = () => {
    window.location.href = '/dashboard'
}

const handleSupport = async () => {
    if (sending.value || sent.value) return;
    
    sending.value = true;
    try {
        await api.post('/support/report', {
            url: window.location.href,
            errorCode: errorCode.value,
            errorMessage: displayMessage.value,
            errorDetails: errorDetails.value,
            userId: user.value?.id,
            metadata: {
                userAgent: navigator.userAgent,
                language: navigator.language,
                screen: `${window.innerWidth}x${window.innerHeight}`,
                timestamp: new Date().toISOString(),
                env: isDev.value ? 'development' : 'production'
            }
        });
        
        sent.value = true;
    } catch (err) {
        console.error('[ErrorPage] Failed to send report:', err);
        // Silent failure to avoid recursive error state, maybe just toast or state
    } finally {
        sending.value = false;
    }
}

const copyDetails = async () => {
    if (errorDetails.value) {
        await copy(errorDetails.value);
    }
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
