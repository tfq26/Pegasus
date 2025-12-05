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
            maxOutputTokens: options.maxTokens || 1000,
            temperature: options.temperature ?? undefined
        }
        if (options.json) {
            generationConfig.responseMimeType = "application/json"
        }

        // Initialize model with specific system instruction for this request
        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemInstruction
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

                return {
                    text,
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
                const text = response.text()
                const usage = response.usageMetadata

                // Return object with text and usage if available, or just text if legacy caller expects string
                // For now, let's attach usage to the string object or change return type
                // To avoid breaking changes, let's return an object but we need to update AIClient to handle it
                // OR we can return a custom object that toString() returns text

                return {
                    text,
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
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`
            )

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json()

            // Only show models relevant for SQL generation and data analysis
            const relevantModels = [
                'gemini-2.5-pro',
                'gemini-2.5-flash',
                'gemini-2.0-flash-exp',
                'gemini-1.5-pro',
                'gemini-1.5-flash'
            ]

            if (data.models) {
                return data.models
                    .filter(m => {
                        const modelId = m.name.replace('models/', '')
                        return m.supportedGenerationMethods?.includes('generateContent') &&
                            relevantModels.includes(modelId)
                    })
                    .map(m => ({
                        id: m.name.replace('models/', ''),
                        name: m.displayName,
                        description: m.description,
                        contextWindow: m.inputTokenLimit,
                        provider: 'gemini'
                    }))
            }
            return []
        } catch (error) {
            console.error('Error listing models:', error)
            return []
        }
    }
}
