import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/composables/usePlatform'

export interface OllamaStatus {
    is_running: boolean
    version: string | null
    models: string[]
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

declare global {
    interface Window {
        __TAURI__?: any
    }
}

class LocalAIService {
    private static instance: LocalAIService
    private baseUrl = 'http://localhost:11434'

    private constructor() { }

    public static getInstance(): LocalAIService {
        if (!LocalAIService.instance) {
            LocalAIService.instance = new LocalAIService()
        }
        return LocalAIService.instance
    }

    /**
     * Checks if Ollama is running via the Rust backend
     */
    async getStatus(): Promise<OllamaStatus> {
        try {
            if (!isTauri.value) {
                console.warn('LocalAI: Not running in Tauri environment')
                return { is_running: false, version: null, models: [] }
            }
            return await invoke<OllamaStatus>('check_ollama_status')
        } catch (e) {
            console.error('Failed to check Ollama status', e)
            return { is_running: false, version: null, models: [] }
        }
    }

    /**
     * Attempts to start the bundled Ollama sidecar
     */
    async startSidecar(): Promise<boolean> {
        try {
            await invoke('start_ollama_sidecar')
            return true
        } catch (e) {
            console.error('Failed to start Ollama sidecar', e)
            return false
        }
    }

    /**
     * Lists available models directly from Ollama API
     */
    async listModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`)
            const data = await response.json()
            return data.models?.map((m: any) => m.name) || []
        } catch (e) {
            return []
        }
    }

    /**
     * Pulls a model (e.g., 'llama3')
     */
    async pullModel(model: string, onProgress?: (progress: any) => void) {
        const response = await fetch(`${this.baseUrl}/api/pull`, {
            method: 'POST',
            body: JSON.stringify({ name: model })
        })

        const reader = response.body?.getReader()
        if (!reader) return

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = new TextDecoder().decode(value)
            // Ollama sends multiple JSON objects in one chunk sometimes
            const lines = chunk.split('\n').filter(Boolean)
            for (const line of lines) {
                try {
                    const json = JSON.parse(line)
                    if (onProgress) onProgress(json)
                } catch (e) {
                    // Ignore parse errors for partial lines
                }
            }
        }
    }

    /**
     * Chat with a local model
     */
    async chat(model: string, messages: ChatMessage[]): Promise<Response> {
        return fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: true
            })
        })
    }

    /**
     * Chat with streaming response generator
     */
    async *chatStream(model: string, messages: ChatMessage[]) {
        const response = await this.chat(model, messages)
        const reader = response.body?.getReader()
        if (!reader) return

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = new TextDecoder().decode(value)
            const lines = chunk.split('\n').filter(Boolean)

            for (const line of lines) {
                try {
                    const json = JSON.parse(line)
                    if (json.message?.content) {
                        yield json.message.content
                    }
                    if (json.done) return
                } catch (e) {
                    // Ignore
                }
            }
        }
    }
}

export const localAI = LocalAIService.getInstance()
