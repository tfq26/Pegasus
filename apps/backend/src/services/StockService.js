import { db } from "../db/index.js";
import { stocksTable, stockHistory } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { APIService, API_DEFAULTS } from "./APIService.js";

export class StockService extends APIService {
    constructor() {
        super(API_DEFAULTS.STOCK_SIMULATOR);
        this.stocks = new Set(['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'META', 'NVDA', 'QQQ', 'BRK.B', 'V']);
        this.apiKey = process.env.ALPHAVANTAGE_KEY;
        this.lastRealSync = 0;
        this.syncInterval = 1 * 60 * 60 * 1000; // 1 hour
        this.isSyncingReal = false;
        this.rateLimitCooldown = 0;
        this.isDeactivated = true; // Set to true to kill all Alpha Vantage calls
    }

    /**
     * Search for stocks using Alpha Vantage SYMBOL_SEARCH
     */
    async searchStocks(keywords) {
        if (this.isDeactivated || !this.apiKey) return [];
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
        if (this.isDeactivated || !this.apiKey) return;
        if (Date.now() < this.rateLimitCooldown) return;

        try {
            console.log(`[StockService] Fetching history for ${symbol}...`);
            const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data['Note'] || data['Information']) {
                console.warn('[StockService] Alpha Vantage rate limit hit. Cooling down for 1 min...');
                this.rateLimitCooldown = Date.now() + 60000;
                return;
            }

            const timeSeries = data['Time Series (Daily)'];
            if (!timeSeries) {
                console.warn(`[StockService] No history found for ${symbol}`, data['Note'] || data['Information'] || 'Unknown error');
                return;
            }

            const dates = Object.keys(timeSeries).slice(0, 30);

            for (const date of dates) {
                const dayData = timeSeries[date];
                const price = parseFloat(dayData['4. close']);

                // In Postgres, we'll use symbol + date as a unique identifier for history or just insert
                // The schema has an auto-random UUID primary key, but we want unique by (symbol, date)
                // We'll use a raw SQL upsert since schema might not have unique constraint yet or just use symbol/date
                await db.execute(sql`
                    INSERT INTO stock_history (symbol, date, price, created_at)
                    VALUES (${symbol}, ${date}, ${price}, NOW())
                    ON CONFLICT DO NOTHING
                `);
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
            if (!db) return;

            // First time seeding
            await this.seed();

            // Check if we need to sync real data from Alpha Vantage
            const now = Date.now();
            if (this.apiKey && (now - this.lastRealSync > this.syncInterval) && !this.isSyncingReal) {
                this.updateFromAlphaVantage();
            }

            // Then update prices (simulation for micro-movements)
            await this.updatePrices();
        } catch (e) {
            console.error('[StockService] Simulation step failed:', e);
        }
    }

    async updateFromAlphaVantage() {
        if (!this.apiKey || this.isSyncingReal) return;
        if (Date.now() < this.rateLimitCooldown) return;

        this.isSyncingReal = true;
        console.log('[StockService] Starting Alpha Vantage real price sync...');

        try {
            const currentSymbols = Array.from(this.stocks);
            for (const symbol of currentSymbols) {
                await this.refreshStock(symbol);
                await this.syncHistory(symbol);
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
        if (this.isDeactivated || !this.apiKey) return;
        if (Date.now() < this.rateLimitCooldown) return;

        try {
            const quote = await this.getQuote(symbol);

            if (quote && (quote['Note'] || quote['Information'])) {
                console.warn('[StockService] Alpha Vantage rate limit hit during quote. Cooling down...');
                this.rateLimitCooldown = Date.now() + 65000;
                return;
            }

            if (!quote || !quote['05. price']) {
                console.warn(`[StockService] No quote found for ${symbol}`);
                return;
            }

            const price = parseFloat(quote['05. price']);
            const change = parseFloat(quote['09. change']);
            const changePercent = parseFloat(quote['10. change percent']?.replace('%', '') || 0);
            const volume = parseInt(quote['06. volume'] || 0);

            await db.insert(stocksTable)
                .values({
                    symbol,
                    name: symbol,
                    price,
                    change,
                    changePercent,
                    volume,
                    isRealData: true,
                    lastUpdated: new Date()
                })
                .onConflictDoUpdate({
                    target: stocksTable.symbol,
                    set: {
                        price,
                        change,
                        changePercent,
                        volume,
                        isRealData: true,
                        lastUpdated: new Date()
                    }
                });

            console.log(`[StockService] Updated ${symbol} with REAL data: $${price}`);
        } catch (error) {
            console.error(`[StockService] Failed to refresh ${symbol}:`, error.message);
        }
    }

    async seed() {
        const currentSymbols = Array.from(this.stocks);
        for (const symbol of currentSymbols) {
            try {
                const existing = await db.query.stocksTable.findFirst({
                    where: eq(stocksTable.symbol, symbol)
                });

                if (!existing) {
                    const price = this.getInitialPrice(symbol);
                    await db.insert(stocksTable).values({
                        symbol,
                        name: this.getStockName(symbol),
                        price,
                        change: 0,
                        changePercent: 0,
                        volume: Math.floor(Math.random() * 1000000),
                        marketCap: Math.floor(Math.random() * 2000000000),
                        isRealData: false,
                        lastUpdated: new Date()
                    });
                    console.log(`[StockService] Seeded ${symbol} at initial price $${price}`);
                }
            } catch (e) {
                console.error(`[StockService] Seed failed for ${symbol}:`, e.message);
            }
        }
    }

    getInitialPrice(symbol) {
        const prices = {
            'AAPL': 271.86,
            'GOOGL': 312.34,
            'AMZN': 230.88,
            'MSFT': 482.62,
            'TSLA': 449.39,
            'META': 661.45,
            'NVDA': 186.50,
            'QQQ': 614.31,
            'BRK.B': 503.36,
            'V': 350.85
        };
        return prices[symbol] || (100 + Math.random() * 200);
    }

    async updatePrices() {
        const currentSymbols = Array.from(this.stocks);
        for (const symbol of currentSymbols) {
            try {
                const stock = await db.query.stocksTable.findFirst({
                    where: eq(stocksTable.symbol, symbol)
                });

                if (!stock) continue;

                const currentPrice = stock.price;
                const lastChange = stock.change || 0;

                const noise = (Math.random() - 0.5) * (currentPrice * 0.0005);
                const newPrice = currentPrice + noise;
                const newTotalChange = lastChange + noise;
                const changePercent = (newTotalChange / (newPrice - newTotalChange)) * 100;

                await db.update(stocksTable)
                    .set({
                        price: newPrice,
                        change: newTotalChange,
                        changePercent: changePercent,
                        lastUpdated: new Date()
                    })
                    .where(eq(stocksTable.symbol, symbol));
            } catch (e) {
                // Ignore errors during simulation
            }
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
