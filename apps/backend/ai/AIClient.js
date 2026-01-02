import { GeminiProvider } from "./providers/GeminiProvider.js"
import { OpenAIProvider } from "./providers/OpenAIProvider.js"
import { OllamaProvider } from "./providers/OllamaProvider.js"
// import { AnthropicProvider } from "./providers/AnthropicProvider.js"

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

        // Initialize Local (Ollama)
        this.providers.set('local', new OllamaProvider())

        // Initialize Anthropic
        /*
        if (process.env.ANTHROPIC_API_KEY) {
            this.providers.set('anthropic', new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }))
        }
        */
    }

    async getProviderForModel(modelId) {
        if (!modelId) return this.getDefaultProvider()

        // Check if model is OpenAI
        if (modelId.startsWith('gpt') || modelId.startsWith('o1')) {
            const provider = this.providers.get('openai')
            if (provider) {
                provider.config.model = modelId
                return provider
            }
        }

        // Check if model is Gemini
        if (modelId.startsWith('gemini')) {
            const provider = this.providers.get('gemini')
            if (provider) {
                provider.config.model = modelId
                return provider
            }
        }

        // Fallback or check local provider
        // Any model could potentially be in Ollama
        const localProvider = this.providers.get('local')
        if (localProvider) {
            // Check if this specific model is available in Ollama
            const localModels = await localProvider.listModels()
            if (localModels.some(m => m.id === modelId)) {
                localProvider.config.model = modelId
                return localProvider
            }
        }

        // Default to Gemini or OpenAI if local model not found
        const provider = this.getDefaultProvider()
        if (provider) {
            provider.config.model = modelId
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
        const provider = await this.getProviderForModel(settings.modelId)
        return provider.generateQuery(prompt, context, settings)
    }

    async analyzeResults(question, results, query, modelId) {
        const provider = await this.getProviderForModel(modelId)
        return provider.analyzeResults(question, results, query)
    }

    async disambiguate(term, candidates, modelId) {
        const provider = await this.getProviderForModel(modelId)
        return provider.disambiguate(term, candidates)
    }

    async listModels() {
        const models = []
        for (const provider of this.providers.values()) {
            try {
                const providerModels = await provider.listModels()
                if (Array.isArray(providerModels)) {
                    models.push(...providerModels)
                }
            } catch (e) {
                console.error('Error fetching models from provider:', e)
            }
        }
        return models
    }

    async recommendVisualization(query, results, previousConfig, modelId, suggestedChartType) {
        const provider = await this.getProviderForModel(modelId)
        return provider.recommendVisualization(query, results, previousConfig, suggestedChartType)
    }

    async generateTitle(messages, modelId) {
        const provider = await this.getProviderForModel(modelId)
        return provider.generateTitle(messages)
    }

    async generateText(prompt, modelId, options = {}) {
        const provider = await this.getProviderForModel(modelId)
        const result = await provider.generateContent([{ role: 'user', content: prompt }], options)
        return result.text
    }

    async generateContent(messages, options = {}) {
        const provider = await this.getProviderForModel(options.model)
        const result = await provider.generateContent(messages, options)
        return result
    }

    async generateEmbedding(text, modelId, options = {}) {
        const provider = await this.getProviderForModel(modelId)
        return provider.embed(text, options)
    }
}

export const aiClient = new AIClient()
