import { Hono } from "hono"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { stockService } from "../services/StockService.js"
import { getAuthToken } from "../../lib/auth.js"

const stocks = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Status for manual refresh cooldown
let lastManualRefresh = 0;
const MANUAL_REFRESH_COOLDOWN = 10 * 60 * 1000; // 10 minutes

stocks.get("/search", async (c) => {
    const keywords = c.req.query("q");
    if (!keywords) return c.json({ results: [] });
    try {
        const results = await stockService.searchStocks(keywords);
        return c.json({ results });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.post("/track", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { symbol } = await c.req.json();
        if (!symbol) return c.json({ error: "Symbol required" }, 400);

        await stockService.trackSymbol(symbol);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/", async (c) => {
    try {
        const [results] = await db.query("SELECT * FROM stock ORDER BY symbol ASC");
        return c.json({ stocks: results });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.post("/refresh", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    console.log('[Stocks API] Refresh request received');
    console.log('[Stocks API] ALPHAVANTAGE_KEY present:', !!process.env.ALPHAVANTAGE_KEY);

    if (!process.env.ALPHAVANTAGE_KEY) {
        return c.json({ error: "Alpha Vantage API key not configured on server" }, 400)
    }

    const now = Date.now();
    if (now - lastManualRefresh < MANUAL_REFRESH_COOLDOWN) {
        const remaining = Math.ceil((MANUAL_REFRESH_COOLDOWN - (now - lastManualRefresh)) / 60000);
        return c.json({ error: `Manual refresh on cooldown. Please wait ${remaining} minutes.` }, 429)
    }

    try {
        lastManualRefresh = now;
        // Trigger background sync
        stockService.updateFromAlphaVantage();
        return c.json({ message: "Alpha Vantage sync started in background." });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/portfolio", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = `user:${payload.sub}`

        // 1. Get all transactions for this user
        const [transactions] = await db.query(`
            SELECT * FROM stock_transaction 
            WHERE user = $user 
            ORDER BY date ASC
        `, { user: userId });

        // 2. Fetch all unique stocks involved to get current prices
        const symbols = [...new Set(transactions.map(t => t.symbol))];
        const [currentStocks] = await db.query(`SELECT * FROM stock WHERE symbol IN $symbols`, { symbols });
        const stockMap = currentStocks.reduce((map, s) => {
            map[s.symbol] = s;
            return map;
        }, {});

        // 3. Process transactions to get current holdings and realized gains
        const holdings = {};
        let totalRealizedGain = 0;
        let totalInvested = 0;

        for (const t of transactions) {
            if (!holdings[t.symbol]) {
                holdings[t.symbol] = {
                    symbol: t.symbol,
                    name: t.name || t.symbol,
                    quantity: 0,
                    totalCost: 0,
                    avgBuyPrice: 0,
                    history: []
                };
            }

            if (t.type === 'BUY') {
                holdings[t.symbol].quantity += t.quantity;
                holdings[t.symbol].totalCost += (t.quantity * t.price);
                holdings[t.symbol].avgBuyPrice = holdings[t.symbol].totalCost / holdings[t.symbol].quantity;
                totalInvested += (t.quantity * t.price);
            } else if (t.type === 'SELL') {
                const profitPerShare = t.price - holdings[t.symbol].avgBuyPrice;
                totalRealizedGain += (profitPerShare * t.quantity);
                holdings[t.symbol].quantity -= t.quantity;
                holdings[t.symbol].totalCost -= (t.quantity * holdings[t.symbol].avgBuyPrice);
                totalInvested -= (t.quantity * holdings[t.symbol].avgBuyPrice);
            }
        }

        // 4. Calculate unrealized gains and filter out zero holdings
        const activeHoldings = Object.values(holdings).filter(h => h.quantity > 0).map(h => {
            const currentPrice = stockMap[h.symbol]?.price || h.avgBuyPrice;
            const marketValue = h.quantity * currentPrice;
            const unrealizedGain = marketValue - h.totalCost;
            const gainPercent = (unrealizedGain / h.totalCost) * 100;

            return {
                ...h,
                currentPrice,
                marketValue,
                unrealizedGain,
                gainPercent,
                stock_data: stockMap[h.symbol]
            };
        });

        // 5. Aggregate metrics
        const totalMarketValue = activeHoldings.reduce((sum, h) => sum + h.marketValue, 0);
        const totalUnrealizedGain = activeHoldings.reduce((sum, h) => sum + h.unrealizedGain, 0);

        const sortedPerformance = [...activeHoldings].sort((a, b) => b.gainPercent - a.gainPercent);
        const bestPerformer = sortedPerformance[0] || null;
        const worstPerformer = sortedPerformance[sortedPerformance.length - 1] || null;

        return c.json({
            portfolio: activeHoldings,
            metrics: {
                totalMarketValue,
                totalInvested,
                totalUnrealizedGain,
                totalRealizedGain,
                bestPerformer,
                worstPerformer
            }
        });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/history/:symbol", async (c) => {
    const symbol = c.req.param("symbol");
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        // Find stock current price to verify existence
        const safeId = symbol.replace(/\./g, '_');
        const [results] = await db.query(`SELECT price FROM stock:${safeId}`);
        if (!results || results.length === 0) return c.json({ error: "Stock not found" }, 404);

        // Fetch real history from DB
        const [history] = await db.query(`
            SELECT date, price FROM stock_history 
            WHERE symbol = $symbol 
            ORDER BY date ASC
        `, { symbol });

        // If no history exists, trigger a background sync for the future
        if (!history || history.length === 0) {
            stockService.syncHistory(symbol);
        }

        return c.json({ history });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/:symbol", async (c) => {
    const symbol = c.req.param("symbol");
    const safeId = symbol.replace(/\./g, '_');
    try {
        const [results] = await db.query(`SELECT * FROM stock:${safeId}`);
        if (!results || results.length === 0) return c.json({ error: "Stock not found" }, 404);
        return c.json(results[0]);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.post("/transaction", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const { symbol, quantity, price, type, date } = await c.req.json()
        const userId = `user:${payload.sub}`

        const [stock] = await db.query(`SELECT name FROM stock WHERE symbol = $symbol`, { symbol });
        const stockName = stock[0]?.name || symbol;

        // Record the transaction
        const result = await db.query(`
            CREATE stock_transaction CONTENT {
                user: $user,
                symbol: $symbol,
                name: $name,
                quantity: $quantity,
                price: $price,
                type: $type,
                date: $date || time::now(),
                created_at: time::now()
            }
        `, {
            user: userId,
            symbol,
            name: stockName,
            quantity,
            price,
            type, // BUY or SELL
            date
        });

        return c.json({ ok: true, transaction: result[0] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export { stocks as stockRoutes }
