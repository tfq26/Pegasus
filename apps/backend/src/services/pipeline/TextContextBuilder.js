function tokenize(value) {
    return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function extractExcerpt(content, prompt, maxLength = 500) {
    const text = String(content || '').trim();
    if (!text) return '';

    const promptTerms = tokenize(prompt).filter((term) => term.length > 2);
    const lowerText = text.toLowerCase();
    const matchTerm = promptTerms.find((term) => lowerText.includes(term));
    if (!matchTerm) return text.slice(0, maxLength);

    const index = lowerText.indexOf(matchTerm);
    const start = Math.max(0, index - 140);
    const end = Math.min(text.length, start + maxLength);
    return text.slice(start, end);
}

export class TextContextBuilder {
    async build({ prompt, selectedSources = [] }) {
        const excerpts = [];

        for (const source of selectedSources.filter((candidate) => candidate?.capabilities?.isUnstructured).slice(0, 2)) {
            const content = source.resource?.content || source.resource?.preview || source.resource?.snippet || source.resource?.metadata?.content || '';
            const excerpt = extractExcerpt(content, prompt, 500);
            if (!excerpt) continue;

            excerpts.push({
                sourceId: source.id,
                title: source.title,
                provider: source.provider,
                confidence: source.confidence || 0.6,
                excerpt
            });
        }

        return { excerpts };
    }
}
