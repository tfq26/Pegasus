import { ref } from 'vue'
import { generateAIQuery, analyzeResults, QUERY_API_URL, getAuthHeaders } from '@/lib/api'
import { buildConnectionPayload } from '@/lib/db-connections'
import type { ConnectionEntry } from '@/lib/db-connections'

/**
 * Composable for managing SQL query execution and results
 * Handles query execution, history, and AI-powered features
 */
export function useQuery() {
    // Query state
    const queryResult = ref<unknown>(null)
    const queryError = ref('')
    const lastQuery = ref('')
    const queryHistory = ref<any[]>([])
    const isExecuting = ref(false)

    // AI features
    const isAnalyzing = ref(false)
    const ambiguity = ref<any>(null)
    const ambiguityDialogVisible = ref(false)

    // AI options
    const aiOptions = ref({
        model: 'gpt-4',
        temperature: 0.7
    })

    const queryOptions = ref({
        limit: 1000
    })

    /**
     * Execute a SQL query
     */
    async function executeQuery(
        query: string,
        connection: ConnectionEntry | null,
        options?: { aiMode?: boolean; autoExecute?: boolean }
    ) {
        if (!connection) {
            queryError.value = 'No connection selected'
            return
        }

        isExecuting.value = true
        queryError.value = ''
        lastQuery.value = query

        try {
            const payload = buildConnectionPayload(connection, query)

            const res = await fetch(`${QUERY_API_URL}/query`, {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify(payload)
            })

            const body = await res.json()

            if (!res.ok) {
                throw new Error(body.error || 'Query failed')
            }

            queryResult.value = body.result
            queryError.value = ''

            // Add to history
            queryHistory.value.unshift({
                query,
                timestamp: Date.now(),
                rows: Array.isArray(body.result) ? body.result.length : 0
            })

            return body.result
        } catch (e: any) {
            queryError.value = e.message || 'Query execution failed'
            queryResult.value = null
            throw e
        } finally {
            isExecuting.value = false
        }
    }

    /**
     * Generate SQL query using AI
     */
    async function generateQuery(
        prompt: string,
        connection: ConnectionEntry | null,
        options?: { model?: string; temperature?: number }
    ) {
        if (!connection) {
            throw new Error('No connection selected')
        }

        try {
            const result = await generateAIQuery(
                prompt,
                connection.id,
                options?.model || aiOptions.value.model,
                options?.temperature || aiOptions.value.temperature
            )

            return result.query
        } catch (e: any) {
            throw new Error(e.message || 'AI query generation failed')
        }
    }

    /**
     * Analyze query results with AI
     */
    async function analyzeQueryResults() {
        if (!queryResult.value || !Array.isArray(queryResult.value)) {
            throw new Error('No results to analyze')
        }

        isAnalyzing.value = true
        try {
            const analysis = await analyzeResults(
                lastQuery.value,
                queryResult.value,
                aiOptions.value.model
            )

            return analysis
        } catch (e: any) {
            throw new Error(e.message || 'Analysis failed')
        } finally {
            isAnalyzing.value = false
        }
    }

    /**
     * Clear query results and error
     */
    function clearResults() {
        queryResult.value = null
        queryError.value = ''
        lastQuery.value = ''
    }

    /**
     * Load a query from history
     */
    function loadQueryFromHistory(query: string) {
        return query
    }

    return {
        // State
        queryResult,
        queryError,
        lastQuery,
        queryHistory,
        isExecuting,
        isAnalyzing,
        ambiguity,
        ambiguityDialogVisible,
        aiOptions,
        queryOptions,

        // Actions
        executeQuery,
        generateQuery,
        analyzeQueryResults,
        clearResults,
        loadQueryFromHistory
    }
}
