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
        console.error("[Chat] Failed to upsert user:", e);
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
            console.log(`[Quota] User ${userId} (${tier}) exceeded limit: ${used}/${limit}`);
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
        console.error("[Quota] Check failed:", e);
        return { allowed: true };
    }
}

/**
 * Robustly parse JSON from AI responses that might contain markdown or extra text.
 * @param {string} text - The raw text from the AI
 * @param {string} fallbackKey - The key to map raw text to if parsing fails (default: 'answer')
 */
const robustParseJson = (text, fallbackKey = 'answer') => {
    if (!text) return { [fallbackKey]: "" };

    const trimmed = text.trim();

    // 1. Try direct parsing (common case)
    try {
        // Remove markdown tags if present
        const cleaned = trimmed.replace(/^```(json)?\s*|\s*```$/gi, '');
        return JSON.parse(cleaned);
    } catch (e) {
        // 2. Try extracting JSON block {...} if embedded in text
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (innerE) {
                // If nested parsing fails, continue to fallback
            }
        }
    }

    // 3. Fallback: Return as an object with the raw text in the intended key
    return { [fallbackKey]: trimmed };
}

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

const logAiUsage = async (userId, tokens, model, type, content, connectionId) => {
    if (!tokens || tokens <= 0) return;
    try {
        const rawConnId = connectionId ? (connectionId.includes(':') ? connectionId.split(':')[1] : connectionId) : null;

        await db.insert(queryHistory).values({
            userId,
            query: content ? content.substring(0, 500) : 'AI Operation',
            source: type,
            model: model,
            status: 'success',
            connectionId: rawConnId,
            tokensUsed: tokens,
            createdAt: new Date()
        });
        console.log(`[Usage] Logged ${tokens} tokens for ${userId} (${type})`);
    } catch (e) {
        console.error("Failed to log AI usage:", e);
    }
}

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
        console.log(`[Query] Logged SQL for ${userId}: ${sqlQuery.substring(0, 80)}...`);
    } catch (e) {
        console.error("Failed to log executed query:", e);
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
        console.warn('[Chat] Failed to capture query plan:', e.message);
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
        console.error("[Chat] Fetch error:", e);
        return c.json({ error: "Unauthorized" }, 401)
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
        console.error("[Chat] Creation error:", e);
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
        if (existingChat.title === 'New Chat' && updatedMessages.length >= 2) {
            try {
                // Limit title generation to first few exchanges to avoid repeated generation
                // Or verify if current message is Assistant message?
                // `newMessage.role` === 'assistant' (or 'ai' mapped to assistant)?
                // Generally we want title after the FIRST complete turn.
                // If length is exactly 2 (User -> AI), generate.
                // If length > 2, maybe skip?
                // User requirement: "every chat is still showing up as new chat" -> means it never generates.
                // If we check >= 2, it should run.

                console.log('[Chat] Generating smart title for chat:', rawChatId);
                const newTitle = await aiClient.generateTitle(updatedMessages, modelId, userId);
                if (newTitle && newTitle.trim() && newTitle !== 'New Chat') {
                    generatedTitle = newTitle.trim().substring(0, 100); // Limit to 100 chars
                    await db.update(chats).set({ title: generatedTitle }).where(eq(chats.id, rawChatId));
                    console.log('[Chat] Generated title:', generatedTitle);
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
            if (prompt.trim().startsWith('/visualization') || prompt.trim().startsWith('/chart') || prompt.trim().startsWith('/plot')) {
                const isLiveRequest = prompt.match(/\b(live|monitor|real-time|doing|updates)\b/i);

                // If it's a live request, we DON'T want to force the static visualization tool exclusively.
                // We want the AI to be able to use BOTH generate_visualization (with live=true) AND monitor_data_source.
                forceVisualization = !isLiveRequest;

                isExplicitAction = true;
                const corePrompt = prompt.trim().replace(/^\/(visualization|chart|plot)\s*/i, '');

                if (isLiveRequest) {
                    basePrompt = `[USER REQUESTS LIVE VISUALIZATION]: ${corePrompt}. You MUST use 'generate_visualization' with live=true. You should also consider using 'monitor_data_source' if the user wants continuous updates.`;
                    console.log(`[AI Generate] Live visualization request detected. Enabling auto-tool selection.`);
                } else {
                    // Disable forceVisualization - let AI choose tools freely (e.g. query_data first)
                    forceVisualization = false;
                    basePrompt = `[USER REQUESTS VISUALIZATION]: ${corePrompt}. Your goal is to generate a beautiful, Robinhood-style line chart. Use 'generate_visualization'. If you need data, call 'query_data' first.`;
                    console.log(`[AI Generate] Slash command detected. Hinting visualization for: ${corePrompt}`);
                }
            } else if (prompt.trim().startsWith('/query')) {
                forceQuery = true;
                isExplicitAction = true;
                const corePrompt = prompt.trim().replace(/^\/query\s*/i, '');
                basePrompt = `[USER REQUESTS SQL QUERY ONLY - DO NOT EXECUTE]: ${corePrompt}`;
                console.log(`[AI Generate] Slash command detected. Forcing query representation for: ${corePrompt}`);
            } else if (prompt.trim().startsWith('/text')) {
                forceText = true;
                isExplicitAction = true;
                const corePrompt = prompt.trim().replace(/^\/text\s*/i, '');
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

            const processAI = async () => {
                // ... Context Resolution ... (kept inline for simplicity, or refactor)
                // --- OneContext Integration ---
                console.log(`[OneContext] Resolving context for prompt: "${basePrompt.substring(0, 50)}..."`);
                const resolvedResources = await OneContext.resolveContext(basePrompt, userId, connectionId);

                // Start AI Stream via Client
                // AIClient.generateContent is NOT a stream itself, it returns a full response object. 
                // Wait, the current implementation calls aiClient.generateContent at the end? 
                // Let's look at the original code.

                // Original code calls aiClient.generateContent further down (lines 828 in original).
                // I need to wrap the *entire* logic block.
            };

            // To properly fix this without massive indentation changes, I'll insert a timeout check inside the stream logic.

            // 1. Send Progress
            await sendProgress(10, 'Resolving context...');

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
            // DataContextService now injects these into the Knowledge Base (System Prompt).
            let contextBlock = "";

            // 1.5. Check for Instruction Mentions (e.g. *visualization)
            resolvedResources.forEach(r => {
                if (r.type === 'instruction') {
                    if (r.instruction === 'FORCE_INTENT_VISUALIZATION') {
                        forceVisualization = true;
                        forceText = false;
                        isExplicitAction = true;
                        console.log(`[AI Generate] Forcing visualization via instruction tag.`);
                    } else if (r.instruction === 'FORCE_INTENT_QUERY') {
                        forceQuery = true;
                        forceText = false;
                        isExplicitAction = true;
                        console.log(`[AI Generate] Forcing query via instruction tag.`);
                    } else if (r.instruction === 'FORCE_INTENT_ANALYSIS') {
                        forceAnalysis = true;
                        forceText = false;
                        isExplicitAction = true;
                        console.log(`[AI Generate] Forcing analysis via instruction tag.`);
                    } else if (r.instruction === 'FORCE_INTENT_SUMMARY') {
                        forceText = true;
                        isExplicitAction = true;
                        console.log(`[AI Generate] Forcing summary via instruction tag.`);
                    }
                }
            });

            // Fetch all user connections to provide "Available Databases" context
            // BUT we need to filter out anything that's already loaded via OneContext
            // KEY: If OneContext found relevant files, we DON'T show "not loaded" list to avoid confusion
            const hasRelevantFiles = resolvedResources.some(r => r.type === 'file');

            let unloadedResources = [];
            try {
                // 1. Resolve Space ID from current connection to scope "Unloaded" list
                let currentSpaceId = null;
                if (connectionId) {
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    const activeConn = (uuidRegex.test(connectionId) && !connectionId.startsWith('system:'))
                        ? await db.query.connections.findFirst({
                            where: eq(connections.id, connectionId),
                            columns: { spaceId: true }
                        })
                        : null;
                    if (activeConn) currentSpaceId = activeConn.spaceId;
                }

                // 2. Fetch connections scoped to this space (or user if no space)
                const connectionFilters = [eq(connections.userId, userId)];
                if (currentSpaceId) {
                    connectionFilters.push(eq(connections.spaceId, currentSpaceId));
                }

                const allConnections = await db.query.connections.findMany({
                    where: and(...connectionFilters),
                    columns: { id: true, name: true, type: true, config: true }
                });

                // Build a set of "known slugs" from resolved resources
                const makeSlug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const knownSlugs = new Set();
                resolvedResources.forEach(r => {
                    if (r.name) knownSlugs.add(makeSlug(r.name));
                    if (r.title) knownSlugs.add(makeSlug(r.title));
                    if (r.id) knownSlugs.add(makeSlug(r.id));
                });

                // Filter out current active or already resolved connections
                const otherConnections = allConnections.filter(c => {
                    if (c.id === connectionId) return false;
                    const nameSlug = makeSlug(c.name);

                    // A connection is "known" if it's already in the resolved list or its ID matches
                    const isResolved = resolvedResources.some(r => r.id === c.id || makeSlug(r.name) === nameSlug);

                    console.log(`[Chat] Connection Integrity Check: ${c.name} (ID: ${c.id}) | isResolved: ${isResolved}`);
                    return !isResolved;
                });

                unloadedResources = otherConnections.map(c => {
                    const cfg = typeof c.config === 'string' ? JSON.parse(c.config) : c.config;
                    return { name: cfg?.alias || cfg?.nickname || c.name, type: c.type };
                });
                console.log(`[Chat] FINAL UNLOADED LIST:`, unloadedResources.map(u => u.name));
            } catch (e) { console.warn("[Chat] Failed to list other connections:", e); }

            if (resolvedResources.length > 0) {
                console.log(`[OneContext] Injected ${resolvedResources.length} resources.`);
                await sendProgress(15, `Found ${resolvedResources.length} relevant resources...`);

                // RE-ENABLE: Add context summary to the user's prompt to force more grounding
                const summaryBlock = OneContext.buildContextBlock(resolvedResources);
                if (summaryBlock) {
                    contextBlock = contextBlock ? contextBlock + summaryBlock : summaryBlock;

                    // Specific tip for directory mentions to prevent "I need more info"
                    if (basePrompt.includes('@[')) {
                        contextBlock += `\n[MANDATORY]: The user mentioned a directory (@[...]). YOU MUST look at the listed [FILES] or [NOTES] above. Do NOT ask "What funds are you in?" because that data is already provided in the context above. Hunt for it!`;
                    }
                }
            }

            // Auto-select DB if mentioned and no explicit connection selected
            const dbResource = resolvedResources.find(r => r.type === 'database');
            if (!connectionId && dbResource) {
                console.log(`[OneContext] Auto-selecting DB: ${dbResource.name} (${dbResource.id})`);
                connectionId = dbResource.id;
            }

            console.log(`[AI Generate] User: ${userId}, ConnectionId: ${connectionId || 'none'}, ActiveTable: ${activeTable || 'none'}`)

            let userSettings = null
            let activeModel = null

            // Fetch user first to get settings
            const userRow = await db.query.users.findFirst({
                where: eq(users.id, userId),
                columns: { config: true }
            });

            userSettings = userRow?.config || null
            activeModel = userSettings?.activeModel || null

            // --- Data Context Service ---
            await sendProgress(20, 'Building schema context...');
            let contextData;
            try {
                // Combine OneContext resolved resources with any context explicitly sent by the client
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
                    unloadedResources
                });
            } catch (e) {
                console.error(`[AI Generate] DataContext build failed:`, e);
                return sendError(e.message || "Connection not found.");
            }

            const { provider, adapter, normalizedSchema, resourceToAdapter, resourceToProvider, extraAdapters } = contextData;

            console.log(`[AI Generate] Context built. Provider: ${provider}, Tables: ${normalizedSchema.tables.length}`);

            // NEW: Data Profiling for smarter chart/query decisions
            let dataProfile = null;
            try {
                if (adapter && activeTable && normalizedSchema.detailedSchema?.[activeTable]) {
                    await sendProgress(25, 'Profiling data structure...');
                    const columns = normalizedSchema.detailedSchema[activeTable];
                    dataProfile = await DataProfiler.profile(adapter, activeTable, columns, provider);
                    console.log(`[AI Generate] Data profiled for ${activeTable}:`, Object.keys(dataProfile).length, 'columns');
                }
            } catch (profileErr) {
                console.warn('[AI Generate] Data profiling failed:', profileErr.message);
            }

            // Enhance intent with semantic classification if available
            let resolvedIntent = forceVisualization ? { type: 'visualization', force: true } :
                forceQuery ? { type: 'query', force: true } :
                    forceAnalysis ? { type: 'analysis', force: true } :
                        semanticIntent || { type: 'chat' };

            const aiSettings = {
                modelId: activeModel,
                temperature: Number(temperature || 0.7),
                maxTokens: Number(maxTokens || 2500),
                activeTable,
                intent: resolvedIntent,
                conversationContext, // Pass for prompt building
                dataProfile, // Pass for visualization decisions
                // If slash command explicitly requested visualization, FORCE it here
                toolChoice: forceVisualization ? 'generate_visualization' : undefined
            }
            console.log('[AI Generate] Settings:', { modelId: activeModel, tablesCount: normalizedSchema?.tables?.length, intent: resolvedIntent.type, isFollowUp: conversationContext?.isFollowUp });
            // Lazy import to avoid circular dep issues at top level if any
            const { spreadsheetToolService } = await import('../services/SpreadsheetToolService.js')
            aiSettings.tools = spreadsheetToolService.getReadOnlyTools()

            const now = new Date();
            const timeContext = `\nCURRENT TEMPORAL CONTEXT:\n- Local Time: ${now.toString()}\n- UTC Time: ${now.toISOString()}\n`;

            let currentPrompt = `${basePrompt}\n${timeContext}`;
            let lastResult = null;
            let lastToolResult = null;
            let iterations = 0;
            const maxIterations = 4; // Increased for complex many-turn tasks

            try {
                while (iterations < maxIterations) {
                    iterations++;
                    const progressBase = 30 + (iterations * 15);
                    await sendProgress(Math.min(progressBase, 90), `Thinking (Step ${iterations})...`);
                    console.log(`[AI Generate] Iteration ${iterations}...`);
                    console.log(`[AI Generate] Prompt preview (first 500 chars):`, currentPrompt.substring(0, 500));
                    console.log(`[AI Generate] Total prompt length:`, currentPrompt.length);
                    console.log(`[AI Generate] Model:`, aiSettings.modelId || 'default');
                    console.log(`[AI Generate] Tools available:`, aiSettings.tools?.length || 0);

                    let result;
                    try {
                        // Build options with enhanced schema and extra context
                        const generationOptions = {
                            dialect: provider,
                            schema: {
                                ...normalizedSchema,
                                dataProfile: aiSettings.dataProfile,
                                conversationContext: aiSettings.conversationContext
                            },
                            previousContext: context, // Keep as array for .filter()
                            conversationContext: aiSettings.conversationContext,
                            dataProfile: aiSettings.dataProfile
                        };

                        result = await Promise.race([
                            aiClient.generateQuery(currentPrompt, generationOptions, aiSettings),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('AI Generation Timeout')), 25000))
                        ]);
                        console.log(`[AI Generate] Result received:`, { hasText: !!result.text, hasToolCalls: !!result.toolCalls?.length });
                    } catch (aiError) {
                        console.error(`[AI Generate] AI call failed:`, aiError.message);
                        console.error(`[AI Generate] Error stack:`, aiError.stack);
                        console.error(`[AI Generate] Prompt length:`, currentPrompt.length);
                        console.error(`[AI Generate] Schema tables:`, normalizedSchema.tables.length);
                        throw aiError;
                    }

                    lastResult = result;

                    if (!result.toolCalls || result.toolCalls.length === 0) {
                        break;
                    }

                    console.log(`[AI Generate] Tool calls found:`, result.toolCalls.map(t => t.function.name));
                    await sendProgress(Math.min(progressBase + 5, 95), `Executing tools (${result.toolCalls.length})...`);

                    // 1. Check for generate_table (Immediate Exit)
                    const tableTool = result.toolCalls.find(t => t.function.name === 'generate_table')
                    if (tableTool) {
                        const args = JSON.parse(tableTool.function.arguments)
                        const genPrompt = `Generate table for "${args.tableName}". Return JSON: { "tableName": "...", "headers": [], "rows": [] }`
                        const dataRes = await aiClient.generateContent([{ role: 'user', content: genPrompt }], { model: activeModel, json: true })
                        const finalData = JSON.parse(dataRes.text.replace(/```json | ```/g, '').trim())
                        return sendResult({ type: 'generated_table', ...finalData, usage: dataRes.usage })
                    }

                    // 2. Check for search_web (Continue Loop)
                    const searchTool = result.toolCalls.find(t => t.function.name === 'search_web')
                    if (searchTool) {
                        const args = JSON.parse(searchTool.function.arguments)
                        const searchResults = await spreadsheetToolService.callTool('search_web', args);

                        const searchContext = `[System Context - Web Search Results for "${args.query}"]: \n${JSON.stringify(searchResults.results, null, 2)}`;
                        currentPrompt += `\n\n${searchContext}`;
                        console.log(`[AI Generate] Web search results added for "${args.query}", retrying...`);
                        continue;
                    }

                    // 3. Check for get_table_schema or get_sample_data (Continue Loop)
                    const schemaTool = result.toolCalls.find(t => t.function.name === 'get_table_schema' || t.function.name === 'get_sample_data')
                    if (schemaTool) {
                        const toolName = schemaTool.function.name;
                        const args = JSON.parse(schemaTool.function.arguments)
                        const tableName = args.tableName
                        const slug = tableName.toLowerCase().replace(/[^a-z0-9]/g, '');

                        // Handle unstructured resources for schema/sample requests
                        const sourceRegistry = normalizedSchema.sourceRegistry || {};
                        const sourceInfo = sourceRegistry[tableName] || sourceRegistry[slug];

                        let toolRes;
                        if (sourceInfo && sourceInfo.type === 'UNSTRUCTURED') {
                            const knowledgeBase = normalizedSchema.semanticContext?.knowledgeBase || [];
                            const note = knowledgeBase.find(n => n.id === sourceInfo.id || n.source === tableName);
                            if (note) {
                                toolRes = toolName === 'get_table_schema'
                                    ? { columns: [{ name: 'content', type: 'text' }] }
                                    : { rows: [{ content: note.content.substring(0, 500) + '...' }] };
                            }
                        }

                        if (!toolRes) {
                            const targetAdapter = resourceToAdapter[tableName] || resourceToAdapter[slug] || adapter;
                            const targetProvider = resourceToProvider[tableName] || resourceToProvider[slug] || provider;

                            toolRes = await spreadsheetToolService.callTool(toolName, args, {
                                adapter: targetAdapter,
                                dialect: targetProvider,
                                schema: normalizedSchema,
                                connectionId,
                                userId,
                                activeTable
                            });
                        }

                        if (toolRes) {
                            if (toolName === 'get_table_schema' && toolRes.columns) {
                                const schemaDescription = `Structure of '${tableName}':\nColumns: ${toolRes.columns.map(c => `${c.name} (${c.type})`).join(', ')}`;
                                currentPrompt += `\n\n[System Context - Table Schema]:\n${schemaDescription}`;
                                console.log(`[AI Generate] Schema added for ${tableName}, retrying...`);
                            } else if (toolName === 'get_sample_data' && toolRes.rows) {
                                const sampleDescription = `Sample Data from '${tableName}':\n${JSON.stringify(toolRes.rows, null, 2)}`;
                                currentPrompt += `\n\n[System Context - Sample Data]:\n${sampleDescription}`;
                                console.log(`[AI Generate] Sample data added for ${tableName}, retrying...`);
                            }
                            continue; // Go to next iteration with updated prompt
                        }
                    }

                    // 3. Check for query_data (Immediate Exit or Analyst Loop)
                    const dataTools = result.toolCalls.filter(t => t.function.name === 'query_data')
                    if (dataTools.length > 0) {
                        try {
                            const results = await Promise.all(dataTools.map(async (dt) => {
                                const args = JSON.parse(dt.function.arguments);
                                const slug = args.resource?.toLowerCase().replace(/[^a-z0-9]/g, '');

                                // Fuzzy Lookup for Adapter
                                let targetAdapter = resourceToAdapter[args.resource] || resourceToAdapter[slug];
                                let targetProvider = resourceToProvider[args.resource] || resourceToProvider[slug];

                                // Intercept unstructured (note) queries to avoid SQL errors
                                const sourceRegistry = normalizedSchema.sourceRegistry || {};
                                const sourceInfo = sourceRegistry[args.resource] || sourceRegistry[slug];

                                if (sourceInfo && sourceInfo.type === 'UNSTRUCTURED') {
                                    targetProvider = 'notes';
                                    const knowledgeBase = normalizedSchema.semanticContext?.knowledgeBase || [];
                                    const note = knowledgeBase.find(n => n.id === sourceInfo.id || n.source === args.resource);
                                    if (note) {
                                        return {
                                            resource: args.resource,
                                            data: [{ content: note.content }],
                                            note: `Extracted content from unstructured source: ${note.source}`
                                        };
                                    }
                                }

                                // Prioritize underscore-slug for data files
                                const underscoreSlug = args.resource?.toLowerCase().replace(/[^a-z0-9_]/g, '');
                                if (!targetAdapter && underscoreSlug) {
                                    targetAdapter = resourceToAdapter[underscoreSlug];
                                    targetProvider = resourceToProvider[underscoreSlug];
                                }

                                if (!targetAdapter && slug) {
                                    const candidates = Object.keys(resourceToAdapter);
                                    const bestMatch = candidates.find(c => slug.includes(c) || c.includes(slug));
                                    if (bestMatch) {
                                        targetAdapter = resourceToAdapter[bestMatch];
                                        targetProvider = resourceToProvider[bestMatch];
                                    }
                                }

                                // Final Fallback
                                targetAdapter = targetAdapter || adapter;
                                targetProvider = targetProvider || provider;

                                const res = await spreadsheetToolService.callTool('query_data', args, {
                                    adapter: targetAdapter,
                                    dialect: targetProvider,
                                    schema: normalizedSchema,
                                    connectionId,
                                    userId,
                                    activeTable
                                });

                                return { ...res, resource: args.resource, intent: args };
                            }));

                            // Construct toolResult
                            let toolResult;
                            if (results.length === 1) {
                                toolResult = results[0];
                            } else {
                                toolResult = {
                                    type: "data_response",
                                    isCompound: true,
                                    results: results
                                };
                            }

                            console.log(`[AI Generate] Executed ${results.length} query intents.`);
                            results.forEach(r => {
                                if (r.query) logExecutedQuery(userId, r.query, connectionId, 'success');
                                else if (r.results) r.results.forEach(sr => { if (sr.query) logExecutedQuery(userId, sr.query, connectionId, 'success'); });
                            });

                            const isVisual = results.some(r => !!r.config);
                            const isSmallData = (forceText || !forceVisualization) && !isVisual && (
                                toolResult.isCompound
                                    ? toolResult.results.every(r => Array.isArray(r.data) && r.data.length <= 100)
                                    : (Array.isArray(toolResult.data) && toolResult.data.length <= 100)
                            );

                            lastToolResult = toolResult;

                            // 4. Decide if we exit or continue (Analyst Loop)
                            if ((isSmallData || forceText) && iterations < maxIterations) {
                                console.log(`[AI Generate] Data is small. Adding to context and continuing turnover...`);
                                let resSummary = JSON.stringify(toolResult.data || toolResult.results, null, 2);

                                // SAFETY: Truncate massive data even if row count is low (prevent 429/Token explosion)
                                const MAX_SUMMARY_LENGTH = 10000; // 10kb limit for intermediate results
                                if (resSummary.length > MAX_SUMMARY_LENGTH) {
                                    console.warn(`[AI Generate] Intermediate result too large (${resSummary.length} chars). Truncating...`);
                                    resSummary = resSummary.substring(0, MAX_SUMMARY_LENGTH) + "\n... (truncated)";
                                }

                                currentPrompt += `\n\n[System Context - Intermediate Query Result]:\n${resSummary}\n\n`;
                                continue;
                            }

                            if (forceQuery) {
                                return sendResult({
                                    ...toolResult,
                                    usage: result.usage,
                                    contextUsed: resolvedResources
                                });
                            }

                            // 2-Step Visualization Analysis
                            // STRICT OPT-IN: Only visualize if explicitly requested via slash command or not in forceText mode
                            const vizResult = (forceText && !forceVisualization)
                                ? { shouldVisualize: false, blueprint: null }
                                : await VisualizationAnalyzer.analyze(currentPrompt, toolResult.data || toolResult.results, activeModel, userId, forceVisualization);

                            // Maintain compatibility with both 'config' (new) and 'vizBlueprint' (legacy/standard UI)
                            const blueprint = vizResult.shouldVisualize ? vizResult.blueprint : null;

                            return sendResult({
                                ...toolResult,
                                type: forceVisualization ? "visualization_request" : (toolResult.type || "data_response"),
                                vizBlueprint: blueprint,
                                config: blueprint,
                                usage: result.usage,
                                contextUsed: resolvedResources
                            });
                        } catch (e) {
                            console.error("[AI Generate] Multi-query execution failed:", e.message);
                            currentPrompt += `\n\n[System Error - Query Execution Failed]:\n${e.message}\nPlease fix your query intent and try again.`;
                            continue;
                        }
                    }

                    // 4. Check for generate_visualization (Immediate Exit with Blueprint)
                    const vizTool = result.toolCalls.find(t => t.function.name === 'generate_visualization')
                    if (vizTool) {
                        const args = JSON.parse(vizTool.function.arguments)
                        console.log(`[AI Generate] Visualization requested:`, args.title)

                        // Denormalize the AI-generated query (snake_case -> original camelCase)
                        const translator = new SchemaTranslator();
                        translator.tableMapping = new Map(Object.entries(normalizedSchema.mappings?.tables || {}));
                        translator.columnMapping = new Map(Object.entries(normalizedSchema.mappings?.columns || {}));

                        let vizQuery = args.query;
                        if (translator.hasNormalizations()) {
                            const originalQuery = vizQuery;
                            vizQuery = translator.denormalizeQuery(vizQuery, provider);
                            console.log(`[AI Generate] Denormalized viz query:`);
                            console.log(`  Before: ${originalQuery}`);
                            console.log(`  After:  ${vizQuery}`);
                        }

                        let data = [];
                        let error = null;
                        try {
                            // Resolve the correct adapter (e.g. if query hits 'OrionMetrics' -> CosmosDB)
                            const vizAdapter = resolveAdapterForQuery(vizQuery, adapter, resourceToAdapter);
                            data = await vizAdapter.query(vizQuery);
                        } catch (e) {
                            console.error(`[AI Generate] Visualization Query Failed:`, e.message);
                            error = e.message;
                        }

                        if (error) {
                            return sendResult({
                                type: "data_response",
                                text: `I tried to generate a visualization for you, but the database query failed: ${error}`,
                                error: error,
                                query: vizQuery,
                                usage: result.usage,
                                contextUsed: resolvedResources
                            });
                        }

                        return sendResult({
                            type: "data_response",
                            text: result.text || undefined, // Include AI explanation if present
                            query: args.query,
                            data: Array.isArray(data) ? data : [data],
                            vizBlueprint: {
                                type: args.chartType,
                                title: args.title,
                                xAxis: args.xAxis,
                                yAxis: args.yAxis
                            },
                            usage: result.usage,
                            contextUsed: resolvedResources
                        })
                    }

                    // 5. Check for execute_query (Optional turnover for analysis)
                    const queryTool = result.toolCalls.find(t => t.function.name === 'execute_query')
                    if (queryTool) {
                        try {
                            const args = JSON.parse(queryTool.function.arguments);

                            // Resolve correct adapter dynamically
                            const targetAdapter = resolveAdapterForQuery(args.query, adapter, resourceToAdapter);
                            const targetProvider = provider; // Provider for dialect (assumed consistent or handled by adapter translation)

                            const data = await spreadsheetToolService.callTool('execute_query', args, {
                                adapter: targetAdapter,
                                dialect: targetProvider,
                                connectionId,
                                userId
                            });

                            if (data.rows) logExecutedQuery(userId, args.query, connectionId, 'success');

                            const toolResult = {
                                type: "data_response",
                                query: args.query,
                                data: data.rows || [],
                                error: data.error
                            };

                            lastToolResult = toolResult;

                            // Turnover loop for chat summary (Allows AI to generate a JSON table in chat)
                            // We increase this limit so more results stay in-chat as requested.
                            const isSmallData = (Array.isArray(toolResult.data) && toolResult.data.length <= 500);

                            if (isSmallData && iterations < maxIterations) {
                                console.log(`[AI Generate] Raw query data is small. Continuing turnover for chat summary...`);
                                let resSummary = JSON.stringify(toolResult.data.slice(0, 50), null, 2);
                                currentPrompt += `\n\n[System Context - Intermediate Query Result]:\n${resSummary}\n\n`;
                                continue;
                            }

                            // Otherwise exit normally
                            return sendResult({
                                ...toolResult,
                                usage: result.usage,
                                contextUsed: resolvedResources
                            });
                        } catch (e) {
                            console.error("[AI Generate] execute_query failed:", e.message);
                            currentPrompt += `\n\n[System Error - Raw Query Failed]:\n${e.message}\nPlease fix your SQL and try again.`;
                            continue;
                        }
                    }

                    // If none of the specific tools matched but we have tool calls, just break
                    break;
                }

                await sendProgress(98, 'Finalizing response...');

                const finalResult = lastResult;
                let generatedQuery = typeof finalResult === 'string' ? finalResult : (finalResult.text || '');
                if (finalResult.usage) await logAiUsage(userId, finalResult.usage.totalTokens, activeModel, 'ai_generation', basePrompt, connectionId)

                console.log(`[AI Generate] Final response generated. Preview: ${generatedQuery.substring(0, 200)}...`);

                if (generatedQuery.trim()) {
                    const parsed = robustParseJson(generatedQuery);

                    if (parsed.multi_step && parsed.steps?.length > 0) {
                        console.log(`[AI Generate] Multi-step response detected, extracting first query`)
                        generatedQuery = parsed.steps[0].query
                    } else if (parsed.query) {
                        generatedQuery = parsed.query
                    } else if (parsed.ambiguous) {
                        return sendResult({ ...lastToolResult, ambiguous: true, text: parsed.message, message: parsed.message, choices: parsed.choices, usage: finalResult.usage, needs_disclaimer: parsed.needs_disclaimer })
                    } else if (parsed.answer || parsed.analysis || parsed.explanation) {
                        // Qualitative response or diagnostic explanation
                        const content = parsed.answer || parsed.analysis || parsed.explanation;
                        return sendResult({
                            ...lastToolResult,
                            text: content,
                            explanation: content,
                            message: content,
                            needs_disclaimer: parsed.needs_disclaimer || false,
                            usage: finalResult.usage,
                            contextUsed: resolvedResources
                        })
                    }
                }

                const translator = new SchemaTranslator();
                translator.tableMapping = new Map(Object.entries(normalizedSchema.mappings.tables || {}));
                translator.columnMapping = new Map(Object.entries(normalizedSchema.mappings.columns || {}));

                // Denormalize the query - replace AI's normalized names with original column names
                if (translator.hasNormalizations() && generatedQuery && !generatedQuery.startsWith('{')) {
                    const originalQuery = generatedQuery
                    generatedQuery = translator.denormalizeQuery(generatedQuery, provider)
                    console.log(`[AI Generate] Denormalized query:`)
                    console.log(`  Before: ${originalQuery}`)
                    console.log(`  After:  ${generatedQuery}`)
                }

                // Detect if the result is a refusal message or plain text rather than a query
                const lowerQuery = generatedQuery.toLowerCase();
                const isPlainExplanation = (generatedQuery.length > 20 &&
                    !lowerQuery.includes('select ') &&
                    !lowerQuery.includes('update ') &&
                    !lowerQuery.includes('delete from') &&
                    !lowerQuery.includes('insert into') &&
                    !generatedQuery.startsWith('{')) ||
                    lowerQuery.startsWith('i cannot') ||
                    lowerQuery.startsWith('i am sorry') ||
                    lowerQuery.startsWith("i'm sorry");

                if (isPlainExplanation) {
                    const lowerGen = generatedQuery.toLowerCase();
                    const needsDisclaimerHeuristic = lowerGen.includes('invest') || lowerGen.includes('fund') || lowerGen.includes('return') || lowerGen.includes('allocation');

                    return sendResult({
                        text: generatedQuery,
                        explanation: generatedQuery,
                        message: generatedQuery,
                        usage: finalResult.usage,
                        contextUsed: resolvedResources,
                        needs_disclaimer: needsDisclaimerHeuristic
                    });
                }

                if (!generatedQuery) {
                    const errorMsg = "I'm having trouble phrasing that as a query. Could you try being more specific, or mention the data source using symbols like !filename or #database?";
                    return sendResult({
                        text: errorMsg,
                        explanation: errorMsg,
                        message: errorMsg,
                        usage: finalResult.usage,
                        contextUsed: resolvedResources
                    });
                }

                if (forceQuery) {
                    return sendResult({
                        message: `Here is the SQL query for your request:\n\n\`\`\`sql\n${generatedQuery}\n\`\`\``,
                        usage: finalResult.usage,
                        contextUsed: resolvedResources
                    });
                }

                // Safety check: If the AI generated a query for an unstructured resource (note),
                // intercept and return content instead of a failing query.
                const targetedUnstructuredName = Object.keys(normalizedSchema.sourceRegistry).find(name => {
                    const info = normalizedSchema.sourceRegistry[name];
                    return info.type === 'UNSTRUCTURED' && lowerQuery.includes(name.toLowerCase());
                });

                if (targetedUnstructuredName) {
                    console.log(`[AI Generate] Intercepted SQL query targeting unstructured resource: ${targetedUnstructuredName}`);
                    const sourceInfo = normalizedSchema.sourceRegistry[targetedUnstructuredName];
                    const knowledgeBase = normalizedSchema.semanticContext?.knowledgeBase || [];
                    const note = knowledgeBase.find(n => n.id === sourceInfo.id);
                    if (note) {
                        return sendResult({
                            text: note.content,
                            explanation: note.content,
                            message: note.content,
                            usage: finalResult.usage,
                            contextUsed: resolvedResources,
                            data: [{ content: note.content }],
                            type: "data_response",
                            needs_disclaimer: true
                        });
                    }
                }

                return sendResult({ ...lastToolResult, query: generatedQuery, usage: finalResult.usage, contextUsed: resolvedResources })

            } finally {
                if (adapter) await adapter.disconnect().catch(() => { })
                for (const extra of extraAdapters) {
                    await extra.disconnect().catch(() => { })
                }
            }
        } catch (e) {
            console.error(`[AI Generate] CRITICAL STREAM ERROR:`, e);
            return sendError(e.message)
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
            console.warn("[Chat] Failed to parse analysis JSON:", e.message)
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
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userRow = await db.query.users.findFirst({
            where: eq(users.id, payload.sub),
            columns: { subscriptionTier: true }
        });
        const tier = userRow?.subscriptionTier || 'free'
        const allModels = await aiClient.listModels()
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

