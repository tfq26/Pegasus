import { PromptBuilder } from '../PromptBuilder.js'
import { VisualizationPrompts } from '../VisualizationPrompts.js'

/**
 * Abstract base class for AI Providers.
 * All providers (Gemini, OpenAI, etc.) must extend this class.
 */
export class AIProvider {
    constructor(config) {
        this.config = config
    }

    /**
     * Generates content from the AI model.
     * @param {Array<{role: string, content: string}>} messages - List of messages.
     * @param {object} options - Options like json mode.
     * @returns {Promise<string>} The generated text.
     */
    async generateContent(messages, options = {}) {
        throw new Error('generateContent must be implemented')
    }

    /**
     * Generates a database query from natural language.
     */
    async generateQuery(prompt, context) {
        const systemInstruction = PromptBuilder.buildQueryPrompt(context)

        const history = (context.previousContext || [])
            .filter(msg => msg.content)
            .map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }))

        const messages = [
            { role: 'system', content: systemInstruction },
            ...history,
            { role: 'user', content: prompt }
        ]

        const response = await this.generateContent(messages)
        return PromptBuilder.cleanResponse(response, context.dialect)
    }

    /**
     * Analyzes query results to answer a user question.
     */
    async analyzeResults(question, results, query) {
        const prompt = PromptBuilder.buildAnalysisPrompt(question, results, query)
        const messages = [{ role: 'user', content: prompt }]

        const response = await this.generateContent(messages, { json: true })
        return response
    }

    /**
     * Disambiguates a vague term by choosing from candidates.
     */
    async disambiguate(term, candidates) {
        const prompt = PromptBuilder.buildDisambiguationPrompt(term, candidates)
        const messages = [{ role: 'user', content: prompt }]

        const response = await this.generateContent(messages, { json: true })

        try {
            const jsonStr = PromptBuilder.cleanResponse(response)
            return JSON.parse(jsonStr)
        } catch (e) {
            console.warn("Failed to parse disambiguation response", e)
            return candidates.slice(0, 8) // Fallback
        }
    }

    /**
     * Recommends a visualization type and config.
     */
    async recommendVisualization(query, results, previousConfig = null) {
        const prompt = VisualizationPrompts.buildVisualizationPrompt(query, results, previousConfig)
        const messages = [{ role: 'user', content: prompt }]

        const response = await this.generateContent(messages, { json: true })

        try {
            const jsonStr = PromptBuilder.cleanResponse(response)
            // If response is "null" or empty, return null
            if (!jsonStr || jsonStr === 'null') return null
            return JSON.parse(jsonStr)
        } catch (e) {
            console.warn("Failed to parse visualization recommendation", e)
            return null
        }
    }

    /**
     * Generates a title for a chat session.
     */
    async generateTitle(messages) {
        const prompt = PromptBuilder.buildTitlePrompt(messages)
        const response = await this.generateContent([{ role: 'user', content: prompt }])
        return PromptBuilder.cleanResponse(response)
    }

    async listModels() {
        throw new Error('listModels must be implemented')
    }
}
