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
     * Generates an embedding for the given text.
     * @param {string} text - The text to embed.
     * @param {object} options - Embedding options.
     * @returns {Promise<Array<number>>} The embedding vector.
     */
    async embed(text, options = {}) {
        throw new Error('embed must be implemented')
    }

    /**
     * Generates a database query from natural language.
     */
    async generateQuery(prompt, context, settings = {}) {
        const systemInstruction = PromptBuilder.buildQueryPrompt(context, settings)

        // Debug: Log what schema context the AI is receiving
        console.log(`[AIProvider] System prompt length: ${systemInstruction.length} chars`);
        console.log(`[AIProvider] Schema tables:`, context.schema?.tables?.slice(0, 5));
        console.log(`[AIProvider] Schema columns for first table:`, context.schema?.detailedSchema?.[context.schema?.tables?.[0]]?.slice(0, 5)?.map(c => c.name));

        const history = (context.previousContext || [])
            .filter(msg => msg.content)
            .slice(-10) // LAZY HISTORY: Only keep last 10 messages (approx 5 turns)
            .map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }))

        const messages = [
            { role: 'system', content: systemInstruction },
            ...history,
            { role: 'user', content: prompt }
        ]

        const response = await this.generateContent(messages, settings)
        const text = typeof response === 'string' ? response : response.text
        const usage = typeof response === 'string' ? null : response.usage
        const toolCalls = typeof response === 'string' ? null : response.toolCalls

        return {
            text: PromptBuilder.cleanResponse(text, context.dialect),
            usage,
            toolCalls
        }
    }

    /**
     * Analyzes query results to answer a user question.
     */
    async analyzeResults(question, results, query, semanticContext = {}) {
        const prompt = PromptBuilder.buildAnalysisPrompt(question, results, query, semanticContext)
        const messages = [{ role: 'user', content: prompt }]

        const response = await this.generateContent(messages, { json: true })
        const text = typeof response === 'string' ? response : response.text
        const usage = typeof response === 'string' ? null : response.usage
        return { text, usage }
    }

    /**
     * Disambiguates a vague term by choosing from candidates.
     */
    async disambiguate(term, candidates) {
        const prompt = PromptBuilder.buildDisambiguationPrompt(term, candidates)
        const messages = [{ role: 'user', content: prompt }]

        const response = await this.generateContent(messages, { json: true })
        const text = typeof response === 'string' ? response : response.text

        try {
            const jsonStr = PromptBuilder.cleanResponse(text)
            return JSON.parse(jsonStr)
        } catch (e) {
            console.warn("Failed to parse disambiguation response", e)
            return candidates.slice(0, 8) // Fallback
        }
    }

    /**
     * Recommends a visualization type and config.
     */
    async recommendVisualization(query, results, previousConfig = null, suggestedChartType = null) {
        const prompt = VisualizationPrompts.buildVisualizationPrompt(query, results, previousConfig, suggestedChartType)
        const messages = [{ role: 'user', content: prompt }]

        const response = await this.generateContent(messages, { json: true })
        const text = typeof response === 'string' ? response : response.text

        try {
            const jsonStr = PromptBuilder.cleanResponse(text)
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
