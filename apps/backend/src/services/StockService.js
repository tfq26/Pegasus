import { db, isConnected } from "../../db/surreal.js";
import { APIService, API_DEFAULTS } from "./APIService.js";

export class StockService extends APIService {
    constructor() {
        super(API_DEFAULTS.STOCK_SIMULATOR);
        this.stocks = new Set(['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'META', 'NVDA', 'BRK.B', 'JNJ', 'V']);
        this.apiKey = process.env.ALPHAVANTAGE_KEY;
        this.lastRealSync = 0;
        this.syncInterval = 8 * 60 * 60 * 1000; // 8 hours (3 times a day)
        this.isSyncingReal = false;
    }

    /**
     * Search for stocks using Alpha Vantage SYMBOL_SEARCH
     */
    async searchStocks(keywords) {
        if (!this.apiKey) return [];
        try {
            const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${keywords}&apikey=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            const matches = data.bestMatches || [];
            return matches.map(m => ({
                symbol: m['1. symbol'],
                name: m['2. name'],
                type: m['3. type'],
                region: m['4. region'],
                currency: m['8. currency']
            }));
        } catch (e) {
            console.error('[StockService] Search failed:', e);
            return [];
        }
    }

    /**
     * Add a new symbol to our tracked list and seed initial data
     */
    async trackSymbol(symbol) {
        if (this.stocks.has(symbol)) return true;

        console.log(`[StockService] Tracking new symbol: ${symbol}`);
        this.stocks.add(symbol);

        // Fetch initial quote and history immediately
        await this.refreshStock(symbol);
        await this.syncHistory(symbol);
        return true;
    }

    /**
     * Fetch historical daily data from Alpha Vantage and persist it
     */
    async syncHistory(symbol) {
        if (!this.apiKey) return;

        try {
            console.log(`[StockService] Fetching history for ${symbol}...`);
            const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            const timeSeries = data['Time Series (Daily)'];
            if (!timeSeries) {
                console.warn(`[StockService] No history found for ${symbol}`, data['Note'] || data['Information'] || 'Unknown error');
                return;
            }

            // Limit to last 30 days
            const dates = Object.keys(timeSeries).slice(0, 30);

            for (const date of dates) {
                const dayData = timeSeries[date];
                const price = parseFloat(dayData['4. close']);

                const safeSymbolId = symbol.replace(/\./g, '_');
                const historyId = `stock_history:${safeSymbolId}_${date.replace(/-/g, '')}`;

                await db.query(`
                    INSERT INTO stock_history (id, symbol, date, price, created_at)
                    VALUES ($id, $symbol, $date, $price, time::now())
                    ON DUPLICATE KEY UPDATE 
                        price = $price;
                `, {
                    id: historyId,
                    symbol,
                    date,
                    price
                });
            }
            console.log(`[StockService] Persisted ${dates.length} historical points for ${symbol}.`);
        } catch (e) {
            console.error(`[StockService] History sync failed for ${symbol}:`, e.message);
        }
    }

    /**
     * Standard quote fetcher
     */
    async getQuote(symbol) {
        if (!this.apiKey) return null;
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        return data['Global Quote'];
    }

    /**
     * Override sync with the simulation logic for stocks
     */
    async sync() {
        try {
            if (!isConnected) return;

            // First time seeding
            await this.seed();

            // Check if we need to sync real data from Alpha Vantage
            const now = Date.now();
            if (this.apiKey && (now - this.lastRealSync > this.syncInterval) && !this.isSyncingReal) {
                // Run real sync in background so we don't block simulation
                this.updateFromAlphaVantage();
            }

            // Then update prices (simulation for micro-movements)
            await this.updatePrices();
        } catch (e) {
            if (!e.message.includes('NoActiveSocket')) {
                console.error('[StockService] Simulation step failed:', e);
            }
        }
    }

    async updateFromAlphaVantage() {
        if (!this.apiKey || this.isSyncingReal) return;

        this.isSyncingReal = true;
        console.log('[StockService] Starting Alpha Vantage real price sync...');

        try {
            const currentSymbols = Array.from(this.stocks);
            for (const symbol of currentSymbols) {
                await this.refreshStock(symbol);
                // Also sync history if it's the cycle
                await this.syncHistory(symbol);

                // Throttling: Alpha Vantage free tier is 5 requests per minute.
                // Since we are doing 2 calls per symbol (quote + history), 
                // we should wait longer.
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
            this.lastRealSync = Date.now();
            console.log('[StockService] Alpha Vantage sync completed.');
        } catch (error) {
            console.error('[StockService] Alpha Vantage sync failed:', error.message);
        } finally {
            this.isSyncingReal = false;
        }
    }

    async refreshStock(symbol) {
        if (!this.apiKey) return;

        try {
            const quote = await this.getQuote(symbol);
            if (!quote || !quote['05. price']) {
                console.warn(`[StockService] No quote found for ${symbol}`);
                return;
            }

            const price = parseFloat(quote['05. price']);
            const change = parseFloat(quote['09. change']);
            const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));
            const volume = parseInt(quote['06. volume']);

            const safeId = symbol.replace(/\./g, '_');
            const id = `stock:${safeId}`;

            // Check if exists to determine if we need a full seed or just update
            const [existing] = await db.query(`SELECT id FROM ${id}`);

            if (!existing || existing.length === 0) {
                // Fetch name if not already tracked
                const searchResults = await this.searchStocks(symbol);
                const info = searchResults.find(r => r.symbol === symbol);
                const name = info ? info.name : symbol;

                await db.query(`
                    INSERT INTO stock (id, symbol, name, price, change, change_percent, last_updated, volume, market_cap)
                    VALUES ($id, $symbol, $name, $price, $change, $change_percent, time::now(), $volume, $market_cap)
                `, {
                    id,
                    symbol,
                    name,
                    price,
                    change,
                    change_percent: changePercent,
                    volume,
                    market_cap: 0
                });
            } else {
                await db.query(`
                    UPDATE ${id} SET 
                        price = $price,
                        change = $change,
                        change_percent = $change_percent,
                        volume = $volume,
                        last_updated = time::now(),
                        is_real_data = true
                `, {
                    price,
                    change,
                    change_percent: changePercent,
                    volume
                });
            }

            console.log(`[StockService] Updated ${symbol} with REAL data: $${price}`);
        } catch (error) {
            console.error(`[StockService] Failed to refresh ${symbol}:`, error.message);
        }
    }

    async seed() {
        const currentSymbols = Array.from(this.stocks);
        for (const symbol of currentSymbols) {
            const safeId = symbol.replace(/\./g, '_');
            const id = `stock:${safeId}`;
            try {
                const [existing] = await db.query(`SELECT id FROM ${id}`);

                if (!existing || existing.length === 0) {
                    const price = 100 + Math.random() * 500;
                    console.log(`[StockService] Seeding ${symbol} at $${price.toFixed(2)}`);
                    await db.query(`
                        INSERT INTO stock (id, symbol, name, price, change, change_percent, last_updated, volume, market_cap)
                        VALUES ($id, $symbol, $name, $price, 0, 0, time::now(), $volume, $market_cap)
                    `, {
                        id,
                        symbol,
                        name: this.getStockName(symbol),
                        price,
                        volume: Math.floor(Math.random() * 1000000),
                        market_cap: Math.floor(Math.random() * 2000000000)
                    });
                }
            } catch (e) {
                console.error(`[StockService] Failed to seed ${symbol}:`, e.message);
                throw e;
            }
        }
    }

    async updatePrices() {
        const currentSymbols = Array.from(this.stocks);
        for (const symbol of currentSymbols) {
            const safeId = symbol.replace(/\./g, '_');
            const id = `stock:${safeId}`;
            const [results] = await db.query(`SELECT price FROM ${id}`);
            if (!results || results.length === 0) continue;

            const currentPrice = results[0].price;
            const change = (Math.random() - 0.5) * (currentPrice * 0.0005);
            const newPrice = currentPrice + change;
            const [stock] = await db.query(`SELECT change FROM ${id}`);

            const totalChange = (stock[0]?.change || 0) + change;
            const changePercent = (totalChange / (newPrice - totalChange)) * 100;

            await db.query(`
                UPDATE ${id} SET 
                    price = $price,
                    change = $change,
                    change_percent = $change_percent,
                    last_updated = time::now()
            `, {
                price: newPrice,
                change: totalChange,
                change_percent: changePercent
            });
        }
    }

    getStockName(symbol) {
        const names = {
            'AAPL': 'Apple Inc.',
            'GOOGL': 'Alphabet Inc.',
            'AMZN': 'Amazon.com Inc.',
            'MSFT': 'Microsoft Corp.',
            'TSLA': 'Tesla Inc.',
            'META': 'Meta Platforms Inc.',
            'NVDA': 'NVIDIA Corp.',
            'BRK.B': 'Berkshire Hathaway Inc.',
            'JNJ': 'Johnson & Johnson',
            'V': 'Visa Inc.'
        };
        return names[symbol] || symbol;
    }
}

export const stockService = new StockService();
