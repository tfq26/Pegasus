import { aiClient } from './AIClient.js';
import { PromptBuilder } from './PromptBuilder.js';

export class VisualizationAnalyzer {
    /**
     * Determines if a dataset should be visualized and provides a blueprint.
     * 
     * @param {string} originalPrompt - The user's original natural language request.
     * @param {Array<object>} data - The query results (rows).
     * @param {string} modelId - AI model to use for analysis.
     * @param {string} userId - User ID for credential resolution.
     * @returns {Promise<object>} { shouldVisualize: boolean, blueprint: object | null }
     */
    static async analyze(originalPrompt, data, modelId = 'gemini-3-flash-preview', userId = null, forceVisualization = false) {
        if (!data || data.length < 1) {
            return { shouldVisualize: false, blueprint: null };
        }

        const columnNames = Object.keys(data[0]);
        const sampleRows = data.slice(0, 10); // More samples for better mapping

        const forceDirective = forceVisualization
            ? "\nDETECTION OVERRIDE: The user has explicitly requested a visualization. You MUST return shouldVisualize: true unless technically impossible.\n"
            : "";

        const prompt = `
You are a data visualization expert.
${forceDirective}
Given the user's original request and the query result, determine if and how to visualize the data.

USER REQUEST: "${originalPrompt}"

QUERY RESULT (up to 10 rows):
${JSON.stringify(sampleRows, null, 2)}

COLUMNS: ${columnNames.join(', ')}

RULES:
1. If intent is clearly NOT visual (e.g., "list all...", "find the row..."), return { "shouldVisualize": false }.
2. If headers are generic (e.g. "Field1", "column_0"), scan the QUERY RESULT to find which index contains the user's requested metrics (e.g. if "Market Value" appears in row 5 of "Field 12", then xAxis/yAxis should use "Field 12").
3. Choose chart type based on data:
   - "bar": Comparisons, rankings, categorical X.
   - "line": Trends, time-series (X is a date/time/sequence).
   - "pie": Proportions, distributions (one numeric value, one categorical). Best for < 10 categories.
   - "doughnut": Same as pie.
   - "stat": Single numeric value (KPI/Total).
4. X-Axis: Choose a categorical or date column.
5. Y-Axis: Choose one or more numeric columns. Use the EXACT column names from the COLUMNS list provided.

OUTPUT (JSON ONLY):
{
  "shouldVisualize": true,
  "type": "bar",
  "title": "Descriptive chart title",
  "xAxis": "column_name",
  "yAxis": ["numeric_column_1"]
}
`.trim();

        try {
            const response = await aiClient.generateContent([
                { role: 'system', content: 'You are a data visualization expert. Respond ONLY with valid JSON.' },
                { role: 'user', content: prompt }
            ], { model: modelId, json: true, userId });

            let result = response;
            if (typeof response === 'string') {
                result = JSON.parse(PromptBuilder.cleanResponse(response));
            } else if (response.text) {
                result = JSON.parse(PromptBuilder.cleanResponse(response.text));
            }

            return {
                shouldVisualize: !!result.shouldVisualize,
                blueprint: result.shouldVisualize ? {
                    type: result.type,
                    title: result.title,
                    xAxis: result.xAxis,
                    yAxis: Array.isArray(result.yAxis) ? result.yAxis : [result.yAxis]
                } : null
            };
        } catch (error) {
            console.error('[VisualizationAnalyzer] Error:', error);
            return { shouldVisualize: false, blueprint: null };
        }
    }
}
