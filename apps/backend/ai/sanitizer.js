import { aiClient } from './AIClient.js';

/**
 * Profiles the table data to identify potential issues (nulls, types, outliers).
 * Returns a summary object.
 */
export function profileData(rows) {
    if (!rows || rows.length === 0) return { error: 'No data to profile' };

    const profile = {};
    const columns = Object.keys(rows[0]);

    columns.forEach(col => {
        profile[col] = {
            nullCount: 0,
            distinctCount: 0,
            distinctValues: new Set(),
            examples: [],
            type: null
        };
    });

    rows.forEach(row => {
        columns.forEach(col => {
            const val = row[col];
            if (val === null || val === undefined) {
                profile[col].nullCount++;
            } else {
                profile[col].distinctValues.add(val);
                // Basic type inference (first non-null)
                if (!profile[col].type) profile[col].type = typeof val;
            }
        });
    });

    // Finalize stats
    columns.forEach(col => {
        profile[col].distinctCount = profile[col].distinctValues.size;
        profile[col].examples = Array.from(profile[col].distinctValues).slice(0, 5); // Take first 5 as sample
        delete profile[col].distinctValues; // cleanup memory
    });

    return profile;
}

/**
 * Analyzes the table profile and sample data using AI to detect semantic issues and propose fixes.
 */
export async function analyzeForSanitization(tableName, rows, model = 'gpt-4') {
    const profile = profileData(rows);
    const sampleRows = rows.slice(0, 20); // Send first 20 rows for context

    const prompt = `
You are a Data Quality Expert. Analyze the following dataset profile and sample data from table "${tableName}".
Your goal is to identify data quality issues and propose standard SQL fixes.

## Issues to Detect:
1.  **NULL Values**: Columns with missing data.
2.  **Inconsistencies**: Spelling errors (e.g., "Californa" vs "California"), formatting issues.
3.  **Outliers**: Values that don't match the column's pattern.

## Data Profile:
${JSON.stringify(profile, null, 2)}

## Sample Data (First 20 rows):
${JSON.stringify(sampleRows, null, 2)}

## Output Format:
Propvide a JSON response (strictly valid JSON) with a list of "issues".
Each issue should have:
- "column": string
- "type": "null" | "inconsistency" | "outlier" | "other"
- "description": string (human readable explanation of the problem)
- "suggested_action": "delete_rows" | "update_value" | "fill_null" | "custom_sql"
- "sql_template": string (A specific SQL statement to fix this. Use "{{TABLE}}" for table name. If specific values are involved, generate distinct UPDATE statements or a CASE statement. Prefer generic fixes where possible, but for widely varied typos, you might need specific UPDATES. Limit to 5 specific SQL statements per issue if they are row-level fixes.)
- "risk": "low" | "medium" | "high"

Example Output:
{
  "issues": [
    {
      "column": "region",
      "type": "null",
      "description": "50 rows have NULL region.",
      "suggested_action": "fill_null",
      "sql_template": "UPDATE {{TABLE}} SET region = 'Unknown' WHERE region IS NULL;",
      "risk": "medium"
    }
  ]
}
`;

    try {
        const response = await aiClient.generateText(prompt, model);
        // Attempt to parse JSON
        let cleanJson = response.trim();
        // Remove markdown code blocks if present
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');

        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("AI Sanitization failed:", e);
        throw new Error("Failed to analyze data for sanitization");
    }
}
