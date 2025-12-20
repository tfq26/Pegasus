import AdmZip from 'adm-zip';
import { parseXML } from '../lib/xmlParser.js';

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

        console.log('[XMLExcelInterpreter] Extracted sheet1.xml and sharedStrings.xml');

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

        console.log(`[XMLExcelInterpreter] Found ${sharedStrings.length} shared strings`);

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

        console.log(`[XMLExcelInterpreter] Extracted ${rows.length} rows`);

        // Find the header row - look for row with "Fund Name" or similar specific headers
        // Skip rows with repeated values (merged cells)
        let headerRow = null;
        let headerRowIndex = -1;

        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const row = rows[i];
            const values = Object.values(row.cells).filter(v => v && v.trim());

            // Skip rows where the same value repeats (merged cells)
            const uniqueValues = new Set(values);
            if (uniqueValues.size < values.length * 0.5) {
                console.log(`[XMLExcelInterpreter] Skipping row ${row.rowNumber} - has repeated values (merged cells)`);
                continue;
            }

            const hasSpecificHeaders = values.some(v =>
                v && (
                    v.toLowerCase().includes('fund name') ||
                    v.toLowerCase().includes('folio') ||
                    v.toLowerCase().includes('since') ||
                    v.toLowerCase().includes('amount') ||
                    v.toLowerCase().includes('units') ||
                    v.toLowerCase().includes('nav') ||
                    v.toLowerCase().includes('balance')
                )
            );

            if (hasSpecificHeaders) {
                headerRow = row;
                headerRowIndex = i;
                console.log(`[XMLExcelInterpreter] Found header row at index ${i} (row ${row.rowNumber})`);
                console.log(`[XMLExcelInterpreter] Header values:`, values);
                break;
            }
        }

        if (!headerRow) {
            console.warn('[XMLExcelInterpreter] Could not find header row');
            return null;
        }

        // Extract column mappings from header row
        const columnMappings = [];
        Object.keys(headerRow.cells).forEach(colLetter => {
            const headerValue = headerRow.cells[colLetter];
            if (headerValue && headerValue.trim()) {
                columnMappings.push({
                    column: colLetter,
                    semanticName: headerValue.trim(),
                    originalName: headerValue.trim()
                });
            }
        });

        console.log(`[XMLExcelInterpreter] Found ${columnMappings.length} columns:`, columnMappings.map(c => c.semanticName));

        // Extract data rows (skip header and any rows before it, plus one separator row)
        const dataStartIndex = headerRowIndex + 2; // Skip header + 1 separator row
        const dataRows = [];

        for (let i = dataStartIndex; i < rows.length; i++) {
            const row = rows[i];
            const rowData = {};
            let isEmpty = true;

            columnMappings.forEach(colMap => {
                const value = row.cells[colMap.column] || '';
                if (value && value.toString().trim()) {
                    isEmpty = false;
                }
                rowData[colMap.semanticName] = value;
            });

            // Skip empty rows
            if (!isEmpty) {
                dataRows.push(rowData);
            }
        }

        console.log(`[XMLExcelInterpreter] Extracted ${dataRows.length} data rows`);

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
