import ExcelJS from 'exceljs';

/**
 * Parse an Excel file using ExcelJS.
 * Returns an object with:
 * - sheets: object where keys are sheet names and values are arrays of row objects
 * - metadata: parsing confidence and details for each sheet
 * 
 * Handles formulas (returns calculated values), merged cells, and rich text.
 */
export async function parseExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const result = {};
    const metadata = {};

    workbook.eachSheet((worksheet, sheetId) => {
        const rows = [];
        let headers = [];
        let headerRowNumber = 0;
        let parsingMethod = 'none';
        let confidence = 0;
        const warnings = [];

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            // Get cell values, resolving formulas/rich text
            const rowValues = [];

            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                // Ensure array is large enough
                while (rowValues.length < colNumber) {
                    rowValues.push('');
                }

                let value = '';

                if (cell.value === null || cell.value === undefined) {
                    value = '';
                } else if (typeof cell.value === 'object') {
                    // Handle different object types
                    if (cell.value.result !== undefined) {
                        // Formula cell - use calculated result
                        value = cell.value.result;
                    } else if (cell.value.richText) {
                        // Rich text - concatenate all text parts
                        value = cell.value.richText.map(r => r.text || '').join('');
                    } else if (cell.value.text !== undefined) {
                        // Hyperlink or other text object
                        value = cell.value.text;
                    } else if (cell.value instanceof Date) {
                        // Date object
                        value = cell.value.toISOString().split('T')[0];
                    } else {
                        // Other object - stringify
                        value = String(cell.value);
                    }
                } else {
                    value = cell.value;
                }

                rowValues[colNumber - 1] = value;
            });

            // Header detection with multi-row support
            if (headers.length === 0) {
                const nonEmpty = rowValues.filter(v => v !== '' && v !== undefined && v !== null);

                if (nonEmpty.length >= 2) {
                    // Check if this row has many duplicate values (indicating merged cells in title rows)
                    const uniqueValues = new Set(nonEmpty);
                    const hasManyDuplicates = uniqueValues.size < nonEmpty.length / 2;

                    if (hasManyDuplicates) {
                        // This might be a parent header row - store it for potential combination
                        console.log(`[ExcelParser] Found potential parent header row ${rowNumber}:`, [...uniqueValues]);
                        // Store this row for potential combination with next row
                        worksheet._parentHeaderRow = { rowNumber, values: rowValues };
                        return;
                    }

                    // Check if this looks like a header row
                    const looksLikeHeader = rowValues.some(v => {
                        if (!v) return false;
                        const str = String(v).toLowerCase();
                        return str.includes('name') || str.includes('date') || str.includes('amount') ||
                            str.includes('value') || str.includes('total') || str.includes('type') ||
                            str.includes('folio') || str.includes('nav') || str.includes('units') ||
                            str.includes('gain') || str.includes('loss') || str.includes('return') ||
                            str.includes('since') || str.includes('cost') || str.includes('switch') ||
                            str.includes('dividend') || str.includes('balance') || str.includes('market') ||
                            str.includes('ret') || str.includes('xirr');
                    });

                    if (looksLikeHeader) {
                        // Check if we have a parent header row to combine with
                        if (worksheet._parentHeaderRow) {
                            const parentValues = worksheet._parentHeaderRow.values;
                            console.log(`[ExcelParser] Combining parent row ${worksheet._parentHeaderRow.rowNumber} with child row ${rowNumber}`);

                            // Combine parent and child headers
                            headers = rowValues.map((childHeader, i) => {
                                const parentHeader = parentValues[i];
                                let combined = '';

                                // Build combined header from parent + child
                                if (parentHeader && parentHeader !== '') {
                                    combined = String(parentHeader).trim();
                                }
                                if (childHeader && childHeader !== '') {
                                    const childStr = String(childHeader).trim();
                                    if (combined) {
                                        combined += ' ' + childStr;
                                    } else {
                                        combined = childStr;
                                    }
                                }

                                if (!combined) {
                                    return `Column_${i + 1}`;
                                }

                                // Clean header
                                combined = combined.replace(/[\n\r]/g, ' ');
                                combined = combined.replace(/\s+/g, ' ');
                                return combined;
                            });

                            delete worksheet._parentHeaderRow;
                            parsingMethod = 'multi-row';
                        } else {
                            // Single-row headers
                            headers = rowValues.map((h, i) => {
                                if (h === '' || h === undefined || h === null) {
                                    return `Column_${i + 1}`;
                                }
                                let cleaned = String(h).trim();
                                cleaned = cleaned.replace(/[\n\r]/g, ' ');
                                cleaned = cleaned.replace(/\s+/g, ' ');
                                return cleaned || `Column_${i + 1}`;
                            });
                            parsingMethod = 'single-row';
                        }

                        headerRowNumber = rowNumber;

                        // Calculate initial confidence based on header quality
                        const headerKeywordMatches = headers.filter(h => {
                            const str = h.toLowerCase();
                            return str.includes('name') || str.includes('date') || str.includes('amount') ||
                                str.includes('value') || str.includes('total') || str.includes('units') ||
                                str.includes('cost') || str.includes('balance') || str.includes('nav');
                        }).length;

                        const genericHeaders = headers.filter(h => h.startsWith('Column_')).length;

                        // Confidence: 0.5 base + 0.3 for keyword matches + 0.2 penalty for generic headers
                        confidence = 0.5 + (headerKeywordMatches / headers.length) * 0.3 - (genericHeaders / headers.length) * 0.2;

                        if (genericHeaders > headers.length / 3) {
                            warnings.push(`${genericHeaders} columns have generic names (Column_X)`);
                        }

                        console.log(`[ExcelParser] Found headers at row ${rowNumber}:`, headers);
                        console.log(`[ExcelParser] Initial confidence: ${confidence.toFixed(2)} (method: ${parsingMethod})`);
                        return; // Don't add header row to data
                    }
                }
            }

            // Data rows (only after headers are found)
            if (headers.length > 0 && rowNumber > headerRowNumber) {
                // Check if row has any non-empty values
                const hasData = rowValues.some(v => v !== '' && v !== undefined && v !== null);

                if (hasData) {
                    const rowData = {};
                    headers.forEach((header, i) => {
                        rowData[header] = rowValues[i] !== undefined ? rowValues[i] : '';
                    });
                    rows.push(rowData);
                }
            }
        });

        // Post-processing: Check if the first "data" row is actually the real headers
        // This happens when we have multi-level headers and detected an intermediate level
        if (rows.length > 0) {
            const firstRow = rows[0];
            const firstRowValues = Object.values(firstRow);

            // Check if first row looks more like headers than data
            const looksLikeRealHeaders = firstRowValues.filter(v => {
                if (!v || v === '') return false;
                const str = String(v).toLowerCase();
                // Check for common header patterns
                return str.includes('name') || str.includes('no') || str.includes('since') ||
                    str.includes('amount') || str.includes('units') || str.includes('cost') ||
                    str.includes('value') || str.includes('nav') || str.includes('balance') ||
                    str.includes('dividend') || str.includes('switch') || str.includes('gain') ||
                    str.includes('loss') || str.includes('ret') || str.includes('xirr') ||
                    str.includes('date') || str.includes('folio') || str.includes('market');
            }).length;

            // If more than half the columns look like headers, use this row as headers
            if (looksLikeRealHeaders >= headers.length / 2) {
                console.log(`[ExcelParser] First data row appears to be real headers, using it instead`);

                // Combine parent headers with these detailed headers
                const newHeaders = headers.map((parentHeader, i) => {
                    const detailedHeader = firstRowValues[i];
                    if (!detailedHeader || detailedHeader === '') {
                        return parentHeader;
                    }

                    const detailedStr = String(detailedHeader).trim();
                    // If parent header is generic (Column_X), just use detailed
                    if (parentHeader.startsWith('Column_')) {
                        return detailedStr;
                    }

                    // Otherwise combine: "Current Status" + "NAV" = "Current Status NAV"
                    return `${parentHeader} ${detailedStr}`.trim();
                });

                headers = newHeaders;
                console.log(`[ExcelParser] Updated headers:`, headers);
                parsingMethod = 'post-processed';

                // Recalculate confidence with updated headers
                const headerKeywordMatches = headers.filter(h => {
                    const str = h.toLowerCase();
                    return str.includes('name') || str.includes('date') || str.includes('amount') ||
                        str.includes('value') || str.includes('total') || str.includes('units') ||
                        str.includes('cost') || str.includes('balance') || str.includes('nav');
                }).length;

                const genericHeaders = headers.filter(h => h.startsWith('Column_')).length;
                confidence = 0.6 + (headerKeywordMatches / headers.length) * 0.3 - (genericHeaders / headers.length) * 0.1;

                console.log(`[ExcelParser] Updated confidence: ${confidence.toFixed(2)} (post-processed)`);

                // Remove first row from data since it's now the header
                rows.shift();
            }
        }

        // Final confidence adjustments
        if (headers.length === 0) {
            confidence = 0;
            warnings.push('No headers detected');
        } else if (rows.length === 0) {
            confidence = Math.max(0, confidence - 0.3);
            warnings.push('No data rows found');
        }

        // Clamp confidence to [0, 1]
        confidence = Math.max(0, Math.min(1, confidence));

        // Only add sheet if it has data
        if (rows.length > 0) {
            result[worksheet.name] = rows;
            metadata[worksheet.name] = {
                confidence,
                method: parsingMethod,
                headerRow: headerRowNumber,
                totalRows: rows.length,
                totalColumns: headers.length,
                warnings: warnings.length > 0 ? warnings : undefined,
                headers
            };
            console.log(`[ExcelParser] Sheet "${worksheet.name}": ${rows.length} rows, ${headers.length} columns, confidence: ${confidence.toFixed(2)}`);
        }
    });

    return { sheets: result, metadata };
}
