import { aiClient } from './AIClient.js';

/**
 * Classifies a list of files and suggests actions (Spreadsheet, Database, Note, File, Skip).
 */
export async function classifyFiles(files, context = {}) {
    if (!files || files.length === 0) return [];

    const prompt = `
You are a Smart Data Assistant for Pegasus, a platform that manages portfolios, databases, and research.
I have a list of files that were just uploaded (possibly from a zip file or a folder).
Your task is to classify each file and suggest the most appropriate action for it based on its name and extension.

Actions:
- "spreadsheet": For data files like Excel (.xlsx, .xls) and CSV (.csv). These will be imported into a DuckDB managed connection.
- "database": For database files like SQLite (.db, .sqlite, .sqlite3) or DuckDB (.duckdb).
- "note": For text-based documents that should be imported as rich text notes in a Space (e.g., .md, .txt).
- "file": For documents that should be stored as static files in a Space (e.g., .pdf, .docx, .doc, .pptx).
- "skip": For system files, logs, or duplicates that shouldn't be processed (e.g., .DS_Store, __MACOSX, .thumbs.db).

Context (Optional):
Space Name: ${context.spaceName || 'General Workspace'}

Files to Classify:
${files.map(f => `- ${f.name} (type: ${f.type || 'unknown'})`).join('\n')}

Output Format:
Provide a JSON response (strictly valid JSON) containing an array of "suggestions".
Each suggestion must have:
- "filename": string (original name)
- "suggested_action": "spreadsheet" | "database" | "note" | "file" | "skip"
- "reasoning": string (short explanation)
- "options": object (additional info based on action)
  - For spreadsheet: { "tableName": string (suggested snake_case table name) }
  - For note/file: { "title": string (suggested title) }

Example Output:
{
  "suggestions": [
    {
      "filename": "Portfolio.xlsx",
      "suggested_action": "spreadsheet",
      "reasoning": "Excel file identified as portfolio data.",
      "options": { "tableName": "portfolio_data" }
    }
  ]
}
`;

    try {
        const response = await aiClient.generateText(prompt);
        let cleanJson = response.trim();
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');

        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
            cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
        }

        const parsed = JSON.parse(cleanJson);
        return parsed.suggestions || [];
    } catch (e) {
        console.error("[Classifier] AI classification failed:", e);
        // Fallback: simple extension-based matching
        return files.map(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            let action = 'file'
            if (['xlsx', 'xls', 'csv'].includes(ext)) action = 'spreadsheet'
            else if (['db', 'sqlite', 'sqlite3', 'duckdb'].includes(ext)) action = 'database'
            else if (['md', 'txt'].includes(ext)) action = 'note'
            else if (['ds_store', 'thumbs.db'].includes(ext) || f.name.startsWith('__MACOSX')) action = 'skip'

            return {
                filename: f.name,
                suggested_action: action,
                reasoning: "Classified based on file extension (fallback).",
                options: {}
            }
        });
    }
}
