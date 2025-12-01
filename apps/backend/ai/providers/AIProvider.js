/**
 * Abstract base class for AI Providers.
 * All providers (Gemini, OpenAI, etc.) must extend this class.
 */
export class AIProvider {
    constructor(config) {
        this.config = config
    }

    /**
     * Generates a database query from natural language.
     * @param {string} prompt - The user's natural language request.
     * @param {object} context - Schema info, dialect, etc.
     * @returns {Promise<string>} The generated SQL/KQL/Mongo query.
     */
    async generateQuery(prompt, context) {
        throw new Error('generateQuery must be implemented')
    }

    /**
     * Analyzes query results to answer a user question.
     * @param {string} question - The user's question about the data.
     * @param {any[]} results - The query results.
     * @param {string} query - The query that was executed.
     * @returns {Promise<string>} The analysis/answer.
     */
    async analyzeResults(question, results, query) {
        throw new Error('analyzeResults must be implemented')
    }

    /**
     * Disambiguates a vague term by choosing from candidates.
     * @param {string} term - The vague term (e.g. "users").
     * @param {string[]} candidates - List of possible matches.
     * @returns {Promise<string[]>} The filtered/ranked candidates or a question.
     */
    async disambiguate(term, candidates) {
        throw new Error('disambiguate must be implemented')
    }
}
