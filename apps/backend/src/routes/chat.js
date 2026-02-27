import { Hono } from "hono"
import { stream } from "hono/streaming"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { users, chats, queryHistory, connections } from "../db/schema.js"
import { eq, and, sql, desc, gte } from "drizzle-orm"
import { aiClient } from "../../ai/AIClient.js"
import { interpretDataset } from "../../ai/sanitizer.js"
import { adapters } from "../../adapters/index.js"
import { analyzeForSanitization } from "../../ai/sanitizer.js"
import { RAGService } from "../services/ragService.js"
import { getUserFeatureFlags } from "../../experimental-features.js"
import { filterModelsByTier, calculateUserLimits } from "../../lib/tierLimits.js"
import { ConfigService } from "../services/ConfigService.js"
import { SchemaTranslator } from "../services/SchemaTranslator.js"
import { StorageManager } from "../services/storage/StorageManager.js"
import { ConnectionAnalyzer } from "../services/ConnectionAnalyzer.js"
import { OneContext } from "../services/OneContext.js"
import { DataContextService } from "../services/DataContextService.js"
import { VisualizationAnalyzer } from "../../ai/VisualizationAnalyzer.js"
import { ConversationState } from "../services/ConversationState.js"
import { DataProfiler } from "../services/DataProfiler.js"
import { QueryRepair } from "../services/QueryRepair.js"
import { SemanticIntentClassifier } from "../services/SemanticIntentClassifier.js"
import { authMiddleware, requireUser } from '../middleware/auth.js'
import { logger } from '../services/Logger.js'


// Fix BigInt serialization for JSON.stringify
BigInt.prototype.toJSON = function () { return this.toString() }

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id;
        const [user] = await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                firstName: payload.firstName || "",
                lastName: payload.lastName || "",
                profilePictureUrl: payload.profilePictureUrl || null,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    email: payload.email,
                    firstName: payload.firstName || "",
                    lastName: payload.lastName || "",
                    profilePictureUrl: payload.profilePictureUrl || null,
                    updatedAt: new Date()
                }
            })
            .returning();
        return user.id;
    } catch (e) {
        // If it fails (e.g. invalid ID format or constraint), log it but don't crash
        logger.error("[Chat] Failed to upsert user", e);
        // Fallback: just return the ID from payload so we can proceed with limited functionality
        return payload.sub || payload.id;
    }
}

// Helper to resolve adapter based on table name in query
const resolveAdapterForQuery = (query, defaultAdapter, resourceToAdapter) => {
    if (!resourceToAdapter) return defaultAdapter;

    // Sort keys by length descending to match longest identifiers first
    const tables = Object.keys(resourceToAdapter).sort((a, b) => b.length - a.length);

    for (const table of tables) {
        if (!resourceToAdapter[table]) continue; // Skip null/virtual adapters

        // Regex to match table identifier allowing for quotes/brackets
        // Matches: "Table", 'Table', [Table], or just Table with word boundaries
        // We use 'i' flag for case-insensitive matching as users/AI might vary casing
        const regex = new RegExp(`["'\\[]?\\b${table}\\b["'\\]]?`, 'i');

        if (regex.test(query)) {
            // console.log(`[Chat] Routing query to adapter for resource: ${table}`);
            return resourceToAdapter[table];
        }
    }
    return defaultAdapter;
}

const chat = new Hono()
chat.use('*', authMiddleware)
const jwtSecret = ConfigService.getJwtSecret()

// Helper to check AI quota
const checkAiQuota = async (userId) => {
    try {
        const { tokenLimit, tier } = await calculateUserLimits(db, userId);
        const limit = tokenLimit;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [usageResult] = await db.select({
            total: sql`sum(${queryHistory.tokensUsed})`.mapWith(Number)
        })
            .from(queryHistory)
            .where(and(
                eq(queryHistory.userId, userId),
                gte(queryHistory.createdAt, startOfMonth)
            ));

        const used = usageResult?.total || 0;

        if (used >= limit) {
            logger.warn(`[Quota] User ${userId} (${tier}) exceeded limit: ${used}/${limit}`, { requestId: c.get('requestId') });
            return {
                allowed: false,
                error: `Usage limit exceeded for ${tier} tier (${limit.toLocaleString()} tokens).`,
                code: 'QUOTA_EXCEEDED',
                tier,
                limit,
                used
            };
        }
        return { allowed: true };
    } catch (e) {
        logger.error("[Quota] Check failed", e);
        return { allowed: true };
    }
}

import { robustParseJson, logAiUsage } from "../services/ChatUtils.js"

const colIndexToLabel = (index) => {
    let label = '';
    index++;
    while (index > 0) {
        let remainder = (index - 1) % 26;
        label = String.fromCharCode(65 + remainder) + label;
        index = Math.floor((index - 1) / 26);
    }
    return label;
};


// Log actually executed SQL queries (these appear in the Queries tab)
const logExecutedQuery = async (userId, sqlQuery, connectionId, status = 'success') => {
    if (!sqlQuery || typeof sqlQuery !== 'string') return;
    try {
        const rawConnId = connectionId ? (connectionId.includes(':') ? connectionId.split(':')[1] : connectionId) : null;

        await db.insert(queryHistory).values({
            userId,
            query: sqlQuery.substring(0, 2000), // Allow longer SQL
            source: 'user', // Mark as 'user' so it shows in Queries tab
            model: null,
            status,
            connectionId: rawConnId,
            tokensUsed: 0,
            createdAt: new Date()
        });
        logger.info(`[Query] Logged SQL for ${userId}: ${sqlQuery.substring(0, 80)}...`, { requestId: (typeof c !== 'undefined' && c.get) ? c.get('requestId') : null });
    } catch (e) {
        logger.error("Failed to log executed query", e);
    }
}

const captureQueryPlan = async (adapter, query, provider) => {
    try {
        let planQuery = '';
        const p = provider ? provider.toLowerCase() : '';
        if (p.includes('postgres')) planQuery = `EXPLAIN (FORMAT JSON) ${query}`;
        else if (p.includes('mysql')) planQuery = `EXPLAIN FORMAT=JSON ${query}`;
        else if (p.includes('sqlite')) planQuery = `EXPLAIN QUERY PLAN ${query}`;
        else return `Execution plan not supported for provider: ${provider}`;
        const plan = await adapter.query(planQuery);
        return JSON.stringify(plan, null, 2);
    } catch (e) {
        logger.warn('[Chat] Failed to capture query plan', { message: e.message });
        return `Could not capture execution plan: ${e.message}`;
    }
}

// Routes
chat.get("/chats", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        const spaceId = c.req.query("space_id")
        const conditions = [eq(chats.userId, userId)]

        if (spaceId) {
            conditions.push(eq(chats.spaceId, spaceId))
        }

        const results = await db.query.chats.findMany({
            where: and(...conditions),
            orderBy: [desc(chats.updatedAt)]
        });
        return c.json({ chats: results })
    } catch (e) {
        logger.error("[Chat] Fetch error", e, { requestId: c.get('requestId') });
        return c.json({ error: "Failed to fetch chats" }, 500)
    }
})

chat.post("/chats", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        const { title, space_id } = await c.req.json()

        const [created] = await db.insert(chats)
            .values({
                userId,
                spaceId: space_id || null,
                title: title || "New Chat",
                messages: [],
                createdAt: new Date(),
                updatedAt: new Date()
            })
            .returning();

        return c.json({ id: created.id, title: created.title })
    } catch (e) {
        logger.error("[Chat] Creation error", e, { requestId: c.get('requestId') });
        return c.json({ error: "Failed to create chat" }, 500)
    }
})

chat.get("/chats/:id", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        let chatId = c.req.param("id")
        const rawChatId = chatId.includes(':') ? chatId.split(':')[1] : chatId

        const result = await db.query.chats.findFirst({
            where: and(eq(chats.id, rawChatId), eq(chats.userId, userId))
        });

        if (!result) return c.json({ error: "Chat not found" }, 404)

        let messages = result.messages || [];

        // Hybrid Storage Check
        if (result.storageId) {
            try {
                const provider = await StorageManager.getProvider(userId);
                const url = await provider.getPresignedUrl(result.storageId, 60);
                const response = await fetch(url);
                if (response.ok) {
                    messages = await response.json();
                } else {
                    console.error(`[Chat] Failed to fetch storage messages: ${response.statusText}`);
                }
            } catch (err) {
                console.error(`[Chat] Storage fetch error for ${result.id}:`, err);
            }
        }

        return c.json({ chat: result, messages })
    } catch (e) {
        console.error("[Chat] Fetch failed:", e);
        return c.json({ error: "Failed to fetch chat" }, 500)
    }
})

chat.post("/chats/:id/messages", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        let chatId = c.req.param("id")
        const rawChatId = chatId.includes(':') ? chatId.split(':')[1] : chatId

        let body;
        try {
            body = await c.req.json();
        } catch (e) {
            console.warn('[Chat] Invalid JSON body in message send:', e.message);
            return c.json({ error: "Invalid request body" }, 400);
        }
        const { role, content, meta, modelId } = body;
        const newMessage = { id: crypto.randomUUID(), role, content, meta: meta || null, created_at: Math.floor(Date.now() / 1000) }

        // Fetch current messages
        const existingChat = await db.query.chats.findFirst({
            where: and(eq(chats.id, rawChatId), eq(chats.userId, userId))
        });

        if (!existingChat) return c.json({ error: "Chat not found" }, 404)

        let existingMessages = existingChat.messages || [];

        // Hybrid Storage: Fetch history if offloaded
        if (existingChat.storageId) {
            try {
                const provider = await StorageManager.getProvider(userId);
                const url = await provider.getPresignedUrl(existingChat.storageId, 60);
                const response = await fetch(url);
                if (response.ok) {
                    existingMessages = await response.json();
                }
            } catch (err) {
                console.error(`[Chat] Failed to fetch storage context for append:`, err);
                // Cannot proceed safely if history is missing in a context-dependent chat?
                // We fallback to empty and hope for the best or error out.
                // For now, allow append to empty.
            }
        }

        const updatedMessages = [...existingMessages, newMessage];

        if (existingChat.storageId) {
            // Write back to Storage
            try {
                const provider = await StorageManager.getProvider(userId);
                await provider.upload(existingChat.storageId, JSON.stringify(updatedMessages), 'application/json');

                // Update DB timestamp only
                await db.update(chats)
                    .set({
                        updatedAt: new Date()
                    })
                    .where(eq(chats.id, rawChatId));
            } catch (err) {
                console.error(`[Chat] Failed to upload updated messages:`, err);
                return c.json({ error: "Failed to save message to storage" }, 500)
            }
        } else {
            // Standard DB Update
            await db.update(chats)
                .set({
                    messages: updatedMessages,
                    updatedAt: new Date()
                })
                .where(eq(chats.id, rawChatId));
        }

        // Generate smart title after first user+assistant exchange
        let generatedTitle = null;
        const currentTitle = (existingChat.title || '').trim();
        const isDefaultTitle = currentTitle === 'New Chat' || currentTitle === '';

        console.log(`[Chat] Checking title generation trigger: title="${currentTitle}", messages=${updatedMessages.length}`);

        if (isDefaultTitle && updatedMessages.length >= 2) {
            try {
                // Limit title generation to first few exchanges to avoid repeated generation
                // If length is exactly 2 (User -> AI), or slightly more if first attempt failed
                if (updatedMessages.length <= 6) {
                    const requestId = c.get('requestId');
                    logger.debug(`[Chat] Triggering smart title generation for chat: ${rawChatId}`, { requestId });
                    const newTitle = await aiClient.generateTitle(updatedMessages, modelId, userId);
                    logger.debug(`[Chat] AI generateTitle returned: ${newTitle}`, { requestId });

                    if (newTitle && newTitle.trim() && newTitle.trim() !== 'New Chat') {
                        generatedTitle = newTitle.trim().substring(0, 100); // Limit to 100 chars
                        await db.update(chats).set({ title: generatedTitle }).where(eq(chats.id, rawChatId));
                        console.log('[Chat] Successfully updated title to:', generatedTitle);
                    } else {
                        console.log('[Chat] AI returned invalid or default title, skipping update.');
                    }
                } else {
                    console.log('[Chat] Message count exceeds threshold for auto-naming, skipping.');
                }
            } catch (e) {
                console.error("[Chat] Failed to auto-label chat:", e);
            }
        }

        return c.json({
            id: newMessage.id,
            ...(generatedTitle && { title: generatedTitle })
        });
    } catch (e) {
        console.error("[Chat] Message send error:", e);
        return c.json({ error: "Failed to send message" }, 500)
    }
})

chat.delete("/chats/:id", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        let chatId = c.req.param("id")
        const rawChatId = chatId.includes(':') ? chatId.split(':')[1] : chatId

        await db.delete(chats).where(and(eq(chats.id, rawChatId), eq(chats.userId, userId)));
        return c.json({ success: true })
    } catch (e) {
        console.error("[Chat] Delete failed:", e);
        return c.json({ error: "Failed to delete chat" }, 500)
    }
})

chat.delete("/chats", requireUser, async (c) => {
    try {
        const userId = c.get('userId')
        await db.delete(chats).where(eq(chats.userId, userId));
        return c.json({ success: true })
    } catch (e) {
        console.error("[Chat] Multi-delete failed:", e);
        return c.json({ error: "Failed to delete chats" }, 500)
    }
})

chat.post("/ai/spreadsheet-action", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const quota = await checkAiQuota(payload.sub);
        if (!quota.allowed) return c.json(quota, 403);
        const body = await c.req.json()
        const { request, spreadsheetData, model, isFollowUp, analysisResult } = body
        if (isFollowUp && analysisResult) {
            let resultContext = ''
            const { type } = analysisResult
            if (type === 'analysis_result') {
                const { result, headers } = analysisResult
                if (result.operation === 'maximum' || result.operation === 'minimum') {
                    resultContext = `The ${result.operation} value found is ${result.value}. The corresponding row data is: ${result.row.map((val, i) => `${headers[i]}: ${val}`).join(', ')}.`
                } else {
                    resultContext = `The calculated ${result.operation} is ${result.value}${result.count ? ` (based on ${result.count} values)` : ''}.`
                }
            } else if (type === 'summary_result') {
                resultContext = `Data summary for ${analysisResult.totalRows} rows.`
            }
            const followUpPrompt = `Spreadsheet Assistant. Context: ${resultContext}. Provide helpful response.`
            const response = await aiClient.generateContent([{ role: 'user', content: followUpPrompt }], { model })
            if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'ai_analysis', 'follow_up')
            return c.json({ text: response.text })
        }
        const { spreadsheetToolService } = await import('../services/SpreadsheetToolService.js')
        const tools = spreadsheetToolService.getSpreadsheetTools()
        const systemPrompt = `Excel assistant. Headers: ${spreadsheetData.headers.join(', ')}. Use tools for accurate calculations.`
        const response = await aiClient.generateContent([{ role: 'system', content: systemPrompt }, { role: 'user', content: request }], { tools, model })
        if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'ai_spreadsheet', request)
        if (response.toolCalls?.length > 0) {
            const toolResults = []
            for (const toolCall of response.toolCalls) {
                const res = await spreadsheetToolService.callTool(toolCall.function.name, JSON.parse(toolCall.function.arguments), { spreadsheetData, userId: payload.sub })
                if (res.type === 'generate_table_request') {
                    const genPrompt = `Generate a table for "${res.tableName}". Description: ${res.description}. Rows: ${res.rowCount || 10}. Return JSON: { "headers": [], "rows": [] }`
                    const genRes = await aiClient.generateContent([{ role: 'user', content: genPrompt }], { model, json: true })
                    const genData = JSON.parse(genRes.text.replace(/```json | ```/g, '').trim())
                    toolResults.push({ toolName: toolCall.function.name, result: { type: 'generated_table', tableName: res.tableName, headers: genData.headers, rows: genData.rows } })
                } else {
                    toolResults.push({ toolName: toolCall.function.name, result: res })
                }
            }
            return c.json({ toolCalls: toolResults, usage: response.usage })
        }
        return c.json({ text: response.text, usage: response.usage })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/health-profile", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const quota = await checkAiQuota(payload.sub);
        if (!quota.allowed) return c.json(quota, 403);
        const { connectionId, model } = await c.req.json()
        const rawConnId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId

        const connRow = await db.query.connections.findFirst({
            where: eq(connections.id, rawConnId)
        });

        if (!connRow) return c.json({ error: "Connection not found" }, 404)
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
        const provider = connRow.type
        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

        let adapterConfig = config[provider] || config
        if (provider === 'duckdb' && adapterConfig) {
            const dbPath = adapterConfig.path || ':memory:'
            if (dbPath !== ':memory:') {
                adapterConfig = { ...adapterConfig, readOnly: true }
            }
        }
        const adapter = new Adapter(adapterConfig)
        try {
            await adapter.connect()
            const tables = await adapter.listCollections();
            const stats = `Provider: ${provider}, Total Tables: ${tables.length}`
            const prompt = `Database Health Specialist. Analyze: ${stats}. Return JSON: { "status": "...", "summary": "...", "recommendations": [] }`
            const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model, json: true })
            if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'health_profile', 'Health Check')
            return c.json(JSON.parse(response.text.replace(/```json | ```/g, '').trim()))
        } finally {
            await adapter.disconnect().catch(() => { })
        }
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/explain-table", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { connectionId, tableName, model } = await c.req.json()
        const rawConnId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        let connRow = null;
        if (uuidRegex.test(rawConnId) && !connectionId.startsWith('system:')) {
            connRow = await db.query.connections.findFirst({
                where: eq(connections.id, rawConnId)
            });
        }

        if (!connRow) return c.json({ error: "Connection not found" }, 404)
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
        const provider = connRow.type
        const Adapter = adapters[provider]

        let adapterConfig = config[provider] || config
        if (provider === 'duckdb' && adapterConfig) {
            const dbPath = adapterConfig.path || ':memory:'
            if (dbPath !== ':memory:') {
                adapterConfig = { ...adapterConfig, readOnly: true }
            }
        }
        const adapter = new Adapter(adapterConfig)
        try {
            await adapter.connect()
            const sample = await adapter.query(`SELECT * FROM ${tableName} LIMIT 3`)
            const prompt = `Explain table "${tableName}" based on sample: ${JSON.stringify(sample)}`
            const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model })
            if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'explain_table', 'Explain Table')
            return c.json({ explanation: response.text })
        } finally {
            await adapter.disconnect().catch(() => { })
        }
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/analyze-formula-error", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { context, model } = await c.req.json()
        const prompt = `Excel formula debugger. Formula: ${context.formula}. Error: ${context.result}. Return JSON: { "explanation": "...", "suggestedFix": "..." }`
        const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model, json: true })
        if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'ai_formula_debug', 'Debug Formula')
        return c.json(JSON.parse(response.text.replace(/```json | ```/g, '').trim()))
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/explain-query", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { query, connectionId, model } = await c.req.json()
        const rawConnId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        let connRow = null;
        if (uuidRegex.test(rawConnId) && !connectionId.startsWith('system:')) {
            connRow = await db.query.connections.findFirst({
                where: eq(connections.id, rawConnId)
            });
        }

        if (!connRow) return c.json({ error: "Connection not found" }, 404)
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
        const provider = connRow.type
        const Adapter = adapters[provider]

        let adapterConfig = config[provider] || config
        if (provider === 'duckdb' && adapterConfig) {
            const dbPath = adapterConfig.path || ':memory:'
            if (dbPath !== ':memory:') {
                adapterConfig = { ...adapterConfig, readOnly: true }
            }
        }
        const adapter = new Adapter(adapterConfig)
        try {
            await adapter.connect()
            const plan = await captureQueryPlan(adapter, query, provider)
            const prompt = `Explain query: ${query}. Plan: ${plan}`
            const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model })
            if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'query_explain', 'Explain Query')
            return c.json({ explanation: response.text, plan })
        } finally {
            await adapter.disconnect().catch(() => { })
        }
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/optimize-query", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { query, connectionId, model } = await c.req.json()
        const rawConnId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        let connRow = null;
        if (uuidRegex.test(rawConnId) && !connectionId.startsWith('system:')) {
            connRow = await db.query.connections.findFirst({
                where: eq(connections.id, rawConnId)
            });
        }

        if (!connRow) return c.json({ error: "Connection not found" }, 404)
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
        const provider = connRow.type
        const Adapter = adapters[provider]

        let adapterConfig = config[provider] || config
        if (provider === 'duckdb' && adapterConfig) {
            const dbPath = adapterConfig.path || ':memory:'
            if (dbPath !== ':memory:') {
                adapterConfig = { ...adapterConfig, readOnly: true }
            }
        }
        const adapter = new Adapter(adapterConfig)
        try {
            await adapter.connect()
            const plan = await captureQueryPlan(adapter, query, provider)
            const prompt = `Optimize query: ${query}. Plan: ${plan}. Return JSON: { "optimizedQuery": "...", "explanation": "..." }`
            const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model, json: true })
            if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'query_optimize', 'Optimize Query')
            return c.json(JSON.parse(response.text.replace(/```json | ```/g, '').trim()))
        } finally {
            await adapter.disconnect().catch(() => { })
        }
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/data-wrangler", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { prompt, model } = await c.req.json()
        const res = await aiClient.generateContent([{ role: 'system', content: 'Output only valid JS code.' }, { role: 'user', content: prompt }], { model })
        if (res.usage) await logAiUsage(payload.sub, res.usage.totalTokens, model, 'ai_wrangler', 'Transformation')
        return c.json({ code: res.text })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/generate", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    // Pre-stream: Auth & Validation
    let payload, body, userId;

    // 1. Verify Authentication
    try {
        payload = await verify(token, jwtSecret)
    } catch (e) {
        console.error("[Auth] Token verification failed:", e.message);
        return c.json({ error: "Unauthorized" }, 401)
    }

    // 2. Process Request Data
    try {
        // Resolve User ID
        let rawUserId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            rawUserId = parts.length > 1 ? parts[1] : resolvedId
        }
        userId = rawUserId;

        // Quota Check
        const quota = await checkAiQuota(userId);
        if (!quota.allowed) return c.json(quota, 403);

        body = await c.req.json()
    } catch (e) {
        console.error("[Request] Failed to process request body or user data:", e);
        return c.json({ error: "Invalid Request: " + e.message }, 400)
    }

    return stream(c, async (stream) => {
        // Helper to send progress chunks
        const sendProgress = async (progress, message, details = null) => {
            await stream.write(JSON.stringify({ type: 'progress', progress, message, details }) + '\n');
        }

        const sendResult = async (data) => {
            await stream.write(JSON.stringify(data) + '\n');
        }

        const sendError = async (message) => {
            await stream.write(JSON.stringify({ error: message }) + '\n');
        }

        try {
            const { prompt, connectionId: rawConnId, context, activeTable, temperature, maxTokens, adHocSchema, chatId } = body

            let basePrompt = prompt;
            let forceVisualization = false;
            let forceQuery = false;
            let forceText = false;
            let forceAnalysis = false;
            let isExplicitAction = false;
            let adapter = null;
            let extraAdapters = [];
            let contextData = null;

            // NEW: Build conversation context for follow-up handling
            let conversationContext = null;
            try {
                if (chatId) {
                    conversationContext = await ConversationState.buildContext(chatId, prompt);
                    if (conversationContext?.isFollowUp) {
                        console.log(`[AI Generate] Detected follow-up question. Previous table: ${conversationContext.entities?.lastTable}`);
                    }
                }
            } catch (convErr) {
                console.warn('[AI Generate] Conversation state build failed:', convErr.message);
            }

            // NEW: Semantic intent classification
            let semanticIntent = null;
            try {
                semanticIntent = SemanticIntentClassifier.classifyQuick(prompt);
                console.log(`[AI Generate] Intent classified: ${semanticIntent.type} (confidence: ${semanticIntent.confidence})`);
            } catch (intentErr) {
                console.warn('[AI Generate] Intent classification failed:', intentErr.message);
            }

            // Handle Slash Commands
            // Handle Slash Commands
            if (/\/(visualization|chart|plot)/i.test(prompt)) {
                const isLiveRequest = prompt.match(/\b(live|monitor|real-time|doing|updates)\b/i);

                // If it's a live request, we DON'T want to force the static visualization tool exclusively.
                // We want the AI to be able to use BOTH generate_visualization (with live=true) AND monitor_data_source.
                forceVisualization = !isLiveRequest;

                isExplicitAction = true;
                const corePrompt = prompt.trim().replace(/^.*?\/(visualization|chart|plot)\s*/i, '');

                if (isLiveRequest) {
                    basePrompt = `[USER REQUESTS LIVE VISUALIZATION]: ${corePrompt}. You MUST use 'generate_visualization' with live=true. You should also consider using 'monitor_data_source' if the user wants continuous updates.`;
                    console.log(`[AI Generate] Live visualization request detected. Enabling auto-tool selection.`);
                } else {
                    // Disable forceVisualization - let AI choose tools freely (e.g. query_data first)
                    forceVisualization = false;
                    basePrompt = `[USER REQUESTS VISUALIZATION]: ${corePrompt}. Your goal is to generate a beautiful, Robinhood-style line chart. Use 'generate_visualization'. If you need data, call 'query_data' first.`;
                    console.log(`[AI Generate] Slash command detected. Hinting visualization for: ${corePrompt}`);
                }
            } else if (/\/(query|sql)/i.test(prompt)) {
                forceQuery = true;
                isExplicitAction = true;
                const corePrompt = prompt.trim().replace(/^.*?\/(query|sql)\s*/i, '');
                basePrompt = `[USER REQUESTS SQL QUERY ONLY - DO NOT EXECUTE]: ${corePrompt}`;
                console.log(`[AI Generate] Slash command detected. Forcing query representation for: ${corePrompt}`);
            } else if (/\/(text)/i.test(prompt)) {
                forceText = true;
                isExplicitAction = true;
                const corePrompt = prompt.trim().replace(/^.*?\/(text)\s*/i, '');
                basePrompt = `[USER REQUESTS TEXT RESPONSE ONLY - NO VISUALS]: ${corePrompt}`;
                console.log(`[AI Generate] Slash command detected. Forcing text response for: ${corePrompt}`);
            }

            // If no explicit command, default to text response behavior
            if (!isExplicitAction) {
                forceText = true;
                console.log(`[AI Generate] No slash command. Defaulting to forceText=true.`);
            }

            // Handle connexion ID
            let connectionId = rawConnId ? (rawConnId.includes(':') ? rawConnId.split(':')[1] : rawConnId) : null;

            await sendProgress(10, 'Resolving context...');

            // TIMEOUT SAFETY: Wrap both context resolution and generation in a timeout
            // This prevents "malformed stream" errors on the frontend when the backend silently dies (e.g. Vercel 10s limit)
            const TIMEOUT_MS = 25000; // 25s safety limit (assuming 30s-60s platform timeout, adjust if on free tier 10s)

            // Context Resolution
            const contextPromise = OneContext.resolveContext(basePrompt, userId, connectionId);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Backend Timeout')), 9500)); // 9.5s timeout for Vercel Free

            let resolvedResources = [];
            try {
                resolvedResources = await Promise.race([contextPromise, timeoutPromise]);
            } catch (e) {
                if (e.message === 'Backend Timeout') {
                    throw new Error('Analysis timed out (10s limit). Please simplify your request or upgrade to Pro.');
                }
                throw e;
            }

            // Note: We no longer build a contextBlock for the user prompt text.
            let contextBlock = "";

            // 1.5. Check for Instruction Mentions
            resolvedResources.forEach(r => {
                if (r.type === 'instruction') {
                    if (r.instruction === 'FORCE_INTENT_VISUALIZATION') {
                        forceVisualization = true;
                        forceText = false;
                        isExplicitAction = true;
                    } else if (r.instruction === 'FORCE_INTENT_QUERY') {
                        forceQuery = true;
                        forceText = false;
                        isExplicitAction = true;
                    } else if (r.instruction === 'FORCE_INTENT_ANALYSIS') {
                        forceAnalysis = true;
                        forceText = false;
                        isExplicitAction = true;
                    } else if (r.instruction === 'FORCE_INTENT_SUMMARY') {
                        forceText = true;
                        isExplicitAction = true;
                    }
                }
            });

            let unloadedResources = [];
            try {
                let currentSpaceId = null;
                if (connectionId) {
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    const activeConn = (uuidRegex.test(connectionId) && !connectionId.startsWith('system:'))
                        ? await db.query.connections.findFirst({
                            where: eq(connections.id, connectionId),
                            columns: { spaceId: true }
                        })
                        : null;
                    if (activeConn) currentSpaceId = activeConn.spaceId;
                }

                const connectionFilters = [eq(connections.userId, userId)];
                if (currentSpaceId) {
                    connectionFilters.push(eq(connections.spaceId, currentSpaceId));
                }

                const allConnections = await db.query.connections.findMany({
                    where: and(...connectionFilters),
                    columns: { id: true, name: true, type: true, config: true }
                });

                const makeSlug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const knownSlugs = new Set();
                resolvedResources.forEach(r => {
                    if (r.name) knownSlugs.add(makeSlug(r.name));
                    if (r.title) knownSlugs.add(makeSlug(r.title));
                    if (r.id) knownSlugs.add(makeSlug(r.id));
                });

                const otherConnections = allConnections.filter(c => {
                    if (c.id === connectionId) return false;
                    const nameSlug = makeSlug(c.name);
                    const isResolved = resolvedResources.some(r => r.id === c.id || makeSlug(r.name) === nameSlug);
                    return !isResolved;
                });

                unloadedResources = otherConnections.map(c => {
                    const cfg = typeof c.config === 'string' ? JSON.parse(c.config) : c.config;
                    return { name: cfg?.alias || cfg?.nickname || c.name, type: c.type };
                });
            } catch (e) {
                console.warn("[Chat] Failed to list other connections:", e);
            }

            if (resolvedResources.length > 0) {
                await sendProgress(15, `Found ${resolvedResources.length} relevant resources...`);
                const summaryBlock = OneContext.buildContextBlock(resolvedResources);
                if (summaryBlock) {
                    contextBlock = contextBlock ? contextBlock + summaryBlock : summaryBlock;
                    if (basePrompt.includes('@[')) {
                        contextBlock += `\n[MANDATORY]: The user mentioned a directory (@[...]). YOU MUST look at the listed [FILES] or [NOTES] above. Do NOT ask "What funds are you in?" because that data is already provided in the context above. Hunt for it!`;
                    }
                }
            }

            const dbResource = resolvedResources.find(r => r.type === 'database');
            if (!connectionId && dbResource) {
                connectionId = dbResource.id;
            }

            console.log(`[AI Generate] User: ${userId}, ConnectionId: ${connectionId || 'none'}, ActiveTable: ${activeTable || 'none'}`)

            let userSettings = null
            let activeModel = null

            const userRow = await db.query.users.findFirst({
                where: eq(users.id, userId),
                columns: { config: true }
            });

            userSettings = userRow?.config || null
            activeModel = 'gemini-3-flash-preview' // Hardcoded to Gemini 3 Flash for efficiency as requested

            // --- Data Context Service ---
            await sendProgress(20, 'Building schema context...');
            try {
                const allResolved = [...resolvedResources];
                if (context && Array.isArray(context)) {
                    context.forEach(c => {
                        if (!allResolved.find(r => r.id === c.id)) {
                            allResolved.push(c);
                        }
                    });
                }

                contextData = await DataContextService.buildContext(userId, connectionId, {
                    activeTable,
                    adHocSchema,
                    resolvedResources: allResolved,
                    unloadedResources,
                    userMessage: basePrompt
                });

                adapter = contextData.adapter;
                extraAdapters = contextData.extraAdapters || [];
            } catch (e) {
                console.error(`[AI Generate] DataContext build failed:`, e);
                return sendError(e.message || "Connection not found.");
            }

            const { provider, normalizedSchema } = contextData;

            // NEW: Data Profiling
            let dataProfile = null;
            try {
                if (adapter && activeTable && normalizedSchema.detailedSchema?.[activeTable]) {
                    await sendProgress(25, 'Profiling data structure...');
                    const columns = normalizedSchema.detailedSchema[activeTable];
                    dataProfile = await DataProfiler.profile(adapter, activeTable, columns, provider);
                }
            } catch (profileErr) {
                console.warn('[AI Generate] Data profiling failed:', profileErr.message);
            }

            let resolvedIntent = forceVisualization ? { type: 'visualization', force: true } :
                forceQuery ? { type: 'query', force: true } :
                    forceAnalysis ? { type: 'analysis', force: true } :
                        semanticIntent || { type: 'chat' };

            const { AIOrchestrator } = await import('../services/AIOrchestrator.js');
            const { spreadsheetToolService } = await import('../services/SpreadsheetToolService.js');

            const orchestrator = new AIOrchestrator({
                spreadsheetToolService,
                visualizationAnalyzer: VisualizationAnalyzer,
                onProgress: sendProgress
            });

            try {
                const aiSettings = {
                    modelId: activeModel,
                    temperature: Number(temperature || 0.7),
                    maxTokens: Number(maxTokens || 2500),
                    activeTable,
                    intent: resolvedIntent,
                    conversationContext,
                    dataProfile,
                    previousContext: context,
                    tools: spreadsheetToolService.getReadOnlyTools(),
                    toolChoice: forceVisualization ? 'generate_visualization' : undefined,
                    forceText,
                    forceVisualization
                };

                const finalResult = await orchestrator.generate(basePrompt, aiSettings, {
                    ...contextData,
                    contextBlock,
                    requestId: c.get('requestId')
                });

                return sendResult(finalResult);

            } catch (e) {
                logger.error("[AI Generate] Orchestration failed", e, { requestId: c.get('requestId') });
                return sendError(e.message || "Analysis failed.");
            }
        } finally {
            if (adapter) await adapter.disconnect().catch(() => { })
            for (const extra of extraAdapters) {
                await extra.disconnect().catch(() => { })
            }
        }
    })
})

chat.post("/ai/recommend-visualization", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { query, results, previousConfig, suggestedChartType } = await c.req.json()
        const payload = await verify(token, jwtSecret)
        const recommendation = await aiClient.recommendVisualization(query, results, previousConfig, null, suggestedChartType)
        return c.json(recommendation)
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/analyze", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { question, results, query } = await c.req.json()
        const payload = await verify(token, jwtSecret)
        const analysisResult = await aiClient.analyzeResults(question, results, query)

        let analysis = analysisResult.text
        let needs_disclaimer = false

        try {
            const parsed = JSON.parse(analysisResult.text)
            analysis = parsed.answer || analysis
            needs_disclaimer = parsed.needs_disclaimer || false
        } catch (e) {
            logger.warn("[Chat] Failed to parse analysis JSON", { message: e.message, requestId: c.get('requestId') });
        }

        if (analysisResult.usage) await logAiUsage(payload.sub, analysisResult.usage.totalTokens, null, 'ai_analyze', question)
        return c.json({ analysis, needs_disclaimer })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/spreadsheet-command", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { command, data } = await c.req.json()
        const payload = await verify(token, jwtSecret)
        const prompt = `Spreadsheet Command: "${command}". Headers: ${JSON.stringify(Object.keys(data[0] || {}))}. Return JSON: { "modifications": [] }`
        const response = await aiClient.chat(prompt)
        const match = response.match(/\{[\s\S]*\}/)
        return c.json({ modifications: match ? JSON.parse(match[0]).modifications : [] })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/sanitize/analyze", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { tableName, schema } = await c.req.json()
        const result = await analyzeForSanitization(tableName, schema)
        return c.json(result)
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.get("/ai/models", async (c) => {
    // Current user context
    const userId = c.get('userId');
    const payload = c.get('userPayload');

    if (!userId || !payload) return c.json({ error: "Unauthorized" }, 401)

    try {
        const userRow = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { subscriptionTier: true }
        });
        const tier = userRow?.subscriptionTier || 'free'

        // Pass userId to listModels to include BYOM models
        const allModels = await aiClient.listModels(userId)

        return c.json({ models: filterModelsByTier(allModels, tier), tier })
    } catch (e) {
        console.error("[AI Models] Error:", e);
        return c.json({ error: "Failed to list models" }, 500)
    }
})

chat.post("/ai/dashboard-query", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { query, dashboardTitle, elements } = await c.req.json()
        const response = await aiClient.generateText(`Dashboard "${dashboardTitle}". Elements: ${JSON.stringify(elements.slice(0, 5))}. Question: ${query}`)
        return c.json({ response: response.text || response })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/analyze-dashboard", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { dashboardTitle, elements } = await c.req.json()
        const response = await aiClient.generateText(`Analyze Dashboard "${dashboardTitle}". Elements: ${JSON.stringify(elements.slice(0, 5))}`)
        return c.json({ analysis: response.text || response })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/search", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { query } = await c.req.json()
        const response = await aiClient.generateText(query)
        return c.json({ result: response.text || response })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

export { chat as chatRoutes }

