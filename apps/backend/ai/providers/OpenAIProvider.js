import { AIProvider } from './AIProvider.js'

export class OpenAIProvider extends AIProvider {
    constructor(config) {
        super(config)
    }

    async generateContent(messages, options = {}) {
        const apiMessages = messages.map(msg => ({
            role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }))

        const requestBody = {
            model: this.config.model || 'gpt-4o',
            messages: apiMessages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 2000
        }

        if (options.json) {
            requestBody.response_format = { type: 'json_object' }
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`)
            }

            const data = await response.json()
            const text = data.choices[0]?.message?.content || ''
            const usage = data.usage

            return {
                text,
                usage: {
                    promptTokens: usage?.prompt_tokens || 0,
                    candidatesTokens: usage?.completion_tokens || 0,
                    totalTokens: usage?.total_tokens || 0
                }
            }
        } catch (e) {
            console.error('OpenAI API Error:', e)
            throw e
        }
    }

    async listModels() {
        // We return a curated list of models to ensure clean UI and avoid duplicates.
        // We could verify against the API, but for now this ensures the user sees the models we support.
        const relevantModels = [
            'gpt-4.5-preview',
            'gpt-4.1-turbo',
            'o1-preview',
            'o1-mini',
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4-turbo',
            'gpt-4'
        ]

        return relevantModels.map(id => ({
            id: id,
            name: this.formatModelName(id),
            description: this.getModelDescription(id),
            contextWindow: this.getContextWindow(id),
            provider: 'openai'
        }))
    }

    formatModelName(id) {
        const names = {
            'gpt-4.5-preview': 'GPT-4.5 Preview',
            'gpt-4.1-turbo': 'GPT-4.1 Turbo',
            'o1-preview': 'o1 Preview',
            'o1-mini': 'o1 Mini',
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o Mini',
            'gpt-4-turbo': 'GPT-4 Turbo',
            'gpt-4': 'GPT-4'
        }
        return names[id] || id
    }

    getModelDescription(id) {
        const descriptions = {
            'gpt-4.5-preview': 'Latest preview model with enhanced capabilities',
            'gpt-4.1-turbo': 'Improved performance and speed',
            'o1-preview': 'Advanced reasoning model (Strawberry)',
            'o1-mini': 'Efficient reasoning model',
            'gpt-4o': 'Most capable model, best for complex reasoning',
            'gpt-4o-mini': 'Fast and affordable, good for most tasks',
            'gpt-4-turbo': 'High performance with 128k context',
            'gpt-4': 'Advanced reasoning and analysis'
        }
        return descriptions[id] || 'OpenAI language model'
    }

    getContextWindow(id) {
        const windows = {
            'gpt-4.5-preview': 128000,
            'gpt-4.1-turbo': 128000,
            'o1-preview': 128000,
            'o1-mini': 128000,
            'gpt-4o': 128000,
            'gpt-4o-mini': 128000,
            'gpt-4-turbo': 128000,
            'gpt-4': 8192
        }
        return windows[id] || 8192
    }
}
