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
        const modelId = options.model || this.config.model || "gemini-2.5-flash"
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
                const text = response.text()
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
                console.time('[Gemini] generateContent')
                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: lastUserMessage }] }],
                    generationConfig
                })
                console.timeEnd('[Gemini] generateContent')
                const response = result.response
                const text = response.text()
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
        const relevantModels = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-1.0-pro'
        ]

        return relevantModels.map(id => ({
            id: id,
            name: id === 'gemini-2.0-flash-exp' ? 'Gemini 2.0 Flash' :
                id === 'gemini-1.5-pro' ? 'Gemini 1.5 Pro' :
                    id === 'gemini-1.5-flash' ? 'Gemini 1.5 Flash' : 'Gemini 1.0 Pro',
            provider: 'gemini',
            description: 'Google Generative AI model',
            contextWindow: id.includes('1.5') ? 1000000 : 32768
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
