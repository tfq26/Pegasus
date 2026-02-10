import { Hono } from "hono";
import { queryTranslationService } from "../services/QueryTranslationService.js";
import { getAuthToken } from "../../lib/auth.js";
import { verify } from "hono/jwt";
import { ConfigService } from "../services/ConfigService.js";

export const queryRoutes = new Hono();
const jwtSecret = ConfigService.getJwtSecret();

// POST /translate-query
queryRoutes.post('/translate-query', async (c) => {
    // Basic auth check
    const token = getAuthToken(c);
    if (!token) {
        // In dev mode, we might allow it, but let's be safe
        if (process.env.PEGASUS_DEV_MODE !== 'true') {
            return c.json({ error: "Unauthorized" }, 401);
        }
    } else {
        try {
            await verify(token, jwtSecret);
        } catch (e) {
            if (process.env.PEGASUS_DEV_MODE !== 'true') {
                return c.json({ error: "Invalid token" }, 401);
            }
        }
    }

    try {
        const { query, targetDialect, schema } = await c.req.json();

        if (!query) {
            return c.json({ error: "Query is required" }, 400);
        }

        const result = await queryTranslationService.translateQuery(
            query,
            targetDialect || 'sql',
            schema
        );

        return c.json(result);
    } catch (error) {
        console.error('[QueryRoute] Translation failed:', error);
        return c.json({
            error: "Translation failed",
            message: error.message
        }, 500);
    }
});
