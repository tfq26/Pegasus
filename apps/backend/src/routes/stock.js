import { Hono } from "hono"
import { db } from "../db/index.js"

import { stocksTable, stockHistory, stockTransactions, users } from "../db/schema.js"
import { eq, inArray, and, asc, desc } from "drizzle-orm"
import { stockService } from "../services/StockService.js"
import { getAuthToken } from "../../lib/auth.js"
import { ConfigService } from "../services/ConfigService.js"

const stocks = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Tracking manual refresh cooldowns per user
const userRefreshCooldowns = new Map();
const COOLDOWN_PRO = 30 * 60 * 1000; // 30 minutes
const COOLDOWN_FREE = 60 * 60 * 1000; // 1 hour

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

stocks.post("/cleanup", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        await db.delete(stocksTable);
        await db.delete(stockHistory);

        return c.json({ ok: true, message: "Market data reset. Click SYNC again to repopulate." });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/", async (c) => {
    try {
        const results = await db.query.stocksTable.findMany({
            orderBy: [asc(stocksTable.symbol)]
        });
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

    try {
        const payload = await verify(token, jwtSecret);
        const userId = payload.sub;

        // Determine user tier
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { subscriptionTier: true }
        });
        const tier = user?.subscriptionTier || 'free';
        const cooldown = tier === 'pro' ? COOLDOWN_PRO : COOLDOWN_FREE;

        const now = Date.now();
        const lastRefresh = userRefreshCooldowns.get(userId) || 0;

        if (now - lastRefresh < cooldown) {
            const remaining = Math.ceil((cooldown - (now - lastRefresh)) / 60000);
            return c.json({ error: `Refresh on cooldown. Please wait ${remaining} minutes. Tier: ${tier.toUpperCase()}` }, 429)
        }

        userRefreshCooldowns.set(userId, now);

        // Trigger background sync
        stockService.updateFromAlphaVantage();
        return c.json({ message: `Alpha Vantage sync started. Next refresh available in ${tier === 'pro' ? '30' : '60'} mins.` });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/portfolio", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // 1. Get all transactions for this user
        const transactions = await db.query.stockTransactions.findMany({
            where: eq(stockTransactions.userId, userId),
            orderBy: [asc(stockTransactions.date)]
        });

        // 2. Fetch all unique stocks involved to get current prices
        const symbols = [...new Set(transactions.map(t => t.symbol))];
        const currentStocks = await db.query.stocksTable.findMany({
            where: inArray(stocksTable.symbol, symbols)
        });
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
        // Fetch real history
        const history = await db.query.stockHistory.findMany({
            where: eq(stockHistory.symbol, symbol),
            orderBy: [asc(stockHistory.date)]
        });

        // If no history exists, generate an estimated trend based on current price
        if (!history || history.length === 0) {
            const stock = await db.query.stocksTable.findFirst({
                where: eq(stocksTable.symbol, symbol),
                columns: { price: true }
            });
            const currentPrice = stock?.price || 100;

            // Generate 30 points of realistic noise
            const estimatedHistory = [];
            const now = new Date();
            for (let i = 30; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                // Simple random walk starting from past towards current price
                const variance = 1 - (i * 0.002); // less variance as we get closer to today
                estimatedHistory.push({
                    date: date.toISOString().split('T')[0],
                    price: currentPrice * (0.95 + Math.random() * 0.1 * variance),
                    is_estimated: true
                });
            }

            // Still trigger real sync for future
            stockService.syncHistory(symbol);
            return c.json({ history: estimatedHistory });
        }

        return c.json({ history });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/:symbol", async (c) => {
    const symbol = c.req.param("symbol");
    try {
        const result = await db.query.stocksTable.findFirst({
            where: eq(stocksTable.symbol, symbol)
        });
        if (!result) return c.json({ error: "Stock not found" }, 404);
        return c.json(result);
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
        const userId = payload.sub

        const stock = await db.query.stocksTable.findFirst({
            where: eq(stocksTable.symbol, symbol),
            columns: { name: true }
        });
        const stockName = stock?.name || symbol;

        // Record the transaction
        const [result] = await db.insert(stockTransactions).values({
            userId,
            symbol,
            name: stockName,
            quantity,
            price,
            type, // BUY or SELL
            date: date ? new Date(date) : new Date(),
            createdAt: new Date()
        }).returning();

        return c.json({ ok: true, transaction: result });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export { stocks as stockRoutes }
