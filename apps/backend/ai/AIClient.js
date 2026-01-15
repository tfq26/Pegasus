import { GeminiProvider } from "./providers/GeminiProvider.js"
import { OpenAIProvider } from "./providers/OpenAIProvider.js"
import { OllamaProvider } from "./providers/OllamaProvider.js"
import { AnthropicProvider } from "./providers/AnthropicProvider.js"
import { AWSBedrockProvider } from "./providers/AWSBedrockProvider.js"
import { AzureOpenAIProvider } from "./providers/AzureOpenAIProvider.js"
import { GCPVertexProvider } from "./providers/GCPVertexProvider.js"
import { secretService } from "../src/services/SecretService.js"

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
        if (process.env.ANTHROPIC_API_KEY) {
            this.providers.set('anthropic', new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }))
        }
    }

    async getProviderForModel(modelId, userId) {
        if (!modelId) return this.getDefaultProvider()

        // 1. Check for Cloud Providers (BYOM)
        // These require a userId to fetch credentials dynamically
        if (userId) {
            // AWS Bedrock
            if (modelId.startsWith('aws:') || modelId.includes('anthropic.claude') && !this.providers.has('anthropic')) {
                const vaultKey = `secret/pegasus/users/${userId}/cloud/aws/token`;
                const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

                if (tokenData) {
                    const creds = JSON.parse(tokenData);
                    return new AWSBedrockProvider({
                        accessKeyId: creds.accessKeyId,
                        secretAccessKey: creds.secretAccessKey,
                        region: creds.region || 'us-east-1'
                    });
                }
            }

            // Azure OpenAI
            if (modelId.startsWith('azure:')) {
                const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
                const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`); // Need to adapt to stored Azure config structure
                const configKey = `secret/pegasus/users/${userId}/cloud/azure/config`;
                const configData = await secretService.resolveSecret(`vault://${configKey}`);

                if (configData) {
                    const config = JSON.parse(configData);
                    // Assuming config has endpoint and apiKey/token
                    return new AzureOpenAIProvider(config);
                }
            }

            // GCP Vertex
            if (modelId.startsWith('gcp:') || (modelId.startsWith('gemini') && !this.providers.has('gemini'))) {
                const vaultKey = `secret/pegasus/users/${userId}/cloud/gcp/token`;
                const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

                if (tokenData) {
                    const tokens = JSON.parse(tokenData);
                    return new GCPVertexProvider({
                        projectId: tokens.project_id, // This typically comes from the service account JSON
                        credentials: tokens // Or handle OAuth access token
                    });
                }
            }
        }

        // --- Standard Provider Fallbacks ---

        // Handle provider names (openai, gemini) as provider requests, not model names
        if (modelId === 'openai') {
            const provider = this.providers.get('openai')
            if (provider) {
                // Use latest OpenAI model (Nov 2025)
                provider.config.model = 'gpt-5.1'
                return provider
            }
            // Fallback to default provider if OpenAI not available
            return this.getDefaultProvider()
        }

        if (modelId === 'gemini') {
            const provider = this.providers.get('gemini')
            if (provider) {
                // Use latest Gemini model (Nov 2025)
                provider.config.model = 'gemini-3-flash-preview'
                return provider
            }
            // Fallback to default provider if Gemini not available
            return this.getDefaultProvider()
        }

        // Check if model is OpenAI (gpt-*, o1*, o3*, o4*)
        if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
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

        // Check if model is Claude (Anthropic)
        if (modelId.startsWith('claude')) {
            const provider = this.providers.get('anthropic')
            if (provider) {
                provider.config.model = modelId
                return provider
            }
        }

        // Check explicit local prefix
        if (modelId.startsWith('local:')) {
            const provider = this.providers.get('local')
            const realModelId = modelId.replace('local:', '')
            if (provider) {
                provider.config.model = realModelId
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
            // Don't override the model if it's not a recognized model ID
            // Just use the provider's default model
            return provider
        }

        throw new Error("No suitable AI provider configured for " + modelId)
    }

    getDefaultProvider() {
        const gemini = this.providers.get('gemini')
        if (gemini) return gemini

        const openai = this.providers.get('openai')
        if (openai) return openai

        throw new Error("No AI providers configured")
    }

    // Updated Helper Methods to pass userId
    // Note: The caller must pass { modelId: ..., userId: ... } in settingsOrModelId
    // or modify these signatures in the routes/controllers

    async generateQuery(prompt, context, settingsOrModelId) {
        let settings = settingsOrModelId || {}
        if (typeof settingsOrModelId === 'string') {
            settings = { modelId: settingsOrModelId }
        }
        const provider = await this.getProviderForModel(settings.modelId, settings.userId)
        return provider.generateQuery(prompt, context, settings)
    }

    async analyzeResults(question, results, query, modelId) {
        // Warning: This method signature doesn't support userId yet.
        // It should be refactored or rely on default provider.
        const provider = await this.getProviderForModel(modelId)
        return provider.analyzeResults(question, results, query)
    }

    async disambiguate(term, candidates, modelId) {
        const provider = await this.getProviderForModel(modelId)
        return provider.disambiguate(term, candidates)
    }

    async listModels(userId) {
        const models = []

        // 1. Add Cloud Models if connected
        if (userId) {
            // Check AWS
            try {
                const vaultKey = `secret/pegasus/users/${userId}/cloud/aws/token`;
                const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
                if (tokenData) {
                    const creds = JSON.parse(tokenData);
                    const awsProvider = new AWSBedrockProvider({
                        accessKeyId: creds.accessKeyId,
                        secretAccessKey: creds.secretAccessKey,
                        region: creds.region || 'us-east-1'
                    });
                    const awsModels = await awsProvider.listModels();
                    models.push(...awsModels.map(m => ({ ...m, id: `aws:${m.id}` })));
                }
            } catch (e) {
                // Ignore connection errors during listing
            }
            // Can add Azure/GCP here similarly
        }

        // 2. Add Standard Models
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
        // Support options.userId if provided
        const provider = await this.getProviderForModel(modelId, options.userId)
        const result = await provider.generateContent([{ role: 'user', content: prompt }], options)
        return result
    }

    async generateContent(messages, options = {}) {
        const provider = await this.getProviderForModel(options.model, options.userId)
        const result = await provider.generateContent(messages, options)
        return result
    }

    async generateEmbedding(text, modelId, options = {}) {
        const provider = await this.getProviderForModel(modelId, options.userId)
        return provider.embed(text, options)
    }
}

export const aiClient = new AIClient()
