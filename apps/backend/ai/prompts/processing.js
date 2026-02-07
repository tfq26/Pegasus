/**
 * Data Processing & Analysis Prompts
 */

export function buildAnalysisPrompt(question, results, query, schema = {}) {
    // 1. Context Building
    const registry = schema.sourceRegistry || {};
    let registryContent = '';
    if (Object.keys(registry).length > 0) {
        registryContent = `\nDATA SOURCE MAPPING:\n`;
        Object.entries(registry).forEach(([name, meta]) => {
            registryContent += `- ${name} -> Source: ${meta.origin} (${meta.type})\n`;
        });
    }

    // 2. Knowledge Base
    let kbContent = '';
    if (schema.semanticContext?.knowledgeBase?.length > 0) {
        kbContent = `\n[KNOWLEDGE BASE]\n`;
        schema.semanticContext.knowledgeBase.forEach((item, i) => {
            kbContent += `[Source ${i + 1}: ${item.source}]\n${item.content}\n\n`;
        });
    }

    return `
You are a helpful data analyst assistant. 
Analyze the following database results to answer the user's question with deep insights.

${registryContent}

${kbContent}

Query Executed: ${query}

Results:
${Array.isArray(results) ? JSON.stringify(results.slice(0, 50), null, 2) : JSON.stringify(results, null, 2)}
${Array.isArray(results) && results.length > 50 ? '(Note: Only the first 50 rows are shown)' : ''}

User Question: ${question}

Provide a natural language summary that directly answers the user's question.

CRITICAL: You MUST return a valid JSON object.

Response Format:
{
  "answer": "Your detailed response here...",
  "needs_disclaimer": true, // Set to true ONLY if providing financial advice
  "prediction": {
    "value": "The predicted value (if applicable)",
    "confidence": 0.85,
    "reasoning": "Step-by-step logic"
  }
}

Rules for "answer":
1. Length: At least 1 paragraph, maximum 5 paragraphs.
2. Use Markdown (**bold**, lists, etc).
3. Identify patterns, trends, or outliers.
`.trim();
}

export function buildTitlePrompt(messages) {
    const recentMessages = messages.slice(0, 4);
    const conversationText = recentMessages.map(m => `${m.role}: ${m.content?.substring(0, 300) || ''}`).join('\n');

    return `
Generate a SHORT, DESCRIPTIVE title (2-5 words) for this chat based on the user's intent.

RULES:
- Be specific (e.g., "Sales by Region" not "Data Query")
- No quotes, no labels
- Use nouns and action words

Messages:
${conversationText}

Title:`.trim();
}

export function buildDisambiguationPrompt(term, candidates) {
    return `
The user is searching for "${term}" in a database.
Here are the candidate tables/columns found:
${JSON.stringify(candidates, null, 2)}

Which of these are the most relevant?
Return a JSON array of the top matches (max 8).
Output format: ["match1", "match2"]
`.trim();
}
