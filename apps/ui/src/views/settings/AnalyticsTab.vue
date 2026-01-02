<template>
  <div class="space-y-8 max-w-5xl">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-foreground">Operation Analytics</h3>
        <p class="text-sm text-muted-foreground">Track performance and success rates across your operations.</p>
      </div>
      <div class="flex gap-3">
        <button 
          @click="exportLogs" 
          class="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors text-sm font-medium border border-border"
        >
          <Download class="h-4 w-4" />
          Export CSV
        </button>
        <button 
          @click="loadData" 
          class="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors text-sm font-medium border border-primary/20"
          :disabled="loading"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
          Refresh
        </button>
      </div>
    </div>

    <div v-if="loading" class="py-20 flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <Loader2 class="h-8 w-8 animate-spin" />
        <p>Analyzing history...</p>
    </div>

    <template v-else-if="analytics">
        <!-- Stats Overview -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="p-4 rounded-xl border border-border bg-card/50">
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Operations</p>
                <p class="text-2xl font-bold">{{ analytics.overall.total_count }}</p>
            </div>
            <div class="p-4 rounded-xl border border-border bg-card/50">
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Success Rate</p>
                <p class="text-2xl font-bold text-emerald-500">{{ successRate }}%</p>
            </div>
            <div class="p-4 rounded-xl border border-border bg-card/50">
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Avg. Duration</p>
                <p class="text-2xl font-bold">{{ (analytics.overall.avg_duration / 1000).toFixed(2) }}s</p>
            </div>
            <div class="p-4 rounded-xl border border-border bg-card/50">
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Errors</p>
                <p class="text-2xl font-bold text-destructive">{{ analytics.overall.error_count }}</p>
            </div>
        </div>

        <!-- Activity Graph -->
        <div class="p-6 rounded-xl border border-border bg-card/50">
            <div class="flex items-center justify-between mb-6">
                <h4 class="text-sm font-bold flex items-center gap-2">
                    <Activity class="h-4 w-4 text-primary" />
                    Activity Overview
                </h4>
                
                <div class="flex items-center gap-4">
                    <!-- Range Selector -->
                    <select 
                        v-model="timeRange"
                        class="bg-muted border-none text-[11px] font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 ring-primary/30 outline-none"
                    >
                        <option value="day">Last 24 Hours</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="year">Last Year</option>
                    </select>

                    <!-- Type Toggle -->
                    <div class="flex bg-muted p-1 rounded-lg">
                        <button 
                            @click="chartType = 'line'"
                            class="p-1 px-2 rounded-md transition-all"
                            :class="chartType === 'line' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'"
                            title="Line Chart"
                        >
                            <TrendingUp class="h-3.5 w-3.5" />
                        </button>
                        <button 
                            @click="chartType = 'bar'"
                            class="p-1 px-2 rounded-md transition-all"
                            :class="chartType === 'bar' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'"
                            title="Bar Chart"
                        >
                            <BarChart2 class="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            <div class="h-64 relative">
                <div v-if="!hasActivityData" class="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-10 bg-background/50 backdrop-blur-[1px]">
                    No activity recorded in this period
                </div>
                <component 
                    :is="chartType === 'line' ? Line : Bar" 
                    v-if="chartData.usage" 
                    :data="chartData.usage" 
                    :options="chartType === 'line' ? lineOptions : barOptions" 
                />
            </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Category Distribution -->
            <div class="p-6 rounded-xl border border-border bg-card/50">
                <h4 class="text-sm font-bold mb-6 flex items-center gap-2">
                    <PieChart class="h-4 w-4 text-primary" />
                    Category Distribution
                </h4>
                <div class="h-64 flex items-center justify-center relative">
                    <Doughnut v-if="chartData.category" :data="chartData.category" :options="pieOptions" />
                </div>
            </div>

            <!-- Performance Trend -->
            <div class="p-6 rounded-xl border border-border bg-card/50">
                <h4 class="text-sm font-bold mb-6 flex items-center gap-2">
                    <BarChart3 class="h-4 w-4 text-primary" />
                    Success Rate by Category
                </h4>
                <div class="h-64 flex items-center justify-center">
                    <Bar v-if="chartData.success" :data="chartData.success" :options="successOptions" />
                </div>
            </div>
        </div>

        <!-- Recent History List (Sample) -->
        <div class="space-y-4">
            <h4 class="text-sm font-bold uppercase tracking-widest text-muted-foreground px-1">Recent Logs (Last 10)</h4>
            <div class="rounded-xl border border-border bg-card/30 overflow-hidden">
                <table class="w-full text-left text-sm">
                    <thead class="bg-muted/50 border-b border-border">
                        <tr>
                            <th class="px-4 py-3 font-semibold">Label</th>
                            <th class="px-4 py-3 font-semibold">Category</th>
                            <th class="px-4 py-3 font-semibold">Duration</th>
                            <th class="px-4 py-3 font-semibold">Time</th>
                            <th class="px-4 py-3 font-semibold text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border/50">
                        <tr v-for="op in history.slice(0, 10)" :key="op.id" class="hover:bg-muted/30 transition-colors">
                            <td class="px-4 py-3 truncate max-w-[250px] font-medium">{{ op.label }}</td>
                            <td class="px-4 py-3 text-xs">
                                <span v-if="op.category" class="px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-bold text-[9px]">
                                    {{ op.category }}
                                </span>
                                <span v-else class="text-muted-foreground/50">-</span>
                            </td>
                            <td class="px-4 py-3 text-muted-foreground font-mono">
                                {{ op.duration ? (op.duration > 1000 ? (op.duration/1000).toFixed(1) + 's' : op.duration + 'ms') : '-' }}
                            </td>
                            <td class="px-4 py-3 text-muted-foreground">
                                {{ new Date(op.startedAt).toLocaleTimeString() }}
                            </td>
                            <td class="px-4 py-3 text-right">
                                <span 
                                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                    :class="op.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'"
                                >
                                    <CheckCircle2 v-if="op.status === 'completed'" class="h-3 w-3" />
                                    <XCircle v-else class="h-3 w-3" />
                                    {{ op.status }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </template>

    <div v-else class="py-20 text-center text-muted-foreground">
        <div class="max-w-md mx-auto space-y-4">
            <div class="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <BarChart3 class="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
            <p>No analytics data available yet. Start performing some operations to see trends!</p>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { 
    Download, 
    RefreshCw, 
    PieChart, 
    BarChart3, 
    Loader2, 
    CheckCircle2, 
    XCircle,
    Activity,
    TrendingUp,
    BarChart2
} from 'lucide-vue-next'
import { fetchOperationAnalytics } from '@/lib/api'
import { useProgress } from '@/lib/progress'
import { toast } from '@/composables/useNotifications'
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement, LineElement, PointElement, Filler } from 'chart.js'
import { Doughnut, Bar, Line } from 'vue-chartjs'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement, LineElement, PointElement, Filler)

const { history, loadHistoryFromBackend } = useProgress()
const loading = ref(true)
const analytics = ref<any>(null)
const chartType = ref<'line' | 'bar'>('line')
const timeRange = ref<'day' | 'week' | 'month' | 'year'>('day')

const successRate = computed(() => {
    if (!analytics.value?.overall) return 0
    const { total_count, success_count } = analytics.value.overall
    return Math.round((success_count / total_count) * 100)
})

const chartData = computed(() => {
    if (!analytics.value?.byCategory) return {}

    const categories = analytics.value.byCategory.map((c: any) => c.category || 'other')
    const counts = analytics.value.byCategory.map((c: any) => parseInt(c.total_count))
    const successRates = analytics.value.byCategory.map((c: any) => {
        const total = parseInt(c.total_count)
        const success = parseInt(c.success_count)
        return Math.round((success / total) * 100)
    })

    const historyData = analytics.value.usageHistory || []
    const historyLabels = historyData.map((h: any) => {
        const date = new Date(h.bucket)
        if (timeRange.value === 'day') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        if (timeRange.value === 'year') return date.toLocaleDateString([], { month: 'short' })
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    })
    const historySuccessCounts = historyData.map((h: any) => parseInt(h.success_count || '0'))
    const historyErrorCounts = historyData.map((h: any) => parseInt(h.error_count || '0'))

    return {
        category: {
            labels: categories.map((c: string) => c.toUpperCase()),
            datasets: [{
                backgroundColor: [
                    'rgba(168, 85, 247, 0.8)', 
                    'rgba(168, 85, 247, 0.6)', 
                    'rgba(168, 85, 247, 0.4)', 
                    'rgba(168, 85, 247, 0.2)', 
                    'rgba(168, 85, 247, 0.1)', 
                    'rgba(168, 85, 247, 0.05)'
                ],
                borderColor: 'rgba(168, 85, 247, 0.2)',
                borderWidth: 2,
                hoverOffset: 15,
                borderRadius: 4,
                spacing: 5,
                data: counts
            }]
        },
        success: {
            labels: categories,
            datasets: [{
                label: 'Success Rate (%)',
                backgroundColor: (context: any) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.8)');
                    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.1)');
                    return gradient;
                },
                borderColor: 'rgba(168, 85, 247, 1)',
                borderWidth: 2,
                borderRadius: 6,
                hoverBackgroundColor: 'rgba(168, 85, 247, 1)',
                data: successRates
            }]
        },
        usage: {
            labels: historyLabels,
            datasets: [
                {
                    label: 'Successful Operations',
                    backgroundColor: (context: any) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)'); // Emerald-500
                        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
                        return gradient;
                    },
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(16, 185, 129, 1)',
                    pointBorderColor: '#fff',
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.4,
                    borderRadius: chartType.value === 'bar' ? 4 : 0,
                    data: historySuccessCounts
                },
                {
                    label: 'Failed Operations',
                    backgroundColor: (context: any) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                        gradient.addColorStop(0, 'rgba(244, 63, 94, 0.4)'); // Rose-500
                        gradient.addColorStop(1, 'rgba(244, 63, 94, 0.0)');
                        return gradient;
                    },
                    borderColor: 'rgba(244, 63, 94, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(244, 63, 94, 1)',
                    pointBorderColor: '#fff',
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.4,
                    borderRadius: chartType.value === 'bar' ? 4 : 0,
                    data: historyErrorCounts
                }
            ]
        }
    }
})

const hasActivityData = computed(() => {
    if (!chartData.value?.usage?.datasets) return false
    const totalOps = chartData.value.usage.datasets.reduce((acc: number, ds: any) => {
        return acc + ds.data.reduce((a: number, b: number) => a + b, 0)
    }, 0)
    return totalOps > 0
})

const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
        y: { 
            beginAtZero: true, 
            ticks: { 
                color: '#888', 
                font: { size: 10 },
                precision: 0 
            }, 
            grid: { color: 'rgba(128,128,128,0.1)', drawBorder: false } 
        },
        x: { 
            ticks: { color: '#888', font: { size: 10 }, maxRotation: 0 }, 
            grid: { display: false } 
        }
    },
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            displayColors: false
        }
    },
    interaction: {
        intersect: false,
        mode: 'index' as const
    }
}

const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
        legend: {
            position: 'bottom' as const,
            labels: { 
                color: '#888', 
                font: { size: 10, weight: 'bold' as const },
                padding: 20,
                usePointStyle: true,
                pointStyle: 'circle'
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: { size: 12, weight: 'bold' as const },
            bodyFont: { size: 12 },
            cornerRadius: 8,
            displayColors: true,
            boxPadding: 6
        }
    }
}

const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
        y: { 
            beginAtZero: true, 
            ticks: { 
                color: '#888', 
                font: { size: 10 },
                precision: 0
            }, 
            grid: { color: 'rgba(128,128,128,0.1)', drawBorder: false } 
        },
        x: { 
            ticks: { color: '#888', font: { size: 10 } }, 
            grid: { display: false } 
        }
    },
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 8,
            displayColors: false
        }
    }
}

const successOptions = {
    ...barOptions,
    scales: {
        ...barOptions.scales,
        y: {
            ...barOptions.scales.y,
            max: 100
        }
    }
}

const loadData = async () => {
    loading.value = true
    try {
        analytics.value = await fetchOperationAnalytics(timeRange.value)
        await loadHistoryFromBackend()
    } catch (e) {
        console.error('Failed to load analytics:', e)
        toast.error('Could not load analytics data')
    } finally {
        loading.value = false
    }
}

import { watch } from 'vue'
watch(timeRange, () => {
    loadData()
})

const exportLogs = () => {
    if (history.value.length === 0) {
        toast.error('No logs to export')
        return
    }

    const headers = ['ID', 'Label', 'Status', 'Progress', 'Category', 'Started At', 'Completed At', 'Duration (ms)', 'Error']
    const rows = history.value.map(op => [
        op.id,
        `"${op.label.replace(/"/g, '""')}"`,
        op.status,
        op.progress,
        op.category || '',
        new Date(op.startedAt).toISOString(),
        op.completedAt ? new Date(op.completedAt).toISOString() : '',
        op.duration || '',
        `"${(op.error || '').replace(/"/g, '""')}"`
    ])

    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `pegasus-operations-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Logs exported successfully')
}

onMounted(() => {
    loadData()
})
</script>
