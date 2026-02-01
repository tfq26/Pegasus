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
            history = previousMessages.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))
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

        // Initialize model with specific system instruction for this request
        const modelId = options.model || this.config.model || "gemini-3-pro"
        const model = this.genAI.getGenerativeModel({
            model: modelId,
            systemInstruction: systemInstruction,
            tools: tools
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
            'gemini-2.5-flash-lite',
            'gemini-3-flash-preview',
            'gemini-3-pro-preview'
        ];

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
                        const mapped = data.models
                            .map(m => {
                                const id = m.name.replace('models/', '');
                                return {
                                    id: id,
                                    name: m.displayName,
                                    provider: 'gemini',
                                    description: m.description,
                                    contextWindow: m.inputTokenLimit
                                }
                            })
                            // STRICTLY filter for only the models we want
                            .filter(m => supportedModels.includes(m.id))
                            .sort((a, b) => {
                                // Sort order: 2.5 Pro, 2.5 Flash, 3 Pro, 3 Flash
                                return supportedModels.indexOf(a.id) - supportedModels.indexOf(b.id);
                            });

                        // Only return if we found matches
                        if (mapped.length > 0) return mapped;
                    }
                }
            }
        } catch (e) {
            console.warn("[Gemini] Failed to fetch dynamic model list, using fallback:", e.message);
        }

        // Fallback hardcoded list matching exactly what was requested
        return supportedModels.map(id => ({
            id: id,
            name: id === 'gemini-2.5-flash-lite' ? 'Gemini 2.5 Flash Lite' :
                id === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash Preview' :
                    id === 'gemini-3-pro-preview' ? 'Gemini 3.0 Pro Preview' : id,
            provider: 'gemini',
            description: 'Google Generative AI model',
            // Default context windows if API fetch fails
            contextWindow: id.includes('3') ? 1048576 : 1048576
        }))
    }

    async embed(text, options = {}) {
        const modelId = options.model || "text-embedding-004"
        const model = this.genAI.getGenerativeModel({ model: modelId })

        try {
            const result = await model.embedContent(text)
            return result.embedding.values
        } catch (e) {
            console.error("[Gemini] Embedding failed:", e)
            throw e
        }
    }
}
