import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { aiClient } from "../../ai/AIClient.js"
import { toolService } from "../services/ToolService.js"
import { getUserFeatureFlags } from "../../experimental-features.js"

const agent = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Helper to get token from cookie or header
const getAuthToken = (c) => {
    let token = getCookie(c, "session")
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }
    return token
}

/**
 * Agentic Chat with Tool Calling
 * This is an experimental feature for real-time inference.
 */
agent.post("/chat", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const { messages, modelId } = await c.req.json()

        // 1. Check if user has the real-time-tools feature enabled
        const userFlags = await getUserFeatureFlags(db, userId)
        if (!userFlags.includes('real-time-tools')) {
            return c.json({
                error: "Experimental feature required",
                message: "Please enable 'Real-time API Tools' in your experimental settings to use the Agentic mode."
            }, 403)
        }

        // 2. Prepare Tool Definitions
        const tools = toolService.getToolDefinitions()

        // 3. First AI Turn: Check for tool calls
        let response = await aiClient.generateContent(messages, {
            model: modelId || 'gpt-4o',
            tools: tools
        })

        // 4. Handle Tool Calls Loop (supports multiple sequential calls)
        let toolCallCount = 0;
        const MAX_TOOL_CALLS = 5;
        const conversationHistory = [...messages];

        while (response.toolCalls && response.toolCalls.length > 0 && toolCallCount < MAX_TOOL_CALLS) {
            toolCallCount++;

            // Add the assistant's tool call message to history
            conversationHistory.push({
                role: 'assistant',
                content: response.text || '',
                tool_calls: response.toolCalls
            });

            // Execute each tool call
            for (const toolCall of response.toolCalls) {
                const name = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);

                try {
                    const result = await toolService.callTool(name, args);

                    // Add tool result to history
                    conversationHistory.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: name,
                        content: JSON.stringify(result)
                    });
                } catch (toolError) {
                    conversationHistory.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: name,
                        content: JSON.stringify({ error: toolError.message })
                    });
                }
            }

            // Get next AI turn with tool results
            response = await aiClient.generateContent(conversationHistory, {
                model: modelId || 'gpt-4o',
                tools: tools
            });
        }

        return c.json({
            text: response.text,
            usage: response.usage
        })

    } catch (e) {
        console.error("[Agent] Chat failed:", e)
        return c.json({ error: e.message }, 500)
    }
})

/**
 * Register a custom tool for the user
 */
agent.post("/tools/custom", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const config = await c.req.json()

        const result = await toolService.registerCustomTool(userId, config)
        return c.json({ success: true, ...result })
    } catch (e) {
        return c.json({ error: e.message }, 400)
    }
})

export { agent as agentRoutes }
