import { AIProvider } from './AIProvider.js'

/**
 * Ollama AI Provider for local models.
 */
export class OllamaProvider extends AIProvider {
    constructor(config = {}) {
        super(config)
        this.baseUrl = config.baseUrl || 'http://localhost:11434/api'
        this.model = config.model || 'llama3'
    }

    async generateContent(messages, options = {}) {
        try {
            const isJsonMode = options.json === true;
            const model = options.model || this.model;

            const response = await fetch(`${this.baseUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    stream: false,
                    format: isJsonMode ? 'json' : undefined,
                }),
            })

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Ollama Error: ${error}`)
            }

            const data = await response.json()
            const text = data.message?.content || ''

            return {
                text: text,
                usage: {
                    prompt_tokens: data.prompt_eval_count || 0,
                    completion_tokens: data.eval_count || 0,
                    total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                }
            }
        } catch (e) {
            console.error('[Ollama] Generation failed:', e)
            throw new Error(`Local AI failed: ${e.message}. Is Ollama running?`)
        }
    }

    async embed(text, options = {}) {
        const model = options.model || 'mxbai-embed-large'

        try {
            const response = await fetch(`${this.baseUrl}/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: text
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(`Ollama Embedding Error: ${error.error || response.statusText}`)
            }

            const data = await response.json()
            return data.embedding
        } catch (e) {
            console.error('[Ollama] Embedding failed:', e)
            throw e
        }
    }

    async listModels() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            const response = await fetch(`${this.baseUrl}/tags`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return []

            const data = await response.json()
            return (data.models || []).map(m => ({
                id: m.name,
                name: m.name,
                provider: 'local',
                description: `Local model: ${m.name} (${(m.size / 1e9).toFixed(1)} GB)`,
                contextWindow: 8192,
            }))
        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn('[Ollama] Model listing timed out');
            } else {
                console.warn('[Ollama] Failed to list models:', e.message);
            }
            return []
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
