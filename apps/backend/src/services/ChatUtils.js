import { db } from "../db/index.js";
import { queryHistory } from "../db/schema.js";

/**
 * Robustly parse JSON from AI responses that might contain markdown or extra text.
 * @param {string} text - The raw text from the AI
 * @param {string} fallbackKey - The key to map raw text to if parsing fails (default: 'answer')
 */
export const robustParseJson = (text, fallbackKey = 'answer') => {
    if (!text) return { [fallbackKey]: "" };

    const trimmed = text.trim();

    // 1. Try direct parsing (common case)
    try {
        // Remove markdown tags if present
        const cleaned = trimmed.replace(/^```(json)?\s*|\s*```$/gi, '');
        return JSON.parse(cleaned);
    } catch (e) {
        // 2. Try extracting JSON block {...} if embedded in text
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (innerE) {
                // If nested parsing fails, continue to fallback
            }
        }
    }

    // 3. Fallback: Return as an object with the raw text in the intended key
    return { [fallbackKey]: trimmed };
}

/**
 * Logs AI token usage to the database.
 */
export const logAiUsage = async (userId, tokens, model, type, content, connectionId) => {
    if (!tokens || tokens <= 0) return;
    try {
        const rawConnId = connectionId ? (connectionId.includes(':') ? connectionId.split(':')[1] : connectionId) : null;

        await db.insert(queryHistory).values({
            userId,
            query: content ? content.substring(0, 500) : 'AI Operation',
            source: type || 'ai_generation',
            model: model || 'default',
            status: 'success',
            connectionId: rawConnId,
            tokensUsed: tokens,
            createdAt: new Date()
        });
        console.log(`[ChatUtils] Logged ${tokens} tokens for user ${userId} (${type})`);
    } catch (e) {
        console.error("[ChatUtils] Failed to log AI usage:", e.message);
    }
}
