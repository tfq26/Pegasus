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

        // Centralized Strategy Injection
        let finalPrompt = prompt;
        if (settings.intent) {
            finalPrompt = provider.enrichPromptWithStrategies(prompt, settings.intent);
        }

        return provider.generateQuery(finalPrompt, context, settings)
    }

    async analyzeResults(question, results, query, modelId, schemaContext = {}) {
        const provider = await this.getProviderForModel(modelId)
        return provider.analyzeResults(question, results, query, modelId, schemaContext)
    }

    async disambiguate(term, candidates, modelId) {
        const provider = await this.getProviderForModel(modelId)
        return provider.disambiguate(term, candidates)
    }

    async listModels(userId) {
        const models = []
        const providerTasks = []

        // 1. Prepare Cloud Model Tasks if connected
        if (userId) {
            providerTasks.push((async () => {
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
                        return awsModels.map(m => ({ ...m, id: `aws:${m.id}` }));
                    }
                } catch (e) {
                    // console.warn('AWS listing failed:', e.message);
                }
                return [];
            })());
            // Can add Azure/GCP tasks here similarly
        }

        // 2. Add Standard Provider Tasks
        for (const [id, provider] of this.providers.entries()) {
            providerTasks.push((async () => {
                try {
                    // Add timeout protection (5s) for each provider fetch
                    const providerModelsPromise = provider.listModels();
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Timeout fetching from ${id}`)), 5000)
                    );

                    const providerModels = await Promise.race([providerModelsPromise, timeoutPromise]);
                    return Array.isArray(providerModels) ? providerModels : [];
                } catch (e) {
                    console.error(`Error fetching models from provider '${id}':`, e.message);
                    return [];
                }
            })());
        }

        // 3. Execute all in parallel
        const results = await Promise.allSettled(providerTasks);
        results.forEach(result => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                models.push(...result.value);
            }
        });

        return models;
    }

    async recommendVisualization(query, results, previousConfig, modelId, suggestedChartType) {
        const provider = await this.getProviderForModel(modelId)
        return provider.recommendVisualization(query, results, previousConfig, suggestedChartType)
    }

    async generateTitle(messages, modelId, userId) {
        const provider = await this.getProviderForModel(modelId, userId)
        return provider.generateTitle(messages)
    }

    async generateText(prompt, modelId, options = {}) {
        const provider = await this.getProviderForModel(modelId, options.userId)

        // Centralized Strategy Injection
        let finalPrompt = prompt;
        if (options.intent) {
            finalPrompt = provider.enrichPromptWithStrategies(prompt, options.intent);
        }

        const result = await provider.generateContent([{ role: 'user', content: finalPrompt }], options)
        return result.text || result
    }

    async generateContent(messages, options = {}) {
        const provider = await this.getProviderForModel(options.model, options.userId)

        // Enrich the last user message if intent is provided
        if (options.intent && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'user') {
                lastMsg.content = provider.enrichPromptWithStrategies(lastMsg.content, options.intent);
            }
        }

        const result = await provider.generateContent(messages, options)
        return result
    }

    static EMBEDDING_FALLBACKS = {
        'models/text-embedding-004': 'models/embedding-001',
        'text-embedding-3-small': 'text-embedding-ada-002'
    };

    static EMBEDDING_MODEL_MAPPING = {
        'openai': 'text-embedding-3-small',
        'gemini': 'models/text-embedding-004'
    };

    async generateEmbedding(text, modelId, options = {}) {
        const resolvedModel = AIClient.EMBEDDING_MODEL_MAPPING[modelId] || modelId || "models/text-embedding-004";
        const provider = await this.getProviderForModel(resolvedModel, options.userId);

        try {
            // Standardized Batch-to-Sequential strategy
            if (Array.isArray(text)) {
                try {
                    const result = await provider.embed(text, { ...options, model: resolvedModel });
                    if (result === null) throw new Error("Batch embedding returned null");
                    return result;
                } catch (batchErr) {
                    console.warn(`[AIClient] Batch embedding failed, falling back to sequential: ${batchErr.message}`);
                    return await Promise.all(text.map(t => this.generateEmbedding(t, resolvedModel, options)));
                }
            }

            const result = await provider.embed(text, { ...options, model: resolvedModel });
            if (result === null) throw new Error("Embedding returned null");
            return result;

        } catch (e) {
            console.warn(`[AIClient] Embedding attempt failed for ${resolvedModel}: ${e.message}`);
            const fallbackModel = AIClient.EMBEDDING_FALLBACKS[resolvedModel];
            if (fallbackModel) {
                console.log(`[AIClient] Triggering fallback: ${resolvedModel} -> ${fallbackModel}`);
                return this.generateEmbedding(text, fallbackModel, options);
            }

            console.error(`[AIClient] All embedding attempts failed:`, e.message);
            return null; // Return null to allow caller (like RAGService) to skip gracefully
        }
    }
}

export const aiClient = new AIClient()
