import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { stockService } from "../services/StockService.js"

const stocks = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

stocks.get("/", async (c) => {
    try {
        const [results] = await db.query("SELECT * FROM stock ORDER BY symbol ASC");
        return c.json({ stocks: results });
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

stocks.post("/buy", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const { symbol, quantity } = await c.req.json()
        const userId = `user:${payload.sub}`
        const symbolSafe = symbol.replace(/\./g, '_')
        const stockId = `stock:${symbolSafe}`

        // Check if stock exists
        const [stock] = await db.query(`SELECT price FROM ${stockId}`);
        if (!stock || stock.length === 0) return c.json({ error: "Stock not found" }, 404);

        const buyPrice = stock[0].price;

        // Use Graph Relation: user -> owns -> stock
        await db.query(`
            RELATE ${userId}->owns->${stockId} CONTENT {
                quantity: $quantity,
                buy_price: $buyPrice,
                created_at: time::now()
            }
        `, {
            quantity,
            buyPrice
        });

        return c.json({ ok: true, message: `Bought ${quantity} shares of ${symbol}` });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

stocks.get("/portfolio", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = `user:${payload.sub}`

        // Query graph relations and fetch stock data in one go
        const [results] = await db.query(`
            SELECT 
                quantity,
                buy_price,
                created_at,
                ->owns->stock.* as stock_data
            FROM ${userId}->owns
            ORDER BY created_at DESC
        `);

        return c.json({ portfolio: results });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export { stocks as stockRoutes }
