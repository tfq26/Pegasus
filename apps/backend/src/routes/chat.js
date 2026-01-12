import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { aiClient } from "../../ai/AIClient.js"
import { interpretDataset } from "../../ai/sanitizer.js"
import { adapters } from "../../adapters/index.js"
import { analyzeForSanitization } from "../../ai/sanitizer.js"
import { RAGService } from "../services/ragService.js"
import { getUserFeatureFlags } from "../../experimental-features.js"
import { filterModelsByTier } from "../../lib/tierLimits.js"

import { ConfigService } from "../services/ConfigService.js"

const chat = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`

        // 1. Try to find by ID
        const [existingById] = await db.query(`SELECT id FROM ${userRecordId}`);

        if (existingById && existingById.length > 0) {
            // Found by ID -> Update
            await db.query(`
                UPDATE ${userRecordId} SET 
                    email = $email,
                    first_name = $firstName,
                    last_name = $lastName,
                    profile_picture_url = $pic,
                    updated_at = time::now();
            `, {
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });
            return existingById[0].id.toString();
        } else {
            // 2. Not found by ID -> Check by Email to prevent duplicates
            const [existingByEmail] = await db.query(`SELECT id FROM user WHERE email = $email`, { email: payload.email });

            if (existingByEmail && existingByEmail.length > 0) {
                // Found by Email -> Update that record instead
                const targetId = existingByEmail[0].id.toString();
                await db.query(`
                    UPDATE ${targetId} SET 
                        first_name = $firstName,
                        last_name = $lastName,
                        profile_picture_url = $pic,
                        updated_at = time::now();
                `, {
                    firstName: payload.firstName || payload.first_name,
                    lastName: payload.lastName || payload.last_name,
                    pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
                });
                return targetId;
            } else {
                // 3. Not found by ID or Email -> Create new
                await db.query(`
                    CREATE ${userRecordId} CONTENT {
                        email: $email,
                        first_name: $firstName,
                        last_name: $lastName,
                        profile_picture_url: $pic,
                        created_at: time::now(),
                        updated_at: time::now()
                    };
                `, {
                    email: payload.email,
                    firstName: payload.firstName || payload.first_name,
                    lastName: payload.lastName || payload.last_name,
                    pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
                });
                return userRecordId;
            }
        }
    } catch (e) {
        console.error("[Chat] Failed to upsert user:", e)
        return null;
    }
}

// Helper to check AI quota
// Helper to check AI quota
const checkAiQuota = async (userId) => {
    try {
        const [userRecord] = await db.query(`SELECT subscription_tier, purchased_tokens FROM user:${userId}`);
        const tier = userRecord[0]?.subscription_tier || 'free';
        const purchasedTokens = Number(userRecord[0]?.purchased_tokens || 0);

        // Limits: 60k (Free), 200k (Pro) + Purchased
        const baseLimit = tier === 'pro' ? 200000 : 60000;
        const limit = baseLimit + purchasedTokens;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [usageResult] = await db.query(`
            SELECT math::sum(tokens_used) as total FROM query_history 
            WHERE user = $user AND created_at >= $start
            GROUP ALL
        `, {
            user: `user:${userId}`,
            start: startOfMonth
        });

        const used = usageResult[0]?.total || 0;

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
        return { allowed: true }; // Fail open
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



// Helper to log AI usage
const logAiUsage = async (userId, tokens, model, type, content, connectionId) => {
    if (!tokens || tokens <= 0) return;
    try {
        await db.query(`
            CREATE query_history CONTENT {
                user: $user,
                query: $content,
                source: $source,
                model: $model,
                status: 'success',
                connection: $connection,
                tokens_used: $tokens,
                created_at: time::now()
            }
        `, {
            user: `user:${userId}`,
            content: content ? content.substring(0, 500) : 'AI Operation',
            source: type,
            model: model,
            connection: connectionId ? (connectionId.includes(':') ? connectionId : `connection:${connectionId}`) : null,
            tokens: tokens
        });
        console.log(`[Usage] Logged ${tokens} tokens for ${userId} (${type})`);
    } catch (e) {
        console.error("Failed to log AI usage:", e);
    }
}


// Chat Routes
chat.get("/chats", async (c) => {
    const token = getAuthToken(c)
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
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }
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
    const token = getAuthToken(c)
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
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }
        let chatId = c.req.param("id")
        if (!chatId.includes(':')) chatId = `chat:${chatId}`
        const { role, content, meta } = await c.req.json()

        // Append to messages array
        const newMessage = {
            id: crypto.randomUUID(),
            role,
            content,
            meta: meta || null,
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

        // Background Task: Auto-label chat based on first user message
        // Trigger when we have at least 2 messages (user + assistant)
        if (chatData.title === 'New Chat' && chatData.messages && chatData.messages.length >= 2) {
            console.log('[Chat] Auto-labeling chat with', chatData.messages.length, 'messages')

            // Run in background without blocking the response
            setImmediate(async () => {
                try {
                    const newTitle = await aiClient.generateTitle(chatData.messages)
                    if (newTitle && newTitle.trim() && newTitle !== 'New Chat') {
                        console.log('[Chat] Generated title:', newTitle)
                        await db.query(`UPDATE ${chatId} SET title = $title`, { title: newTitle.trim() })
                    } else {
                        console.log('[Chat] Generated title was empty or invalid:', newTitle)
                    }
                } catch (e) {
                    console.error("[Chat] Failed to auto-label chat:", e)
                }
            })
        }

        return c.json({ id: newMessage.id })
    } catch (e) {
        return c.json({ error: "Failed to send message" }, 500)
    }
})

// Delete a single chat
chat.delete("/chats/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let chatId = c.req.param("id")
        if (!chatId.includes(':')) chatId = `chat:${chatId}`

        console.log(`[Chat] Deleting chat: ${chatId} for user: ${userId}`)

        // Delete only if owned by user
        const result = await db.query(`
            DELETE ${chatId} WHERE user = $user RETURN BEFORE;
        `, { user: `user:${userId}` });

        if (!result || !result[0] || result[0].length === 0) {
            return c.json({ error: "Chat not found or unauthorized" }, 404)
        }

        console.log(`[Chat] Successfully deleted chat: ${chatId}`)
        return c.json({ success: true })
    } catch (e) {
        console.error("[Chat] Delete error:", e)
        return c.json({ error: "Failed to delete chat" }, 500)
    }
})

// Delete all chats for a user
chat.delete("/chats", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        console.log(`[Chat] Deleting all chats for user: ${userId}`)

        const result = await db.query(`
            DELETE chat WHERE user = $user;
        `, { user: `user:${userId}` });

        console.log(`[Chat] Deleted all chats for user: ${userId}`)
        return c.json({ success: true, deleted: result[0]?.length || 0 })
    } catch (e) {
        console.error("[Chat] Delete all error:", e)
        return c.json({ error: "Failed to delete chats" }, 500)
    }
})


// AI Routes
chat.post("/ai/spreadsheet-action", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const quota = await checkAiQuota(payload.sub);
        if (!quota.allowed) {
            return c.json(quota, 403);
        }

        const body = await c.req.json()
        const { request, spreadsheetData, model, isFollowUp, analysisResult } = body

        // Handle follow-up calculation requests from frontend
        if (isFollowUp && analysisResult) {
            console.log('Processing follow-up result...')

            let resultContext = ''
            const { type } = analysisResult

            if (type === 'analysis_result') {
                const { operation, result, headers } = analysisResult
                if (result.operation === 'maximum' || result.operation === 'minimum') {
                    resultContext = `The ${result.operation} value found is ${result.value}. 
The corresponding row data is: ${result.row.map((val, i) => `${headers[i]}: ${val}`).join(', ')}.`
                } else if (result.operation === 'average' || result.operation === 'sum' || result.operation === 'count') {
                    resultContext = `The calculated ${result.operation} is ${result.value}${result.count ? ` (based on ${result.count} values)` : ''}.`
                } else if (result.operation === 'group_by') {
                    resultContext = `Grouped analysis results:
${result.groups.map(g => `- ${g.group}: Count=${g.count}, Sum=${g.sum.toFixed(2)}, Average=${g.avg.toFixed(2)}`).join('\n')}`
                }
            } else if (type === 'summary_result') {
                const { summary, totalRows } = analysisResult
                resultContext = `Data summary for ${totalRows} rows:
${Object.entries(summary.metrics).map(([col, metrics]) => {
                    const colName = summary.ColumnHeaders[col]
                    return `Column ${colName}: ${Object.entries(metrics).map(([m, v]) => `${m}=${Number(v).toFixed(2)}`).join(', ')}`
                }).join('\n')}`
            } else if (type === 'chart_suggestion_result') {
                const { stats } = analysisResult
                resultContext = `Chart suitability analysis:
${stats.columns.map(c => `- ${c.header}: isNumeric=${c.isNumeric}, uniqueValues=${c.uniqueCount}`).join('\n')}`
            }

            const followUpPrompt = `You are a spreadsheet assistant. Based on the following calculation result from the spreadsheet, provide a clear, helpful response.
            
Calculation/Analysis Results:
${resultContext}

Note: The user might have asked for a summary, a specific calculation, or a chart suggestion. Provide the most helpful natural language response based on these actual statistics.`

            const response = await aiClient.generateContent([
                { role: 'user', content: followUpPrompt }
            ], { model })

            await logAiUsage(payload.sub, response.usage?.totalTokens || response.usage?.total_tokens, model, 'ai_analysis', 'distributed_follow_up')
            return c.json({ text: response.text })
        }

        // Import the spreadsheet tool service
        const { spreadsheetToolService } = await import('../services/SpreadsheetToolService.js')

        // Get spreadsheet-specific tools
        const tools = spreadsheetToolService.getSpreadsheetTools()

        // Build context for AI
        const { headers, sampleData, rowCount, colCount, isLargeDataset } = spreadsheetData
        const headerStr = headers.map((h, i) => `${colIndexToLabel(i)}: ${h}`).join(', ')
        const dataStr = sampleData.slice(0, 5).map((row, i) =>
            `Row ${i + 2}: ${row.join(' | ')}`
        ).join('\n')

        const samplingNote = isLargeDataset
            ? `\n\nNOTE: This dataset is large (${rowCount} rows). You are only seeing a sample of the first 100 rows to understand the structure. 
IMPORTANT: For any data analysis questions (like "highest value", "average", "count", etc.), use the 'analyze_data' tool. 
The system will automatically execute your specified calculation LOCALLY on all ${rowCount} rows to ensure 100% accurate results, even if you can't see all rows here.`
            : '';

        const systemPrompt = `You are an AI assistant for a spreadsheet editor. The user has a spreadsheet with the following data:

Headers: ${headerStr}
Sample Data (first 5 rows):
${dataStr}

Total Rows: ${rowCount}, Total Columns: ${colCount}${samplingNote}

You have access to tools to perform various spreadsheet operations. Analyze the user's request and call the appropriate tool(s).

IMPORTANT: 
- For data analysis questions (e.g., "which fund has the highest value?"), use the analyze_data tool. 
- You MUST specify the 'operation' (max, min, sum, average, count, etc.) and the 'column' index (0-based) for analysis.
- If a question involves a filter (e.g., "average return for Large Cap funds"), use the 'condition' parameter.
- For calculations that create a new column, use calculate_column.
- For formatting, use apply_conditional_formatting.`

        const response = await aiClient.generateContent([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: request }
        ], { tools, model })

        const usage = response.usage
        await logAiUsage(payload.sub, usage?.totalTokens || usage?.total_tokens, model, 'ai_spreadsheet', request)

        // Handle tool calls
        if (response.toolCalls && response.toolCalls.length > 0) {
            const toolResults = []

            for (const toolCall of response.toolCalls) {
                const toolName = toolCall.function.name
                const toolArgs = JSON.parse(toolCall.function.arguments)

                console.log(`[AI] Calling tool: ${toolName}`, toolArgs)

                let result = await spreadsheetToolService.callTool(toolName, toolArgs, {
                    spreadsheetData,
                    userId: payload.sub
                })

                // Special handling for process_with_ai - make a follow-up AI call
                if (result.type === 'ai_process_request') {
                    console.log(`[AI] Processing flexible AI request: ${result.task}`)

                    const processPrompt = `You are a data processing assistant. You have the following spreadsheet data:

Headers: ${result.headers.join(', ')}

Data (${result.rowCount} rows):
${result.data.map((row, i) => `${i + 1}. ${row.join(' | ')}`).join('\n')}

TASK: ${result.task}

${result.options && Object.keys(result.options).length > 0 ? `Options: ${JSON.stringify(result.options)}` : ''}

Please process the data according to the task. Return your response in ${result.outputFormat} format.
${result.outputFormat === 'table' ? 'Format tables as markdown with | separators.' : ''}
${result.outputFormat === 'json' ? 'Return valid JSON only.' : ''}

Be thorough and complete the task exactly as requested.`

                    const processResponse = await aiClient.generateContent([
                        { role: 'user', content: processPrompt }
                    ], { model })

                    // Log usage for this follow-up call
                    const processUsage = processResponse.usage
                    await logAiUsage(payload.sub, processUsage?.totalTokens || processUsage?.total_tokens, model, 'ai_process', result.task)

                    // Replace the result with the AI-processed output
                    result = {
                        type: 'ai_processed_result',
                        task: result.task,
                        outputFormat: result.outputFormat,
                        output: processResponse.text,
                        originalRowCount: result.rowCount
                    }
                }

                // Special handling for generate_table - AI generates new table data
                if (result.type === 'generate_table_request') {
                    console.log(`[AI] Generating new table: ${result.tableName} - ${result.description}`)

                    const generatePrompt = `You are a data generation assistant. Create a table of data based on the following request:

TABLE NAME: ${result.tableName}
DESCRIPTION: ${result.description}
NUMBER OF ROWS: ${result.rowCount || 10}
${result.columns ? `COLUMNS TO INCLUDE: ${result.columns.join(', ')}` : ''}

Generate realistic, diverse data. Return ONLY valid JSON in this exact format:
{
  "headers": ["Column1", "Column2", ...],
  "rows": [
    ["value1", "value2", ...],
    ["value1", "value2", ...],
    ...
  ]
}

Make the data realistic and varied. For names use diverse names. For numbers use realistic ranges. Be creative but realistic.`

                    const generateResponse = await aiClient.generateContent([
                        { role: 'user', content: generatePrompt }
                    ], { model, json: true })

                    // Log usage
                    const genUsage = generateResponse.usage
                    await logAiUsage(payload.sub, genUsage?.totalTokens || genUsage?.total_tokens, model, 'generate_table', result.description)

                    // Parse the generated data
                    let generatedData = null
                    try {
                        // Extract JSON from response (handle markdown code blocks)
                        let jsonStr = generateResponse.text
                        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
                        if (jsonMatch) {
                            jsonStr = jsonMatch[1].trim()
                        }
                        generatedData = JSON.parse(jsonStr)
                    } catch (e) {
                        console.error('[AI] Failed to parse generated table JSON:', e)
                        result = {
                            type: 'error',
                            message: 'Failed to generate table data. Please try again.'
                        }
                    }

                    if (generatedData) {
                        result = {
                            type: 'generated_table',
                            tableName: result.tableName,
                            headers: generatedData.headers || [],
                            rows: generatedData.rows || [],
                            openInNewTab: result.openInNewTab,
                            description: result.description
                        }
                    }
                }

                toolResults.push({
                    toolName,
                    result
                })
            }


            return c.json({
                toolCalls: toolResults,
                usage
            })
        }

        // If no tool calls, return the text response
        return c.json({
            text: response.text,
            usage
        })

    } catch (e) {
        console.error("AI Spreadsheet Action Error:", e)
        return c.json({ error: e.message }, 500)
    }
})


chat.post("/ai/analyze-formula-error", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const quota = await checkAiQuota(payload.sub);
        if (!quota.allowed) {
            return c.json(quota, 403);
        }

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

        const usage = response.usage
        await logAiUsage(payload.sub, usage?.totalTokens || usage?.total_tokens, model, 'ai_formula_debug', 'Debug Formula')

        return c.json(JSON.parse(response.text || response))
    } catch (e) {
        return c.json({ error: "Analysis failed" }, 500)
    }
})

chat.post("/ai/generate", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        let userId = payload.sub // Default to JWT sub

        // Resolve real user ID (handle Dev/Prod mismatch)
        const resolvedId = await upsertUser(payload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }

        const quota = await checkAiQuota(userId);
        if (!quota.allowed) {
            return c.json(quota, 403);
        }

        const { prompt, connectionId: rawConnId, context, activeTable, temperature, maxTokens } = await c.req.json()
        let connectionId = rawConnId;
        if (!connectionId.includes(':')) connectionId = `connection:${connectionId}`

        // Debug: Check Resolution
        console.log(`[Chat] JWT User ID: ${payload.sub}`)
        console.log(`[Chat] Resolved User ID: ${userId}`)
        console.log(`[Chat] Fetching connection: ${connectionId}`)
        if (temperature) console.log(`[Chat] Using temperature: ${temperature}`)
        if (maxTokens) console.log(`[Chat] Using maxTokens: ${maxTokens}`)

        // 1. Fetch connection details
        const [rs] = await db.query(
            "SELECT * FROM connection WHERE id = type::thing($id)",
            { id: connectionId }
        )
        const connRow = rs ? rs[0] : null

        if (connRow) {
            const ownerStr = connRow.user.toString();
            const allowedOwners = [`user:${userId}`, `user:${payload.sub}`, userId, payload.sub];

            if (!allowedOwners.includes(ownerStr)) {
                console.error(`[Chat] MISMATCH! Owner: ${ownerStr} vs Allowed: ${allowedOwners.join(', ')}`)
                return c.json({ error: "Connection not found" }, 404)
            }
        } else {
            return c.json({ error: "Connection not found" }, 404)
        }

        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config

        // Debug: Show connection structure
        console.log('[Chat] Connection type:', connRow.type, '| provider:', connRow.provider)

        // Get provider from connection.type (primary) OR connection.provider, or derive from config keys
        let provider = connRow.type || connRow.provider
        if (!provider && config) {
            // Derive provider from config keys (e.g., { mysql: {...} } -> 'mysql')
            const configKeys = Object.keys(config).filter(k =>
                ['mongodb', 'mysql', 'kusto', 'sqlite', 'postgres', 'surrealdb'].includes(k.toLowerCase())
            )
            if (configKeys.length > 0) {
                provider = configKeys[0]
                console.log(`[Chat] Derived provider from config: ${provider}`)
            }
        }

        const adapterConfig = config[provider] || config[provider?.toLowerCase()]

        // 2. Fetch Schema
        // Case-insensitive adapter lookup for robustness
        const providerLower = provider?.toLowerCase()
        const Adapter = adapters[provider] || adapters[providerLower]
        if (!Adapter) {
            console.error(`[Chat] Provider not supported: "${provider}" (lowercase: "${providerLower}"). Available adapters:`, Object.keys(adapters))
            return c.json({ error: `Provider not supported: ${provider}` }, 400)
        }

        const adapter = new Adapter(adapterConfig)

        let semanticContext = null;

        try {
            await adapter.connect()
            const allTables = await adapter.listCollections()
            // ... (Schema filtering logic would go here)
            // For now, take top 50
            schemaInfo = { tables: allTables.slice(0, 50), detailedSchema: {} }

            // LAZY LOADING: Only fetch schema for the active table immediately
            if (activeTable && typeof adapter.getOneTableSchema === 'function') {
                schemaInfo.detailedSchema[activeTable] = await adapter.getOneTableSchema(activeTable)
            } else if (allTables.length <= 3 && typeof adapter.getSchema === 'function') {
                // If there are very few tables, just fetch them all
                schemaInfo.detailedSchema = await adapter.getSchema()
            }

            // Fetch sample values for the active table (CRITICAL for accurate queries)
            if (activeTable) {
                try {
                    const sampleRows = await adapter.query(`SELECT * FROM ${activeTable} LIMIT 10`)
                    if (sampleRows && sampleRows.length > 0) {
                        const sampleValues = {}
                        sampleValues[activeTable] = {}

                        // Extract unique values for each column (up to 5 per column)
                        const columns = Object.keys(sampleRows[0])
                        columns.forEach(col => {
                            const uniqueVals = [...new Set(sampleRows.map(r => r[col]).filter(v => v != null))]
                            if (uniqueVals.length > 0 && uniqueVals.length <= 10) {
                                sampleValues[activeTable][col] = uniqueVals.slice(0, 5)
                            }
                        })

                        schemaInfo.sampleValues = sampleValues
                        console.log('[Chat] Fetched sample values:', JSON.stringify(sampleValues))
                    }
                } catch (e) {
                    console.warn('[Chat] Failed to fetch sample values:', e.message)
                }
            }

            // Debug: Log activeTable and schema info
            console.log(`[Chat] DEBUG - activeTable: "${activeTable}"`);
            console.log(`[Chat] DEBUG - schemaInfo.tables:`, schemaInfo.tables);
            console.log(`[Chat] DEBUG - includes check: ${schemaInfo.tables && schemaInfo.tables.includes(activeTable)}`);

            // On-the-fly Interpretation for Raw Tables (while adapter is still connected)
            if (activeTable && schemaInfo.tables && schemaInfo.tables.includes(activeTable)) {
                console.log(`[Chat] Checking for semantic metadata for ${activeTable}...`);
                try {
                    // Try to find metadata for this table
                    const [metaResult] = await db.query(
                        `SELECT * FROM sanitization_metadata WHERE original_table = $t OR original_table = $orig LIMIT 1`,
                        { t: activeTable, orig: `${activeTable}_original` }
                    );

                    if (metaResult && metaResult[0]) {
                        const meta = metaResult[0];
                        console.log(`[Chat] Found semantic metadata for ${activeTable}`);

                        // Find the version object for the active table
                        let versionObj = (meta.versions || []).find(v => v.table === activeTable);

                        // Fallback to latest version if not found specific match
                        if (!versionObj && meta.versions && meta.versions.length > 0) {
                            versionObj = meta.versions[meta.versions.length - 1];
                        }

                        if (versionObj && versionObj.semantic_context) {
                            semanticContext = versionObj.semantic_context;
                        }
                    } else {
                        // No metadata found - do on-the-fly interpretation using RAW FILE
                        console.log(`[Chat] No metadata found for ${activeTable}, attempting raw file interpretation...`);

                        // Extract upload ID from table name (format: data_{uuid}_{name})
                        const uuidMatch = activeTable.match(/^data_([a-f0-9-]+)_/);
                        if (uuidMatch) {
                            const uploadId = `uploads:${uuidMatch[1]}`;
                            console.log(`[Chat] Fetching raw file from ${uploadId}...`);

                            try {
                                // Fetch the upload record with raw file data
                                const [uploadResult] = await db.query(`SELECT file_data, filename, format FROM ${uploadId}`);
                                const upload = uploadResult && uploadResult[0];

                                if (upload && upload.file_data) {
                                    console.log(`[Chat] Found raw file: ${upload.filename} (${upload.format})`);

                                    // Decode base64 file data
                                    const fileBuffer = Buffer.from(upload.file_data, 'base64');

                                    // Parse the file to get original structure
                                    const { parseFile } = await import('../../utils/fileParser.js');
                                    const parsedData = await parseFile(fileBuffer, upload.filename);

                                    if (parsedData && parsedData.length > 0) {
                                        console.log(`[Chat] Parsed ${parsedData.length} rows from raw file`);

                                        // Interpret the raw data
                                        const interpretation = await interpretDataset(activeTable, parsedData.slice(0, 20));
                                        if (interpretation && interpretation.domain) {
                                            semanticContext = {
                                                domain: interpretation.domain,
                                                columns: interpretation.columns
                                            };
                                            console.log(`[Chat] Raw file interpretation successful: ${interpretation.domain.domain}`);

                                            // Async: Persist this metadata for future use
                                            (async () => {
                                                try {
                                                    const [exists] = await db.query(`SELECT id FROM sanitization_metadata WHERE original_table = $t LIMIT 1`, { t: activeTable });
                                                    if (!exists || exists.length === 0) {
                                                        await db.create('sanitization_metadata', {
                                                            original_table: activeTable,
                                                            logical_name: activeTable.replace(/^data_[^_]+_/, ''),
                                                            current_version: 0,
                                                            versions: [{
                                                                version: 0,
                                                                table: activeTable,
                                                                created_at: new Date(),
                                                                reason: 'On-the-fly Raw File Interpretation',
                                                                semantic_context: semanticContext
                                                            }]
                                                        });
                                                        console.log(`[Chat] Persisted raw file metadata for ${activeTable}`);
                                                    }
                                                } catch (err) {
                                                    console.warn(`[Chat] Failed to persist metadata:`, err);
                                                }
                                            })();
                                        }
                                    }
                                } else {
                                    console.warn(`[Chat] No raw file data found in ${uploadId}`);
                                }
                            } catch (err) {
                                console.warn(`[Chat] Raw file interpretation failed:`, err);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[Chat] Semantic context fetch/interpretation failed:`, e);
                }
            }

            // Perform RAG Search (Semantic Retrieval) - Only if experimental feature is enabled
            try {
                const userFlags = await getUserFeatureFlags(db, userId);
                const ragEnabled = userFlags.includes('rag-pipeline');

                if (ragEnabled) {
                    // Note: aiSettings not yet available here, use latest model for RAG
                    const ragResults = await RAGService.hybridSearch(prompt, userId, 5, 'gemini-3-flash-preview');
                    if (ragResults && ragResults.length > 0) {
                        semanticContext = semanticContext || {};
                        semanticContext.knowledgeBase = ragResults.map(r => ({
                            content: r.content,
                            source: r.metadata.source,
                            type: r.metadata.type,
                            tableName: r.metadata.table_name
                        }));
                        console.log(`[Chat] RAG found ${ragResults.length} relevant chunks`);
                    }
                } else {
                    console.log(`[Chat] RAG skipped - experimental feature not enabled for user`);
                }
            } catch (ragError) {
                console.warn("[Chat] RAG Search failed:", ragError.message);
            }

        } catch (e) {
            console.warn("Schema fetch failed", e)
        } finally {
            try { await adapter.disconnect() } catch (e) { }
        }


        const aiContext = {
            dialect: provider,
            schema: schemaInfo,
            previousContext: context,
            semanticContext,
            adapter
        }

        // Fetch user settings
        let aiSettings = { modelId: null, temperature: 0.7 }
        try {
            const [user] = await db.query(`SELECT settings FROM user:${userId}`);
            if (user && user[0] && user[0].settings) {
                const s = user[0].settings;
                aiSettings.modelId = s.activeModel
                aiSettings.temperature = s.temperature
            }
        } catch (e) {
            console.error('[Chat] Failed to fetch user settings:', e);
        }

        // Inject activeTable into settings for PromptBuilder
        aiSettings.activeTable = activeTable;

        // Override with request-specific settings if provided (takes precedence over DB/default)
        if (temperature !== undefined && temperature !== null) aiSettings.temperature = Number(temperature);
        if (maxTokens !== undefined && maxTokens !== null) aiSettings.maxTokens = Number(maxTokens);

        // ENABLE TOOLS (Lazy Load)
        const { spreadsheetToolService } = await import('../services/SpreadsheetToolService.js')
        aiSettings.tools = spreadsheetToolService.getSpreadsheetTools()

        const result = await aiClient.generateQuery(prompt, aiContext, aiSettings)

        let generatedQuery = typeof result === 'string' ? result : result.text
        const usage = typeof result === 'string' ? null : result.usage
        const toolCalls = typeof result === 'string' ? null : result.toolCalls

        // Handle Tool Calls (e.g. generate_table)
        if (toolCalls && toolCalls.length > 0) {
            const tableCall = toolCalls.find(tc => tc.function.name === 'generate_table')
            if (tableCall) {
                console.log('[Chat] Detected generate_table tool usage');
                try {
                    const args = typeof tableCall.function.arguments === 'string' ? JSON.parse(tableCall.function.arguments) : tableCall.function.arguments;

                    // Generate actual data using AI
                    const generatePrompt = `You are a data generation assistant. Create a table of data based on the following request:

TABLE NAME: ${args.tableName}
DESCRIPTION: ${args.description}
NUMBER OF ROWS: ${args.rowCount || 10}
${args.columns ? `COLUMNS: ${args.columns.join(', ')}` : ''}

Output the data as a JSON object with this exact structure:
{
  "tableName": "${args.tableName}",
  "headers": ["Col1", "Col2", ...],
  "rows": [
    ["Val1", "Val2", ...],
    ...
  ],
  "description": "Brief summary of what was generated"
}

IMPORTANT:
- Generate realistic, diverse data
- Ensure 'rows' is an array of arrays, matching the 'headers' order
- Return VALID JSON only. Do not wrap in markdown code blocks.
`;

                    console.log('[Chat] Generating table data...');
                    const dataResponse = await aiClient.generateContent([
                        { role: 'user', content: generatePrompt }
                    ], {
                        model: aiSettings.modelId,
                        json: true
                    });

                    let finalData;
                    try {
                        const cleaned = typeof dataResponse === 'string' ? dataResponse : (dataResponse.text || JSON.stringify(dataResponse));
                        finalData = JSON.parse(cleaned.replace(/```json|```/g, '').trim());
                    } catch (e) {
                        console.warn('[Chat] Failed to parse generated table data, attempting to use raw text if JSON-like', e);
                        // Try regex extraction if JSON parse failed
                        const jsonMatch = (typeof dataResponse === 'string' ? dataResponse : dataResponse.text).match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            finalData = JSON.parse(jsonMatch[0]);
                        } else {
                            throw e;
                        }
                    }

                    // Return immediately as a generated table response
                    return c.json({
                        type: 'generated_table',
                        tableName: finalData.tableName || args.tableName,
                        headers: finalData.headers,
                        rows: finalData.rows,
                        description: finalData.description,
                        openInNewTab: args.openInNewTab !== false,
                        usage: dataResponse.usage || usage
                    })

                } catch (e) {
                    console.error('[Chat] Failed to execute generate_table tool:', e);
                    // Fallback to text if tool fails
                }
            }
        }

        if (usage) {
            await logAiUsage(userId, usage.totalTokens || usage.total_tokens, aiSettings.modelId, 'ai_generation', prompt, connectionId)
        }


        chat.post("/ai/generate", async (c) => {
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)

            try {
                const payload = await verify(token, jwtSecret)
                let userId = payload.sub

                // Resolve real user ID
                const resolvedId = await upsertUser(payload)
                if (resolvedId) {
                    const parts = resolvedId.toString().split(':')
                    if (parts.length > 1) userId = parts[1]
                    else userId = resolvedId
                }

                const quota = await checkAiQuota(userId);
                if (!quota.allowed) {
                    return c.json(quota, 403);
                }

                const { prompt, connectionId: rawConnId, context, activeTable, temperature, maxTokens, adHocSchema } = await c.req.json()
                let connectionId = rawConnId || '';
                if (connectionId && !connectionId.includes(':')) connectionId = `connection:${connectionId}`

                // Connection Handling
                let connRow = null
                if (connectionId === 'connection:local') {
                    // Ad-hoc local connection
                    connRow = { type: 'local', provider: 'local', config: {}, is_virtual: true }
                } else {
                    // DB Lookup
                    const rs = await db.query(
                        "SELECT * FROM connection WHERE id = $id",
                        { id: connectionId }
                    )
                    connRow = rs && rs[0] && rs[0][0] ? rs[0][0] : null
                }

                if (!connRow) return c.json({ error: "Connection not found" }, 404)

                // Config & Provider
                const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config || {}
                let provider = connRow.type || connRow.provider
                if (!provider && config) {
                    const keys = Object.keys(config).filter(k => ['mongodb', 'mysql', 'kusto', 'sqlite', 'postgres', 'surrealdb'].includes(k.toLowerCase()))
                    if (keys.length > 0) provider = keys[0]
                }

                const adapterConfig = config[provider] || config[provider?.toLowerCase()]
                let schemaInfo = {}
                let adapter = null

                // Adapter & Schema
                if (provider === 'local' && connRow.is_virtual) {
                    if (adHocSchema) {
                        schemaInfo = { tables: [activeTable], detailedSchema: { [activeTable]: adHocSchema } };
                    } else {
                        // Fallback empty schema
                        schemaInfo = { tables: [], detailedSchema: {} }
                    }
                } else {
                    const Adapter = adapters[provider] || adapters[provider?.toLowerCase()]
                    if (!Adapter) return c.json({ error: `Provider not supported: ${provider}` }, 400)

                    adapter = new Adapter(adapterConfig)
                    await adapter.connect()

                    const allTables = await adapter.listCollections()
                    schemaInfo = { tables: allTables.slice(0, 50), detailedSchema: {} }

                    if (activeTable) {
                        try {
                            const cols = await adapter.getColumns ? await adapter.getColumns(activeTable) : []
                            schemaInfo.detailedSchema[activeTable] = cols
                        } catch (e) {
                            console.warn('[Chat] Failed to fetch schema', e)
                        }
                    }
                }

                // System Prompt
                const systemPrompt = `You are an expert SQL/SurrealQL assistant.
Your task is to generate valid queries for the "${provider}" database.

Schema Information:
${JSON.stringify(schemaInfo.detailedSchema && Object.keys(schemaInfo.detailedSchema).length > 0 ? schemaInfo.detailedSchema : schemaInfo.tables, null, 2)}

User Request: "${prompt}"

CRITICAL INSTRUCTIONS:
1. Always use backticks for table and column names that contain spaces or special characters (e.g., \`Fund Name\`). This is MANDATORY.
2. Return ONLY the raw SQL/SurrealQL query. Do not wrap in markdown.
3. If multiple steps are needed, return JSON with "steps".
`
                // Call AI
                // Resolve Settings/Tenancy (Optional, defaulting for restoration speed)
                const aiResponse = await aiClient.generateContent([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ], {
                    model: 'gemini-2.0-flash-exp', // Or fetch from user settings if critical
                    temperature: temperature || 0,
                    maxTokens: maxTokens || 1000
                })

                let generatedQuery = aiResponse.text
                const usage = aiResponse.usage

                // Log usage
                if (usage) {
                    await logAiUsage(userId, usage.totalTokens || usage.total_tokens, 'gemini-2.0-flash-exp', 'ai_generation', prompt, connectionId)
                }

                // Clean markdown code blocks
                // Clean markdown code blocks - Robust extraction (even with surrounding text)
                const codeBlockMatch = generatedQuery.match(/```(?:surrealql|sql|json|javascript)?\s*([\s\S]*?)\s*```/i);
                if (codeBlockMatch) {
                    generatedQuery = codeBlockMatch[1].trim();
                } else {
                    generatedQuery = generatedQuery.trim();
                }

                // Clean leading label if present (e.g. "surrealql\nSELECT...")
                if (generatedQuery.toLowerCase().startsWith('surrealql')) {
                    generatedQuery = generatedQuery.substring(9).trim()
                }





                // Handle Multi-Step Queries (JSON format)
                let multiStepResult = null;
                try {
                    console.log('[Chat] Raw AI response (first 500 chars):', generatedQuery.substring(0, 500));
                    console.log('[Chat] Raw AI response (last 500 chars):', generatedQuery.substring(Math.max(0, generatedQuery.length - 500)));

                    const jsonStart = generatedQuery.indexOf('{');
                    const jsonEnd = generatedQuery.lastIndexOf('}');
                    if (jsonStart !== -1 && jsonEnd !== -1) {
                        const potentialJson = generatedQuery.substring(jsonStart, jsonEnd + 1);
                        console.log('[Chat] Extracted JSON (length:', potentialJson.length, ')');
                        const parsed = JSON.parse(potentialJson);

                        console.log('[Chat] Parsed potential JSON from AI:', JSON.stringify(parsed, null, 2));

                        if (parsed.action === 'edit') {
                            console.log('[Chat] Detected edit action');
                            return c.json({
                                action: 'edit',
                                method: parsed.method,
                                reasoning: parsed.reasoning,
                                confirmation: parsed.confirmation,
                                example_formula: parsed.example_formula,
                                query: parsed.query,
                                usage
                            });
                        }

                        // Normalize 'steps' or 'queries'
                        const steps = parsed.steps || parsed.queries || [];

                        // Relaxed check: Accept if 'multi_step' is true OR if 'steps' array is present
                        if ((parsed.multi_step || steps.length > 0) && Array.isArray(steps)) {
                            multiStepResult = [];
                            let previousStepResults = {}; // Store results from previous steps

                            for (let i = 0; i < steps.length; i++) {
                                const step = steps[i];
                                // Support both { query: "..." } and string "..." steps
                                let stepQuery = (typeof step === 'string' ? step : step.query) || '';
                                stepQuery = stepQuery.replace(/;\s*$/, ''); // Remove semi-colon
                                // stepQuery = stepQuery.replace(/[")}\]]+$/, ''); // Remove trailing junk - DISABLED: was removing valid SQL parens
                                stepQuery = stepQuery.trim();

                                console.log(`[Chat] Step ${i + 1} cleaned query:`, stepQuery);

                                if (!stepQuery) continue;

                                // Replace placeholders with actual values from previous steps
                                // Look for patterns like [AVERAGE_SALARY_FROM_PREVIOUS_STEP], [RESULT_FROM_STEP_1], etc.
                                stepQuery = stepQuery.replace(/\[([^\]]+)\]/g, (match, placeholder) => {
                                    // Try to find the value from previous step
                                    if (i > 0 && multiStepResult[i - 1]?.result) {
                                        const prevResult = multiStepResult[i - 1].result;

                                        // If previous result is a scalar (number)
                                        if (typeof prevResult === 'number') {
                                            return prevResult;
                                        }

                                        // If previous result has a 'rows' property (from RETURN statement)
                                        if (prevResult.rows !== undefined) {
                                            return prevResult.rows;
                                        }

                                        // If previous result is an array with one item
                                        if (Array.isArray(prevResult) && prevResult.length === 1) {
                                            return prevResult[0];
                                        }
                                    }

                                    // If no substitution found, log warning and keep placeholder
                                    console.warn(`[Chat] Could not substitute placeholder: ${match}`);
                                    return match;
                                });

                                try {
                                    // Execute each step
                                    console.log(`[Chat] Executing step ${i + 1}: ${stepQuery}`);
                                    const stepRes = await adapter.query(stepQuery);
                                    multiStepResult.push({
                                        explanation: step.explanation,
                                        query: stepQuery,
                                        result: stepRes,
                                        visualizable: step.visualizable || false,
                                        chart_type: step.chart_type || null
                                    });
                                } catch (err) {
                                    console.error(`[Chat] Step ${i + 1} execution failed: ${err.message}`);
                                    multiStepResult.push({
                                        explanation: step.explanation,
                                        error: err.message
                                    });
                                }
                            }

                            // Return aggregated results
                            return c.json({
                                multi_step: true,
                                steps: multiStepResult,
                                usage
                            });
                        }
                    }
                } catch (e) {
                    console.log('[Chat] JSON parse attempt failed:', e.message);
                    // Not valid JSON, continue as single query
                }

                // Safety Check: If we are here, we are treating it as a single SQL query.
                // If the query still looks like a JSON object (starts with {), it's likely a failed parse or unhandled JSON.
                // We should try to extract SQL from it or fail gracefully rather than sending JSON to DB.
                if (generatedQuery.trim().startsWith('{') && generatedQuery.trim().endsWith('}')) {
                    console.warn('[Chat] AI returned JSON but not handled as multi-step. Raw:', generatedQuery);
                    try {
                        const p = JSON.parse(generatedQuery);
                        if (p.query) {
                            generatedQuery = p.query;
                        } else if (p.ambiguous) {
                            // Return the ambiguity object directly to the frontend for handling
                            return c.json(p);
                        } else if (p.choices) {
                            // Fallback if ambiguous flag is missing but structure looks like one
                            return c.json({ ambiguous: true, ...p });
                        } else if (provider === 'mongodb' && (p.collection || p.filter || p.pipeline)) {
                            // MongoDB query - the entire JSON IS the query
                            // Return it directly - frontend will pass this to /query endpoint
                            console.log('[Chat] Detected MongoDB query structure, returning as-is');
                            return c.json({
                                query: JSON.stringify(p),
                                usage,
                                reasoning: p.reasoning || null
                            });
                        }
                    } catch (e) { }
                }


                // Standard Single Query Logic...
                // Extract only the SQL statement if AI added explanatory text
                // Look for SELECT, INSERT, UPDATE, DELETE, CREATE statements
                // Improvement: Stop at the first "Results:", "Explanation:" or similar headers if they appear at start of a line
                // FIX: strict CTE check for 'WITH' to avoid matching English sentences starting with 'With'
                const sqlStartMatch = generatedQuery.match(/(?:^|\n)\s*(?:(SELECT|INSERT|UPDATE|DELETE|CREATE|RELATE|RETURN)|(WITH\s+[a-zA-Z0-9_]+\s+AS))\s+/i)


                if (sqlStartMatch) {
                    const startIndex = sqlStartMatch.index
                    let possibleQuery = generatedQuery.substring(startIndex)

                    // Cut off at "Results:" or "Output:" if present on a new line
                    const cutoffMatch = possibleQuery.match(/\n\s*(Results|Output|Explanation|Analysis|Row \d):/i)
                    if (cutoffMatch) {
                        possibleQuery = possibleQuery.substring(0, cutoffMatch.index)
                    }

                    generatedQuery = possibleQuery.trim()
                } else if (provider && ['surrealdb', 'mysql', 'postgres', 'sqlite'].includes(provider.toLowerCase())) {
                    const trimmed = generatedQuery.trim();
                    let isSafe = false;

                    if (trimmed.startsWith('{')) {
                        // Check if it's valid JSON (SurrealDB accepts objects)
                        try {
                            JSON.parse(trimmed);
                            isSafe = true;
                        } catch (e) {
                            console.warn('[Chat] Malformed JSON detected, commenting out.');
                        }
                    }

                    if (!isSafe) {
                        // Safety: If no SQL start detected and not valid JSON, it's likely text or malformed.
                        console.warn('[Chat] No executable SQL/JSON detected in response, commenting out to prevent crash.');
                        generatedQuery = "/* AI Response (Not executable): " + generatedQuery.replace(/\*\//g, '* /') + " */";
                    }
                }


                // Remove trailing semicolon if present (SurrealDB doesn't require it in queries)
                generatedQuery = generatedQuery.replace(/;\s*$/, '').trim()

                return c.json({ query: generatedQuery, usage })
            } catch (error) {
                console.error("AI Generation Error:", error)
                return c.json({ error: error.message }, 500)
            }
        })

        chat.post("/ai/recommend-visualization", async (c) => {
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)
            try {
                const { query, results, previousConfig, suggestedChartType } = await c.req.json()
                const payload = await verify(token, jwtSecret)
                const userId = payload.sub

                // Get Model
                let activeModel = null
                try {
                    const [user] = await db.query(`SELECT settings FROM user:${userId}`);
                    if (user && user[0] && user[0].settings) {
                        activeModel = user[0].settings.activeModel;
                    }
                } catch (e) { }

                const recommendation = await aiClient.recommendVisualization(query, results, previousConfig, activeModel, suggestedChartType)
                return c.json(recommendation)
            } catch (e) {
                return c.json({ error: e.message }, 500)
            }
        })

        chat.post("/ai/analyze", async (c) => {
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)
            try {
                const { question, results, query } = await c.req.json()
                console.log('[AI Analyze] Request received:', {
                    question,
                    resultsCount: Array.isArray(results) ? results.length : 'not array',
                    queryLength: query?.length
                })

                const payload = await verify(token, jwtSecret)
                const userId = payload.sub

                let activeModel = null
                try {
                    const [user] = await db.query(`SELECT settings FROM user:${userId}`);
                    if (user && user[0] && user[0].settings) {
                        activeModel = user[0].settings.activeModel;
                    }
                } catch (e) { }

                console.log('[AI Analyze] Calling aiClient.analyzeResults...')
                const analysisResult = await aiClient.analyzeResults(question, results, query, activeModel)
                // Check if analysisResult is object with text/usage or string (backwards compat)
                const analysis = typeof analysisResult === 'object' && analysisResult.text ? analysisResult.text : analysisResult
                const usage = typeof analysisResult === 'object' ? analysisResult.usage : null

                if (usage) {
                    await logAiUsage(userId, usage.totalTokens || usage.total_tokens, activeModel, 'ai_analyze', question)
                }

                console.log('[AI Analyze] Analysis received (type:', typeof analysis, ', length:', analysis?.length, ')')

                // Parse the AI response - it might be JSON with a "summary" field
                let summaryText = analysis
                try {
                    const parsed = JSON.parse(analysis)

                    // Check if it's a chart configuration
                    if (parsed.chart_type) {
                        // Inject metadata for dashboard usage
                        parsed.query = query
                        parsed.description = question
                        if (!parsed.title) {
                            parsed.title = question.length > 50 ? question.substring(0, 47) + '...' : question
                        }
                        // Return stringified JSON with injected metadata
                        summaryText = JSON.stringify(parsed)
                        console.log('[AI Analyze] Detected chart response, injected metadata')
                    }
                    // Check for enhanced content (answer + prediction/action)
                    else if (parsed.answer && (parsed.prediction || parsed.action)) {
                        summaryText = JSON.stringify(parsed)
                        console.log('[AI Analyze] Preserving structured response (contains prediction or action)')
                    }
                    // Check for simple field extraction
                    else if (parsed.answer) {
                        summaryText = parsed.answer
                        console.log('[AI Analyze] Extracted answer from JSON response')
                    } else if (parsed.summary) {
                        summaryText = parsed.summary
                        console.log('[AI Analyze] Extracted summary from JSON response')
                    }
                } catch (e) {
                    // Not JSON, use as-is
                    console.log('[AI Analyze] Using response as plain text')
                }

                console.log('[AI Analyze] Final summary:', summaryText?.substring ? summaryText.substring(0, 200) : summaryText)
                return c.json({ analysis: summaryText })
            } catch (e) {
                console.error('[AI Analyze] Error:', e)
                return c.json({ error: e.message }, 500)
            }
        })

        chat.post("/ai/spreadsheet-command", async (c) => {
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)
            try {
                const { command, data } = await c.req.json()
                const payload = await verify(token, jwtSecret)
                const userId = payload.sub

                let activeModel = null
                try {
                    const [user] = await db.query(`SELECT settings FROM user:${userId}`);
                    if (user && user[0] && user[0].settings) {
                        activeModel = user[0].settings.activeModel;
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
            const token = getAuthToken(c)
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
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)
            try {
                const payload = await verify(token, jwtSecret)

                // Get user's subscription tier
                const [userData] = await db.query(`SELECT subscription_tier FROM type::thing('user', $userId)`, { userId: payload.sub })
                const tier = userData?.[0]?.subscription_tier || 'free'

                // Get all models and filter by tier
                const allModels = await aiClient.listModels()
                const filteredModels = filterModelsByTier(allModels, tier)

                return c.json({ models: filteredModels, tier })
            } catch (e) {
                return c.json({ error: "Failed to list models" }, 500)
            }
        })

        chat.post("/ai/dashboard-query", async (c) => {
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)

            try {
                const payload = await verify(token, jwtSecret)
                const userId = payload.sub
                const { query, dashboardTitle, elements } = await c.req.json()

                // Resolve real user ID (handle Dev/Prod mismatch)
                const resolvedId = await upsertUser(payload)
                let resolvedUserId = userId
                if (resolvedId) {
                    const parts = resolvedId.toString().split(':')
                    if (parts.length > 1) resolvedUserId = parts[1]
                    else resolvedUserId = resolvedId
                }

                const quota = await checkAiQuota(resolvedUserId);
                if (!quota.allowed) {
                    return c.json(quota, 403);
                }

                let activeModel = null
                try {
                    const [user] = await db.query(`SELECT settings FROM user:${userId}`);
                    if (user && user[0] && user[0].settings) {
                        activeModel = user[0].settings.activeModel;
                    }
                } catch (e) { }

                // Construct a summary of the data
                const dataSummary = (elements || []).map(el => {
                    const resultSummary = Array.isArray(el.results)
                        ? `Array of ${el.results.length} rows. Sample: ${JSON.stringify(el.results.slice(0, 2))}`
                        : JSON.stringify(el.results || el.config || {});
                    return `Element: ${el.title} (Type: ${el.type})\nData: ${resultSummary}`;
                }).join('\n\n');

                const prompt = `
You are Pegasus, an AI assistant for the Pegasus Data Platform.
You are helping the user with their dashboard titled "${dashboardTitle}".

Dashboard Data Content:
${dataSummary}

User Question: ${query}

Instructions:
1. Be concise and professional.
2. Answer based on the provided dashboard data if possible.
3. If the user asks for something outside the dashboard data, explain you don't have that context but suggest how they could add a connection to get it.
4. If they ask about platform features, help them.
`;

                const response = await aiClient.generateText(prompt, activeModel)
                const analysisText = response.text || response
                const usage = response.usage

                if (usage) {
                    await logAiUsage(userId, usage.totalTokens || usage.total_tokens, activeModel || 'gemini', 'dashboard_chat', query)
                }

                return c.json({ response: analysisText })
            } catch (e) {
                console.error("[Chat] Dashboard query failed:", e)
                return c.json({ error: e.message || "Failed to process query" }, 500)
            }
        })

        chat.post("/ai/analyze-dashboard", async (c) => {
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)

            try {
                const payload = await verify(token, jwtSecret)
                const userId = payload.sub
                const { dashboardTitle, elements } = await c.req.json()

                let activeModel = null
                try {
                    const [user] = await db.query(`SELECT settings FROM user:${userId}`);
                    if (user && user[0] && user[0].settings) {
                        activeModel = user[0].settings.activeModel;
                    }
                } catch (e) { }

                // Construct a summary of the data
                const dataSummary = elements.map(el => {
                    const resultSummary = Array.isArray(el.results)
                        ? `Array of ${el.results.length} rows. Sample: ${JSON.stringify(el.results.slice(0, 2))}`
                        : JSON.stringify(el.results);
                    return `Element: ${el.title} (Type: ${el.type})\nData: ${resultSummary}`;
                }).join('\n\n');

                const prompt = `
You are a senior data analyst. You are analyzing a dashboard titled "${dashboardTitle}".
Below is a summary of the data from various dashboard elements:

${dataSummary}

Based on this data, provide a concise (2-3 paragraphs) summary of the key insights, trends, and any anomalies you detect. 
Focus on crossing references between different elements if applicable.
Keep the tone professional and helpful.
`;

                const response = await aiClient.generateText(prompt, activeModel)
                // With AIClient update, response is now { text, usage }
                const analysisText = response.text || response
                const usage = response.usage

                if (usage) {
                    await logAiUsage(payload.sub, usage.totalTokens || usage.total_tokens, activeModel || 'openai', 'ai_dashboard_summary', dashboardTitle)
                }

                return c.json({ analysis: analysisText })
            } catch (e) {
                console.error("[Chat] Analyze dashboard failed:", e)
                return c.json({ error: e.message || "Failed to analyze dashboard" }, 500)
            }
        })

        chat.post("/ai/search", async (c) => {
            const token = getAuthToken(c)
            if (!token) return c.json({ error: "Unauthorized" }, 401)
            try {
                const { query } = await c.req.json()
                const payload = await verify(token, jwtSecret)
                const userId = payload.sub

                let activeModel = null
                try {
                    const [user] = await db.query(`SELECT settings FROM user:${userId}`);
                    if (user && user[0] && user[0].settings) {
                        activeModel = user[0].settings.activeModel;
                    }
                } catch (e) { }

                const response = await aiClient.generateText(query, activeModel)
                return c.json({ result: response })
            } catch (e) {
                return c.json({ error: e.message }, 500)
            }
        })

        export { chat as chatRoutes }
