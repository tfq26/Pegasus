import { ref } from 'vue';

export interface DataViewAction {
    action: 'find' | 'sort' | 'calculate' | 'update' | 'format' | 'visibility' | 'delete' | 'highlight' | 'complex' | 'unknown';
    reasoning?: string;
    // For 'find'
    findTarget?: string;
    // For 'sort'
    sortConditions?: Array<{ column: string; direction: 'asc' | 'desc' }>;
    // For 'calculate'
    calculate?: { newColumnName: string; logic: string; targetColumns: string[] };
    // For 'update'
    update?: { targetColumn: string; newValue: string; conditionLogic: string };
    // For 'format'
    format?: { targetColumn: string; formatType: 'uppercase' | 'lowercase' | 'trim' | 'date' };
    // For 'visibility'
    visibility?: { targetColumns: string[]; action: 'hide' | 'show' };
    // For 'delete'
    delete?: { targetColumn?: string; conditionLogic: string };
    // For 'highlight'
    highlight?: { targetColumn?: string; conditionLogic: string; color?: string };
}

export function useDataViewAI() {
    const isProcessing = ref(false);

    const executeDataViewCommand = async (
        query: string,
        schemaUrl: string,
        columnNames: string[],
        provider: string
    ): Promise<DataViewAction> => {
        isProcessing.value = true;
        try {
            const baseUrl = import.meta.env.VITE_QUERY_API_URL;

            const prompt = `
You are a Data View AI Assistant embedded in an application.
Your goal is to parse a user's natural language command regarding a dataset and convert it into a STRICT JSON format representing one of the designated lightweight operations, or determine if it's too complex.

Available Columns: ${columnNames.join(', ')}
Data Provider: ${provider}

Rules:
1. "find": Use when the user wants to search for a specific value or filter the dataset. Set "findTarget" to the value they are looking for.
2. "sort": Use when the user implies an ordering. It can be multi-step. Set "sortConditions" to an array of objects with "column" and "direction" ("asc" or "desc").
3. "calculate": Use when adding or computing things. Set "calculate" with "newColumnName", "targetColumns" (columns involved), and "logic" (a brief description of the math, e.g., "A + B").
4. "update": Use when the user wants to change values based on a condition (e.g., "Set status to active where role is admin"). Set "update" with "targetColumn", "newValue", and "conditionLogic".
5. "format": Use for changing text case or trimming whitespace. Set "format" with "targetColumn" and "formatType" ("uppercase", "lowercase", "trim", "date").
6. "visibility": Use for hiding or showing specific columns. Set "visibility" with "targetColumns" (array of strings) and "action" ("hide" or "show").
7. "delete": Use for removing rows matching a condition. Set "delete" with an optional "targetColumn" and "conditionLogic" (e.g. "is pending").
8. "highlight": Use for visually marking rows. Set "highlight" with an optional "targetColumn", "conditionLogic", and an optional "color".
9. "complex": Use if the request requires heavy computation (e.g., linear regression) or doesn't map to the above.

User Command: "${query}"

Respond ONLY with valid JSON matching this TypeScript interface:
{
  "action": "find" | "sort" | "calculate" | "update" | "format" | "visibility" | "delete" | "highlight" | "complex" | "unknown",
  "reasoning": "brief explanation",
  "findTarget": "value to find if action=find",
  "sortConditions": [{ "column": "col_name", "direction": "asc|desc" }],
  "calculate": { "newColumnName": "string", "logic": "string", "targetColumns": ["col_name"] },
  "update": { "targetColumn": "col_name", "newValue": "string", "conditionLogic": "string" },
  "format": { "targetColumn": "col_name", "formatType": "uppercase" },
  "visibility": { "targetColumns": ["col_name"], "action": "hide" },
  "delete": { "targetColumn": "col_name", "conditionLogic": "is pending" },
  "highlight": { "targetColumn": "col_name", "conditionLogic": "> 90", "color": "yellow" }
}
`;

            const response = await fetch(`${baseUrl}/api/ai/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    query: prompt,
                    provider: 'openai' // Fallback or configured provider
                })
            });

            if (!response.ok) {
                throw new Error(`AI request failed: ${response.statusText}`);
            }

            const data = await response.json();
            const resultText = data.result || data.response || '';

            // Extract JSON from potential markdown blocks
            const jsonMatch = resultText.match(/```json\n([\s\S]*?)\n```/) || resultText.match(/{[\s\S]*}/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                return JSON.parse(jsonStr) as DataViewAction;
            }

            throw new Error("Failed to parse AI response into JSON");

        } catch (e) {
            console.error('[DataStudioAI] Error:', e);
            return { action: 'unknown', reasoning: String(e) };
        } finally {
            isProcessing.value = false;
        }
    };

    return {
        isProcessing,
        executeDataViewCommand
    };
}
