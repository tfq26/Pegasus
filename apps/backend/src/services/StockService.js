import { db } from "../../db/surreal.js";

export class StockService {
    constructor() {
        this.stocks = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'META', 'NVDA', 'BRK.B', 'JNJ', 'V'];
        this.isRunning = false;
        this.intervalId = null;
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[StockService] Starting real-time stock simulation...');

        // Ensure table exists and has initial data
        await this.seed();

        // Update every 5 seconds
        this.intervalId = setInterval(() => this.updatePrices(), 5000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[StockService] Stopped.');
    }

    async seed() {
        try {
            // Check connection first implicitly by catching error
            for (const symbol of this.stocks) {
                const id = `stock:${symbol}`;
                const [existing] = await db.query(`SELECT id FROM ${id}`);

                if (!existing || existing.length === 0) {
                    const price = 100 + Math.random() * 500;
                    await db.query(`
                        CREATE ${id} CONTENT {
                            symbol: $symbol,
                            name: $name,
                            price: $price,
                            change: 0,
                            change_percent: 0,
                            last_updated: time::now(),
                            volume: $volume,
                            market_cap: $market_cap
                        }
                    `, {
                        symbol,
                        name: this.getStockName(symbol),
                        price,
                        volume: Math.floor(Math.random() * 1000000),
                        market_cap: Math.floor(Math.random() * 2000000000)
                    });
                }
            }
        } catch (e) {
            // Gracefully handle NoActiveSocket (startup race condition)
            if (e.message && e.message.includes('NoActiveSocket')) {
                console.log('[StockService] DB not ready yet, retrying seed in 5s...');
                setTimeout(() => this.seed(), 5000);
            } else {
                console.error('[StockService] Seeding failed:', e);
            }
        }
    }

    async updatePrices() {
        try {
            for (const symbol of this.stocks) {
                const id = `stock:${symbol}`;
                // Select first to get current price for realistic change
                const [results] = await db.query(`SELECT price FROM ${id}`);
                if (!results || results.length === 0) continue;

                const currentPrice = results[0].price;
                const change = (Math.random() - 0.5) * (currentPrice * 0.02); // Max 2% change
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
            // console.log('[StockService] Updated prices at', new Date().toLocaleTimeString());
        } catch (e) {
            if (e.message && e.message.includes('NoActiveSocket')) {
                // Determine if we should log verbose (only once per disconnection)
                if (this.isRunning) {
                    console.log('[StockService] DB disconnected, pausing updates...');
                    // Don't retry immediately, let the next interval try
                }
            } else {
                console.error('[StockService] Update failed:', e);
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
