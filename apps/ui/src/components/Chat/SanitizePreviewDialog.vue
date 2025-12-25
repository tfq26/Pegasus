<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, X, AlertTriangle, Play, FileDown, ArrowRight, Loader2 } from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
  issues: any[]
  table: string
  connectionId: string
}>()

const emit = defineEmits(['update:open', 'fixed', 'execute-fix'])

const selectedIssues = ref<Set<number>>(new Set())
const isExecuting = ref(false)

// Initialize all issues as selected by default
const initSelection = () => {
    selectedIssues.value.clear()
    props.issues.forEach((_, idx) => selectedIssues.value.add(idx))
}

watch(() => props.issues, initSelection, { immediate: true })

const totalSelected = computed(() => selectedIssues.value.size)

const toggleIssue = (idx: number) => {
  if (selectedIssues.value.has(idx)) {
    selectedIssues.value.delete(idx)
  } else {
    selectedIssues.value.add(idx)
  }
}

const getRiskColor = (risk: string) => {
  switch (risk) {
    case 'high': return 'text-red-500 bg-red-100 dark:bg-red-900/30'
    case 'medium': return 'text-orange-500 bg-orange-100 dark:bg-orange-900/30'
    default: return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30'
  }
}

const handleExportSQL = () => {
  const sqlStatements = props.issues
    .filter((_, idx) => selectedIssues.value.has(idx))
    .map(issue => `-- ${issue.description}\n${issue.sql_template.replace('{{TABLE}}', props.table)}`)
    .join('\n\n')

  const blob = new Blob([sqlStatements], { type: 'text/sql' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sanitize_${props.table}_${new Date().toISOString().slice(0, 10)}.sql`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success('SQL Script Downloaded')
}

const handleExecute = async () => {
  if (totalSelected.value === 0) return

  const confirmMsg = `Are you sure you want to apply ${totalSelected.value} fixes? This will modify the database.`
  if (!confirm(confirmMsg)) return

  isExecuting.value = true
  try {
    const fixes = props.issues.filter((_, idx) => selectedIssues.value.has(idx))
    const sqls = fixes.map(issue => issue.sql_template.replace('{{TABLE}}', props.table))

    emit('execute-fix', sqls)
    emit('update:open', false)
  } catch (e) {
    toast.error('Failed to execute fixes')
  } finally {
    isExecuting.value = false
  }
}

const formatSql = (template: string, tableName: string) => {
    if (!template) return ''
    return template.replace('{{TABLE}}', tableName)
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <div class="p-2 rounded bg-primary/10 text-primary">
            <AlertTriangle class="h-5 w-5" />
          </div>
          Sanitize Table: {{ table }}
        </DialogTitle>
        <DialogDescription>
          AI has analyzed the table and detected {{ issues.length }} potential quality issues.
          Review and select the fixes you want to apply.
        </DialogDescription>
      </DialogHeader>

      <div class="py-4 space-y-4">
        <!-- Summary Stats -->
        <div class="grid grid-cols-3 gap-4">
            <div class="bg-muted/50 p-4 rounded-lg text-center">
                <div class="text-2xl font-bold">{{ issues.length }}</div>
                <div class="text-xs text-muted-foreground uppercase">Issues Found</div>
            </div>
             <div class="bg-muted/50 p-4 rounded-lg text-center">
                <div class="text-2xl font-bold text-primary">{{ totalSelected }}</div>
                <div class="text-xs text-muted-foreground uppercase">Selected</div>
            </div>
             <div class="bg-muted/50 p-4 rounded-lg text-center">
                <div class="text-2xl font-bold text-orange-500">Review</div>
                <div class="text-xs text-muted-foreground uppercase">Status</div>
            </div>
        </div>

        <!-- Issue List -->
        <div class="border rounded-lg divide-y">
            <div 
                v-for="(issue, idx) in issues" 
                :key="idx" 
                class="p-4 hover:bg-muted/30 transition-colors"
                :class="{ 'opacity-50 grayscale': !selectedIssues.has(idx) }"
            >
                <div class="flex items-start gap-3">
                    <div class="pt-1">
                        <input 
                            type="checkbox" 
                            :checked="selectedIssues.has(idx)" 
                            @change="toggleIssue(idx)"
                            class="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                        />
                    </div>
                    <div class="flex-1 space-y-2">
                        <div class="flex items-center justify-between">
                            <h4 class="font-medium flex items-center gap-2">
                                {{ issue.description }}
                                <span :class="['text-xs px-2 py-0.5 rounded-lg font-medium', getRiskColor(issue.risk)]">
                                    {{ issue.risk ? issue.risk.toUpperCase() : 'UNKNOWN' }}
                                </span>
                            </h4>
                            <span class="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                {{ issue.column }}
                            </span>
                        </div>
                        
                        <!-- Diff / Action Preview -->
                        <div class="bg-black/5 dark:bg-white/5 rounded p-3 text-sm font-mono overflow-x-auto">
                            <div class="text-muted-foreground text-xs mb-1">PROPOSED SQL:</div>
                            <code class="text-blue-600 dark:text-blue-400 block whitespace-pre-wrap">
                                {{ formatSql(issue.sql_template, table) }}
                            </code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <DialogFooter class="gap-2 sm:justify-between">
        <div class="flex gap-2">
             <button class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2" @click="handleExportSQL">
                <FileDown class="h-4 w-4 mr-2" />
                Export SQL
            </button>
        </div>
        <div class="flex gap-2">
            <button class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2" @click="$emit('update:open', false)">Cancel</button>
            <button class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2" @click="handleExecute" :disabled="totalSelected === 0 || isExecuting">
                <Loader2 v-if="isExecuting" class="h-4 w-4 mr-2 animate-spin" />
                <Play v-if="!isExecuting" class="h-4 w-4 mr-2" />
                Apply Fixes
            </button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
