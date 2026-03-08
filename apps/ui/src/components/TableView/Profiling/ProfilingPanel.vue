<script setup lang="ts">
import { computed } from 'vue'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog'
import { 
  ShieldCheck, 
  ShieldQuestion, 
  ListRestart, 
  Copy,
  BarChart3,
  Dna,
  CheckCircle2
} from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'

interface Suggestion {
  title: string
  description: string
  sql?: string
}

interface ColumnStats {
  name: string
  type: string
  nullCount: number
  distinctCount: number
  min?: any
  max?: any
}

interface ProfileResult {
  tableName: string
  rowCount: number
  healthScore: number
  insights: string[]
  suggestions: Suggestion[]
  columns: ColumnStats[]
}

const props = defineProps<{
  profile: ProfileResult | null
  loading: boolean
}>()

const emit = defineEmits(['update:modelValue', 'apply-fix'])

const scoreColor = computed(() => {
  const score = props.profile?.healthScore || 0
  if (score >= 80) return 'text-green-500'
  if (score >= 50) return 'text-yellow-500'
  return 'text-red-500'
})

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  toast.success('SQL copied to clipboard')
}
</script>

<template>
  <Dialog :model-value="!!profile || loading" @update:model-value="$emit('update:modelValue', $event)">
    <DialogContent class="max-w-3xl max-h-[85vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
      <DialogHeader>
        <div class="flex items-center gap-3 mb-2">
          <div class="p-2 rounded-xl bg-violet-500/10 text-violet-500">
            <Dna class="w-6 h-6" />
          </div>
          <div>
            <DialogTitle class="text-2xl font-bold tracking-tight text-foreground/90">
              Smart Data Profile: {{ profile?.tableName }}
            </DialogTitle>
            <DialogDescription class="text-muted-foreground/70 font-mono text-xs uppercase tracking-widest mt-1">
              AI-Powered Health Analysis & Quality Insights
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div v-if="loading" class="py-20 flex flex-col items-center justify-center space-y-4">
        <div class="relative w-20 h-20">
          <div class="absolute inset-0 border-4 border-violet-500/20 rounded-full"></div>
          <div class="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          <Dna class="absolute inset-0 m-auto w-8 h-8 text-violet-500 animate-pulse" />
        </div>
        <p class="text-sm font-mono text-muted-foreground animate-pulse">Scanning table patterns...</p>
      </div>

      <div v-else-if="profile" class="space-y-8 py-4">
        <!-- Dashboard Header -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 rounded-2xl bg-muted/30 border border-border/50 flex flex-col items-center justify-center text-center">
            <span class="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Health Score</span>
            <div :class="['text-4xl font-black tabular-nums', scoreColor]">
              {{ profile.healthScore }}<span class="text-sm ml-0.5 opacity-50">%</span>
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-muted/30 border border-border/50 flex flex-col items-center justify-center text-center">
            <span class="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Total Rows</span>
            <div class="text-3xl font-black text-foreground/80 tabular-nums">
              {{ profile.rowCount.toLocaleString() }}
            </div>
          </div>
          <div class="p-4 rounded-2xl bg-muted/30 border border-border/50 flex flex-col items-center justify-center text-center">
            <span class="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Columns</span>
            <div class="text-3xl font-black text-foreground/80 tabular-nums">
              {{ profile.columns.length }}
            </div>
          </div>
        </div>

        <!-- AI Insights -->
        <div class="space-y-4">
          <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-400">
            <ShieldQuestion class="w-4 h-4" />
            AI Quality Insights
          </h3>
          <div class="grid grid-cols-1 gap-2">
            <div v-for="(insight, idx) in profile.insights" :key="idx" 
                 class="group flex items-start gap-4 p-4 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/30 hover:border-violet-500/30 transition-all duration-300">
              <div class="mt-1 p-1 rounded-full bg-violet-500/10 text-violet-400">
                <ShieldCheck class="w-3.5 h-3.5" />
              </div>
              <p class="text-sm text-foreground/80 leading-relaxed">{{ insight }}</p>
            </div>
          </div>
        </div>

        <!-- Actionable Fixes -->
        <div v-if="profile.suggestions?.length" class="space-y-4">
          <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-green-400">
            <ListRestart class="w-4 h-4" />
            AI Recommendations
          </h3>
          <div class="space-y-3">
            <div v-for="(suggestion, idx) in profile.suggestions" :key="idx"
                 class="p-5 rounded-2xl bg-green-500/5 border border-green-500/10 space-y-3 relative overflow-hidden group">
              <div class="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <CheckCircle2 class="w-12 h-12 text-green-500/5 -rotate-12" />
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-bold text-green-400 tracking-tight">{{ suggestion.title }}</span>
                <button v-if="suggestion.sql" @click="copyToClipboard(suggestion.sql)" 
                        class="p-2 hover:bg-green-500/10 rounded-lg transition-colors text-green-400/60 hover:text-green-400">
                  <Copy class="w-4 h-4" />
                </button>
              </div>
              <p class="text-xs text-muted-foreground leading-relaxed">{{ suggestion.description }}</p>
              <div v-if="suggestion.sql" class="mt-4 p-3 rounded-xl bg-black/40 font-mono text-[11px] text-green-400/90 border border-green-500/20">
                {{ suggestion.sql }}
              </div>
            </div>
          </div>
        </div>

        <!-- Column breakdown -->
        <div class="space-y-4">
          <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            <BarChart3 class="w-4 h-4" />
            Column Breakdown
          </h3>
          <div class="rounded-2xl border border-border/50 overflow-hidden">
            <table class="w-full text-left text-xs">
              <thead class="bg-muted/50 text-[10px] uppercase font-bold tracking-widest text-muted-foreground border-b border-border/50">
                <tr>
                  <th class="px-4 py-3">Column</th>
                  <th class="px-4 py-3">Type</th>
                  <th class="px-4 py-3">Nulls</th>
                  <th class="px-4 py-3">Distinct</th>
                  <th class="px-4 py-3 text-right">Range</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/30">
                <tr v-for="col in profile.columns" :key="col.name" class="hover:bg-muted/20 transition-colors">
                  <td class="px-4 py-3 font-bold text-foreground/80 underline decoration-violet-500/20 underline-offset-4">{{ col.name }}</td>
                  <td class="px-4 py-3 font-mono text-[10px] text-muted-foreground/70 opacity-60 uppercase">{{ col.type }}</td>
                  <td class="px-4 py-3 tabular-nums" :class="col.nullCount > 0 ? 'text-red-400 font-bold' : 'text-muted-foreground/50'">
                    {{ col.nullCount }}
                  </td>
                  <td class="px-4 py-3 tabular-nums font-mono">{{ col.distinctCount }}</td>
                  <td class="px-4 py-3 text-right font-mono text-[10px] text-muted-foreground/60">
                    {{ col.min }} → {{ col.max }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
