import { aiClient } from './AIClient.js';
import { interpretDataset } from './interpreter.js';

export { interpretDataset };

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
export async function analyzeForSanitization(tableName, rows, optionsOrModel = {}) {
    // Basic argument normalization
    let options = typeof optionsOrModel === 'string' ? { model: optionsOrModel } : optionsOrModel;
    let model = options.model || 'gpt-4';

    // Handle empty tables
    if (!rows || rows.length === 0) {
        console.log('[Sanitizer] No data to analyze')
        return { issues: [], message: 'No data found in table' }
    }

    // 1. Profile Data (Stats)
    const profile = profileData(rows);
    const sampleRows = rows.slice(0, 20); // Send first 20 rows for context

    // 2. Semantic Interpretation (Deep Understanding)
    // Run this in parallel or before generating fixes so we can use the understanding
    let interpretation = {};
    try {
        interpretation = await interpretDataset(tableName, rows, { hint: options.hint });
        console.log(`[Sanitizer] Interpretation complete for ${tableName}:`, interpretation.domain?.domain);
    } catch (e) {
        console.error('[Sanitizer] Interpretation failed:', e);
    }

    const prompt = `
You are a Data Quality Expert. Analyze the following dataset profile and sample data from table "${tableName}".
Your goal is to identify data quality issues and propose standard SQL fixes.


## Semantic Understanding (Context):
The data has been identified as: ${interpretation.domain?.domain || 'Unknown'}
Columns Analysis: ${JSON.stringify(interpretation.columns || [], null, 2)}
Validation Errors: ${interpretation.validation?.rules?.filter(r => !r.isValid).map(r =>
        `Rule "${r.rule}" failed with ${r.errorCount} errors. Example: ${r.errors?.[0]?.message}`
    ).join('\n') || 'None'}


## Issues to Detect:
1.  **Generic Column Names**: Columns named "Column1", "Column2", etc. that should be renamed based on their content.
2.  **NULL Values**: Columns with missing data.
3.  **Inconsistencies**: Spelling errors (e.g., "Californa" vs "California"), formatting issues.
4.  **Outliers**: Values that don't match the column's pattern.

## Data Profile:
${JSON.stringify(profile, null, 2)}

## Sample Data (First 20 rows):
${JSON.stringify(sampleRows, null, 2)}

## IMPORTANT - Column Name Detection:
If you see columns named "Column1", "Column2", "Column3", etc., these are GENERIC placeholders.
You MUST analyze the actual data in these columns and infer meaningful names.

For example:
- If Column1 contains fund names like "Kotak Large & Midcap", "Axis Midcap", rename it to "fund_name"
- If Column2 contains folio numbers, rename it to "folio_number"
- If Column3 contains dates, rename it to "investment_date" or "since_date"
- If Column4 contains amounts/numbers, check context - could be "investment_amount", "current_value", etc.
- If a column contains percentages with "%" or "return", it's likely "return_percentage" or "xirr"
- If a column contains "NAV" values, name it "nav" or "net_asset_value"

Look at the ACTUAL DATA VALUES to infer the column purpose, not just the generic name.

## Output Format:
Provide a JSON response (strictly valid JSON) with a list of "issues".
Each issue should have:
- "column": string (the current column name, e.g., "Column1")
- "type": "generic_column_name" | "null" | "inconsistency" | "outlier" | "other"
- "description": string (human readable explanation of the problem)
- "suggested_action": "rename_column" | "delete_rows" | "update_value" | "fill_null" | "custom_sql"
- "new_column_name": string (ONLY for rename_column action - the proposed new name, use snake_case)
- "sql_template": string (A specific SQL statement to fix this. Use "{{TABLE}}" for table name. For column renames in SurrealDB, use: "DEFINE FIELD new_name ON {{TABLE}} VALUE $value.old_name; REMOVE FIELD old_name ON {{TABLE}};")
- "risk": "low" | "medium" | "high"

Example Output:
{
  "issues": [
    {
      "column": "Column1",
      "type": "generic_column_name",
      "description": "Column1 contains fund names and should be renamed to 'fund_name'",
      "suggested_action": "rename_column",
      "new_column_name": "fund_name",
      "sql_template": "DEFINE FIELD fund_name ON {{TABLE}} VALUE $value.Column1; REMOVE FIELD Column1 ON {{TABLE}};",
      "risk": "low"
    },
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
        console.log('[Sanitizer] Raw AI response:', response.substring(0, 500) + '...')

        // Attempt to parse JSON
        let cleanJson = response.trim();
        // Remove markdown code blocks if present
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        else if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');

        // Try to extract JSON object if there's extra text
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
            cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
        }

        const parsed = JSON.parse(cleanJson);
        console.log('[Sanitizer] Successfully parsed response, issues found:', parsed.issues?.length || 0)
        return {
            ...parsed,
            interpretation
        };
    } catch (e) {
        console.error("[Sanitizer] AI response parsing failed:", e);
        console.error("[Sanitizer] Raw response that failed:", response?.substring(0, 1000));

        // Return empty issues instead of throwing
        return {
            issues: [],
            message: 'AI analysis failed - could not parse response. Please try again.'
        };
    }
}

/**
 * Applies the suggested sanitization fixes to the data in-memory.
 * This allows us to create the sanitized table with the correct schema immediately.
 * 
 * @param {Array} rows - The original data rows
 * @param {Array} issues - The list of issues with suggested actions from analyzeForSanitization
 * @returns {Array} - The modified rows
 */
export function applySanitization(rows, issues) {
    if (!rows || rows.length === 0 || !issues || issues.length === 0) {
        return rows;
    }

    // Deep copy to avoid mutating original
    const sanitizedRows = rows.map(row => ({ ...row }));

    const renames = issues.filter(i => i.suggested_action === 'rename_column' && i.new_column_name);
    // Other actions like fill_null can be implemented here if needed

    sanitizedRows.forEach(row => {
        // Apply Renames
        renames.forEach(rename => {
            if (row.hasOwnProperty(rename.column)) {
                row[rename.new_column_name] = row[rename.column];
                delete row[rename.column];
            }
        });

        // Potential Future: Apply row-level fixes (nulls, etc.)
        // But for v1, we focus on schema/column names which is the biggest pain point
    });

    return sanitizedRows;
}
