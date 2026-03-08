import { aiClient } from '../../ai/AIClient.js'

export class DataProfilingService {
    /**
     * Analyzes table profiling data using AI to generate health insights and suggestions.
     * @param {object} profileData - The raw statistics from the database adapter
     * @returns {Promise<object>} AI-driven health profile
     */
    async analyzeProfile(profileData) {
        const prompt = this.buildProfilingPrompt(profileData)

        try {
            const response = await aiClient.generateText(
                prompt,
                'gemini-2.0-flash',
                {
                    temperature: 0.1,
                    json: true
                }
            )

            // Parse JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    tableName: profileData.tableName,
                    rowCount: profileData.rowCount,
                    columns: profileData.columns,
                    ...result
                };
            }

            throw new Error('No JSON found in AI response')
        } catch (e) {
            console.error('[DataProfilingService] AI analysis failed:', e)
            return {
                tableName: profileData.tableName,
                rowCount: profileData.rowCount,
                columns: profileData.columns,
                healthScore: 50,
                insights: ['AI analysis failed. Please review stats manually.'],
                suggestions: []
            }
        }
    }

    buildProfilingPrompt(profile) {
        return `You are a data quality expert. Analyze the following table statistics and provide health insights.

TABLE: ${profile.tableName}
TOTAL ROWS: ${profile.rowCount}

COLUMN STATISTICS:
${profile.columns.map(c => `- ${c.name} (${c.type}): ${c.nullCount} nulls, ${c.distinctCount} distinct values, Min: ${c.min || 'N/A'}, Max: ${c.max || 'N/A'}`).join('\n')}

INSTRUCTIONS:
1. Detect anomalies: duplicate keys, high null percentages, inconsistent data patterns, potential outliers.
2. Provide a health score (0-100) based on data completeness and potential issues.
3. List specific insights (at least 3 if possible).
4. Provide actionable suggestions for cleaning or optimizing (e.g., "Add a unique constraint", "Clean nulls"). 
5. Include a SQL snippet for each suggestion if applicable.

Return ONLY a JSON object:
{
  "healthScore": 85,
  "insights": ["High null rate in 'phone' column (45%)", "Potential duplicates in 'email'"],
  "suggestions": [
     {"title": "Clean Nulls", "description": "Update 'phone' with 'N/A' where null", "sql": "UPDATE \\"${profile.tableName}\\" SET phone = 'N/A' WHERE phone IS NULL"}
  ]
}`
    }
}

export const dataProfilingService = new DataProfilingService()
