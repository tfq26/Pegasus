import { Hono } from "hono"
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

const chat = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id;
        const [user] = await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                profilePictureUrl: (payload.profilePictureUrl || payload.profile_picture_url) ?? null,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    email: payload.email,
                    firstName: payload.firstName || payload.first_name,
                    lastName: payload.lastName || payload.last_name,
                    profilePictureUrl: (payload.profilePictureUrl || payload.profile_picture_url) ?? null,
                    updatedAt: new Date()
                }
            })
            .returning();
        return user.id;
    } catch (e) {
        console.error("[Chat] Failed to upsert user:", e)
        return null;
    }
}

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
chat.get("/chats", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const results = await db.query.chats.findMany({
            where: eq(chats.userId, userId),
            orderBy: [desc(chats.updatedAt)]
        });
        return c.json({ chats: results })
    } catch (e) {
        console.error("[Chat] Fetch error:", e);
        return c.json({ error: "Unauthorized" }, 401)
    }
})

chat.post("/chats", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = await upsertUser(payload)
        const { title } = await c.req.json()

        const [created] = await db.insert(chats)
            .values({
                userId,
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

chat.get("/chats/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        let chatId = c.req.param("id")
        const rawChatId = chatId.includes(':') ? chatId.split(':')[1] : chatId

        const result = await db.query.chats.findFirst({
            where: and(eq(chats.id, rawChatId), eq(chats.userId, payload.sub))
        });

        if (!result) return c.json({ error: "Chat not found" }, 404)
        return c.json({ chat: result, messages: result.messages || [] })
    } catch (e) {
        console.error("[Chat] Fetch failed:", e);
        return c.json({ error: "Failed to fetch chat" }, 500)
    }
})

chat.post("/chats/:id/messages", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = await upsertUser(payload)
        let chatId = c.req.param("id")
        const rawChatId = chatId.includes(':') ? chatId.split(':')[1] : chatId

        const { role, content, meta } = await c.req.json()
        const newMessage = { id: crypto.randomUUID(), role, content, meta: meta || null, created_at: Math.floor(Date.now() / 1000) }

        // Fetch current messages
        const existingChat = await db.query.chats.findFirst({
            where: and(eq(chats.id, rawChatId), eq(chats.userId, userId))
        });

        if (!existingChat) return c.json({ error: "Chat not found" }, 404)

        const updatedMessages = [...(existingChat.messages || []), newMessage];

        await db.update(chats)
            .set({
                messages: updatedMessages,
                updatedAt: new Date()
            })
            .where(eq(chats.id, rawChatId));

        if (existingChat.title === 'New Chat' && updatedMessages.length >= 2) {
            setImmediate(async () => {
                try {
                    const newTitle = await aiClient.generateTitle(updatedMessages)
                    if (newTitle && newTitle.trim() && newTitle !== 'New Chat') {
                        await db.update(chats).set({ title: newTitle.trim() }).where(eq(chats.id, rawChatId));
                    }
                } catch (e) { console.error("[Chat] Failed to auto-label chat:", e) }
            })
        }
        return c.json({ id: newMessage.id })
    } catch (e) {
        console.error("[Chat] Message send error:", e);
        return c.json({ error: "Failed to send message" }, 500)
    }
})

chat.delete("/chats/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        let chatId = c.req.param("id")
        const rawChatId = chatId.includes(':') ? chatId.split(':')[1] : chatId

        await db.delete(chats).where(and(eq(chats.id, rawChatId), eq(chats.userId, payload.sub)));
        return c.json({ success: true })
    } catch (e) {
        console.error("[Chat] Delete failed:", e);
        return c.json({ error: "Failed to delete chat" }, 500)
    }
})

chat.delete("/chats", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        await db.delete(chats).where(eq(chats.userId, payload.sub));
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
        const adapter = new Adapter(config[provider] || config)
        await adapter.connect()
        const tables = await adapter.listCollections();
        const stats = `Provider: ${provider}, Total Tables: ${tables.length}`
        const prompt = `Database Health Specialist. Analyze: ${stats}. Return JSON: { "status": "...", "summary": "...", "recommendations": [] }`
        const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model, json: true })
        if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'health_profile', 'Health Check')
        return c.json(JSON.parse(response.text.replace(/```json | ```/g, '').trim()))
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/explain-table", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { connectionId, tableName, model } = await c.req.json()
        const rawConnId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId

        const connRow = await db.query.connections.findFirst({
            where: eq(connections.id, rawConnId)
        });

        if (!connRow) return c.json({ error: "Connection not found" }, 404)
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
        const provider = connRow.type
        const Adapter = adapters[provider]
        const adapter = new Adapter(config[provider] || config)
        await adapter.connect()
        const sample = await adapter.query(`SELECT * FROM ${tableName} LIMIT 3`)
        const prompt = `Explain table "${tableName}" based on sample: ${JSON.stringify(sample)}`
        const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model })
        if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'explain_table', 'Explain Table')
        return c.json({ explanation: response.text })
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

        const connRow = await db.query.connections.findFirst({
            where: eq(connections.id, rawConnId)
        });

        if (!connRow) return c.json({ error: "Connection not found" }, 404)
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
        const provider = connRow.type
        const Adapter = adapters[provider]
        const adapter = new Adapter(config[provider] || config)
        await adapter.connect()
        const plan = await captureQueryPlan(adapter, query, provider)
        const prompt = `Explain query: ${query}. Plan: ${plan}`
        const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model })
        if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'query_explain', 'Explain Query')
        return c.json({ explanation: response.text, plan })
    } catch (e) { return c.json({ error: e.message }, 500) }
})

chat.post("/ai/optimize-query", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { query, connectionId, model } = await c.req.json()
        const rawConnId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId

        const connRow = await db.query.connections.findFirst({
            where: eq(connections.id, rawConnId)
        });

        if (!connRow) return c.json({ error: "Connection not found" }, 404)
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config
        const provider = connRow.type
        const Adapter = adapters[provider]
        const adapter = new Adapter(config[provider] || config)
        await adapter.connect()
        const plan = await captureQueryPlan(adapter, query, provider)
        const prompt = `Optimize query: ${query}. Plan: ${plan}. Return JSON: { "optimizedQuery": "...", "explanation": "..." }`
        const response = await aiClient.generateContent([{ role: 'user', content: prompt }], { model, json: true })
        if (response.usage) await logAiUsage(payload.sub, response.usage.totalTokens, model, 'query_optimize', 'Optimize Query')
        return c.json(JSON.parse(response.text.replace(/```json | ```/g, '').trim()))
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
    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            userId = parts.length > 1 ? parts[1] : resolvedId
        }
        const quota = await checkAiQuota(userId);
        if (!quota.allowed) return c.json(quota, 403);
        const { prompt, connectionId: rawConnId, context, activeTable, temperature, maxTokens, adHocSchema } = await c.req.json()

        // Handle connection ID
        const connectionId = rawConnId ? (rawConnId.includes(':') ? rawConnId.split(':')[1] : rawConnId) : null;

        console.log(`[AI Generate] User: ${userId}, ConnectionId: ${connectionId || 'none'}, ActiveTable: ${activeTable || 'none'}`)

        let connRow = null
        let userSettings = null
        let activeModel = null

        // Fetch user first to get settings
        const userRow = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { settings: true }
        });

        userSettings = userRow?.settings || null
        activeModel = userSettings?.activeModel || null

        if (connectionId && connectionId !== 'undefined' && connectionId !== 'null' && connectionId !== 'local') {
            connRow = await db.query.connections.findFirst({
                where: eq(connections.id, connectionId)
            });

            if (connRow) {
                console.log(`[AI Generate] Found connection ${connectionId}. Owner: ${connRow.userId}, Requester: ${userId}`)
            } else {
                console.log(`[AI Generate] Connection ${connectionId} not found in DB`)
            }
        }

        // Handle local/virtual connections (e.g., spreadsheets without DB backing)
        if (!connRow && connectionId === 'connection:local') {
            connRow = { type: 'local', provider: 'local', config: {}, is_virtual: true }
        }

        // If still no connection but we have adHocSchema, create a virtual connection
        // This allows AI to work with spreadsheet data passed directly from frontend
        if (!connRow && adHocSchema) {
            console.log(`[AI Generate] No connection found, using adHocSchema for virtual analysis`)
            connRow = { type: 'local', provider: 'local', config: {}, is_virtual: true }
        }

        // Final check - if no connection and no fallback possible, return error
        if (!connRow) {
            console.log(`[AI Generate] Connection not found and no fallback available. ID: ${connectionId}`)
            return c.json({
                error: "Connection not found. Please select a valid connection or ensure the data is loaded.",
                hint: "If you're working with a spreadsheet, try refreshing the page."
            }, 404)
        }

        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config || {}
        let provider = connRow.type || connRow.provider
        if (!provider && config) {
            const keys = Object.keys(config).filter(k => ['mongodb', 'mysql', 'kusto', 'sqlite', 'postgres', 'duckdb'].includes(k.toLowerCase()))
            if (keys.length > 0) provider = keys[0]
        }
        const adapterConfig = config[provider] || config[provider?.toLowerCase()]
        let schemaInfo = { tables: [], detailedSchema: {} }
        let adapter = null
        if (provider === 'local' && connRow.is_virtual) {
            if (adHocSchema) schemaInfo = { tables: [activeTable], detailedSchema: { [activeTable]: adHocSchema } }
        } else {
            const Adapter = adapters[provider] || adapters[provider?.toLowerCase()]
            if (Adapter) {
                adapter = new Adapter(adapterConfig)
                await adapter.connect()
                const allTables = await adapter.listCollections()
                schemaInfo.tables = allTables.slice(0, 50)
                console.log(`[AI Generate] Found ${allTables.length} tables. Active table: ${activeTable || 'none'}`)

                // Get schema for the active table or the first few tables if no active table
                if (typeof adapter.getOneTableSchema === 'function') {
                    let tablesToFetch = []

                    if (activeTable && allTables.includes(activeTable)) {
                        tablesToFetch = [activeTable]
                    } else if (!activeTable && allTables.length > 0) {
                        // Fetch schema for first few tables to give AI context
                        tablesToFetch = allTables.slice(0, 5)
                    }

                    // Initialize sample values object
                    schemaInfo.sampleValues = {}

                    for (const t of tablesToFetch) {
                        schemaInfo.detailedSchema[t] = await adapter.getOneTableSchema(t)

                        // Fetch sample data to show AI what values look like
                        if (typeof adapter.sampleCollection === 'function') {
                            try {
                                const samples = await adapter.sampleCollection(t, 5)
                                if (samples && samples.length > 0) {
                                    schemaInfo.sampleValues[t] = {}
                                    // Get unique sample values for each column
                                    for (const col of schemaInfo.detailedSchema[t] || []) {
                                        const values = samples.map(row => row[col.name]).filter(v => v != null)
                                        const uniqueValues = [...new Set(values)].slice(0, 3)
                                        if (uniqueValues.length > 0) {
                                            schemaInfo.sampleValues[t][col.name] = uniqueValues
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn(`[AI Generate] Failed to fetch samples for ${t}:`, e.message)
                            }
                        }
                    }

                    console.log(`[AI Generate] Fetched schema for ${tablesToFetch.length} tables with sample values`)
                    if (tablesToFetch.length > 0) {
                        console.log(`[AI Generate] Schema for first table:`, schemaInfo.detailedSchema[tablesToFetch[0]])
                        console.log(`[AI Generate] Sample values for first table:`, schemaInfo.sampleValues[tablesToFetch[0]])
                    }
                }
            }
        }
        // Use SchemaTranslator to normalize column names for AI
        const translator = new SchemaTranslator()
        const normalizedSchema = translator.normalizeSchema(schemaInfo)

        if (translator.hasNormalizations()) {
            console.log(`[AI Generate] Schema normalized. Mappings:`, translator.getMappingSummary())
        }

        const aiSettings = { modelId: activeModel, temperature: Number(temperature || 0.7), maxTokens: Number(maxTokens || 1000), activeTable }
        const { spreadsheetToolService } = await import('../services/SpreadsheetToolService.js')
        aiSettings.tools = spreadsheetToolService.getSpreadsheetTools()

        // Send normalized schema to AI
        const result = await aiClient.generateQuery(prompt, { dialect: provider, schema: normalizedSchema, previousContext: context }, aiSettings)
        let generatedQuery = typeof result === 'string' ? result : result.text

        console.log(`[AI Generate] Raw AI response:`, JSON.stringify(result).substring(0, 500))
        console.log(`[AI Generate] Extracted query:`, generatedQuery?.substring(0, 200))

        if (result.toolCalls?.length > 0) {
            const tc = result.toolCalls.find(t => t.function.name === 'generate_table')
            if (tc) {
                const args = JSON.parse(tc.function.arguments)
                const genPrompt = `Generate table for "${args.tableName}". Return JSON: { "tableName": "...", "headers": [], "rows": [] }`
                const dataRes = await aiClient.generateContent([{ role: 'user', content: genPrompt }], { model: activeModel, json: true })
                const finalData = JSON.parse(dataRes.text.replace(/```json | ```/g, '').trim())
                return c.json({ type: 'generated_table', ...finalData, usage: dataRes.usage })
            }
        }
        if (result.usage) await logAiUsage(userId, result.usage.totalTokens, activeModel, 'ai_generation', prompt, connectionId)
        generatedQuery = generatedQuery.replace(/```.*?```/gs, (m) => m.replace(/```/g, '')).trim()

        // Denormalize the query - replace AI's normalized names with original column names
        if (translator.hasNormalizations() && generatedQuery && !generatedQuery.startsWith('{')) {
            const originalQuery = generatedQuery
            generatedQuery = translator.denormalizeQuery(generatedQuery, provider)
            console.log(`[AI Generate] Denormalized query:`)
            console.log(`  Before: ${originalQuery}`)
            console.log(`  After:  ${generatedQuery}`)
        }

        return c.json({ query: generatedQuery, usage: result.usage })
    } catch (e) { return c.json({ error: e.message }, 500) }

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
        const analysis = analysisResult.text || analysisResult
        if (analysisResult.usage) await logAiUsage(payload.sub, analysisResult.usage.totalTokens, null, 'ai_analyze', question)
        return c.json({ analysis })
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
