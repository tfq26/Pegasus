import { aiClient } from './AIClient.js';
import * as financialInterpreter from './interpreters/financial.js';

/**
 * Main function to interpret a dataset semantically.
 * @param {string} tableName - The name of the table
 * @param {Array<Object>} rows - The data rows
 * @param {Object} options - Configuration options
 */
export async function interpretDataset(tableName, rows, options = {}) {
    if (!rows || rows.length === 0) return { error: 'No data to interpret' };

    console.log(`[Interpreter] Interpreting dataset: ${tableName}`);

    // 1. Detect domain
    const domainResult = await detectDomain(rows, options.hint);
    const domain = domainResult.domain;

    // 2. Analyze columns semantically
    const columnAnalysis = await analyzeColumns(rows, domain);

    // 3. Domain-specific interpretation
    let specificInterpretation = {};
    if (domain === 'financial_portfolio') {
        specificInterpretation = await financialInterpreter.interpretFinancialPortfolio(rows, columnAnalysis);
    } else if (domain === 'sales_transactions') {
        // specificInterpretation = await salesInterpreter.interpretSales(rows, columnAnalysis);
    }

    // 4. Combine results
    return {
        domain: domainResult,
        columns: columnAnalysis,
        ...specificInterpretation, // Merges validation, insights, etc.
        metadata: {
            interpretedAt: new Date().toISOString(),
            rowCount: rows.length,
            columnCount: Object.keys(rows[0] || {}).length
        }
    };
}

/**
 * Detects the business domain of the dataset using AI.
 */
async function detectDomain(rows, hint = '') {
    const sample = rows.slice(0, 5);
    const prompt = `
Analyze this dataset and identify its business domain/type.

Sample data (first 5 rows):
${JSON.stringify(sample, null, 2)}

Possible domains:
- financial_portfolio (mutual funds, stocks, investments, folio numbers)
- financial_pnl (profit & loss statement)
- financial_balance_sheet
- sales_transactions (orders, customers, products)
- sales_revenue_report
- inventory_list
- hr_employees
- generic (if no specific domain matches)

${hint ? `Hint: Users thinks this might be related to "${hint}"` : ''}

Return ONLY a JSON object:
{
  "domain": "one_of_the_above_options",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation why"
}
`;

    try {
        const response = await aiClient.generateText(prompt, undefined, {
            temperature: 0.1, // Low temp for classification
            json: true
        });
        return JSON.parse(response);
    } catch (e) {
        console.error('[Interpreter] Domain detection failed:', e);
        return { domain: 'generic', confidence: 0, reasoning: 'AI detection failed' };
    }
}

/**
 * Analyzes columns to understand their semantic meaning.
 */
async function analyzeColumns(rows, domain) {
    const columns = Object.keys(rows[0] || {});
    const sample = rows.slice(0, 10);

    const prompt = `
Analyze these columns in the context of a "${domain}" dataset.

Columns: ${columns.join(', ')}

Sample data:
${JSON.stringify(sample, null, 2)}

For each column, provide a semantic analysis object.
Return ONLY a JSON array of objects with this structure:
{
  "column_name": "original_column_name",
  "semantic_name": "Business-friendly name (e.g., 'Investment Amount')",
  "data_type": "currency" | "percentage" | "date" | "number" | "text" | "identifier",
  "role": "dimension" | "measure" | "calculated" | "identifier",
  "business_meaning": "Brief description of what this column represents",
  "is_derived": boolean (true if it looks calculated from other columns)
}
`;

    try {
        const response = await aiClient.generateText(prompt, undefined, {
            temperature: 0.1,
            json: true
        });
        return JSON.parse(response);
    } catch (e) {
        console.error('[Interpreter] Column analysis failed:', e);
        // Fallback to basic analysis
        return columns.map(col => ({
            column_name: col,
            semantic_name: col,
            data_type: 'text',
            role: 'dimension',
            business_meaning: 'Unknown',
            is_derived: false
        }));
    }
}
