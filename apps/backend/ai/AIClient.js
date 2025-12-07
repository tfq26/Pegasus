import { GeminiProvider } from "./providers/GeminiProvider.js"
import { OpenAIProvider } from "./providers/OpenAIProvider.js"

export class AIClient {
    constructor() {
        this.providers = new Map()

        // Initialize Gemini
        if (process.env.GEMINI_API_KEY) {
            this.providers.set('gemini', new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY }))
        }

        // Initialize OpenAI
        if (process.env.OPENAI_API_KEY) {
            this.providers.set('openai', new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }))
        }
    }

    getProviderForModel(modelId) {
        if (!modelId) return this.getDefaultProvider()

        // Check if model is OpenAI
        if (modelId.startsWith('gpt') || modelId.startsWith('o1')) {
            const provider = this.providers.get('openai')
            if (provider) {
                provider.config.model = modelId
                return provider
            }
        }

        // Default to Gemini for gemini-* models or fallback
        const provider = this.providers.get('gemini')
        if (provider) {
            if (modelId.startsWith('gemini')) {
                provider.config.model = modelId
            }
            return provider
        }

        throw new Error("No suitable AI provider configured")
    }

    getDefaultProvider() {
        const gemini = this.providers.get('gemini')
        if (gemini) return gemini

        const openai = this.providers.get('openai')
        if (openai) return openai

        throw new Error("No AI providers configured")
    }

    async generateQuery(prompt, context, settingsOrModelId) {
        let settings = settingsOrModelId
        if (typeof settingsOrModelId === 'string' || !settingsOrModelId) {
            settings = { modelId: settingsOrModelId }
        }
        const provider = this.getProviderForModel(settings.modelId)
        return provider.generateQuery(prompt, context, settings)
    }

    async analyzeResults(question, results, query, modelId) {
        const provider = this.getProviderForModel(modelId)
        return provider.analyzeResults(question, results, query)
    }

    async disambiguate(term, candidates, modelId) {
        const provider = this.getProviderForModel(modelId)
        return provider.disambiguate(term, candidates)
    }

    async listModels() {
        const models = []
        for (const provider of this.providers.values()) {
            try {
                const providerModels = await provider.listModels()
                models.push(...providerModels)
            } catch (e) {
                console.error('Error fetching models from provider:', e)
            }
        }
        return models
    }

    async recommendVisualization(query, results, previousConfig, modelId) {
        const provider = this.getProviderForModel(modelId)
        return provider.recommendVisualization(query, results, previousConfig)
    }

    async generateTitle(messages, modelId) {
        const provider = this.getProviderForModel(modelId)
        return provider.generateTitle(messages)
    }

    async generateText(prompt, modelId) {
        const provider = this.getProviderForModel(modelId)
        const result = await provider.generateContent([{ role: 'user', content: prompt }])
        return result.text
    }

    async generateContent(messages, options = {}) {
        const provider = this.getProviderForModel(options.model)
        const result = await provider.generateContent(messages, options)
        return result.text
    }
}

export const aiClient = new AIClient()
