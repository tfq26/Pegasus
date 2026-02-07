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
            model: options.model || this.config.model || 'gpt-4o-mini',
            messages: apiMessages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 2000
        }

        if (options.tools) {
            requestBody.tools = options.tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            }))
        }

        if (options.toolChoice) {
            requestBody.tool_choice = { type: 'function', function: { name: options.toolChoice } }
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
            const message = data.choices[0]?.message || {}
            const text = message.content || ''
            const toolCalls = message.tool_calls
            const usage = data.usage

            return {
                text,
                toolCalls,
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
        // Models are ordered by tier: Free → Pro → Pro+
        const relevantModels = [
            // Free tier
            'gpt-5.1-mini',
            // Pro tier
            'o4-mini',
            'gpt-5.1'
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
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o Mini',
            'o1-mini': 'o1-mini',
            'o1-preview': 'o1-preview',
            'gpt-5.1': 'GPT-5.1',
            'gpt-5.1-mini': 'GPT-5.1 Mini',
            'o4-mini': 'o4 Mini',
            'o3-mini': 'o3 Mini',
            'gpt-4-turbo': 'GPT-4 Turbo',
            'gpt-4': 'GPT-4'
        }
        return names[id] || id
    }

    getModelDescription(id) {
        const descriptions = {
            'gpt-4o': 'Multimodal model, great for complex tasks',
            'gpt-4o-mini': 'Fast and affordable, good for most tasks',
            'o1-mini': 'Reasoning model for complex problem-solving',
            'o1-preview': 'Advanced reasoning with extended thinking',
            'gpt-5.1': 'Latest flagship model with advanced reasoning',
            'gpt-5.1-mini': 'Fast and efficient GPT-5.1 variant',
            'o4-mini': 'Latest efficient reasoning model',
            'o3-mini': 'Fast reasoning model',
            'gpt-4-turbo': 'High performance with 128k context',
            'gpt-4': 'Advanced reasoning and analysis'
        }
        return descriptions[id] || 'OpenAI language model'
    }

    getContextWindow(id) {
        const windows = {
            'gpt-5.1': 128000,
            'gpt-5.1-mini': 128000,
            'o4-mini': 128000,
            'o3-mini': 128000,
            'gpt-4o': 128000,
            'gpt-4o-mini': 128000,
            'gpt-4-turbo': 128000,
            'gpt-4': 8192
        }
        return windows[id] || 8192
    }

    async embed(text, options = {}) {
        const model = options.model || 'text-embedding-3-small'

        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: model
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(`OpenAI Embedding Error: ${error.error?.message || response.statusText}`)
            }

            const data = await response.json()
            return data.data[0].embedding
        } catch (e) {
            console.error('[OpenAI] Embedding failed:', e)
            throw e
        }
    }
}
