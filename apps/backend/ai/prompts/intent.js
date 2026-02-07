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
    if (lower.startsWith('/visualization') || lower.startsWith('/chart') || lower.startsWith('/plot')) {
        return { type: 'visualization', force: true };
    }
    if (lower.startsWith('/query') || lower.startsWith('/sql')) {
        return { type: 'query', force: true, noExecute: true }; // Just generate SQL
    }
    if (lower.startsWith('/analyze') || lower.startsWith('/explain')) {
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

    // 3. Heuristic Classification
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

    // Fallback to chat if ambiguous
    return { type: 'chat' };
}
