import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { connections } from '../../db/schema.js';
import { SourceCapabilityService } from './SourceCapabilityService.js';

function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function promptReferencesCandidate(prompt, candidate) {
    const lowerPrompt = String(prompt || '').toLowerCase();
    const promptSlug = slugify(prompt);
    const title = String(candidate?.title || '').toLowerCase();
    const titleSlug = slugify(candidate?.title || '');

    if (!title) return false;
    if (lowerPrompt.includes(title)) return true;
    if (titleSlug && promptSlug.includes(titleSlug)) return true;

    const promptTokens = new Set(lowerPrompt.split(/[^a-z0-9]+/).filter(Boolean));
    const titleTokens = title.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
    return titleTokens.length > 0 && titleTokens.every((token) => promptTokens.has(token));
}

function dedupeResources(resources = []) {
    const seen = new Set();
    return resources.filter((resource) => {
        const key = resource.id || `${resource.type}:${resource.name || resource.title || resource.filename || ''}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function computeScore(candidate, intent, prompt) {
    let score = 0;
    const lower = String(prompt || '').toLowerCase();
    const title = String(candidate.title || '').toLowerCase();

    if (candidate.isActiveConnection) score += 50;
    if (candidate.method === 'explicit') score += 35;
    if (candidate.method === 'implicit-keyword') score += 20;
    if (candidate.method === 'implicit-token-overlap') score += 15;
    if (candidate.method === 'semantic') score += Math.round((candidate.semanticScore || 0) * 20);
    if (title && lower.includes(title)) score += 20;

    if (intent?.needsStructured && candidate.capabilities?.isStructured) score += 25;
    if (intent?.needsText && candidate.capabilities?.isUnstructured) score += 20;
    if (intent?.wantsVisualization && candidate.capabilities?.isStructured) score += 10;
    if (intent?.type === 'comparison' && candidate.capabilities?.isStructured) score += 10;
    if (intent?.type === 'mixed') {
        if (candidate.capabilities?.isStructured) score += 10;
        if (candidate.capabilities?.isUnstructured) score += 10;
    }

    return score;
}

function shouldRequireClarification(primarySource, scoredCandidates = []) {
    if (!primarySource) return true;
    if (primarySource.isActiveConnection) return false;
    if (scoredCandidates.length <= 1) return false;

    const selectionConfidence = primarySource.confidence || 0;
    const runnerUp = scoredCandidates.find((candidate) => candidate.id !== primarySource.id) || null;
    const scoreGap = runnerUp ? (primarySource.score - runnerUp.score) : primarySource.score;

    return selectionConfidence < 0.45 && scoreGap < 15;
}

export class SourceSelector {
    async createCandidates({ userId, connectionId, resolvedResources = [] }) {
        const candidates = [];
        const dedupedResources = dedupeResources(resolvedResources);

        if (connectionId && !dedupedResources.find((resource) => resource.id === connectionId)) {
            const activeConnection = await this._loadActiveConnection(userId, connectionId);
            if (activeConnection) {
                dedupedResources.unshift(activeConnection);
            }
        }

        for (const resource of dedupedResources) {
            if (resource?.type === 'instruction') continue;
            const provider = resource.provider || resource.type || 'unknown';
            const title = resource.title || resource.name || resource.filename || provider;
            candidates.push({
                id: resource.id || `${resource.type}:${title}`,
                type: resource.type || 'unknown',
                provider,
                title,
                method: resource.method || (resource.id === connectionId ? 'active' : 'implicit'),
                semanticScore: resource.semanticScore || 0,
                isActiveConnection: resource.id === connectionId,
                capabilities: SourceCapabilityService.forResource(resource),
                reason: '',
                score: 0,
                resource
            });
        }

        return candidates;
    }

    selectSources({ prompt, intent, candidates = [] }) {
        const scored = candidates.map((candidate) => {
            const score = computeScore(candidate, intent, prompt);
            const promptMatched = promptReferencesCandidate(prompt, candidate);
            const confidence = Math.max(0.2, Math.min(0.99, score / 100));
            return {
                ...candidate,
                score: promptMatched ? score + 15 : score,
                confidence: promptMatched ? Math.max(confidence, 0.85) : confidence,
                promptMatched,
                reason: candidate.isActiveConnection
                    ? 'Active connection'
                    : (candidate.method === 'explicit' || promptMatched ? 'Explicitly referenced' : 'Selected by routing heuristics')
            };
        }).sort((a, b) => b.score - a.score);

        const structured = scored.filter((candidate) => candidate.capabilities?.isStructured);
        const text = scored.filter((candidate) => candidate.capabilities?.isUnstructured);

        let primarySource = null;
        let secondarySource = null;

        if (intent?.type === 'mixed') {
            primarySource = structured[0] || text[0] || null;
            secondarySource = primarySource?.capabilities?.isStructured ? text[0] || null : structured[0] || null;
        } else if (intent?.needsStructured) {
            primarySource = structured[0] || text[0] || null;
            if (intent?.type === 'comparison') {
                secondarySource = structured.find((candidate) => candidate.id !== primarySource?.id) || null;
            } else if (intent?.needsText) {
                secondarySource = text[0] || null;
            }
        } else if (intent?.needsText) {
            primarySource = text[0] || scored[0] || null;
        } else {
            primarySource = scored[0] || null;
        }

        if (secondarySource && secondarySource.id === primarySource?.id) {
            secondarySource = null;
        }

        const singleCandidate = scored.length === 1;
        const singleStructuredCandidate = structured.length === 1 && (intent?.needsStructured || !text.length);
        const primaryPromptMatched = primarySource?.promptMatched || false;
        const selectionConfidence = singleCandidate || singleStructuredCandidate
            ? Math.max(primarySource?.confidence || 0, 0.92)
            : (primarySource?.confidence || 0);
        const requiresClarification = !singleCandidate
            && !singleStructuredCandidate
            && !primaryPromptMatched
            && shouldRequireClarification(primarySource, scored);

        return {
            candidates: scored,
            primarySource,
            secondarySource,
            confidence: selectionConfidence,
            requiresClarification,
            selectionMode: singleCandidate
                ? 'single_candidate'
                : (singleStructuredCandidate ? 'single_structured_candidate' : (primaryPromptMatched ? 'prompt_match' : 'heuristic')),
            clarificationOptions: scored.slice(0, 3).map((candidate) => candidate.title)
        };
    }

    async _loadActiveConnection(userId, connectionId) {
        if (!connectionId || connectionId.startsWith('system:')) return null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(connectionId)) return null;

        const connection = await db.query.connections.findFirst({
            where: and(eq(connections.id, connectionId), eq(connections.userId, userId))
        });

        if (!connection) return null;
        return {
            ...connection,
            provider: connection.type,
            type: 'database',
            method: 'active'
        };
    }
}
