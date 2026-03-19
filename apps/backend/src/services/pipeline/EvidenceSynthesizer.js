import { parseJsonBlock } from '../../v2/utils/json.js';

function flattenSources(selectedSources) {
    return [selectedSources?.primarySource, selectedSources?.secondarySource]
        .filter(Boolean)
        .map((source) => ({
            id: source.id,
            title: source.title,
            provider: source.provider,
            type: source.type,
            confidence: source.confidence
        }));
}

function deterministicAnswer(prompt, executionState, sources) {
    if (executionState.queryResults.length > 0) {
        const result = executionState.mergedResults
            ? { rows: executionState.mergedResults, rowCount: executionState.mergedResults.length }
            : executionState.queryResults[0];
        const topRows = (result.rows || []).slice(0, 3);
        if (topRows.length === 0) {
            return `I checked ${sources.map((source) => source.title).join(', ') || 'the selected source'} and found no matching rows.`;
        }
        const summary = topRows.map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(', ')).join(' | ');
        return `I answered this from ${sources.map((source) => source.title).join(', ')}. Top results: ${summary}.`;
    }

    if (executionState.excerpts.length > 0) {
        const excerpts = executionState.excerpts.slice(0, 2).map((excerpt) => `${excerpt.title}: ${excerpt.excerpt}`).join(' | ');
        return `I answered this from the available notes and documents. Relevant excerpts: ${excerpts}`;
    }

    return `I could not find grounded evidence to answer "${prompt}".`;
}

export class EvidenceSynthesizer {
    constructor({ aiClient } = {}) {
        this.aiClient = aiClient;
    }

    async synthesize({ prompt, intent, executionState, selectedSources, modelId, userId }) {
        const sources = flattenSources(selectedSources);
        const evidenceBundle = {
            tables: executionState.schemaSummary || [],
            excerpts: executionState.excerpts.slice(0, 2),
            queryResults: executionState.mergedResults
                ? [{ rows: executionState.mergedResults, rowCount: executionState.mergedResults.length }]
                : executionState.queryResults.slice(0, 2),
            sourceAttribution: sources,
            assumptions: []
        };

        let answer = null;
        let confidence = Math.max(0.5, selectedSources?.confidence || 0.5);
        let assumptions = [];

        if (this.aiClient && (executionState.queryResults.length > 0 || executionState.excerpts.length > 0)) {
            try {
                const response = await this.aiClient.generateContent([
                    {
                        role: 'system',
                        content: [
                            'You are a grounded analytics answer synthesizer.',
                            'Answer only from the provided evidence bundle.',
                            'Return JSON only: {"answer":"...","confidence":0.0-1.0,"assumptions":["..."]}.',
                            'If no evidence supports a claim, say so plainly.'
                        ].join(' ')
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({
                            prompt,
                            intent: {
                                type: intent.type,
                                wantsVisualization: intent.wantsVisualization
                            },
                            evidenceBundle
                        }, null, 2)
                    }
                ], { model: modelId, userId, json: true });

                const parsed = parseJsonBlock(response?.text || response);
                if (parsed?.answer) {
                    answer = parsed.answer;
                    confidence = typeof parsed.confidence === 'number' ? parsed.confidence : confidence;
                    assumptions = Array.isArray(parsed.assumptions) ? parsed.assumptions : [];
                }
            } catch {
                answer = null;
            }
        }

        if (!answer) {
            answer = deterministicAnswer(prompt, executionState, sources);
        }

        const attribution = sources.length > 0 ? `Sources: ${sources.map((source) => source.title).join(', ')}.` : 'Sources: none.';
        const assumptionText = assumptions.length > 0 ? ` Assumptions: ${assumptions.join('; ')}.` : '';
        const finalAnswer = `${answer}\n\n${attribution}${assumptionText}`.trim();

        return {
            answer: finalAnswer,
            confidence,
            assumptions,
            sources,
            evidenceBundle
        };
    }
}
