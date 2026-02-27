
<script setup>
import { ref, watch, computed } from 'vue';
import { usePisces } from '@/composables/usePisces';
import { 

  Send, 
  Loader2, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  X,
  FileText,
  Terminal,
  Cpu,
  Copy
} from 'lucide-vue-next';
import { toast } from '@/composables/useNotifications'

const isEnabled = import.meta.env.DEV;
const isVisible = computed(() => isEnabled || !!autoReportError.value);
const { reportBug, isReporting, autoReportError, lastReport: globalLastReport } = usePisces();
const isOpen = ref(false);
const userNotes = ref('');
const result = ref(null);
const activeTab = ref('note'); // 'note' | 'logs' | 'analysis'

// Watch for auto-reports from global error handlers
watch(autoReportError, (newError) => {
  if (newError) {
    isOpen.value = true;
    userNotes.value = `System automatically captured this error: ${newError.message || 'Unknown error'}`;
    handleSubmit(); // Auto-start the AI analysis
  }
});

const handleSubmit = async () => {
  if (!userNotes.value.trim() && !confirm('Send report without notes?')) return;
  
  try {
    const data = await reportBug(userNotes.value);
    result.value = data.analysis;
    activeTab.value = 'analysis';
    toast.success('Pisces analysis complete!');
  } catch (e) {
    toast.error('Failed to analyze bug: ' + e.message);
  }
};

const copyAnalysis = async () => {
  if (!result.value) return;

  const text = `### Pisces Analysis
**Severity**: ${result.value.severity}
**Category**: ${result.value.category}

**Diagnosis**:
${result.value.diagnosis}

**Root Cause**:
${result.value.root_cause}

**Suggested Fix**:
${result.value.suggested_fix}
  `.trim();

  try {
    await navigator.clipboard.writeText(text);
    toast.success('Analysis copied to clipboard');
  } catch (e) {
    toast.error('Failed to copy');
  }
};

const close = () => {
  isOpen.value = false;
  userNotes.value = '';
  result.value = null;
  activeTab.value = 'note';
};
</script>

<template>
  <div v-if="isVisible" class="fixed bottom-6 right-6 z-50">
    <!-- Trigger Button -->
    <button 
      @click="isOpen = true"
      class="group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-white shadow-lg transition-all hover:scale-110 hover:bg-indigo-700 active:scale-95"
    >
      <img src="/icons/pisces/pisces-svgrepo-com.svg" class="h-6 w-6" alt="Pisces" />
      <div class="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </button>

    <!-- Slide-over / Modal -->
    <div v-if="isOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all animate-in fade-in duration-200">
      <div 
        class="relative flex h-[600px] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-white/5 p-6">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <img src="/icons/pisces/pisces-svgrepo-com.svg" class="h-5 w-5" alt="Pisces" />
            </div>
            <div>
              <h2 class="text-xl font-semibold text-white">Pisces Analysis</h2>
              <p class="text-xs text-zinc-400">AI-powered diagnostic assistant</p>
            </div>
          </div>
          <button @click="close" class="rounded-full p-2 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">
            <X class="h-5 w-5" />
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex border-b border-white/5 px-6">
          <button 
            v-for="tab in ['note', 'analysis']" 
            :key="tab"
            @click="activeTab = tab"
            :disabled="tab === 'analysis' && !result"
            class="relative px-4 py-3 text-sm font-medium transition-colors"
            :class="[
              activeTab === tab ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
              tab === 'analysis' && !result ? 'opacity-50 cursor-not-allowed' : ''
            ]"
          >
            {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
            <div v-if="activeTab === tab" class="absolute bottom-0 left-0 h-0.5 w-full bg-indigo-500 rounded-full" />
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-8">
          <!-- Note Tab -->
          <div v-if="activeTab === 'note'" class="space-y-6 animate-in slide-in-from-left-4 duration-300">
            <div class="space-y-2">
              <label class="text-sm font-medium text-zinc-300">What happened?</label>
              <textarea 
                v-model="userNotes"
                placeholder="Describe the issue, steps to reproduce, or any weird behavior you noticed..."
                class="min-h-[200px] w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-white placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
              ></textarea>
            </div>

            <div class="rounded-2xl bg-indigo-500/5 p-4 border border-indigo-500/10">
              <div class="flex items-start gap-3">
                <div class="mt-1 rounded-full bg-indigo-500/20 p-1 text-indigo-400">
                  <CheckCircle2 class="h-3 w-3" />
                </div>
                <p class="text-xs leading-relaxed text-zinc-400">
                  Pisces will automatically include your recent console logs, system specifications, 
                  and error traces to provide a deep analysis.
                </p>
              </div>
            </div>

            <button 
              @click="handleSubmit"
              :disabled="isReporting"
              class="group flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 font-semibold text-white shadow-lg transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50"
            >
              <Loader2 v-if="isReporting" class="h-5 w-5 animate-spin" />
              <Send v-else class="h-5 w-5 transition-transform group-hover:translate-x-1" />
              {{ isReporting ? 'Analyzing Logs...' : 'Analyze & Report' }}
            </button>
          </div>

          <!-- Analysis Tab -->
          <div v-if="activeTab === 'analysis' && result" class="space-y-6 animate-in slide-in-from-right-4 duration-300">
            
            <div class="flex justify-end mb-2">
                <button 
                  @click="copyAnalysis"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300 transition-colors border border-white/5"
                >
                  <Copy class="h-3 w-3" />
                  Copy Analysis
                </button>
            </div>

            <!-- Severity & Category -->
            <div class="flex gap-4">
              <div class="flex-1 rounded-2xl bg-white/5 p-4 border border-white/5">
                <div class="text-[10px]  tracking-wider text-zinc-500 mb-1">Severity</div>
                <div class="flex items-center gap-2 font-medium" :class="{
                  'text-red-400': result.severity === 'Critical' || result.severity === 'High',
                  'text-yellow-400': result.severity === 'Medium',
                  'text-green-400': result.severity === 'Low'
                }">
                  <AlertCircle class="h-4 w-4" />
                  {{ result.severity }}
                </div>
              </div>
              <div class="flex-1 rounded-2xl bg-white/5 p-4 border border-white/5">
                <div class="text-[10px]  tracking-wider text-zinc-500 mb-1">Category</div>
                <div class="flex items-center gap-2 font-medium text-white">
                  <Cpu class="h-4 w-4 text-indigo-400" />
                  {{ result.category }}
                </div>
              </div>
            </div>

            <!-- Diagnosis -->
            <div class="space-y-2">
              <div class="text-sm font-semibold text-white">Diagnosis</div>
              <p class="text-zinc-400 text-sm leading-relaxed">{{ result.diagnosis }}</p>
            </div>

            <!-- Root Cause -->
            <div class="space-y-2">
              <div class="text-sm font-semibold text-white">Root Cause</div>
              <div class="rounded-2xl bg-black/40 p-4 border border-white/5">
                <p class="text-zinc-300 text-sm font-mono leading-relaxed">{{ result.root_cause }}</p>
              </div>
            </div>

            <!-- Suggested Fix -->
            <div class="space-y-2">
              <div class="text-sm font-semibold text-white">Suggested Fix</div>
              <div class="rounded-2xl bg-green-500/5 p-4 border border-green-500/10">
                <div class="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{{ result.suggested_fix }}</div>
              </div>
            </div>

            <div class="flex items-center justify-center pt-4">
              <div class="text-[10px] text-zinc-600  tracking-widest">Analysis Confidence: {{ (result.confidence * 100).toFixed(0) }}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes zoom-in-95 {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.animate-in {
  animation-duration: 0.3s;
  animation-fill-mode: both;
}
.zoom-in-95 {
  animation-name: zoom-in-95;
}
</style>
