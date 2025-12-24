import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { aiClient } from "../../ai/AIClient.js"
import { interpretDataset } from "../../ai/sanitizer.js"
import { adapters } from "../../adapters/index.js"
import { analyzeForSanitization } from "../../ai/sanitizer.js"

const chat = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

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
        const [userRecord] = await db.query(`SELECT subscription_tier FROM user:${userId}`);
        const tier = userRecord[0]?.subscription_tier || 'free';

        // Set limits: 900k for Pro, 100k for Free
        const limit = tier === 'pro' ? 900000 : 100000;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [usageResult] = await db.query(`
            SELECT math::sum(tokens_used) as total FROM query_history 
            WHERE user = $user AND created_at >= $start
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

// Helper to get token from cookie or header
const getAuthToken = (c) => {
    // Try cookie first
    let token = getCookie(c, "session")
    // Fallback to Authorization header
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }
    return token
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
chat.post("/ai/generate-formula", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const quota = await checkAiQuota(payload.sub);
        if (!quota.allowed) {
            return c.json(quota, 403);
        }

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

        return c.json(JSON.parse(response))
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

        const { prompt, connectionId: rawConnId, context, activeTable } = await c.req.json()
        let connectionId = rawConnId;
        if (!connectionId.includes(':')) connectionId = `connection:${connectionId}`

        // Debug: Check Resolution
        console.log(`[Chat] JWT User ID: ${payload.sub}`)
        console.log(`[Chat] Resolved User ID: ${userId}`)
        console.log(`[Chat] Fetching connection: ${connectionId}`)

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

        let semanticContext = null;

        try {
            await adapter.connect()
            const allTables = await adapter.listCollections()
            // ... (Schema filtering logic would go here)
            // For now, take top 50
            schemaInfo = { tables: allTables.slice(0, 50) }
            if (typeof adapter.getSchema === 'function') {
                schemaInfo.detailedSchema = await adapter.getSchema() // simple approach
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

        } catch (e) {
            console.warn("Schema fetch failed", e)
        } finally {
            try { await adapter.disconnect() } catch (e) { }
        }


        const aiContext = {
            dialect: provider,
            schema: schemaInfo,
            previousContext: context,
            semanticContext
        }

        // Fetch user settings
        let aiSettings = { modelId: null, temperature: 0.7 }
        try {
            const [settingsRes] = await db.query(
                "SELECT settings FROM user_settings WHERE user_id = $userId",
                { userId }
            )
            if (settingsRes && settingsRes.length > 0 && settingsRes[0].settings) {
                const s = JSON.parse(settingsRes[0].settings)
                aiSettings.modelId = s.activeModel
                aiSettings.temperature = s.temperature
            }
        } catch (e) { }

        const result = await aiClient.generateQuery(prompt, aiContext, aiSettings)
        let generatedQuery = typeof result === 'string' ? result : result.text
        const usage = typeof result === 'string' ? null : result.usage

        // Clean markdown code blocks
        generatedQuery = generatedQuery.replace(/^```(?:surrealql|sql)?\s*([\s\S]*?)\s*```$/i, '$1').trim()
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
        const sqlStartMatch = generatedQuery.match(/(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH)\s+/i)


        if (sqlStartMatch) {
            const startIndex = sqlStartMatch.index
            let possibleQuery = generatedQuery.substring(startIndex)

            // Cut off at "Results:" or "Output:" if present on a new line
            const cutoffMatch = possibleQuery.match(/\n\s*(Results|Output|Explanation|Analysis|Row \d):/i)
            if (cutoffMatch) {
                possibleQuery = possibleQuery.substring(0, cutoffMatch.index)
            }

            generatedQuery = possibleQuery.trim()
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
            const [settingsRes] = await db.query(
                "SELECT settings FROM user_settings WHERE user_id = $userId",
                { userId }
            )
            if (settingsRes && settingsRes.length > 0 && settingsRes[0].settings) {
                activeModel = JSON.parse(settingsRes[0].settings).activeModel
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
            const [settingsRes] = await db.query(
                "SELECT settings FROM user_settings WHERE user_id = $userId",
                { userId }
            )
            if (settingsRes && settingsRes.length > 0 && settingsRes[0].settings) {
                activeModel = JSON.parse(settingsRes[0].settings).activeModel
            }
        } catch (e) { }

        console.log('[AI Analyze] Calling aiClient.analyzeResults...')
        const analysis = await aiClient.analyzeResults(question, results, query, activeModel)
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
        const models = await aiClient.listModels()
        return c.json({ models })
    } catch (e) {
        return c.json({ error: "Failed to list models" }, 500)
    }
})

chat.post("/ai/analyze-dashboard", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { dashboardTitle, elements } = await c.req.json()

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

        const response = await aiClient.generateText(prompt, null)
        return c.json({ analysis: response })
    } catch (e) {
        console.error("[Chat] Analyze dashboard failed:", e)
        return c.json({ error: e.message || "Failed to analyze dashboard" }, 500)
    }
})

chat.post("/ai/search", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { query } = await c.req.json()
        await verify(token, jwtSecret)
        const response = await aiClient.generateText(query, null)
        return c.json({ result: response })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

export { chat as chatRoutes }
