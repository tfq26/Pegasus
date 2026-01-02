import { db, isConnected } from "../../db/surreal.js";
import { APIService, API_DEFAULTS } from "./APIService.js";

export class StockService extends APIService {
    constructor() {
        super(API_DEFAULTS.STOCK_SIMULATOR);
        this.stocks = new Set(['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'META', 'NVDA', 'QQQ', 'BRK.B', 'V']);
        this.apiKey = process.env.ALPHAVANTAGE_KEY;
        this.lastRealSync = 0;
        this.syncInterval = 8 * 60 * 60 * 1000; // 8 hours (3 times a day)
        this.isSyncingReal = false;
        this.rateLimitCooldown = 0;
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
        if (Date.now() < this.rateLimitCooldown) return;

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
        if (Date.now() < this.rateLimitCooldown) return;

        try {
            const quote = await this.getQuote(symbol);

            // Check for rate limit message in quote
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

            const safeId = symbol.replace(/\./g, '_');

            // In SurrealDB INSERT, the 'id' field should just be the part AFTER the colon
            // because SurrealDB automatically prepends 'stock:' from the table name
            await db.query(`
                INSERT INTO stock (id, symbol, name, price, change, change_percent, last_updated, volume, market_cap, is_real_data)
                VALUES ($id, $symbol, $name, $price, $change, $change_percent, time::now(), $volume, 0, true)
                ON DUPLICATE KEY UPDATE 
                    price = $price,
                    change = $change,
                    change_percent = $change_percent,
                    volume = $volume,
                    last_updated = time::now(),
                    is_real_data = true;
            `, {
                id: safeId,
                symbol,
                name: symbol,
                price,
                change,
                change_percent: changePercent,
                volume
            });

            console.log(`[StockService] Updated ${symbol} with REAL data: $${price}`);
        } catch (error) {
            console.error(`[StockService] Failed to refresh ${symbol}:`, error.message);
        }
    }

    async seed() {
        const currentSymbols = Array.from(this.stocks);
        for (const symbol of currentSymbols) {
            const safeId = symbol.replace(/\./g, '_');
            const recordId = `stock:${safeId}`;

            try {
                // Check if exists using full record ID
                const [existing] = await db.query(`SELECT id FROM ${recordId}`);

                if (!existing || existing.length === 0) {
                    // Small delay to prevent write conflicts during batch seed
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

                    const price = this.getInitialPrice(symbol);
                    await db.query(`
                        INSERT INTO stock (id, symbol, name, price, change, change_percent, last_updated, volume, market_cap, is_real_data)
                        VALUES ($id, $symbol, $name, $price, 0, 0, time::now(), $volume, $market_cap, false)
                    `, {
                        id: safeId, // Use simple ID for INSERT
                        symbol,
                        name: this.getStockName(symbol),
                        price,
                        volume: Math.floor(Math.random() * 1000000),
                        market_cap: Math.floor(Math.random() * 2000000000)
                    });
                    console.log(`[StockService] Seeded ${symbol} at initial price $${price}`);
                }
            } catch (e) {
                // Silently log conflict but don't stop the loop
                if (!e.message.includes('conflict')) {
                    console.error(`[StockService] Seed failed for ${symbol}:`, e.message);
                }
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
        // If unknown, use a random but sane range (100-300)
        return prices[symbol] || (100 + Math.random() * 200);
    }

    async updatePrices() {
        const currentSymbols = Array.from(this.stocks);
        for (const symbol of currentSymbols) {
            const safeId = symbol.replace(/\./g, '_');
            const recordId = `stock:${safeId}`;

            try {
                const [results] = await db.query(`SELECT price, change FROM ${recordId}`);
                if (!results || results.length === 0) continue;

                const currentPrice = results[0].price;
                const lastChange = results[0].change || 0;

                // Micro-fluctuation
                const noise = (Math.random() - 0.5) * (currentPrice * 0.0005);
                const newPrice = currentPrice + noise;
                const newTotalChange = lastChange + noise;
                const changePercent = (newTotalChange / (newPrice - newTotalChange)) * 100;

                await db.query(`
                    UPDATE ${recordId} SET 
                        price = $price,
                        change = $change,
                        change_percent = $change_percent,
                        last_updated = time::now()
                `, {
                    price: newPrice,
                    change: newTotalChange,
                    change_percent: changePercent
                });
            } catch (e) {
                // Ignore conflict errors during simulation, it'll try again next tick
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
