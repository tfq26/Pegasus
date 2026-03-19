export function parseJsonBlock(input) {
    if (!input) return null;
    if (typeof input === 'object') return input;

    const trimmed = String(input).trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

    try {
        return JSON.parse(candidate);
    } catch {
        return null;
    }
}
