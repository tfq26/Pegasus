import AdmZip from 'adm-zip';
import { parseXML } from '../lib/xmlParser.js';

const verboseXmlLogs = process.env.PEGASUS_VERBOSE_XML_IMPORT === 'true';
const logXmlDebug = (...args) => {
    if (verboseXmlLogs) {
        console.log(...args);
    }
};

function decodeXmlText(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function normalizeColumnName(column, headerValue) {
    const header = decodeXmlText(headerValue).trim();
    const explicitPortfolioColumns = {
        A: 'fund_name',
        B: 'folio_no',
        C: 'since',
        D: 'invested_amount',
        E: 'balance_units',
        F: 'average_cost',
        G: 'withdrawal_switch_out_amount',
        H: 'switch_outs',
        I: 'dividend_amount',
        J: 'dividend_units',
        K: 'nav',
        L: 'market_value',
        M: 'as_on',
        N: 'net_gain_loss',
        O: 'absolute_return_pct',
        P: 'xirr_pct'
    };

    if (explicitPortfolioColumns[column]) {
        return explicitPortfolioColumns[column];
    }

    return header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `column_${column.toLowerCase()}`;
}

/**
 * Extract raw XML from Excel file and parse it properly
 */
export async function interpretExcelFromXML(filePath) {
    try {
        // Extract the Excel file (it's a ZIP)
        const zip = new AdmZip(filePath);

        // Get the first worksheet XML
        const sheetXML = zip.readAsText('xl/worksheets/sheet1.xml');
        const sharedStringsXML = zip.readAsText('xl/sharedStrings.xml');

        logXmlDebug('[XMLExcelInterpreter] Extracted sheet1.xml and sharedStrings.xml');

        // Parse shared strings to get actual text values
        const parsedShared = parseXML(sharedStringsXML);
        const sharedStrings = [];

        if (parsedShared.sst && parsedShared.sst.si) {
            const items = Array.isArray(parsedShared.sst.si) ? parsedShared.sst.si : [parsedShared.sst.si];
            items.forEach(item => {
                if (item.t) {
                    sharedStrings.push(typeof item.t === 'string' ? item.t : (item.t._text || ''));
                } else if (item.r) {
                    const rNodes = Array.isArray(item.r) ? item.r : [item.r];
                    sharedStrings.push(rNodes.map(r => r.t?._text || r.t || '').join(''));
                }
            });
        }

        logXmlDebug(`[XMLExcelInterpreter] Found ${sharedStrings.length} shared strings`);

        // Parse the sheet XML
        const parsedSheet = parseXML(sheetXML);

        // Extract rows with cell data
        const rows = [];
        if (parsedSheet.worksheet && parsedSheet.worksheet.sheetData && parsedSheet.worksheet.sheetData.row) {
            const rowNodes = Array.isArray(parsedSheet.worksheet.sheetData.row)
                ? parsedSheet.worksheet.sheetData.row
                : [parsedSheet.worksheet.sheetData.row];

            rowNodes.forEach((rowNode) => {
                const rowNumber = parseInt(rowNode._attributes?.r || 0);
                const cellNodes = rowNode.c ? (Array.isArray(rowNode.c) ? rowNode.c : [rowNode.c]) : [];

                const rowData = {};
                cellNodes.forEach(cell => {
                    let value = cell.v?._text || cell.v || '';

                    // Resolve shared string reference
                    if (cell._attributes && cell._attributes.t === 's') {
                        const index = parseInt(value);
                        value = sharedStrings[index] || '';
                    }

                    const cellRef = cell._attributes?.r || '';
                    const colLetter = cellRef.replace(/[0-9]/g, '');
                    rowData[colLetter] = value;
                });

                rows.push({ rowNumber, cells: rowData });
            });
        }

        logXmlDebug(`[XMLExcelInterpreter] Extracted ${rows.length} rows`);

        // Find the header row - look for row with "Fund Name" specifically
        // This is typically the detailed header row in financial reports
        let headerRow = null;
        let headerRowIndex = -1;
        let bestCandidate = null;
        let bestCandidateIndex = -1;

        for (let i = 0; i < Math.min(15, rows.length); i++) {
            const row = rows[i];
            const values = Object.values(row.cells).filter(v => v && v.trim());

            // Skip rows where the same value repeats (merged cells)
            const uniqueValues = new Set(values);
            if (uniqueValues.size < values.length * 0.5) {
                logXmlDebug(`[XMLExcelInterpreter] Skipping row ${row.rowNumber} - has repeated values (merged cells)`);
                continue;
            }

            // Best match: row with "Fund Name" - this is the detailed header
            const hasFundName = values.some(v =>
                v && v.toLowerCase().includes('fund name')
            );

            if (hasFundName) {
                headerRow = row;
                headerRowIndex = i;
                logXmlDebug(`[XMLExcelInterpreter] Found header row with Fund Name at index ${i} (row ${row.rowNumber})`);
                logXmlDebug(`[XMLExcelInterpreter] Header values:`, values);
                break;
            }

            // Secondary match: rows with multiple financial keywords (as fallback)
            const hasSpecificHeaders = values.some(v =>
                v && (
                    v.toLowerCase().includes('folio') ||
                    v.toLowerCase().includes('since') ||
                    v.toLowerCase().includes('amount') ||
                    v.toLowerCase().includes('units') ||
                    v.toLowerCase().includes('nav')
                )
            );

            if (hasSpecificHeaders && !bestCandidate) {
                bestCandidate = row;
                bestCandidateIndex = i;
                logXmlDebug(`[XMLExcelInterpreter] Found candidate header row at index ${i} (row ${row.rowNumber})`);
            }
        }

        // Use best candidate if no row with "Fund Name" found
        if (!headerRow && bestCandidate) {
            headerRow = bestCandidate;
            headerRowIndex = bestCandidateIndex;
            logXmlDebug(`[XMLExcelInterpreter] Using candidate header row at index ${headerRowIndex}`);
        }

        if (!headerRow) {
            console.warn('[XMLExcelInterpreter] Could not find header row');
            return null;
        }

        // Extract column mappings from header row
        // CRITICAL: Also look for columns that have data but no header (like Fund Name in column A)
        const columnMappings = [];
        const allColumnsWithData = new Set();

        // First, scan all data rows to find ALL columns that have data
        for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 10, rows.length); i++) {
            Object.keys(rows[i].cells).forEach(col => {
                if (rows[i].cells[col] && rows[i].cells[col].toString().trim()) {
                    allColumnsWithData.add(col);
                }
            });
        }

        logXmlDebug(`[XMLExcelInterpreter] All columns with data:`, [...allColumnsWithData].sort());

        // Add header row columns
        Object.keys(headerRow.cells).forEach(colLetter => {
            const headerValue = headerRow.cells[colLetter];
            if (headerValue && headerValue.trim()) {
                columnMappings.push({
                    column: colLetter,
                    semanticName: normalizeColumnName(colLetter, headerValue),
                    originalName: decodeXmlText(headerValue.trim())
                });
                allColumnsWithData.delete(colLetter); // Remove from set since we handled it
            }
        });

        // Add any columns with data but NO header (assign generic names)
        // Sort columns alphabetically to ensure correct order (A, B, C, ..., AA, AB, etc.)
        const remainingColumns = [...allColumnsWithData].sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });

        remainingColumns.forEach((colLetter, idx) => {
            // Check if this column has meaningful data (not just numbers)
            const sampleValue = rows[headerRowIndex + 1]?.cells[colLetter] || '';

            // Column A with text is likely "Fund Name" or "Name"
            if (colLetter === 'A') {
                logXmlDebug(`[XMLExcelInterpreter] Column A has no header but has data: "${sampleValue}". Adding as "fund_name".`);
                columnMappings.unshift({
                    column: 'A',
                    semanticName: 'fund_name',
                    originalName: ''
                });
            } else {
                logXmlDebug(`[XMLExcelInterpreter] Column ${colLetter} has data but no header: "${sampleValue}". Adding as "Column_${colLetter}".`);
                columnMappings.push({
                    column: colLetter,
                    semanticName: `Column_${colLetter}`,
                    originalName: ''
                });
            }
        });

        // Sort column mappings by column letter
        columnMappings.sort((a, b) => {
            if (a.column.length !== b.column.length) return a.column.length - b.column.length;
            return a.column.localeCompare(b.column);
        });

        logXmlDebug(`[XMLExcelInterpreter] Found ${columnMappings.length} columns:`, columnMappings.map(c => `${c.column}:${c.semanticName}`));

        // Extract data rows - skip header and filter out separator/category rows
        // Category rows have data only in column A (like "Equity - Large & Mid Cap")
        // Separator rows have only numbers or are mostly empty
        const dataRows = [];

        let currentMemberId = null;
        let currentFundSubCategory = null;

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const rowData = {};
            let nonEmptyCount = 0;
            let hasColumnAData = false;
            const firstColValue = decodeXmlText(row.cells['A'] || '').trim();

            columnMappings.forEach(colMap => {
                const value = decodeXmlText(row.cells[colMap.column] || '');
                if (value && value.toString().trim()) {
                    nonEmptyCount++;
                    if (colMap.column === 'A') hasColumnAData = true;
                }
                rowData[colMap.semanticName] = value;
            });

            // Skip rows that are:
            // - Completely empty
            // - Have data only in first few columns (category headers like "Equity - Large & Mid Cap")
            // - Total rows (contain "Total" or "Member Total")
            const isCategory = nonEmptyCount <= 3 && hasColumnAData && !firstColValue.match(/^\d+$/);
            const isTotal = firstColValue.toLowerCase().includes('total');
            const isNumberOnly = firstColValue.match(/^\d+$/);

            if (isNumberOnly) {
                currentMemberId = Number(firstColValue);
            } else if (isCategory && !isTotal) {
                currentFundSubCategory = firstColValue;
            }

            if (nonEmptyCount >= 5 && !isCategory && !isTotal && !isNumberOnly) {
                rowData.member_id = currentMemberId;
                rowData.fund_sub_category = currentFundSubCategory;
                dataRows.push(rowData);
            } else if (verboseXmlLogs) {
                console.log(`[XMLExcelInterpreter] Skipping row ${row.rowNumber}: cols=${nonEmptyCount}, first="${String(firstColValue).substring(0, 20)}"`);
            }
        }

        logXmlDebug(`[XMLExcelInterpreter] Extracted ${dataRows.length} data rows`);

        if (dataRows.length === 0) {
            console.warn('[XMLExcelInterpreter] No data rows found');
            return null;
        }

        return {
            data: dataRows,
            mapping: {
                columns: columnMappings,
                dataStartRow: headerRow.rowNumber + 2,
                headerRow: headerRow.rowNumber
            }
        };
    } catch (e) {
        console.error('[XMLExcelInterpreter] Failed:', e.message);
        console.error('[XMLExcelInterpreter] Stack:', e.stack);
        return null;
    }
}
