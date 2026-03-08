import { aiClient } from '../../ai/AIClient.js';

/**
 * QueryOptimizerService
 * 
 * AI-powered SQL optimization service that analyzes EXPLAIN plans
 * and provides recommendations for indexes, query restructuring, 
 * and performance tuning.
 */
export class QueryOptimizerService {
    /**
     * Analyzes an execution plan and query to provide optimization suggestions.
     * 
     * @param {string} query - The original SQL query
     * @param {any} explainPlan - The output from the database adapter's explain() method
     * @param {string} provider - The database provider type (postgres, sqlite, etc.)
     * @returns {Promise<object>} Optimization results with suggestions and scores
     */
    async analyzeQuery(query, explainPlan, provider) {
        const prompt = `You are a Database Performance Expert. Analyze the following SQL query and its execution plan for the ${provider} provider. 
Identify performance bottlenecks, missing indexes, and suggest query optimizations.

SQL QUERY:
\`\`\`sql
${query}
\`\`\`

EXECUTION PLAN:
\`\`\`json
${JSON.stringify(explainPlan, null, 2)}
\`\`\`

INSTRUCTIONS:
1. Analyze the scan types (Sequential Scan vs Index Scan), join types, and cost estimates.
2. Identify specific tables/columns needing indexes.
3. Suggest better query structures if the current one is inefficient (e.g., avoiding subqueries, proper JOINs).
4. Provide a "Performance Score" from 0 to 100 where 100 is perfectly optimized.
5. Return ONLY a JSON object with this structure:

{
  "performanceScore": 85,
  "bottlenecks": [
    { "type": "Sequential Scan", "table": "users", "impact": "High", "description": "Large table scan without index" }
  ],
  "suggestions": [
    { "title": "Create Index", "description": "Add index on users(email)", "query": "CREATE INDEX idx_users_email ON users(email);" },
    { "title": "Restructure Join", "description": "Use an INNER JOIN instead of a cross-product with WHERE", "query": "SELECT ... FROM a JOIN b ON a.id = b.a_id" }
  ],
  "estimatedImprovement": "40% faster execution",
  "explanation": "Detailed professional explanation of why these changes help."
}

Return ONLY the JSON object, no additional text.`;

        try {
            const response = await aiClient.generateText(
                prompt,
                'gemini-2.0-flash',
                {
                    temperature: 0.1,
                    maxTokens: 2500
                }
            );

            // Parse response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("Failed to parse AI optimization response");
            }

            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error('[QueryOptimizerService] Analysis failed:', error);
            return {
                performanceScore: 0,
                bottlenecks: [],
                suggestions: [],
                error: error.message,
                explanation: "Failed to generate optimization suggestions due to a backend error."
            };
        }
    }
}

export const queryOptimizerService = new QueryOptimizerService();
