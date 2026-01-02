import { db, isConnected } from "../../db/surreal.js";
import { APIService, API_DEFAULTS } from "./APIService.js";

export class StockService extends APIService {
    constructor() {
        super(API_DEFAULTS.STOCK_SIMULATOR);
        this.stocks = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'META', 'NVDA', 'BRK.B', 'JNJ', 'V'];
    }

    /**
     * Override sync with the simulation logic for stocks
     */
    async sync() {
        try {
            if (!isConnected) return;

            // First time seeding
            await this.seed();

            // Then update prices
            await this.updatePrices();
        } catch (e) {
            if (!e.message.includes('NoActiveSocket')) {
                console.error('[StockService] Simulation step failed:', e);
            }
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
            const change = (Math.random() - 0.5) * (currentPrice * 0.02);
            const newPrice = currentPrice + change;
            const changePercent = (change / currentPrice) * 100;

            await db.query(`
                UPDATE ${id} SET 
                    price = $price,
                    change = $change,
                    change_percent = $change_percent,
                    last_updated = time::now()
            `, {
                price: newPrice,
                change,
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
