import { SemanticIntentClassifier } from '../SemanticIntentClassifier.js';

function summarizeSources(sourceCandidates) {
    return (sourceCandidates || []).slice(0, 6).map((candidate) => candidate.title).filter(Boolean);
}

export class IntentRouter {
    constructor({ classifier = SemanticIntentClassifier } = {}) {
        this.classifier = classifier;
    }

    async route({
        prompt,
        modelId,
        userId,
        conversationContext,
        sourceCandidates = [],
        forceVisualization = false,
        forceQuery = false,
        forceText = false,
        forceAnalysis = false
    }) {
        if (forceVisualization) {
            return this._normalize({
                type: 'visualization',
                confidence: 1,
                reasoning: 'Forced visualization mode'
            }, prompt, sourceCandidates);
        }

        if (forceQuery) {
            return this._normalize({
                type: 'query',
                confidence: 1,
                reasoning: 'Forced query mode'
            }, prompt, sourceCandidates);
        }

        if (forceText) {
            return this._normalize({
                type: 'chat',
                confidence: 1,
                reasoning: 'Forced text mode'
            }, prompt, sourceCandidates);
        }

        if (forceAnalysis) {
            return this._normalize({
                type: 'analysis',
                confidence: 1,
                reasoning: 'Forced analysis mode'
            }, prompt, sourceCandidates);
        }

        let classified;
        try {
            classified = await this.classifier.classifySemantic(prompt, {
                schema: { tables: summarizeSources(sourceCandidates) },
                conversationContext
            }, modelId, userId);
        } catch {
            classified = this.classifier.classifyQuick(prompt);
        }

        return this._normalize(classified, prompt, sourceCandidates);
    }

    _normalize(classified, prompt, sourceCandidates) {
        const lower = String(prompt || '').toLowerCase();
        const hasStructured = sourceCandidates.some((candidate) => candidate.capabilities?.isStructured);
        const hasText = sourceCandidates.some((candidate) => candidate.capabilities?.isUnstructured);

        let type = classified?.type || 'chat';
        const wantsVisualization = type === 'visualization' || /\/(visualization|chart|plot)\b|\b(chart|graph|plot|visualize)\b/i.test(lower);
        const comparisonRequested = type === 'comparison' || /\b(compare|comparison|versus|vs|across all|across sources)\b/i.test(lower);
        const textCue = /\b(note|notes|doc|docs|documentation|policy|context|why|reason|explain|using notes|using docs)\b/i.test(lower);

        if (hasStructured && hasText && (comparisonRequested || (textCue && ['analysis', 'query', 'visualization'].includes(type)))) {
            type = 'mixed';
        }

        const needsStructured = ['query', 'analysis', 'visualization', 'comparison', 'mixed'].includes(type);
        const needsText = type === 'mixed' || (hasText && textCue && ['analysis', 'chat'].includes(type));

        return {
            type,
            confidence: classified?.confidence ?? 0.5,
            reasoning: classified?.reasoning || '',
            clarifiedIntent: classified?.clarifiedIntent || null,
            quickClassification: classified?.quickClassification || null,
            wantsVisualization,
            needsStructured,
            needsText,
            requestSummary: String(prompt || '').trim().slice(0, 280),
            outputPreference: wantsVisualization ? 'visualization' : (needsStructured ? 'data' : 'text')
        };
    }
}
