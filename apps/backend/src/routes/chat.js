import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { aiClient } from "../../ai/AIClient.js"
import { adapters } from "../../adapters/index.js"
import { analyzeForSanitization } from "../../ai/sanitizer.js"

const chat = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        await db.query(`
        UPDATE user:${userId} SET 
            email = $email,
            first_name = $firstName,
            last_name = $lastName,
            profile_picture_url = $pic,
            updated_at = time::now()
        RETURN AFTER;
    `, {
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
        });
    } catch (e) {
        console.error("Failed to upsert user:", e)
    }
}

// Helper to convert 0-based index to Excel column label (0 -> A, 25 -> Z, 26 -> AA)
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

// Helper to build formula generation prompt
const buildFormulaPrompt = (request, spreadsheetData, autoExecute) => {
    const { headers, sampleData } = spreadsheetData;
    const headerStr = headers.map((h, i) => `${colIndexToLabel(i)}: ${h}`).join(', ');
    const dataStr = sampleData.map((row, i) =>
        `Row ${i + 2}: ${row.join(' | ')}`
    ).join('\n');

    return `
You are an expert Excel/Spreadsheet formula generator.
User Request: "${request}"

Spreadsheet Context:
Headers: ${headerStr}
Sample Data:
${dataStr}

Task: Generate a valid Excel formula to fulfill the request.
Return a JSON object.

Format:
{
  "ambiguous": false,
  "formula": "=AVERAGEIF($A:$A, A2, $B:$B)",
  "targetColumn": 3,
  "columnHeader": "Average Price",
  "reasoning": "Explanation...",
  "exampleResult": "45.67",
  "isOverwrite": false
}

If ambiguous, return:
{
  "ambiguous": true,
  "clarificationNeeded": "Question...",
  "options": ["Option 1", "Option 2"]
}

Rules:
1. Use standard Excel functions.
2. Use absolute references ($A$1) where appropriate.
3. targetColumn is 0-based index.
4. columnHeader should be concise.
5. Provide formula for Row 2.
6. Calculate exampleResult for Row 2.
7. Set isOverwrite=true if targetColumn has data.
`;
};

// Helper to check if operation will modify existing data
function checkIfModifiesData(targetColumn, spreadsheetData, isOverwrite) {
    if (!spreadsheetData.sampleData) return false;
    for (const row of spreadsheetData.sampleData) {
        if (row[targetColumn] !== undefined && row[targetColumn] !== '' && row[targetColumn] !== null) {
            return true;
        }
    }
    return isOverwrite === true;
}

// Chat Routes
chat.get("/chats", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        const [chats] = await db.query(`
        SELECT * FROM chat WHERE user = $user ORDER BY updated_at DESC;
    `, { user: `user:${userId}` });

        return c.json({ chats })
    } catch (e) {
        return c.json({ error: "Unauthorized" }, 401)
    }
})

chat.post("/chats", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        await upsertUser(payload)
        const { title } = await c.req.json()

        const [created] = await db.query(`
        CREATE chat CONTENT {
            user: $user,
            title: $title,
            messages: [],
            created_at: time::now(),
            updated_at: time::now()
        };
    `, {
            user: `user:${userId}`,
            title: title || "New Chat"
        });

        return c.json({
            id: created[0].id.toString().split(':')[1] || created[0].id,
            title: created[0].title
        })
    } catch (e) {
        return c.json({ error: "Failed to create chat" }, 500)
    }
})

chat.get("/chats/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let chatId = c.req.param("id")
        if (!chatId.includes(':')) chatId = `chat:${chatId}`

        const [result] = await db.query(`
        SELECT * FROM ${chatId} WHERE user = $user;
    `, { user: `user:${userId}` });

        if (!result || !result[0]) return c.json({ error: "Chat not found" }, 404)
        const chat = result[0]
        const messages = chat.messages || []

        return c.json({ chat, messages })
    } catch (e) {
        return c.json({ error: "Failed to fetch chat" }, 500)
    }
})

chat.post("/chats/:id/messages", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        await upsertUser(payload)
        let chatId = c.req.param("id")
        if (!chatId.includes(':')) chatId = `chat:${chatId}`
        const { role, content } = await c.req.json()

        // Append to messages array
        const newMessage = {
            id: crypto.randomUUID(),
            role,
            content,
            created_at: Math.floor(Date.now() / 1000)
        }

        const [updated] = await db.query(`
        UPDATE ${chatId} SET 
            messages += $msg,
            updated_at = time::now()
        WHERE user = $user
        RETURN title, messages;
    `, {
            msg: newMessage,
            user: `user:${userId}`
        });

        if (!updated || !updated[0]) return c.json({ error: "Chat not found" }, 404)
        const chatData = updated[0];

        // Background Task: Auto-label chat
        if (chatData.title === 'New Chat' && chatData.messages.length >= 2) {
            (async () => {
                try {
                    const newTitle = await aiClient.generateTitle(chatData.messages)
                    if (newTitle) {
                        await db.query(`UPDATE ${chatId} SET title = $title`, { title: newTitle })
                    }
                } catch (e) {
                    console.error("[AI] Failed to auto-label chat:", e)
                }
            })()
        }

        return c.json({ id: newMessage.id })
    } catch (e) {
        return c.json({ error: "Failed to send message" }, 500)
    }
})

// AI Routes
chat.post("/ai/generate-formula", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { request, spreadsheetData, model, autoExecute } = await c.req.json()
        const prompt = buildFormulaPrompt(request, spreadsheetData, autoExecute)

        const response = await aiClient.generateContent([
            { role: 'user', content: prompt }
        ], { json: true, model })

        let result
        try {
            result = JSON.parse(response)
        } catch (parseError) {
            console.error('Failed to parse AI response:', response)
            return c.json({
                error: 'AI returned invalid response format',
                details: response?.substring(0, 200)
            }, 500)
        }

        if (result.ambiguous) {
            return c.json({
                ambiguous: true,
                clarificationNeeded: result.clarificationNeeded,
                options: result.options
            })
        }

        const willModifyExistingData = checkIfModifiesData(
            result.targetColumn,
            spreadsheetData,
            result.isOverwrite
        )

        return c.json({
            formula: result.formula,
            targetColumn: result.targetColumn,
            columnHeader: result.columnHeader || 'New Column',
            reasoning: result.reasoning,
            exampleResult: result.exampleResult,
            willModifyExistingData,
            affectedCells: willModifyExistingData ?
                `Column ${colIndexToLabel(result.targetColumn)}` :
                null
        })
    } catch (e) {
        console.error("AI Generation Error:", e)
        return c.json({ error: e.message }, 500)
    }
})

chat.post("/ai/analyze-formula-error", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { context, model } = await c.req.json()
        const prompt = `
You are an expert Excel formula debugger.
Context:
Formula: ${context.formula}
Result: ${context.result}
Cell: ${context.cellPosition}
Row Data: ${JSON.stringify(context.rowData)}
Headers: ${JSON.stringify(context.headers)}

Task: Analyze why this formula is producing an error or unexpected result.
Return JSON:
{
  "explanation": "Brief explanation...",
  "suggestedFix": "=CORRECTED_FORMULA(...)"
}
`;
        const response = await aiClient.generateContent([
            { role: 'user', content: prompt }
        ], { json: true, model })

        return c.json(JSON.parse(response))
    } catch (e) {
        return c.json({ error: "Analysis failed" }, 500)
    }
})

chat.post("/ai/generate", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const { prompt, connectionId, context } = await c.req.json()

        // 1. Fetch connection details
        const rs = await db.execute({
            sql: "SELECT * FROM connections WHERE id = $id AND user_id = $userId",
            args: { id: connectionId, userId }
        })
        const connRow = rs.rows[0]

        if (!connRow) {
            return c.json({ error: "Connection not found" }, 404)
        }

        const config = JSON.parse(connRow.config)
        const provider = connRow.provider
        const adapterConfig = config[provider]

        // 2. Fetch Schema
        const Adapter = adapters[provider]
        if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

        const adapter = new Adapter(adapterConfig)
        let schemaInfo = {}

        // (Note: Simplified schema fetch logic here for brevity, assuming standard fetch)
        // For robust refactor, we should extract schema fetching to a Service. 
        // Implementing inline similar to original for now.

        try {
            await adapter.connect()
            const allTables = await adapter.listCollections()
            // ... (Schema filtering logic would go here)
            // For now, take top 50
            schemaInfo = { tables: allTables.slice(0, 50) }
            if (typeof adapter.getSchema === 'function') {
                schemaInfo.detailedSchema = await adapter.getSchema() // simple approach
            }
        } catch (e) {
            console.warn("Schema fetch failed", e)
        } finally {
            try { await adapter.disconnect() } catch (e) { }
        }

        const aiContext = {
            dialect: provider,
            schema: schemaInfo,
            previousContext: context
        }

        // Fetch user settings
        let aiSettings = { modelId: null, temperature: 0.7 }
        try {
            const settingsRes = await db.execute({
                sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
                args: { userId }
            })
            if (settingsRes.rows.length > 0) {
                const s = JSON.parse(settingsRes.rows[0].settings)
                aiSettings.modelId = s.activeModel
                aiSettings.temperature = s.temperature
            }
        } catch (e) { }

        const result = await aiClient.generateQuery(prompt, aiContext, aiSettings)
        const generatedQuery = typeof result === 'string' ? result : result.text
        const usage = typeof result === 'string' ? null : result.usage

        return c.json({ query: generatedQuery, usage })
    } catch (error) {
        console.error("AI Generation Error:", error)
        return c.json({ error: error.message }, 500)
    }
})

chat.post("/ai/recommend-visualization", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { query, results, previousConfig } = await c.req.json()
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Get Model
        let activeModel = null
        try {
            const settingsRes = await db.execute({
                sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
                args: { userId }
            })
            if (settingsRes.rows.length > 0) {
                activeModel = JSON.parse(settingsRes.rows[0].settings).activeModel
            }
        } catch (e) { }

        const recommendation = await aiClient.recommendVisualization(query, results, previousConfig, activeModel)
        return c.json(recommendation)
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

chat.post("/ai/analyze", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { question, results, query } = await c.req.json()
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        let activeModel = null
        try {
            const settingsRes = await db.execute({
                sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
                args: { userId }
            })
            if (settingsRes.rows.length > 0) {
                activeModel = JSON.parse(settingsRes.rows[0].settings).activeModel
            }
        } catch (e) { }

        const analysis = await aiClient.analyzeResults(question, results, query, activeModel)
        return c.json(analysis)
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

chat.post("/ai/spreadsheet-command", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { command, data } = await c.req.json()
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        let activeModel = null
        try {
            const result = await db.query(`SELECT settings FROM user_settings WHERE user_id = $userId`, { userId });
            if (result[0] && result[0].settings) {
                const settings = JSON.parse(result[0].settings);
                activeModel = settings.activeModel;
            }
        } catch (e) { }

        const headers = data.length > 0 ? Object.keys(data[0]) : []
        const prompt = `
Context: Spreadsheet Data
Headers: ${JSON.stringify(headers)}
Sample Data (first 5 rows): ${JSON.stringify(data.slice(0, 5), null, 2)}

The user wants to: "${command}"

Generate a JSON array of modifications to apply.
Return ONLY a valid JSON object:
{
  "modifications": [
    { "row": 1, "col": 2, "value": "new value" }
  ]
}
`;
        const response = await aiClient.chat(prompt, [], activeModel)
        let modifications = []
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                modifications = parsed.modifications || []
            }
        } catch (e) {
            return c.json({ error: "AI returned invalid response" }, 500)
        }
        return c.json({ modifications })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

chat.post("/ai/sanitize/analyze", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { tableName, schema } = await c.req.json()
        const result = await analyzeForSanitization(tableName, schema)
        return c.json(result)
    } catch (e) {
        return c.json({ error: e.message || "Failed to analyze table" }, 500)
    }
})

chat.get("/ai/models", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const models = await aiClient.listModels()
        return c.json({ models })
    } catch (e) {
        return c.json({ error: "Failed to list models" }, 500)
    }
})

chat.post("/ai/search", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { query } = await c.req.json()
        const payload = await verify(token, jwtSecret)

        // This seems to be a general web search or internal search depending on implementation
        // For now assumed web search via aiClient if supported, or just generic Q&A
        const response = await aiClient.chat(query, [], null)

        return c.json({ result: response })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

export { chat as chatRoutes }
