<template>
  <div class="h-full w-full flex flex-col bg-background text-foreground overflow-hidden">
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-4 border-b border-border bg-card/30 backdrop-blur-md sticky top-0 z-10">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-emerald-500/10 rounded-lg">
          <TrendingUp class="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight">Surreal Stocks</h1>
          <p class="text-xs text-muted-foreground flex items-center gap-1">
            <span class="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Real-time SurrealDB Live Updates
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button 
          @click="syncRealData"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-all text-xs font-bold uppercase tracking-wider"
          title="Sync with real market data (Alpha Vantage)"
          :disabled="isSyncing"
        >
          <Zap class="w-3.5 h-3.5" :class="{ 'animate-pulse text-orange-500': isSyncing }" />
          {{ isSyncing ? 'Syncing...' : 'Sync Real Data' }}
        </button>

        <div class="hidden md:flex flex-col items-end">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Portfolio Value</span>
          <span class="text-lg font-mono font-bold">{{ formatCurrency(totalValue) }}</span>
        </div>
        <button 
          @click="fetchPortfolio"
          class="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          title="Refresh Portfolio"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isRefreshing }" />
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-auto p-6 custom-scrollbar">
      <div class="max-w-7xl mx-auto space-y-8">
        
        <!-- Market Overview -->
        <section>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <BarChart3 class="w-4 h-4" /> Market Live
            </h2>
            <div class="text-[10px] text-muted-foreground font-mono">
              Auto-refreshing every 5s via SurrealQL simulation
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div 
              v-for="stock in stocks" 
              :key="stock.symbol"
              class="group p-4 bg-card border border-border rounded-xl hover:border-emerald-500/50 transition-all cursor-pointer relative overflow-hidden active:scale-95"
              @click="selectStock(stock)"
            >
              <div class="flex justify-between items-start mb-2">
                <div>
                  <div class="text-sm font-bold">{{ stock.symbol }}</div>
                  <div class="text-[10px] text-muted-foreground truncate max-w-[80px]">{{ stock.name }}</div>
                </div>
                <div :class="[
                  'text-xs font-mono font-bold',
                  stock.change >= 0 ? 'text-emerald-500' : 'text-rose-500'
                ]">
                  {{ stock.change >= 0 ? '+' : '' }}{{ stock.change.toFixed(2) }}
                </div>
              </div>
              <div class="text-xl font-mono font-bold mt-2">
                {{ formatCurrency(stock.price) }}
              </div>
              <div class="mt-1 flex items-center gap-1">
                <span :class="[
                  'text-[10px] px-1 rounded font-bold',
                  stock.change >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                ]">
                  {{ stock.change_percent.toFixed(2) }}%
                </span>
              </div>
              
              <!-- Subtle Sparkline (Static placeholder for visual impact) -->
              <div class="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Portfolio Stats -->
          <div class="lg:col-span-2 space-y-8">
            <section>
              <div class="flex items-center gap-2 mb-4">
                <h2 class="text-sm font-bold uppercase tracking-widest text-muted-foreground">Your Portfolio</h2>
                <div class="h-px flex-1 bg-border/50"></div>
              </div>
              
              <div v-if="portfolio.length === 0" class="p-8 bg-muted/30 rounded-2xl border border-dashed border-border flex flex-col items-center justify-center text-center">
                <Wallet class="w-12 h-12 text-muted-foreground/30 mb-4" />
                <h3 class="font-bold text-muted-foreground">Empty Portfolio</h3>
                <p class="text-xs text-muted-foreground mt-1">Select a stock from the market to start buying.</p>
              </div>

              <div v-else class="bg-card border border-border rounded-2xl overflow-hidden">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="bg-muted/50 text-[10px] uppercase tracking-wider font-bold">
                      <th class="px-6 py-3">Asset</th>
                      <th class="px-6 py-3">Holdings</th>
                      <th class="px-6 py-3 text-right">Latest Price</th>
                      <th class="px-6 py-3 text-right">Market Value</th>
                      <th class="px-6 py-3 text-right">Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    <tr v-for="item in portfolio" :key="item.id" class="hover:bg-muted/30 transition-colors">
                      <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded bg-primary/10 flex items-center justify-center font-bold text-xs">
                            {{ item.stock_data?.symbol?.[0] || '?' }}
                          </div>
                          <div>
                            <div class="font-bold">{{ item.stock_data?.symbol }}</div>
                            <div class="text-[10px] text-muted-foreground">{{ item.stock_data?.name }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="px-6 py-4">
                        <div class="font-mono">{{ item.quantity }} shares</div>
                        <div class="text-[10px] text-muted-foreground">Avg: {{ formatCurrency(item.buy_price) }}</div>
                      </td>
                      <td class="px-6 py-4 text-right font-mono">
                        {{ formatCurrency(getLatestPrice(item.stock_data?.symbol)) }}
                      </td>
                      <td class="px-6 py-4 text-right font-mono font-bold">
                        {{ formatCurrency(item.quantity * getLatestPrice(item.stock_data?.symbol)) }}
                      </td>
                      <td class="px-6 py-4 text-right">
                        <div :class="[
                          'font-mono font-bold',
                          getGains(item) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        ]">
                          {{ getGains(item).toFixed(2) }}%
                        </div>
                        <div class="text-[10px] text-muted-foreground">
                          {{ getGainsVal(item) >= 0 ? '+' : '' }}{{ formatCurrency(getGainsVal(item)) }}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <!-- Transaction Card -->
          <div class="space-y-6">
            <section class="p-6 bg-card border border-border rounded-2xl shadow-xl shadow-black/5">
              <h2 class="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                <Zap class="w-4 h-4 text-amber-500" /> Quick Trade
              </h2>

              <div v-if="selectedStock" class="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div class="p-4 bg-muted/50 rounded-xl border border-border flex justify-between items-center">
                  <div>
                    <div class="text-lg font-black">{{ selectedStock.symbol }}</div>
                    <div class="text-xs text-muted-foreground">{{ selectedStock.name }}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-mono font-black">{{ formatCurrency(selectedStock.price) }}</div>
                    <div :class="['text-[10px] font-bold', selectedStock.change >= 0 ? 'text-emerald-500' : 'text-rose-500']">
                      {{ selectedStock.change >= 0 ? '+' : '' }}{{ selectedStock.change.toFixed(2) }} ({{ selectedStock.change_percent.toFixed(2) }}%)
                    </div>
                  </div>
                </div>

                <div class="space-y-2">
                  <label class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Amount to Buy</label>
                  <div class="flex items-center gap-3">
                    <button @click="buyAmount = Math.max(1, buyAmount - 1)" class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition shadow-sm border border-border">
                      <Minus class="w-4 h-4" />
                    </button>
                    <input 
                      v-model.number="buyAmount" 
                      type="number" 
                      min="1"
                      class="flex-1 h-10 bg-background border border-border rounded-lg text-center font-mono font-bold focus:border-primary outline-none"
                    />
                    <button @click="buyAmount++" class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition shadow-sm border border-border">
                      <Plus class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div class="pt-4 border-t border-border">
                  <div class="flex justify-between items-center mb-4">
                    <span class="text-xs text-muted-foreground">Total Estimate</span>
                    <span class="text-lg font-mono font-black">{{ formatCurrency(buyAmount * selectedStock.price) }}</span>
                  </div>
                  <button 
                    @click="handleBuy"
                    :disabled="isBuying"
                    class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <ShoppingCart v-if="!isBuying" class="w-4 h-4" />
                    <Loader2 v-else class="w-4 h-4 animate-spin" />
                    {{ isBuying ? 'Processing...' : `Buy ${buyAmount} Shares` }}
                  </button>
                </div>
              </div>

              <div v-else class="flex flex-col items-center justify-center py-12 text-center opacity-40">
                <MousePointer2 class="w-10 h-10 mb-4" />
                <p class="text-xs font-medium">Select a stock to trade</p>
              </div>
            </section>

            <!-- SurrealDB Insight -->
            <div class="p-6 bg-violet-600/10 border border-violet-500/20 rounded-2xl">
              <div class="flex items-center gap-2 mb-3">
                <Cpu class="w-4 h-4 text-violet-500" />
                <h3 class="text-xs font-bold uppercase tracking-wider text-violet-500">SurrealQL Logic</h3>
              </div>
              <p class="text-[10px] text-muted-foreground leading-relaxed italic">
                Using Graph Relations (<code>RELATE</code>) to link users to assets, allowing for instant portfolio aggregation without complex JOINs. Live updates are pushed via simulated Live Queries.
              </p>
            </div>
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
  ShoppingCart, 
  TrendingDown, 
  Plus, 
  Minus,
  BarChart3,
  MousePointer2,
  Zap,
  Cpu,
  Loader2
} from 'lucide-vue-next'
import { toast } from '@/composables/useNotifications'

const stocks = ref<any[]>([])
const portfolio = ref<any[]>([])
const selectedStock = ref<any>(null)
const buyAmount = ref(1)
const isRefreshing = ref(false)
const isBuying = ref(false)
const isSyncing = ref(false)

const totalValue = computed(() => {
  return portfolio.value.reduce((sum, item) => {
    const currentPrice = getLatestPrice(item.stock_data?.symbol)
    return sum + (item.quantity * currentPrice)
  }, 0)
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
    
    // Update selected stock price if it exists
    if (selectedStock.value) {
      const updated = stocks.value.find(s => s.symbol === selectedStock.value.symbol)
      if (updated) selectedStock.value = updated
    }
  } catch (e) {
    console.error('Failed to fetch stocks', e)
  }
}

const fetchPortfolio = async () => {
  isRefreshing.value = true
  try {
    const data = await api.get<any>('/stocks/portfolio')
    portfolio.value = data.portfolio || []
  } catch (e) {
    console.error('Failed to fetch portfolio', e)
  } finally {
    isRefreshing.value = false
  }
}

const syncRealData = async () => {
    if (isSyncing.value) return
    isSyncing.value = true
    try {
        const response = await api.post<any>('/stocks/refresh')
        toast.success(response.message || 'Alpha Vantage sync started.')
    } catch (e: any) {
        if (e.message.includes('cooldown')) {
            toast.info(e.message)
        } else {
            toast.error(e.message || 'Sync failed')
        }
    } finally {
        isSyncing.value = false
    }
}

const selectStock = (stock: any) => {
  selectedStock.value = stock
  buyAmount.value = 1
}

const getLatestPrice = (symbol: string) => {
  const stock = stocks.value.find(s => s.symbol === symbol)
  return stock ? stock.price : 0
}

const getGains = (item: any) => {
  const current = getLatestPrice(item.stock_data?.symbol)
  if (!item.buy_price) return 0
  return ((current - item.buy_price) / item.buy_price) * 100
}

const getGainsVal = (item: any) => {
  const current = getLatestPrice(item.stock_data?.symbol)
  return (current - item.buy_price) * item.quantity
}

const handleBuy = async () => {
    if (!selectedStock.value || isBuying.value) return
    
    isBuying.value = true
    try {
        await api.post('/stocks/buy', {
            symbol: selectedStock.value.symbol,
            quantity: buyAmount.value
        })

        toast.success(`Bought ${buyAmount.value} shares of ${selectedStock.value.symbol}!`, {
            description: 'SurrealDB graph relation created successfully.'
        })
        
        await fetchPortfolio()
        selectedStock.value = null
    } catch (e: any) {
        toast.error(e.message || 'Purchase failed')
    } finally {
        isBuying.value = false
    }
}

let interval: any = null

onMounted(() => {
  fetchStocks()
  fetchPortfolio()
  
  // Simulate Live Queries via polling every 5s
  interval = setInterval(fetchStocks, 5000)
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
</style>
