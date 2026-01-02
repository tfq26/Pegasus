import { db, isConnected } from "../../db/surreal.js";
import { APIService, API_DEFAULTS } from "./APIService.js";

export class StockService extends APIService {
    constructor() {
        super(API_DEFAULTS.STOCK_SIMULATOR);
        this.stocks = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'META', 'NVDA', 'BRK.B', 'JNJ', 'V'];
        this.apiKey = process.env.ALPHAVANTAGE_KEY;
        this.lastRealSync = 0;
        this.syncInterval = 8 * 60 * 60 * 1000; // 8 hours (3 times a day)
        this.isSyncingReal = false;
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
            for (const symbol of this.stocks) {
                await this.refreshStock(symbol);
                // Throttling: Alpha Vantage free tier is 5 requests per minute.
                // We wait 15 seconds between stocks to be safe (4 calls per minute).
                await new Promise(resolve => setTimeout(resolve, 15000));
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
            const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json();

            const quote = data['Global Quote'];
            if (!quote || !quote['05. price']) {
                console.warn(`[StockService] No quote found for ${symbol}`, data);
                return;
            }

            const price = parseFloat(quote['05. price']);
            const change = parseFloat(quote['09. change']);
            const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));
            const volume = parseInt(quote['06. volume']);

            const safeId = symbol.replace(/\./g, '_');
            const id = `stock:${safeId}`;

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

            console.log(`[StockService] Updated ${symbol} with REAL data: $${price}`);
        } catch (error) {
            console.error(`[StockService] Failed to refresh ${symbol}:`, error.message);
        }
    }

    async seed() {
        for (const symbol of this.stocks) {
            // Replace dots with underscores for valid SurrealDB record IDs
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
                        ON DUPLICATE KEY UPDATE 
                            price = $price,
                            last_updated = time::now();
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
                throw e; // Rethrow to be caught by sync()
            }
        }
    }

    async updatePrices() {
        for (const symbol of this.stocks) {
            const safeId = symbol.replace(/\./g, '_');
            const id = `stock:${safeId}`;
            const [results] = await db.query(`SELECT price FROM ${id}`);
            if (!results || results.length === 0) continue;

            const currentPrice = results[0].price;
            // Micro-fluctuation (0.05% max per simulation step)
            const change = (Math.random() - 0.5) * (currentPrice * 0.0005);
            const newPrice = currentPrice + change;
            const [stock] = await db.query(`SELECT change, change_percent FROM ${id}`);

            // We accumulate the simulation change on top of whatever the last real change was
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
