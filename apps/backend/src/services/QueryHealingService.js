import { aiClient } from '../../ai/AIClient.js';

/**
 * QueryHealingService
 * 
 * Autonomous SQL fix-and-retry service.
 * Analyzes database errors and provides corrected SQL queries based on intent and dialect rules.
 */
export class QueryHealingService {
    /**
     * Attempts to fix a SQL query that failed execution.
     * 
     * @param {string} failedSql - The native SQL query that failed
     * @param {string} dialect - The database dialect (e.g. 'cosmosdb', 'postgres')
     * @param {string} errorMessage - The error message returned by the database
     * @param {object} context - Additional context { originalSql, intent, schema, samples }
     * @returns {Promise<object|null>} Heal result { healedSql, explanation, confidence }
     */
    async healQuery(failedSql, dialect, errorMessage, context = {}) {
        const { originalSql, intent, schema, samples } = context;

        console.log(`[QueryHealingService] Attempting to heal query for dialect: ${dialect}`);
        console.log(`[QueryHealingService] Error encountered: ${errorMessage}`);

        const prompt = `You are a Database Expert specializing in SQL self-correction and autonomous recovery.
A SQL query failed execution against a ${dialect} database. Your task is to analyze the error and provide a corrected SQL query that fulfills the user's original intent.

---
USER INTENT (Structured):
${JSON.stringify(intent || {}, null, 2)}

ORIGINAL SQL (if available):
\`\`\`sql
${originalSql || 'N/A'}
\`\`\`

FAILED NATIVE SQL:
\`\`\`sql
${failedSql}
\`\`\`

DATABASE ERROR:
${errorMessage}

${schema ? `SCHEMA CONTEXT:
${JSON.stringify(schema, null, 2)}` : ''}

${samples ? `DATA SAMPLES (if available):
${JSON.stringify(samples, null, 2)}` : ''}
---

INSTRUCTIONS:
1. Analyze the error carefully. Common issues include:
   - Misaligned column/table names (case sensitivity or typos).
   - Invalid syntax for the target dialect (e.g. ${dialect}).
   - Missing required clauses (e.g. TOP in CosmosDB, ORDER BY with OFFSET).
   - Reserved keywords used as identifiers without quoting.
2. Provide a corrected SQL query formatted for the ${dialect} dialect.
3. Provide a brief explanation of what was fixed.
4. Assign a confidence score (0-100) to your fix.

Return ONLY a JSON object with this structure:
{
  "healedSql": "the corrected native sql query",
  "explanation": "briefly explain the fix",
  "confidence": 95
}

Return ONLY the JSON object, no additional text.`;

        try {
            const response = await aiClient.generateText(
                prompt,
                'gemini-2.0-flash', // Use stable flash model
                { temperature: 0.1, maxTokens: 2000 }
            );

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('[QueryHealingService] No JSON found in AI response');
                return null;
            }

            const result = JSON.parse(jsonMatch[0]);

            if (result.confidence > 50 && result.healedSql) {
                console.log(`[QueryHealingService] Heal successful (${result.confidence}%): ${result.explanation}`);
                return result;
            }

            console.warn(`[QueryHealingService] Low confidence or missing SQL in fix.`);
            return null;
        } catch (error) {
            console.error('[QueryHealingService] Heal execution failed:', error);
            return null;
        }
    }
}

export const queryHealingService = new QueryHealingService();
