import { AIProvider } from './AIProvider.js'

export class AnthropicProvider extends AIProvider {
    constructor(config) {
        super(config)
    }

    async generateContent(messages, options = {}) {
        // Separate system message if present
        const systemMsg = messages.find(m => m.role === 'system')
        const systemPrompt = systemMsg ? systemMsg.content : undefined

        // Filter out system message and map roles
        const apiMessages = messages
            .filter(m => m.role !== 'system')
            .map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }))

        const requestBody = {
            model: options.model || this.config.model || 'claude-3-5-sonnet-latest',
            max_tokens: options.maxTokens || 4096,
            system: systemPrompt,
            messages: apiMessages,
            temperature: options.temperature ?? 0.7
        }

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(`Anthropic API Error: ${error.error?.message || response.statusText}`)
            }

            const data = await response.json()
            const text = data.content[0]?.text || ''
            const usage = data.usage

            return {
                text,
                usage: {
                    promptTokens: usage?.input_tokens || 0,
                    candidatesTokens: usage?.output_tokens || 0,
                    totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
                }
            }
        } catch (e) {
            console.error('Anthropic API Error:', e)
            throw e
        }
    }

    async listModels() {
        // Curated models for data analysis
        // Using -latest aliases for automatic updates
        const relevantModels = [
            // Pro tier
            'claude-3-5-haiku-latest',   // Fast & affordable
            'claude-3-5-sonnet-latest',  // Best for complex data analysis
            // Pro+ tier
            'claude-3-opus-latest'       // Most powerful for highly complex tasks
        ]

        return relevantModels.map(id => ({
            id: id,
            name: this.formatModelName(id),
            description: this.getModelDescription(id),
            contextWindow: this.getContextWindow(id),
            provider: 'anthropic'
        }))
    }

    formatModelName(id) {
        const names = {
            'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
            'claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
            'claude-3-opus-latest': 'Claude 3 Opus',
            'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
            'claude-3-haiku-20240307': 'Claude 3 Haiku'
        }
        return names[id] || id
    }

    getModelDescription(id) {
        const descriptions = {
            'claude-3-5-sonnet-latest': 'Most intelligent model to date',
            'claude-3-5-haiku-latest': 'Fastest and most cost-effective model',
            'claude-3-opus-latest': 'Powerful model for highly complex tasks',
            'claude-3-sonnet-20240229': 'Balanced intelligence and speed',
            'claude-3-haiku-20240307': 'Near-instant responsiveness'
        }
        return descriptions[id] || 'Anthropic language model'
    }

    getContextWindow(id) {
        return 200000 // All Claude 3 models have 200k context window
    }
}
