import { AIProvider } from './AIProvider.js'

export class MockProvider extends AIProvider {
    constructor(config) {
        super(config)
    }

    async generateContent(messages, options = {}) {
        const lastMessage = messages[messages.length - 1].content

        // Mock translation response for Cosmos DB
        if (lastMessage.includes('Convert the following standard SQL query to Cosmos DB SQL syntax')) {
            return JSON.stringify({
                translatedQuery: "SELECT * FROM c WHERE c.email LIKE '%@gmail.com%'",
                confidence: 100,
                warnings: [],
                notes: "Mocked translation"
            })
        }

        // Mock translation response for Kusto (KQL)
        if (lastMessage.includes('Convert the following standard SQL query to Kusto KQL syntax')) {
            return JSON.stringify({
                translatedQuery: "logs | where timestamp > datetime(2026-01-01) | summarize total = count() by status | order by total desc | take 10",
                confidence: 100,
                warnings: [],
                notes: "Mocked translation"
            })
        }

        return "Mocked response"
    }

    async listModels() {
        return [{ id: 'mock-model', name: 'Mock Model', provider: 'mock' }]
    }

    async embed(text) {
        return Array.isArray(text) ? text.map(() => Array(1536).fill(0)) : Array(1536).fill(0)
    }
}
