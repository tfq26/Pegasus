import { Hono } from "hono";
import { queryTranslationService } from "../services/QueryTranslationService.js";
import { getAuthToken } from "../../lib/auth.js";
import { verify } from "hono/jwt";
import { ConfigService } from "../services/ConfigService.js";
import { queryOptimizerService } from "../services/QueryOptimizerService.js";
import { dataProfilingService } from "../services/DataProfilingService.js";
import { createAdapter } from "../../adapters/index.js";

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

/**
 * POST /analyze
 * Analyzes a query using database EXPLAIN and AI suggestions.
 */
queryRoutes.post('/analyze', async (c) => {
    const token = getAuthToken(c);
    let userId = 'dev_user';

    if (token) {
        try {
            const payload = await verify(token, jwtSecret);
            userId = payload.sub || payload.id;
        } catch (e) {
            if (process.env.PEGASUS_DEV_MODE !== 'true') {
                return c.json({ error: "Invalid token" }, 401);
            }
        }
    } else if (process.env.PEGASUS_DEV_MODE !== 'true') {
        return c.json({ error: "Unauthorized" }, 401);
    }

    try {
        const { query, connection, provider } = await c.req.json();

        if (!query || !connection) {
            return c.json({ error: "Query and connection are required" }, 400);
        }

        const adapter = await createAdapter(provider || connection.provider, connection, userId);
        if (!adapter) {
            return c.json({ error: "Unsupported provider" }, 400);
        }

        await adapter.connect();

        // 1. Get execution plan from database
        const explainPlan = await adapter.explain(query);

        // 2. Get AI recommendations based on plan
        const analysis = await queryOptimizerService.analyzeQuery(
            query,
            explainPlan,
            provider || connection.provider
        );

        await adapter.disconnect();

        return c.json({
            ok: true,
            query,
            explainPlan,
            ...analysis
        });
    } catch (error) {
        console.error('[QueryRoute] Analysis failed:', error);
        return c.json({
            error: "Optimization analysis failed",
            message: error.message
        }, 500);
    }
});

/**
 * POST /profile
 * Generates a data profile and health report for a table.
 */
queryRoutes.post('/profile', async (c) => {
    const token = getAuthToken(c);
    let userId = 'dev_user';

    if (token) {
        try {
            const payload = await verify(token, jwtSecret);
            userId = payload.sub || payload.id;
        } catch (e) {
            if (process.env.PEGASUS_DEV_MODE !== 'true') {
                return c.json({ error: "Invalid token" }, 401);
            }
        }
    } else if (process.env.PEGASUS_DEV_MODE !== 'true') {
        return c.json({ error: "Unauthorized" }, 401);
    }

    try {
        const { tableName, connection, provider } = await c.req.json();

        if (!tableName || !connection) {
            return c.json({ error: "Table name and connection are required" }, 400);
        }

        const adapter = await createAdapter(provider || connection.provider, connection, userId);
        if (!adapter) {
            return c.json({ error: "Unsupported provider" }, 400);
        }

        await adapter.connect();

        // 1. Get raw statistics from the database
        const rawProfile = await adapter.getProfile(tableName);

        // 2. Analyze statistics with AI
        const profile = await dataProfilingService.analyzeProfile(rawProfile);

        await adapter.disconnect();

        return c.json({
            ok: true,
            ...profile
        });
    } catch (error) {
        console.error('[QueryRoute] Profiling failed:', error);
        return c.json({
            error: "Data profiling failed",
            message: error.message
        }, 500);
    }
});
