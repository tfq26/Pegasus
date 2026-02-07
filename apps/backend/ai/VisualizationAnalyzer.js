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

        const prompt = PromptBuilder.buildVisualizationPrompt(originalPrompt, data, forceVisualization);


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
