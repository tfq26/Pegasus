import { aiClient } from './AIClient.js';

/**
 * Reads raw Excel structure including all cells, positions, and formatting
 */
export function readExcelStructure(parsedExcel, sheetName) {
    const sheet = parsedExcel[sheetName];
    if (!sheet || sheet.length === 0) {
        return null;
    }

    // Convert parsed data back to cell grid
    const cells = [];
    const headers = Object.keys(sheet[0]);

    // Add header row
    headers.forEach((header, colIndex) => {
        cells.push({
            row: 0,
            col: colIndex,
            value: header,
            type: 'string'
        });
    });

    // Add data rows
    sheet.forEach((row, rowIndex) => {
        headers.forEach((header, colIndex) => {
            const value = row[header];
            if (value !== null && value !== undefined && value !== '') {
                cells.push({
                    row: rowIndex + 1,
                    col: colIndex,
                    value: value,
                    type: typeof value === 'number' ? 'number' : 'string'
                });
            }
        });
    });

    return {
        cells,
        rowCount: sheet.length + 1,
        colCount: headers.length
    };
}

/**
 * Format cells for AI prompt (show grid structure)
 */
function formatCellsForAI(cells, maxRows = 20) {
    const grid = {};

    cells.filter(c => c.row < maxRows).forEach(cell => {
        if (!grid[cell.row]) grid[cell.row] = {};
        grid[cell.row][cell.col] = cell.value;
    });

    let output = '';
    Object.keys(grid).sort((a, b) => a - b).forEach(row => {
        const rowData = grid[row];
        const cols = Object.keys(rowData).sort((a, b) => a - b);
        output += `Row ${row}: `;
        cols.forEach(col => {
            output += `[Col ${col}: "${rowData[col]}"] `;
        });
        output += '\\n';
    });

    return output;
}

/**
 * Use AI to interpret Excel structure and identify proper column mappings
 */
export async function interpretExcelStructure(excelStructure, hint = '') {
    if (!excelStructure || !excelStructure.cells) {
        return null;
    }

    const prompt = `
You are an Excel data interpreter. Analyze this Excel file structure and extract meaningful column mappings.

File Structure:
- ${excelStructure.rowCount} rows × ${excelStructure.colCount} columns

First 20 rows (sample):
${formatCellsForAI(excelStructure.cells, 20)}

${hint ? `Context: This appears to be a ${hint}` : ''}

Tasks:
1. Identify which rows contain headers (may span multiple rows due to merged cells)
2. Determine the actual column names (handle merged cells and multi-row headers)
3. Identify where the data rows start
4. Map each column to a semantic name and data type

IMPORTANT: 
- If you see generic column names like "Column17", "Column18", this means the headers are in the data rows
- Look for rows with text values that describe what the columns contain
- Merged cells often result in empty cells next to filled ones
- Multi-row headers should be concatenated (e.g., "Absolute" + "Return %" = "Absolute Return %")

Return JSON:
{
  "headerRows": [0, 1],
  "dataStartRow": 2,
  "columns": [
    {
      "index": 0,
      "originalName": "Column name from Excel",
      "semanticName": "Meaningful name",
      "dataType": "text|number|date|percentage",
      "description": "What this column represents"
    }
  ],
  "domain": "financial_portfolio|sales|generic",
  "confidence": 0.95,
  "reasoning": "Brief explanation of how you identified the structure"
}
`;

    try {
        const response = await aiClient.generateText(prompt, undefined, {
            temperature: 0.1,
            json: true
        });

        // Extract JSON from response
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonStr = response.substring(jsonStart, jsonEnd + 1);
            const parsed = JSON.parse(jsonStr);
            console.log('[ExcelInterpreter] AI interpretation:', parsed.domain, 'confidence:', parsed.confidence);
            return parsed;
        }

        return null;
    } catch (e) {
        console.error('[ExcelInterpreter] AI interpretation failed:', e);
        return null;
    }
}

/**
 * Extract data using AI-provided column mappings
 */
export function extractDataWithMapping(excelStructure, mapping) {
    if (!mapping || !mapping.columns) {
        return null;
    }

    const rows = [];
    const { cells } = excelStructure;

    for (let r = mapping.dataStartRow; r < excelStructure.rowCount; r++) {
        const row = {};
        let isEmpty = true;

        for (const colMapping of mapping.columns) {
            const cell = cells.find(c => c.row === r && c.col === colMapping.index);
            const value = cell ? cell.value : null;

            if (value !== null && value !== undefined && value !== '') {
                isEmpty = false;
            }
            row[colMapping.semanticName] = value || '';
        }

        if (!isEmpty) {
            rows.push(row);
        }
    }

    console.log(`[ExcelInterpreter] Extracted ${rows.length} rows with semantic columns`);
    return rows;
}

/**
 * Heuristic fallback: detect headers and extract data without AI
 */
export function heuristicExtraction(parsedExcel, sheetName) {
    const sheet = parsedExcel[sheetName];
    if (!sheet || sheet.length === 0) {
        return null;
    }

    // Check if current headers look generic
    const headers = Object.keys(sheet[0]);
    const hasGenericHeaders = headers.some(h => h.startsWith('Column'));

    if (!hasGenericHeaders) {
        // Headers look good, return as-is
        return {
            data: sheet,
            mapping: {
                columns: headers.map((h, i) => ({
                    index: i,
                    originalName: h,
                    semanticName: h,
                    dataType: 'text'
                })),
                confidence: 0.7,
                method: 'heuristic'
            }
        };
    }

    // Headers are generic - try to find real headers in the data
    // Look for a row where most values are text (likely headers)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(5, sheet.length); i++) {
        const row = sheet[i];
        const values = Object.values(row);
        const textCount = values.filter(v => v && typeof v === 'string' && isNaN(v)).length;
        const nonEmptyCount = values.filter(v => v !== '' && v !== null).length;

        if (textCount >= nonEmptyCount * 0.7 && nonEmptyCount >= 3) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        // Couldn't find headers, return null to trigger AI
        return null;
    }

    // Extract new headers from the identified row
    const headerRow = sheet[headerRowIndex];
    const newHeaders = Object.values(headerRow).map((v, i) => v || `Column${i + 1}`);

    // Extract data rows after the header
    const dataRows = sheet.slice(headerRowIndex + 1).map(row => {
        const newRow = {};
        Object.values(row).forEach((value, i) => {
            newRow[newHeaders[i]] = value;
        });
        return newRow;
    });

    console.log(`[ExcelInterpreter] Heuristic found headers at row ${headerRowIndex}:`, newHeaders);

    return {
        data: dataRows,
        mapping: {
            columns: newHeaders.map((h, i) => ({
                index: i,
                originalName: h,
                semanticName: h,
                dataType: 'text'
            })),
            dataStartRow: headerRowIndex + 1,
            confidence: 0.6,
            method: 'heuristic'
        }
    };
}
