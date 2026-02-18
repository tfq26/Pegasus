/**
 * Semantic Intent Classifier
 * Uses AI for nuanced intent detection with confidence scoring and multi-step request handling.
 */
import { aiClient } from '../../ai/AIClient.js';

export class SemanticIntentClassifier {
    // Fallback keyword patterns for quick classification
    static QUICK_PATTERNS = {
        visualization: [
            /\b(chart|graph|plot|visualize|visualization|trend|histogram|pie|bar|line|scatter)\b/i,
            /\b(show me a|create a|generate a|make a)\s+(chart|graph|plot|visual)/i
        ],
        query: [
            /^(select|show|list|find|get|display|give|tell me|what are|how many|count)/i,
            /\b(from|where|group by|order by)\b/i
        ],
        analysis: [
            /\b(why|explain|analyze|analysis|insight|reason|cause|understand|prediction|forecast)\b/i,
            /\b(what happened|what caused|break down|deep dive)\b/i
        ],
        action: [
            /\b(create|update|delete|insert|add|remove|modify|change)\b/i,
            /\b(save|export|download|upload)\b/i
        ]
    };

    /**
     * Quick classification using patterns (no AI call)
     * Used when speed is critical or AI is unavailable
     */
    static classifyQuick(message) {
        if (!message || typeof message !== 'string') {
            return { type: 'chat', confidence: 0 };
        }

        const lower = message.toLowerCase().trim();

        // Check slash commands (highest priority)
        if (/\/(visualization|chart|plot)/i.test(lower)) {
            return { type: 'visualization', confidence: 1.0, force: true };
        }
        if (/\/(query|sql)/i.test(lower)) {
            return { type: 'query', confidence: 1.0, force: true };
        }
        if (/\/(analyze|explain)/i.test(lower)) {
            return { type: 'analysis', confidence: 1.0, force: true };
        }
        if (/\/(text)/i.test(lower)) {
            return { type: 'chat', confidence: 1.0, force: true };
        }

        // Score each intent type
        const scores = {};
        for (const [intentType, patterns] of Object.entries(this.QUICK_PATTERNS)) {
            scores[intentType] = patterns.reduce((score, pattern) => {
                return score + (pattern.test(lower) ? 1 : 0);
            }, 0);
        }

        // Find the winner
        const maxScore = Math.max(...Object.values(scores));
        const winner = Object.entries(scores).find(([_, score]) => score === maxScore);

        if (maxScore === 0) {
            return { type: 'chat', confidence: 0.5 };
        }

        return {
            type: winner[0],
            confidence: Math.min(maxScore / 2, 1.0),
            scores
        };
    }

    /**
     * Full semantic classification using AI
     * Provides detailed intent analysis with multi-step detection
     */
    static async classifySemantic(message, context = {}, modelId = null, userId = null) {
        const { schema, conversationContext, activeTable } = context;

        // Quick classification as fallback
        const quickResult = this.classifyQuick(message);

        // If it's a forced slash command, return immediately
        if (quickResult.force) {
            return {
                ...quickResult,
                secondaryIntent: null,
                reasoning: 'Explicit slash command detected',
                approach: `Execute ${quickResult.type} command`,
                dataNeeded: [],
                outputFormat: quickResult.type === 'visualization' ? 'chart' : 'text'
            };
        }

        // Build AI prompt
        const prompt = this._buildClassificationPrompt(message, quickResult, context);

        try {
            const response = await aiClient.generateContent([
                { role: 'system', content: 'You are an intent classifier for a data analytics platform. Return only valid JSON.' },
                { role: 'user', content: prompt }
            ], { model: modelId, json: true, userId, maxTokens: 500 });

            let result;
            if (typeof response === 'string') {
                result = JSON.parse(response.replace(/```json\s*|\s*```/g, '').trim());
            } else if (response.text) {
                result = JSON.parse(response.text.replace(/```json\s*|\s*```/g, '').trim());
            } else {
                result = response;
            }

            return {
                type: result.primaryIntent || quickResult.type,
                secondaryIntent: result.secondaryIntent || null,
                confidence: result.confidence || quickResult.confidence,
                reasoning: result.reasoning || '',
                approach: result.suggestedApproach || '',
                dataNeeded: result.dataNeeded || [],
                outputFormat: result.outputFormat || 'text',
                isMultiStep: !!result.secondaryIntent,
                quickClassification: quickResult
            };

        } catch (error) {
            console.warn('[SemanticIntent] AI classification failed, using quick result:', error.message);
            return {
                ...quickResult,
                secondaryIntent: null,
                reasoning: 'Fallback to pattern matching',
                approach: '',
                dataNeeded: [],
                outputFormat: quickResult.type === 'visualization' ? 'chart' : 'text',
                error: error.message
            };
        }
    }

    /**
     * Build the classification prompt
     * @private
     */
    static _buildClassificationPrompt(message, quickResult, context) {
        const { schema, conversationContext, activeTable } = context;

        return `
CLASSIFY THE USER'S INTENT for a data analytics platform.

USER MESSAGE: "${message}"

CURRENT CONTEXT:
- Active Table: ${activeTable || 'None'}
- Available Tables: ${schema?.tables?.slice(0, 8).join(', ') || 'Unknown'}
- Is Follow-up: ${conversationContext?.isFollowUp || false}
${conversationContext?.entities?.lastTable ? `- Previous Table: ${conversationContext.entities.lastTable}` : ''}

PATTERN MATCH RESULT: ${quickResult.type} (confidence: ${quickResult.confidence})

CLASSIFY INTO ONE OF:
- "visualization": User wants a chart, graph, or visual representation
- "query": User wants to fetch/list/count data
- "analysis": User wants insights, explanations, or predictions
- "action": User wants to modify data (create/update/delete)
- "chat": General question or conversation

DETECT MULTI-STEP REQUESTS:
- "Show me sales trends" = query (fetch data) + visualization (show as chart)
- "Create a pie chart of revenue by region" = query (fetch with GROUP BY) + visualization (pie chart)
- "Why is Q1 down? Show me the breakdown" = query + analysis

RETURN JSON:
{
  "primaryIntent": "visualization|query|analysis|action|chat",
  "secondaryIntent": null | "visualization|query|analysis",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "suggestedApproach": "what the AI should do",
  "dataNeeded": ["table or column names"],
  "outputFormat": "chart|table|text|mixed"
}
`;
    }

    /**
     * Determine if the intent requires data fetching first
     */
    static requiresDataFetch(intent) {
        return ['visualization', 'analysis'].includes(intent.type) ||
            (intent.type === 'query');
    }

    /**
     * Determine if the intent should produce a visualization
     */
    static shouldVisualize(intent) {
        return intent.type === 'visualization' ||
            intent.secondaryIntent === 'visualization' ||
            intent.outputFormat === 'chart';
    }
}
