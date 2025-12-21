/**
 * Sanitizes AI responses to ensure they are user-friendly.
 * It prevents raw JSON dumps from being displayed as the primary message.
 */
export function sanitizeAIResponse(response: any): string {
    if (!response) return "I processed your request.";

    // If it's already an object (e.g. JSON parsed), don't show the raw object
    if (typeof response === 'object') {
        return "I have retrieved the data for you. You can view the details in the Results Panel below.";
    }

    let text = String(response).trim();

    // 1. Check for purely JSON code blocks which typically indicate the AI just returned data
    // Matches ```json [...] ``` or just [...]
    const isJsonBlock = /^```(?:json)?\s*[\s\S]*?\s*```$/i.test(text);
    const isRawJsonArray = /^\[\s*\{[\s\S]*\}\s*\]$/.test(text);
    const isRawJsonObject = /^\{\s*"[\s\S]*"\s*:\s*[\s\S]*\s*\}$/.test(text);

    if (isJsonBlock || isRawJsonArray || isRawJsonObject) {
        // Try parsing to verify it is indeed data
        try {
            let clean = text;
            if (text.startsWith('```')) {
                clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
            }
            JSON.parse(clean);

            // If we successfully parsed it, it's a data dump.
            // Return a friendly message instead.
            return "I have retrieved the data for you. You can view the details in the Results Panel below.";
        } catch (e) {
            // If parsing fails, it might be text that looks like JSON, keep it (or partial JSON)
            // But if it looks heavily like JSON, still replace it
        }
    }

    // 2. Check for mixed content where a LARGE JSON block is embedded
    // If the text contains a JSON array that is very long (indicative of rows of data), replace it.

    // Regex to find JSON arrays [ ... ]
    // We use a simple heuristic: [ followed by { and ending with } ]
    const jsonArrayRegex = /\[\s*\{[\s\S]*?\}\s*\]/g;

    // We replace large JSON arrays with a placeholder
    const sanitizedText = text.replace(jsonArrayRegex, (match) => {
        // If the JSON array is longer than roughly 200 chars, it's probably data rows
        if (match.length > 200) {
            return "\n\n*[Detailed data has been loaded into the Results Panel]*\n\n";
        }
        return match;
    });

    return sanitizedText;
}
