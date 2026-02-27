/**
 * PromptComposer
 * 
 * Centralizes the assembly of AI prompts, including business strategies, 
 * temporal context, and formatting of tool results.
 */
export class PromptComposer {
    /**
     * Builds the initial user prompt enriched with system context.
     * 
     * @param {string} basePrompt - The original user message.
     * @param {Object} options - Contextual options (time, intent, profile).
     * @returns {string} The enriched prompt.
     */
    static composeInitialPrompt(basePrompt, options = {}) {
        const now = options.now || new Date();
        const timeContext = `\nCURRENT TEMPORAL CONTEXT:\n- Local Time: ${now.toString()}\n- UTC Time: ${now.toISOString()}\n`;

        let prompt = `${basePrompt}\n${timeContext}`;

        // Append explicit context hints (e.g. from OneContext)
        if (options.contextBlock) {
            prompt += `\n${options.contextBlock}`;
        }

        return prompt;
    }

    /**
     * Formats tool execution results for inclusion in the next AI iteration.
     * 
     * @param {string} toolName - Name of the executed tool.
     * @param {Object} args - Arguments passed to the tool.
     * @param {Object} result - The output of the tool.
     * @returns {string} Formatted context block.
     */
    static composeToolResult(toolName, args, result) {
        const header = `[System Context - Result of ${toolName} for "${JSON.stringify(args)}"]`;
        let content = result.rows || result.text || result.data || JSON.stringify(result, null, 2);

        if (Array.isArray(content)) {
            // Smart truncation for arrays
            if (content.length > 20) {
                const totalCount = content.length;
                const slice = content.slice(0, 15);
                content = JSON.stringify(slice, null, 2) + `\n... (Result truncated: ${slice.length} of ${totalCount} rows shown. If you need more specific data, use a more precise query/filter.)`;
            } else {
                content = JSON.stringify(content, null, 2);
            }
        } else if (typeof content === 'string' && content.length > 4000) {
            // Hard limit for long string results (like web search or logs)
            content = content.substring(0, 3800) + "\n... (Result truncated for context preservation. Focus your analysis on the provided snippet.)";
        }

        return `${header}:\n${content}\n`;
    }

    /**
     * Injects a specific strategy hint when AI needs guidance on a complex task.
     */
    static injectStrategyHint(prompt, intent) {
        if (!intent) return prompt;

        if (intent.type === 'comparison' || intent.scores?.comparison > 0) {
            return prompt + `\n[Expert Strategy - Temporal Comparison]: 
If identifying trends or comparisons:
1. Identify BOTH date ranges.
2. Fetch data for BOTH periods.
3. Analyze the DELTA (percentage/change) between the two.
DO NOT claim data is missing if tool calls can resolve the ranges.\n`;
        }

        return prompt;
    }
}
