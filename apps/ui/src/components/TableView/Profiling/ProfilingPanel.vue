<script setup lang="ts">
import { computed } from 'vue'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  ShieldCheck,
  ShieldQuestion,
  ListRestart,
  Copy,
  BarChart3,
  Dna,
  CheckCircle2,
  X,
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
  open: boolean
  profile: ProfileResult | null
  loading: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'apply-fix': [sql: string]
}>()

const scoreColor = computed(() => {
  const score = props.profile?.healthScore || 0
  if (score >= 80) return 'text-emerald-500'
  if (score >= 50) return 'text-amber-500'
  return 'text-rose-500'
})

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  toast.success('SQL copied to clipboard')
}
</script>

<template>
  <Drawer
    :open="open"
    direction="bottom"
    dismissible
    modal
    @update:open="emit('update:open', $event)"
  >
    <DrawerContent class="mx-auto w-full max-w-5xl border-border/50 bg-background/96 shadow-[0_-30px_80px_rgba(15,23,42,0.24)] backdrop-blur-2xl">
      <DrawerHeader class="border-b border-border/50 px-6 pb-5 pt-3">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="rounded-2xl border border-violet-500/15 bg-violet-500/10 p-2.5 text-violet-500">
              <Dna class="h-5 w-5" />
            </div>
            <div>
              <DrawerTitle class="text-xl font-semibold tracking-tight text-foreground">
                {{ props.loading ? 'Profiling Table' : `Data Profile${props.profile?.tableName ? `: ${props.profile.tableName}` : ''}` }}
              </DrawerTitle>
              <DrawerDescription class="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                AI-powered health analysis, column statistics, and cleanup recommendations
              </DrawerDescription>
            </div>
          </div>

          <button
            @click="emit('update:open', false)"
            class="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close profile drawer"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </DrawerHeader>

      <div class="max-h-[78vh] overflow-y-auto px-6 pb-6">
        <div v-if="props.loading" class="flex min-h-[320px] flex-col items-center justify-center space-y-5">
          <div class="relative h-20 w-20">
            <div class="absolute inset-0 rounded-full border-4 border-violet-500/15"></div>
            <div class="absolute inset-0 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
            <Dna class="absolute inset-0 m-auto h-8 w-8 animate-pulse text-violet-500" />
          </div>
          <div class="space-y-1 text-center">
            <p class="text-sm font-semibold text-foreground">Scanning table patterns...</p>
            <p class="text-xs text-muted-foreground">We’re checking quality, distribution, and schema health.</p>
          </div>
        </div>

        <div v-else-if="props.profile" class="space-y-6 py-5">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div class="rounded-2xl border border-border/60 bg-card/70 p-5 text-center shadow-sm">
              <span class="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Health Score</span>
              <div :class="['text-4xl font-black tabular-nums tracking-tight', scoreColor]">
                {{ props.profile.healthScore }}<span class="ml-0.5 text-sm opacity-50">%</span>
              </div>
            </div>
            <div class="rounded-2xl border border-border/60 bg-card/70 p-5 text-center shadow-sm">
              <span class="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Total Rows</span>
              <div class="text-3xl font-black tabular-nums tracking-tight text-foreground/85">
                {{ props.profile.rowCount.toLocaleString() }}
              </div>
            </div>
            <div class="rounded-2xl border border-border/60 bg-card/70 p-5 text-center shadow-sm">
              <span class="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Columns</span>
              <div class="text-3xl font-black tabular-nums tracking-tight text-foreground/85">
                {{ props.profile.columns.length }}
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-violet-500">
              <ShieldQuestion class="h-4 w-4" />
              Quality Insights
            </h3>
            <div class="grid grid-cols-1 gap-3">
              <div
                v-for="(insight, idx) in props.profile.insights"
                :key="idx"
                class="flex items-start gap-3 rounded-2xl border border-border/50 bg-card/55 p-4 transition-colors hover:border-violet-500/20 hover:bg-muted/25"
              >
                <div class="mt-0.5 rounded-full bg-violet-500/10 p-1.5 text-violet-500">
                  <ShieldCheck class="h-3.5 w-3.5" />
                </div>
                <p class="text-sm leading-relaxed text-foreground/85">{{ insight }}</p>
              </div>
            </div>
          </div>

          <div v-if="props.profile.suggestions?.length" class="space-y-4">
            <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-500">
              <ListRestart class="h-4 w-4" />
              Recommendations
            </h3>
            <div class="space-y-3">
              <div
                v-for="(suggestion, idx) in props.profile.suggestions"
                :key="idx"
                class="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5"
              >
                <div class="absolute right-4 top-4 opacity-20">
                  <CheckCircle2 class="h-10 w-10 -rotate-12 text-emerald-500/30" />
                </div>
                <div class="relative space-y-3">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-sm font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">{{ suggestion.title }}</span>
                    <button
                      v-if="suggestion.sql"
                      @click="copyToClipboard(suggestion.sql)"
                      class="rounded-lg p-2 text-emerald-500/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                      <Copy class="h-4 w-4" />
                    </button>
                  </div>
                  <p class="text-sm leading-relaxed text-muted-foreground">{{ suggestion.description }}</p>
                  <div
                    v-if="suggestion.sql"
                    class="rounded-xl border border-emerald-500/15 bg-background/80 p-3 font-mono text-[11px] text-foreground/85"
                  >
                    {{ suggestion.sql }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              <BarChart3 class="h-4 w-4" />
              Column Breakdown
            </h3>
            <div class="overflow-hidden rounded-2xl border border-border/50 bg-card/55">
              <table class="w-full text-left text-xs">
                <thead class="border-b border-border/50 bg-muted/35 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th class="px-4 py-3">Column</th>
                    <th class="px-4 py-3">Type</th>
                    <th class="px-4 py-3">Nulls</th>
                    <th class="px-4 py-3">Distinct</th>
                    <th class="px-4 py-3 text-right">Range</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border/30">
                  <tr v-for="col in props.profile.columns" :key="col.name" class="transition-colors hover:bg-muted/20">
                    <td class="px-4 py-3 font-semibold text-foreground/85">{{ col.name }}</td>
                    <td class="px-4 py-3 font-mono text-[10px] uppercase text-muted-foreground/70">{{ col.type }}</td>
                    <td class="px-4 py-3 tabular-nums" :class="col.nullCount > 0 ? 'font-semibold text-rose-500' : 'text-muted-foreground/60'">
                      {{ col.nullCount }}
                    </td>
                    <td class="px-4 py-3 font-mono tabular-nums text-foreground/80">{{ col.distinctCount }}</td>
                    <td class="px-4 py-3 text-right font-mono text-[10px] text-muted-foreground/70">
                      {{ col.min }} → {{ col.max }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DrawerContent>
  </Drawer>
</template>
