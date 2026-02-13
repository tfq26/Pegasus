import { GoogleGenerativeAI } from "@google/generative-ai"
import { AIProvider } from "./AIProvider.js"

export class GeminiProvider extends AIProvider {
    constructor(config) {
        super(config)
        this.genAI = new GoogleGenerativeAI(config.apiKey)
        // We don't initialize this.model here because systemInstruction changes per request
    }

    async generateContent(messages, options = {}) {
        let systemInstruction = undefined
        let history = []
        let lastUserMessage = ''

        // Extract system instruction
        const systemMsg = messages.find(m => m.role === 'system')
        if (systemMsg) {
            systemInstruction = systemMsg.content
        }

        // Filter out system message to get chat messages
        const chatMessages = messages.filter(m => m.role !== 'system')

        if (chatMessages.length > 0) {
            lastUserMessage = chatMessages[chatMessages.length - 1].content

            // Previous messages form the history
            const previousMessages = chatMessages.slice(0, -1)
            let rawHistory = previousMessages.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))

            // Gemini requirement: History MUST start with 'user'
            let firstUserIndex = rawHistory.findIndex(m => m.role === 'user');
            if (firstUserIndex === -1) {
                history = [];
            } else {
                // Slice from first user message
                let filtered = rawHistory.slice(firstUserIndex);

                // Gemini requirement: Roles MUST alternate
                const alternating = [];
                let lastRole = null;
                for (const msg of filtered) {
                    if (msg.role !== lastRole) {
                        alternating.push(msg);
                        lastRole = msg.role;
                    }
                }

                // Gemini requirement: If using sendMessage(), history should end with 'model'
                // so that the new message can be 'user'.
                if (alternating.length > 0 && alternating[alternating.length - 1].role === 'user') {
                    alternating.pop();
                }

                history = alternating;
            }
        }

        const generationConfig = {
            maxOutputTokens: options.maxTokens || 4000,
            temperature: options.temperature ?? undefined
        }
        if (options.json) {
            generationConfig.responseMimeType = "application/json"
        }

        let tools = undefined
        if (options.tools) {
            tools = [{
                functionDeclarations: options.tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }))
            }]
        }

        let toolConfig = undefined
        if (options.toolChoice && tools) {
            // Find the tool to verify it exists (optional but good for safety)
            const targetTool = tools[0].functionDeclarations.find(t => t.name === options.toolChoice)
            if (targetTool) {
                toolConfig = {
                    functionCallingConfig: {
                        mode: "ANY",
                        allowedFunctionNames: [options.toolChoice]
                    }
                }
            }
        }

        // Initialize model with specific system instruction for this request
        const modelId = options.model || this.config.model || "gemini-3-flash-preview"
        const model = this.genAI.getGenerativeModel({
            model: modelId,
            systemInstruction: systemInstruction,
            tools: tools,
            toolConfig: toolConfig
        })

        try {
            if (history.length > 0) {
                const chat = model.startChat({
                    history,
                    generationConfig,
                })
                const result = await chat.sendMessage(lastUserMessage)
                const response = result.response

                // Debug logging
                console.log('[Gemini] Response candidates:', response.candidates?.length || 0);
                if (response.candidates?.[0]) {
                    console.log('[Gemini] Finish reason:', response.candidates[0].finishReason);
                    console.log('[Gemini] Safety ratings:', response.candidates[0].safetyRatings);
                }

                let text = '';
                try {
                    text = response.text();
                } catch (textError) {
                    console.warn('[Gemini] No text in response:', textError.message);
                    // This is OK if there are function calls
                }
                const usage = response.usageMetadata

                const functionCalls = response.candidates?.[0]?.content?.parts
                    ?.filter(p => p.functionCall)
                    ?.map(p => ({
                        id: `call_${crypto.randomUUID().replace(/-/g, '')}`,
                        function: {
                            name: p.functionCall.name,
                            arguments: JSON.stringify(p.functionCall.args)
                        }
                    }));

                return {
                    text,
                    toolCalls: functionCalls,
                    usage: {
                        promptTokens: usage?.promptTokenCount || 0,
                        candidatesTokens: usage?.candidatesTokenCount || 0,
                        totalTokens: usage?.totalTokenCount || 0
                    }
                }
            } else {
                // Single turn (or just prompt without history)
                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: lastUserMessage }] }],
                    generationConfig
                })
                const response = result.response

                // Debug logging
                console.log('[Gemini] Response candidates:', response.candidates?.length || 0);
                if (response.candidates?.[0]) {
                    console.log('[Gemini] Finish reason:', response.candidates[0].finishReason);
                    console.log('[Gemini] Safety ratings:', response.candidates[0].safetyRatings);
                }

                let text = '';
                try {
                    text = response.text();
                } catch (textError) {
                    console.warn('[Gemini] No text in response:', textError.message);
                    // This is OK if there are function calls
                }
                const usage = response.usageMetadata

                const functionCalls = response.candidates?.[0]?.content?.parts
                    ?.filter(p => p.functionCall)
                    ?.map(p => ({
                        id: `call_${crypto.randomUUID().replace(/-/g, '')}`,
                        function: {
                            name: p.functionCall.name,
                            arguments: JSON.stringify(p.functionCall.args)
                        }
                    }));

                return {
                    text,
                    toolCalls: functionCalls,
                    usage: {
                        promptTokens: usage?.promptTokenCount || 0,
                        candidatesTokens: usage?.candidatesTokenCount || 0,
                        totalTokens: usage?.totalTokenCount || 0
                    }
                }
            }
        } catch (e) {
            console.error("Gemini API Error:", e)
            throw e
        }
    }

    async listModels() {
        // The specific models we want to support
        const supportedModels = [
            'gemini-3-pro-preview',
            'gemini-3-flash-preview',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'deep-research-pro-preview-12-2025',
            'gemini-exp-1206'
        ];

        let apiModelsMap = new Map();

        try {
            // Try to fetch dynamic list to get up-to-date metadata
            const apiKey = this.config.apiKey;
            if (apiKey) {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.models) {
                        data.models.forEach(m => {
                            const id = m.name.replace('models/', '');
                            apiModelsMap.set(id, {
                                id: id,
                                name: m.displayName,
                                description: m.description,
                                contextWindow: m.inputTokenLimit
                            });
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("[Gemini] Failed to fetch dynamic model list, using fallback:", e.message);
        }

        // Return ALL supported models, using API data if available, otherwise defaults
        return supportedModels.map(id => {
            const apiData = apiModelsMap.get(id);

            // Default Display Names
            let name = id;
            if (id === 'gemini-3-flash-preview') name = 'Gemini 3.0 Flash Preview';
            else if (id === 'gemini-3-pro-preview') name = 'Gemini 3.0 Pro Preview';

            return {
                id: id,
                name: apiData?.name || name,
                provider: 'gemini',
                description: apiData?.description || 'Google Generative AI model',
                contextWindow: apiData?.contextWindow || (id.includes('3') ? 1048576 : 1048576)
            };
        });
    }

    async embed(text, options = {}) {
        const modelId = options.model || "text-embedding-004"
        const model = this.genAI.getGenerativeModel({ model: modelId })

        try {
            if (Array.isArray(text)) {
                const result = await model.batchEmbedContents({
                    requests: text.map(t => ({ content: { role: 'user', parts: [{ text: t }] } }))
                });
                return result.embeddings.map(e => e.values);
            } else {
                const result = await model.embedContent(text)
                return result.embedding.values
            }
        } catch (e) {
            if (e.message.includes('404') || e.message.includes('not found')) {
                console.warn(`[Gemini] Embedding model '${modelId}' not found or not accessible. RAG will be disabled for this request.`)
                return null
            }
            console.error("[Gemini] Embedding failed:", e)
            throw e
        }
    }
}
