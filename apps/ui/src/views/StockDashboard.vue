<template>
  <div class="h-full w-full flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-4 border-b border-border bg-card/30 backdrop-blur-md sticky top-0 z-10">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-primary/10 rounded-lg">
          <BarChart3 class="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight">Portfolio Analytics</h1>
          <p class="text-xs text-muted-foreground flex items-center gap-1">
            <span class="inline-block w-2 h-2 bg-emerald-500 rounded-full"></span>
            Live Performance Tracking
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <!-- Search Bar -->
        <div class="relative hidden lg:block w-64 group">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            v-model="searchQuery"
            @input="handleSearch"
            placeholder="Search symbols (e.g. BTC)..."
            class="w-full h-9 bg-muted/50 border border-border rounded-lg pl-9 pr-3 text-xs focus:border-primary focus:bg-background outline-none transition-all"
          />
          
          <!-- Search Results Dropdown -->
          <div v-if="searchResults.length > 0" class="absolute top-full mt-2 left-0 right-0 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div class="max-h-64 overflow-y-auto p-1 custom-scrollbar">
              <button 
                v-for="res in searchResults" 
                :key="res.symbol"
                @click="trackAndSelect(res)"
                class="w-full text-left px-3 py-2 hover:bg-muted rounded-lg flex justify-between items-center transition-colors group"
              >
                <div>
                  <div class="text-xs font-bold">{{ res.symbol }}</div>
                  <div class="text-[9px] text-muted-foreground truncate max-w-[120px]">{{ res.name }}</div>
                </div>
                <PlusCircle class="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </div>
            <div class="p-2 bg-muted/30 border-t border-border text-[9px] text-muted-foreground text-center italic">
              Results via Alpha Vantage Search API
            </div>
          </div>
        </div>

        <button 
          @click="syncRealData"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-all text-xs font-bold uppercase tracking-wider"
          title="Sync with real market data"
          :disabled="isSyncing"
        >
          <Zap class="w-3.5 h-3.5" :class="{ 'animate-pulse text-orange-500': isSyncing }" />
          {{ isSyncing ? 'Syncing...' : 'Sync Data' }}
        </button>

        <div class="hidden md:flex flex-col items-end border-l border-border pl-4">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Portfolio Value</span>
          <span class="text-lg font-mono font-bold">{{ formatCurrency(metrics?.totalMarketValue || 0) }}</span>
        </div>
        
        <button 
          @click="fetchPortfolio"
          class="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          title="Refresh Data"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isRefreshing }" />
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-auto p-6 custom-scrollbar">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- Top Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="p-5 bg-card border border-border rounded-2xl shadow-sm">
            <div class="flex justify-between items-start mb-2">
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Invested Capital</span>
              <Wallet class="w-4 h-4 text-muted-foreground/50" />
            </div>
            <div class="text-xl font-mono font-bold">{{ formatCurrency(metrics?.totalInvested || 0) }}</div>
          </div>

          <div class="p-5 bg-card border border-border rounded-2xl shadow-sm">
            <div class="flex justify-between items-start mb-2">
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unrealized Gain</span>
              <div :class="[
                'p-1 rounded bg-opacity-10',
                (metrics?.totalUnrealizedGain || 0) >= 0 ? 'bg-emerald-500 text-emerald-500' : 'bg-rose-500 text-rose-500'
              ]">
                <TrendingUp v-if="(metrics?.totalUnrealizedGain || 0) >= 0" class="w-3 h-3" />
                <TrendingDown v-else class="w-3 h-3" />
              </div>
            </div>
            <div :class="['text-xl font-mono font-bold', (metrics?.totalUnrealizedGain || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500']">
              {{ (metrics?.totalUnrealizedGain || 0) >= 0 ? '+' : '' }}{{ formatCurrency(metrics?.totalUnrealizedGain || 0) }}
            </div>
          </div>

          <div class="p-5 bg-card border border-border rounded-2xl shadow-sm">
            <div class="flex justify-between items-start mb-2">
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Realized Profit</span>
              <DollarSign class="w-4 h-4 text-muted-foreground/50" />
            </div>
            <div class="text-xl font-mono font-bold text-amber-500">
              {{ formatCurrency(metrics?.totalRealizedGain || 0) }}
            </div>
          </div>

          <div class="p-5 bg-card border border-border rounded-2xl shadow-sm">
            <div class="flex justify-between items-start mb-2">
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Best Performer</span>
              <Trophy class="w-4 h-4 text-yellow-500/50" />
            </div>
            <div v-if="metrics?.bestPerformer" class="flex flex-col">
              <span class="text-sm font-bold truncate">{{ metrics.bestPerformer.symbol }}</span>
              <span class="text-xs font-mono text-emerald-500 font-bold">+{{ metrics.bestPerformer.gainPercent.toFixed(1) }}%</span>
            </div>
            <div v-else class="text-xl font-mono font-bold text-muted-foreground/30">—</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-8">
            
            <!-- Performance Chart -->
            <section class="p-6 bg-card border border-border rounded-2xl">
              <div class="flex items-center justify-between mb-6">
                <h3 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Portfolio History (30D)</h3>
                <div class="flex gap-2">
                  <span v-if="history.length > 0 && history[0].is_estimated" class="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full font-bold">Estimated Trend</span>
                  <span v-else-if="history.length > 0" class="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold">Live Market</span>
                  <span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Performance Simulator</span>
                </div>
              </div>
              <div class="h-[300px] w-full">
                <Line v-if="chartData.labels.length" :data="chartData" :options="chartOptions" />
                <div v-else class="h-full flex items-center justify-center text-muted-foreground/50 text-xs italic">
                  Select a stock or add transactions to see performance trends.
                </div>
              </div>
            </section>

            <!-- Stock Selection -->
            <section>
              <div class="flex items-center gap-2 mb-4">
                <h2 class="text-sm font-bold uppercase tracking-widest text-muted-foreground">Markets</h2>
                <div class="h-px flex-1 bg-border/50"></div>
                <div class="lg:hidden w-full max-w-[200px] relative">
                  <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input 
                    v-model="searchQuery"
                    @input="handleSearch"
                    placeholder="Search..."
                    class="w-full h-8 bg-muted/50 border border-border rounded-lg pl-8 pr-3 text-[10px] outline-none"
                  />
                  <!-- Mobile Search Results -->
                  <div v-if="searchResults.length > 0" class="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <button 
                      v-for="res in searchResults" 
                      :key="res.symbol"
                      @click="trackAndSelect(res)"
                      class="w-full text-left px-3 py-1.5 hover:bg-muted text-[10px] flex justify-between items-center"
                    >
                      <span class="font-bold">{{ res.symbol }}</span>
                      <PlusCircle class="w-3 h-3 text-primary" />
                    </button>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div 
                  v-for="stock in stocks" 
                  :key="stock.symbol"
                  @click="selectStock(stock)"
                  class="p-3 bg-card border border-border rounded-xl hover:border-primary/50 transition-all cursor-pointer group active:scale-95 relative overflow-hidden"
                  :class="{'border-primary bg-primary/5 shadow-sm': selectedStock?.symbol === stock.symbol}"
                >
                  <div class="flex justify-between items-start mb-1">
                    <div class="flex flex-col">
                        <span class="text-xs font-bold">{{ stock.symbol }}</span>
                        <span v-if="stock.is_real_data" class="text-[8px] text-emerald-500 font-bold uppercase tracking-tighter">Real Time</span>
                        <span v-else class="text-[8px] text-orange-500 font-bold uppercase tracking-tighter">Initial</span>
                    </div>
                    <span :class="['text-[10px] font-mono', (stock.change || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500']">
                      {{ (stock.change || 0) >= 0 ? '+' : '' }}{{ (stock.change || 0).toFixed(1) }}
                    </span>
                  </div>
                  <div class="text-sm font-mono font-bold">{{ formatCurrency(stock.price) }}</div>
                </div>
              </div>
            </section>

            <!-- Portfolio Table -->
            <section>
              <div class="flex items-center gap-2 mb-4">
                <h2 class="text-sm font-bold uppercase tracking-widest text-muted-foreground">Active Holdings</h2>
                <div class="h-px flex-1 bg-border/50"></div>
              </div>
              
              <div v-if="portfolio.length === 0" class="p-8 bg-muted/30 rounded-2xl border border-dashed border-border flex flex-col items-center justify-center text-center">
                <History class="w-12 h-12 text-muted-foreground/30 mb-4" />
                <h3 class="font-bold text-muted-foreground">No Holdings</h3>
                <p class="text-[10px] text-muted-foreground mt-1 max-w-[200px]">Log your first transaction or search for a stock to start tracking performance.</p>
              </div>

              <div v-else class="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <table class="w-full text-left text-xs">
                  <thead class="bg-muted/50 text-muted-foreground font-bold border-b border-border">
                    <tr>
                      <th class="px-5 py-3">Asset</th>
                      <th class="px-5 py-3">Holdings</th>
                      <th class="px-5 py-3 text-right">Avg Buy</th>
                      <th class="px-5 py-3 text-right">Mkt Value</th>
                      <th class="px-5 py-3 text-right">Return</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border/50">
                    <tr v-for="item in portfolio" :key="item.symbol" class="hover:bg-muted/30 transition-colors">
                      <td class="px-5 py-4">
                        <div class="flex items-center gap-2">
                          <div class="w-7 h-7 rounded bg-primary/10 flex items-center justify-center font-bold text-[10px]">
                            {{ item.symbol[0] }}
                          </div>
                          <div>
                            <div class="font-bold">{{ item.symbol }}</div>
                            <div class="text-[9px] text-muted-foreground truncate max-w-[100px]">{{ item.name }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="px-5 py-4 font-mono font-medium">{{ item.quantity }} shrs</td>
                      <td class="px-5 py-4 text-right font-mono text-muted-foreground">{{ formatCurrency(item.avgBuyPrice) }}</td>
                      <td class="px-5 py-4 text-right">
                        <div class="font-mono font-bold">{{ formatCurrency(item.marketValue) }}</div>
                        <div class="text-[9px] text-muted-foreground">@ {{ formatCurrency(item.currentPrice) }}</div>
                      </td>
                      <td class="px-5 py-4 text-right">
                        <div :class="['font-mono font-bold', item.gainPercent >= 0 ? 'text-emerald-500' : 'text-rose-500']">
                          {{ item.gainPercent >= 0 ? '+' : '' }}{{ item.gainPercent.toFixed(2) }}%
                        </div>
                        <div class="text-[9px] text-muted-foreground">{{ formatCurrency(item.unrealizedGain) }}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <!-- Sidebar: Logging -->
          <div class="space-y-6">
            <section class="p-6 bg-card border border-border rounded-2xl shadow-xl shadow-black/5 flex flex-col gap-5 sticky top-24">
              <div class="flex flex-col gap-1">
                <h2 class="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <PlusCircle class="w-4 h-4 text-primary" /> Log Transaction
                </h2>
                <p class="text-[10px] text-muted-foreground">Record your trades manually to update your analytics.</p>
              </div>

              <div class="flex gap-2 p-1 bg-muted/50 rounded-lg">
                <button 
                  v-for="type in ['BUY', 'SELL']" 
                  :key="type"
                  @click="txType = type"
                  class="flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all"
                  :class="txType === type ? 'bg-background text-primary shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'"
                >
                  {{ type }}
                </button>
              </div>

              <div v-if="selectedStock" class="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div class="p-4 rounded-xl border border-primary/20 bg-primary/5">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-black">{{ selectedStock.symbol }}</span>
                    <span class="text-xs font-mono font-bold">{{ formatCurrency(selectedStock.price) }}</span>
                  </div>
                  <p class="text-[9px] text-muted-foreground mt-0.5">{{ selectedStock.name }}</p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <label class="text-[9px] font-bold uppercase text-muted-foreground">Quantity</label>
                    <input 
                      v-model.number="txAmount" 
                      type="number"
                      class="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs font-mono focus:border-primary outline-none"
                    />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-[9px] font-bold uppercase text-muted-foreground">Execution Price</label>
                    <input 
                      v-model.number="txPrice" 
                      type="number"
                      class="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs font-mono focus:border-primary outline-none"
                    />
                  </div>
                </div>

                <div class="space-y-1.5">
                  <label class="text-[9px] font-bold uppercase text-muted-foreground">Transaction Date</label>
                  <input 
                    v-model="txDate" 
                    type="date"
                    class="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs font-mono focus:border-primary outline-none appearance-none"
                  />
                </div>

                <div class="pt-2">
                  <button 
                    @click="handleTransaction"
                    :disabled="isLogging"
                    class="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Save v-if="!isLogging" class="w-3 h-3" />
                    <Loader2 v-else class="w-3 h-3 animate-spin" />
                    {{ isLogging ? 'Saving...' : 'Record Transaction' }}
                  </button>
                </div>
              </div>

              <div v-else class="py-12 flex flex-col items-center justify-center text-center opacity-30">
                <MousePointer2 class="w-10 h-10 mb-2" />
                <p class="text-[10px] font-medium max-w-[120px]">Select a symbol or search from the header to log a trade</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { api } from '@/lib/apiClient'
import { 
  TrendingUp, 
  RefreshCw, 
  Wallet, 
  TrendingDown, 
  BarChart3,
  MousePointer2,
  Zap,
  Loader2,
  DollarSign,
  Trophy,
  History,
  PlusCircle,
  Save,
  Search
} from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type TooltipModel
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { useDebounceFn } from '@vueuse/core'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const stocks = ref<any[]>([])
const portfolio = ref<any[]>([])
const metrics = ref<any>(null)
const history = ref<any[]>([])

const selectedStock = ref<any>(null)
const isRefreshing = ref(false)
const isLogging = ref(false)
const isSyncing = ref(false)

// Search state
const searchQuery = ref('')
const searchResults = ref<any[]>([])

// Transaction form state
const txType = ref('BUY')
const txAmount = ref(1)
const txPrice = ref(0)
const txDate = ref(new Date().toISOString().split('T')[0])

const chartOptions: any = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: 'rgba(20, 20, 20, 0.9)',
      titleColor: '#fff',
      bodyColor: '#A1A1AA',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      padding: 10,
      displayColors: false,
      font: { family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }
    }
  },
  scales: {
    x: { display: false },
    y: {
      display: true,
      grid: { color: 'rgba(255, 255, 255, 0.05)' },
      ticks: { 
        color: '#71717A', 
        font: { size: 10 },
        callback: (val: any) => formatCurrency(val)
      }
    }
  },
  elements: {
    point: { radius: 0, hoverRadius: 4, hitRadius: 20 },
    line: { tension: 0.4 }
  }
}

const chartData = computed(() => {
  if (!history.value || history.value.length === 0) {
    return { labels: [], datasets: [] }
  }
  
  return {
    labels: history.value.map(h => h.date),
    datasets: [
      {
        label: 'Portfolio Value',
        data: history.value.map(h => h.price),
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        borderWidth: 2,
      }
    ]
  }
})

const formatCurrency = (val: number) => {
    if (val === undefined || val === null) return '$0.00'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(val)
}

const fetchStocks = async () => {
  try {
    const data = await api.get<any>('/stocks')
    stocks.value = data.stocks || []
  } catch (e) {
    console.error('Failed to fetch stocks', e)
  }
}

const fetchPortfolio = async () => {
  isRefreshing.value = true
  try {
    const data = await api.get<any>('/stocks/portfolio')
    portfolio.value = data.portfolio || []
    metrics.value = data.metrics || null
    
    // If we have portfolio items, fetch history for the best one to show a trend
    if (portfolio.value.length > 0) {
        const primarySymbol = metrics.value?.bestPerformer?.symbol || portfolio.value[0].symbol
        fetchHistory(primarySymbol)
    }
  } catch (e) {
    console.error('Failed to fetch portfolio', e)
  } finally {
    isRefreshing.value = false
  }
}

const fetchHistory = async (symbol: string) => {
    try {
        const data = await api.get<any>(`/stocks/history/${symbol}`)
        history.value = data.history || []
    } catch (e) {
        console.error('Failed to fetch history', e)
    }
}

const handleSearch = useDebounceFn(async () => {
  if (searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }
  
  try {
    const data = await api.get<any>(`/stocks/search?q=${searchQuery.value}`)
    searchResults.value = data.results || []
  } catch (e) {
    console.error('Search failed', e)
  }
}, 300)

const trackAndSelect = async (result: any) => {
    try {
        // Track symbol in backend (seeds price if new)
        await api.post('/stocks/track', { symbol: result.symbol })
        
        // Clear search
        searchQuery.value = ''
        searchResults.value = []
        
        // Refresh local stocks list to get the new one
        await fetchStocks()
        
        // Find and select it
        const stock = stocks.value.find(s => s.symbol === result.symbol)
        if (stock) selectStock(stock)
        
        toast.info(`Tracking ${result.symbol}`, {
            description: 'Market data is being fetched from Alpha Vantage.'
        })
    } catch (e: any) {
        toast.error('Failed to track symbol')
    }
}

const syncRealData = async () => {
    if (isSyncing.value) return
    isSyncing.value = true
    try {
        // Clean up duplicates first
        await api.post('/stocks/cleanup')
        
        const response = await api.post<any>('/stocks/refresh')
        toast.success(response.message || 'Alpha Vantage sync started.')
    } catch (e: any) {
        toast.error(e.message || 'Sync failed')
    } finally {
        isSyncing.value = false
        fetchStocks()
    }
}

const selectStock = (stock: any) => {
  selectedStock.value = stock
  txAmount.value = 1
  txPrice.value = stock.price ? parseFloat(stock.price.toFixed(2)) : 0
  fetchHistory(stock.symbol)
}

const handleTransaction = async () => {
    if (!selectedStock.value || isLogging.value) return
    
    isLogging.value = true
    try {
        await api.post('/stocks/transaction', {
            symbol: selectedStock.value.symbol,
            quantity: txAmount.value,
            price: txPrice.value,
            type: txType.value,
            date: txDate.value
        })

        toast.success('Transaction Recorded', {
            description: `${txType.value} ${txAmount.value} shares of ${selectedStock.value.symbol}`
        })
        
        await fetchPortfolio()
        selectedStock.value = null
    } catch (e: any) {
        toast.error(e.message || 'Failed to save transaction')
    } finally {
        isLogging.value = false
    }
}

let interval: any = null

onMounted(() => {
  fetchStocks()
  fetchPortfolio()
  interval = setInterval(fetchStocks, 10000)
})

onBeforeUnmount(() => {
  if (interval) clearInterval(interval)
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(120, 120, 120, 0.2);
}

/* Hide spin buttons for number inputs */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}
input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.appearance-none {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
}
</style>
