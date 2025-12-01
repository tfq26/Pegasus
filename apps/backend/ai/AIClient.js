import { GeminiProvider } from "./providers/GeminiProvider.js"

export class AIClient {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY

        // We can add logic here to switch providers based on config
        // For now, we default to Gemini
        this.provider = new GeminiProvider({ apiKey })
    }

    /**
     * Generates a database query from natural language.
     */
    async generateQuery(prompt, context) {
        this.ensureConfigured()
        return this.provider.generateQuery(prompt, context)
    }

    /**
     * Analyzes query results.
     */
    async analyzeResults(question, results, query) {
        this.ensureConfigured()
        return this.provider.analyzeResults(question, results, query)
    }

    /**
     * Disambiguates vague terms.
     */
    async disambiguate(term, candidates) {
        this.ensureConfigured()
        return this.provider.disambiguate(term, candidates)
    }

    async listModels() {
        this.ensureConfigured()
        return this.provider.listModels()
    }

    ensureConfigured() {
        if (!this.provider.config.apiKey) {
            throw new Error("AI is not configured. Please set GEMINI_API_KEY in your environment variables.")
        }
    }
}

// Singleton instance
export const aiClient = new AIClient()
