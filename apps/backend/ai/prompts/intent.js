/**
 * Intent Classifier
 * Determines the primary goal of the user's request before prompt construction.
 */

export function classifyIntent(message, context = {}) {
    if (!message || typeof message !== 'string') {
        return { type: 'chat', confidence: 0 };
    }

    const lower = message.toLowerCase().trim();

    // 1. Explicit Slash Commands (Highest Priority)
    if (/\/(visualization|chart|plot)/i.test(lower)) {
        return { type: 'visualization', force: true };
    }
    if (/\/(query|sql)/i.test(lower)) {
        return { type: 'query', force: true, noExecute: true }; // Just generate SQL
    }
    if (/\/(analyze|explain)/i.test(lower)) {
        return { type: 'analysis', force: true };
    }

    // 2. Keyword Analysis
    const hasVisualizationKeywords = lower.includes('chart') ||
        lower.includes('graph') ||
        lower.includes('plot') ||
        lower.includes('visualize') ||
        lower.includes('trend');

    const hasQueryKeywords = lower.includes('select') ||
        lower.includes('from') ||
        lower.includes('show me') ||
        lower.includes('list') ||
        lower.includes('how many') ||
        lower.includes('count') ||
        lower.includes('find');

    const hasAnalysisKeywords = lower.includes('why') ||
        lower.includes('explain') ||
        lower.includes('analyze') ||
        lower.includes('prediction') ||
        lower.includes('forecast');

    // 3. Out-of-Scope Detection (Jokes, General Knowledge, etc.)
    const isOutOfScope = lower.includes('joke') ||
        lower.includes('tell me a') ||
        lower.includes('why did the') ||
        lower.includes('capital of') ||
        lower.includes('who is') ||
        lower.includes('poem') ||
        lower.includes('story');

    // 4. Heuristic Classification
    if (hasVisualizationKeywords) {
        return { type: 'visualization' };
    }

    // If user asks "Why..." or "Explain...", prioritize analysis
    if (hasAnalysisKeywords) {
        return { type: 'analysis' };
    }

    // Default data fetching
    if (hasQueryKeywords) {
        return { type: 'query' };
    }

    // Fallback to chat if ambiguous or flagged as out-of-scope
    return { type: 'chat', isOutOfScope };
}
